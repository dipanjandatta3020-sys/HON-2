import http.server
import socketserver
import json
import os
import base64
import time
import hashlib
import secrets
import hmac

import uuid
from collections import defaultdict

ADMIN_TOKEN = str(uuid.uuid4())
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'gloomhon@gmail.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'natureofhouse')

# Rate limiting store
AUTH_RATE_LIMITS = defaultdict(list)


PORT = 8080
PRODUCTS_FILE = 'products.json'
USERS_FILE = 'users.json'
ORDERS_FILE = 'orders.json'
LOGS_FILE = 'system_logs.json'
ADMIN_CONFIG_FILE = 'admin_config.json'
UPLOAD_DIR = 'uploads'

# Ensure files/dirs exist
for f in [PRODUCTS_FILE, USERS_FILE, ORDERS_FILE, LOGS_FILE, ADMIN_CONFIG_FILE]:
    if not os.path.exists(f):
        with open(f, 'w') as file:
            json.dump({}, file) if f == ADMIN_CONFIG_FILE else json.dump([], file)

if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

def log_system_action(action_type, description, admin_user="Admin"):
    try:
        with open(LOGS_FILE, 'r') as f:
            logs = json.load(f)
        
        log_entry = {
            'timestamp': time.time(),
            'action': action_type,
            'description': description,
            'user': admin_user
        }
        logs.insert(0, log_entry) # Prepend
        
        with open(LOGS_FILE, 'w') as f:
            json.dump(logs, f, indent=2)
    except Exception as e:
        print(f"Logging failed: {e}")

def hash_password(password, salt=""):
    # Using salt if provided, else empty string for legacy
    if not salt:
        return hashlib.sha256(password.encode()).hexdigest()
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex()


def verify_razorpay_signature(order_id, payment_id, signature, secret):
    generated_signature = hmac.new(
        secret.encode(),
        f"{order_id}|{payment_id}".encode(),
        hashlib.sha256
    ).hexdigest()
    # Use hmac.compare_digest to prevent timing attacks
    return hmac.compare_digest(generated_signature, signature)

def get_razorpay_creds():
    try:
        with open(ADMIN_CONFIG_FILE, 'r') as f:
            config = json.load(f)
        return config.get('razorpay_key_id'), config.get('razorpay_key_secret')
    except:
        return None, None

def create_razorpay_order(amount, currency='INR'):
    # Use urllib to avoid new dependencies
    key_id, key_secret = get_razorpay_creds()
    if not key_id or not key_secret:
        return None, "Razorpay keys not configured"

    import urllib.request
    import base64

    url = "https://api.razorpay.com/v1/orders"
    data = json.dumps({
        "amount": amount * 100, # Amount in paise
        "currency": currency,
        "payment_capture": 1
    }).encode()

    headers = {
        "Content-Type": "application/json",
        "Authorization": "Basic " + base64.b64encode(f"{key_id}:{key_secret}".encode()).decode()
    }

    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode()), None
    except Exception as e:
        return None, str(e)

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*') # Dev
        self.end_headers()

    def _is_admin(self):
        auth_header = self.headers.get('Authorization')
        if not auth_header:
            return False
        # Expecting "Bearer <token>"
        try:
            token = auth_header.split(' ')[1]
            return token == ADMIN_TOKEN
        except:
            return False

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            try:
                with open('screenshots/error_page.html', 'rb') as f:
                    content = f.read()
                self.send_response(404)
                self.send_header('Content-Type', 'text/html')
                self.end_headers()
                self.wfile.write(content)
                return
            except FileNotFoundError:
                pass
        super().send_error(code, message, explain)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_POST(self):
        # --- AUTHENTICATION ---
        if self.path == '/api/auth/signup':
            length = int(self.headers['Content-Length'])
            data = json.loads(self.rfile.read(length).decode())
            
            email = data.get('email', '').strip().lower()
            password = data.get('password')
            name = data.get('name', '').strip()
            
            if not email or not password:
                self._set_headers(400)
                self.wfile.write(json.dumps({'success': False, 'message': 'Missing fields'}).encode())
                return


            with open(USERS_FILE, 'r') as f:
                users = json.load(f)

            user = next((u for u in users if u.get('email', '').lower() == email), None)
            
            # Check password (use salt if exists)
            salt = user.get('salt', '') if user else ''
            if user and user.get('password_hash') == hash_password(password, salt):

                # Update Last Login
                user['last_login'] = time.time()
                with open(USERS_FILE, 'w') as f: json.dump(users, f, indent=2)

                self._set_headers(200)
                resp_user = {k:v for k,v in user.items() if k != 'password_hash'}
                
                # Ensure cart and orders exist in response even if missing in file (legacy users)
                if 'cart' not in resp_user: resp_user['cart'] = []
                if 'orders' not in resp_user: resp_user['orders'] = []
                
                self.wfile.write(json.dumps({'success': True, 'user': resp_user, 'token': user['id']}).encode())
            else:
                self._set_headers(401)
                self.wfile.write(json.dumps({'success': False, 'message': 'Invalid credentials'}).encode())

        elif self.path == '/api/auth/login':
            length = int(self.headers['Content-Length'])
            data = json.loads(self.rfile.read(length).decode())
            
            email = data.get('email', '').strip()
            password = data.get('password', '')

            if email == ADMIN_EMAIL and password == ADMIN_PASSWORD:
                self._set_headers(200)
                self.wfile.write(json.dumps({
                    'success': True, 
                    'isAdmin': True,
                    'token': ADMIN_TOKEN
                }).encode())
            else:
                self._set_headers(401)
                self.wfile.write(json.dumps({'success': False, 'message': 'Invalid credentials'}).encode())

        # --- ADMIN CONFIG (RAZORPAY) ---
        elif self.path == '/api/admin/config/razorpay':
            if not self._is_admin():
                self._set_headers(403)
                self.wfile.write(json.dumps({'success': False, 'message': 'Unauthorized'}).encode())
                return

            length = int(self.headers['Content-Length'])
            data = json.loads(self.rfile.read(length).decode())
            
            key_id = data.get('keyId')
            key_secret = data.get('keySecret')

            if not key_id or not key_secret:
                self._set_headers(400)
                self.wfile.write(json.dumps({'success': False, 'message': 'Missing keys'}).encode())
                return

            try:
                with open(USERS_FILE, 'r') as f: # Just ensuring valid read
                    pass 
                
                # Check config file existence or create dict
                if os.path.exists(ADMIN_CONFIG_FILE):
                     with open(ADMIN_CONFIG_FILE, 'r') as f:
                        try: config = json.load(f)
                        except: config = {}
                else: config = {}
            except: config = {}

            config['razorpay_key_id'] = key_id
            config['razorpay_key_secret'] = key_secret

            with open(ADMIN_CONFIG_FILE, 'w') as f:
                json.dump(config, f, indent=2)
            
            self._set_headers(200)
            self.wfile.write(json.dumps({'success': True}).encode())

        # --- ADMIN HERO CONFIG ---
        elif self.path == '/api/admin/config/hero':
            if not self._is_admin():
                self._set_headers(403)
                self.wfile.write(json.dumps({'success': False, 'message': 'Unauthorized'}).encode())
                return

            length = int(self.headers['Content-Length'])
            data = json.loads(self.rfile.read(length).decode())
            
            desktop = data.get('desktop', [])
            mobile = data.get('mobile', [])

            # Validation
            if not isinstance(desktop, list) or len(desktop) != 3 or not all(isinstance(x, str) and x.strip() for x in desktop):
                self._set_headers(400)
                self.wfile.write(json.dumps({'success': False, 'message': 'Invalid desktop images. Must be exactly 3 valid URLs.'}).encode())
                return
            
            if not isinstance(mobile, list) or len(mobile) != 3 or not all(isinstance(x, str) and x.strip() for x in mobile):
                self._set_headers(400)
                self.wfile.write(json.dumps({'success': False, 'message': 'Invalid mobile images. Must be exactly 3 valid URLs.'}).encode())
                return

            try:
                if os.path.exists(ADMIN_CONFIG_FILE):
                     with open(ADMIN_CONFIG_FILE, 'r') as f:
                        try: config = json.load(f)
                        except: config = {}
                else: config = {}
            except: config = {}

            config['hero_images'] = {
                'desktop': desktop,
                'mobile': mobile
            }

            with open(ADMIN_CONFIG_FILE, 'w') as f:
                json.dump(config, f, indent=2)
            
            self._set_headers(200)
            self.wfile.write(json.dumps({'success': True}).encode())

        # --- ADMIN DATA (Read Only - Handled in GET) ---
        elif self.path.startswith('/api/admin/data/'):
             self._set_headers(405) # Method Not Allowed
             self.wfile.write(json.dumps({'success': False, 'message': 'Use GET'}).encode())
             return 

        # --- PRODUCTS ---
        elif self.path == '/api/products':
            if not self._is_admin():
                self._set_headers(403)
                self.wfile.write(json.dumps({'success': False, 'message': 'Unauthorized'}).encode())
                return

            length = int(self.headers['Content-Length'])
            data = json.loads(self.rfile.read(length).decode())
            
            # Simple overwrite or update?
            # Creating backup/log before overwrite
            # log_system_action('PRODUCT_UPDATE', "Product list updated") 
            # (Too verbose if bulk? Maybe log individual if possible, but frontend sends all)
            
            # We should probably detect diffs for logging, but for now just log "Bulk Update"
            log_system_action('INVENTORY_UPDATE', "Products updated via Admin")

            with open(PRODUCTS_FILE, 'w') as f:
                json.dump(data, f, indent=2)
            
            self._set_headers(200)
            self.wfile.write(json.dumps({'success': True}).encode())

        # --- UPLOAD ---
        elif self.path == '/api/upload':
            if not self._is_admin():
                self._set_headers(403)
                self.wfile.write(json.dumps({'success': False, 'message': 'Unauthorized'}).encode())
                return

            length = int(self.headers['Content-Length'])
            data = json.loads(self.rfile.read(length).decode('utf-8'))
            
            filename = f"{int(time.time())}_{os.path.basename(data['filename'])}"
            filepath = os.path.join(UPLOAD_DIR, filename)
            
            with open(filepath, 'wb') as f:
                f.write(base64.b64decode(data['image']))
            
            relative_path = f"{UPLOAD_DIR}/{filename}".replace('\\', '/')
            self._set_headers(200)
            self.wfile.write(json.dumps({'filepath': relative_path}).encode())

        # --- USER UPDATE ---
        elif self.path == '/api/user/update':
            length = int(self.headers['Content-Length'])
            data = json.loads(self.rfile.read(length).decode())
            user_id = data.get('id')
            
            with open(USERS_FILE, 'r') as f:
                users = json.load(f)
            
            user = next((u for u in users if u['id'] == user_id), None)
            if user:
                if 'avatar' in data: user['avatar'] = data['avatar']
                with open(USERS_FILE, 'w') as f:
                    json.dump(users, f, indent=2)
                self._set_headers(200)
                self.wfile.write(json.dumps({'success': True, 'user': user}).encode())
            else:
                self._set_headers(404)
                self.wfile.write(json.dumps({'success': False}).encode())

        # --- CART MANAGEMENT ---
        elif self.path == '/api/user/cart/save':
            length = int(self.headers['Content-Length'])
            data = json.loads(self.rfile.read(length).decode())
            user_id = data.get('userId')
            cart = data.get('cart', [])
            
            with open(USERS_FILE, 'r') as f:
                users = json.load(f)
            
            user = next((u for u in users if u['id'] == user_id), None)
            if user:
                user['cart'] = cart
                user['last_cart_update'] = time.time()
                with open(USERS_FILE, 'w') as f:
                    json.dump(users, f, indent=2)
                log_system_action('CART_UPDATE', f"Cart saved for user: {user.get('email', user_id)}")
                self._set_headers(200)
                self.wfile.write(json.dumps({'success': True}).encode())
            else:
                self._set_headers(404)
                self.wfile.write(json.dumps({'success': False, 'message': 'User not found'}).encode())

        elif self.path == '/api/user/cart/clear':
            length = int(self.headers['Content-Length'])
            data = json.loads(self.rfile.read(length).decode())
            user_id = data.get('userId')
            
            with open(USERS_FILE, 'r') as f:
                users = json.load(f)
            
            user = next((u for u in users if u['id'] == user_id), None)
            if user:
                user['cart'] = []
                with open(USERS_FILE, 'w') as f:
                    json.dump(users, f, indent=2)
                self._set_headers(200)
                self.wfile.write(json.dumps({'success': True}).encode())
            else:
                self._set_headers(404)
                self.wfile.write(json.dumps({'success': False}).encode())

        # --- ORDER INIT (RAZORPAY) ---
        elif self.path == '/api/orders/create':
            # This is for INITIALIZING a Razorpay order
            length = int(self.headers['Content-Length'])
            data = json.loads(self.rfile.read(length).decode())
            
            amount = data.get('amount') # In Rupees
            if not amount:
                self._set_headers(400)
                self.wfile.write(json.dumps({'success': False, 'message': 'Amount required'}).encode())
                return

            raz_order, error = create_razorpay_order(amount)
            if error:
                self._set_headers(500)
                self.wfile.write(json.dumps({'success': False, 'message': error}).encode())
                return
            
            key_id, _ = get_razorpay_creds()
            
            self._set_headers(200)
            self.wfile.write(json.dumps({
                'success': True, 
                'orderId': raz_order['id'],
                'keyId': key_id,
                'amount': raz_order['amount'],
                'currency': raz_order['currency']
            }).encode())

        # --- ORDER PLACE (FINALIZE) ---
        elif self.path == '/api/orders/place':
            # 1. Authorization (User Token for ID)
            # Actually, guest checkout might be allowed? 
            # User request says "User ID (or Guest identifier if applicable)".
            # So allow no auth header? Let's check headers.
            auth_header = self.headers.get('Authorization')
            user_id = "guest"
            if auth_header:
                 try: user_id = auth_header.split(' ')[1]
                 except: pass

            length = int(self.headers['Content-Length'])
            data = json.loads(self.rfile.read(length).decode())
            
            order_type = data.get('type') # 'COD' or 'ONLINE'
            cart_items = data.get('items', [])
            user_details = data.get('userDetails', {})
            payment_data = data.get('paymentData', {})

            if not cart_items:
                self._set_headers(400)
                self.wfile.write(json.dumps({'success': False, 'message': 'Cart empty'}).encode())
                return

            # 2. Recalculate Total
            try:
                with open(PRODUCTS_FILE, 'r') as f: all_products = json.load(f)
                
                total_amount = 0
                verified_items = []
                
                for item in cart_items:
                    # Match by Title or ID
                    product = next((p for p in all_products if p['title'] == item['title']), None)
                    if product:
                        price = product['price']
                        qty = int(item['quantity'])
                        total_amount += price * qty
                        verified_items.append({
                            'title': product['title'],
                            'price': price,
                            'quantity': qty,
                            'image': product['images'][0] if product['images'] else ''
                        })
                
                if not verified_items:
                    self._set_headers(400)
                    self.wfile.write(json.dumps({'success': False, 'message': 'No valid items'}).encode())
                    return

                # 3. Verify Payment (If Online)
                payment_status = 'Pending'
                payment_id = None
                
                if order_type == 'ONLINE':
                    raz_order_id = payment_data.get('razorpay_order_id')
                    raz_payment_id = payment_data.get('razorpay_payment_id')
                    raz_signature = payment_data.get('razorpay_signature')
                    
                    if not (raz_order_id and raz_payment_id and raz_signature):
                        self._set_headers(400)
                        self.wfile.write(json.dumps({'success': False, 'message': 'Missing payment data'}).encode())
                        return

                    # Verify Sig
                    key_id, key_secret = get_razorpay_creds()
                    msg = f"{raz_order_id}|{raz_payment_id}"
                    
                    generated_sig = hmac.new(
                        key_secret.encode(), 
                        msg.encode(), 
                        hashlib.sha256
                    ).hexdigest()
                    
                    if generated_sig == raz_signature:
                        payment_status = 'Paid'
                        payment_id = raz_payment_id
                    else:
                        self._set_headers(400)
                        self.wfile.write(json.dumps({'success': False, 'message': 'Payment verification failed'}).encode())
                        return
                
                # 4. Create Order
                final_order_id = f"ORD-{int(time.time())}-{secrets.token_hex(3).upper()}"
                
                new_order = {
                    'id': final_order_id,
                    'user_id': user_id,
                    'customer_name': user_details.get('name'),
                    'phone': user_details.get('phone'),
                    'address': user_details.get('address'),
                    'items': verified_items,
                    'total': total_amount,
                    'order_type': 'Cash on Delivery' if order_type == 'COD' else 'Online Payment',
                    'payment_status': payment_status,
                    'payment_id': payment_id,
                    'date': time.time(),
                    'status': 'Processing' # Fulfillment status
                }

                # Save Global
                orders = []
                if os.path.exists(ORDERS_FILE):
                     with open(ORDERS_FILE, 'r') as f:
                        try: orders = json.load(f)
                        except: orders = []
                orders.append(new_order)
                with open(ORDERS_FILE, 'w') as f: json.dump(orders, f, indent=2)

                # Save User & Clear Cart (if registered)
                if user_id != 'guest':
                    with open(USERS_FILE, 'r') as f: users = json.load(f)
                    user = next((u for u in users if u['id'] == user_id), None)
                    if user:
                        if 'orders' not in user: user['orders'] = []
                        user['orders'].append(new_order)
                        user['cart'] = [] # Clear
                        with open(USERS_FILE, 'w') as f: json.dump(users, f, indent=2)

                log_system_action('ORDER_PLACED', f"{order_type} Order {final_order_id} by {user_id}")

                self._set_headers(200)
                self.wfile.write(json.dumps({'success': True, 'orderId': final_order_id}).encode())

            except Exception as e:
                print(f"Order Place Error: {e}")
                self._set_headers(500)
                self.wfile.write(json.dumps({'success': False, 'message': str(e)}).encode())

    def do_GET(self):
        # --- USER CART LOAD ---
        if self.path.startswith('/api/user/cart/load'):
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            user_id = params.get('userId', [None])[0]
            
            if not user_id:
                self._set_headers(400)
                self.wfile.write(json.dumps({'success': False, 'message': 'Missing userId'}).encode())
                return
            
            try:
                with open(USERS_FILE, 'r') as f:
                    users = json.load(f)
                user = next((u for u in users if u['id'] == user_id), None)
                if user:
                    self._set_headers(200)
                    self.wfile.write(json.dumps({'success': True, 'cart': user.get('cart', [])}).encode())
                else:
                    self._set_headers(404)
                    self.wfile.write(json.dumps({'success': False, 'message': 'User not found'}).encode())
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({'success': False, 'message': str(e)}).encode())
            return

        # --- USER ORDERS ---
        elif self.path.startswith('/api/user/orders'):
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            user_id = params.get('userId', [None])[0]
            
            if not user_id:
                self._set_headers(400)
                self.wfile.write(json.dumps({'success': False, 'message': 'Missing userId'}).encode())
                return

            try:
                with open(USERS_FILE, 'r') as f:
                    users = json.load(f)
                
                user = next((u for u in users if u['id'] == user_id), None)
                
                if user:
                    user_orders = user.get('orders', [])
                    self._set_headers(200)
                    self.wfile.write(json.dumps({'success': True, 'orders': user_orders}).encode())
                else:
                    self._set_headers(404)
                    self.wfile.write(json.dumps({'success': False, 'message': 'User not found'}).encode())
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({'success': False, 'message': str(e)}).encode())
            return

        # --- USER PROFILE ---
        elif self.path.startswith('/api/user/profile'):
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            user_id = params.get('userId', [None])[0]
            
            if not user_id:
                self._set_headers(400)
                self.wfile.write(json.dumps({'success': False, 'message': 'Missing userId'}).encode())
                return

            try:
                with open(USERS_FILE, 'r') as f:
                    users = json.load(f)
                
                user = next((u for u in users if u['id'] == user_id), None)
                
                if user:
                    # Don't send sensitive info like password
                    safe_user = {
                        'id': user.get('id'),
                        'name': user.get('name'),
                        'identifier': user.get('email') or user.get('identifier'),
                        'avatar': user.get('avatar'),
                        'phone': user.get('phone', ''),
                        'joined': user.get('joined')
                    }
                    self._set_headers(200)
                    self.wfile.write(json.dumps({'success': True, 'user': safe_user}).encode())
                else:
                    self._set_headers(404)
                    self.wfile.write(json.dumps({'success': False, 'message': 'User not found'}).encode())
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({'success': False, 'message': str(e)}).encode())
            return

        # --- ADMIN DATA ENDPOINTS ---
        if self.path.startswith('/api/admin/data/'):
            if not self._is_admin():
                self._set_headers(403)
                self.wfile.write(json.dumps({'success': False, 'message': 'Unauthorized'}).encode())
                return

            endpoint = self.path.split('/')[-1]
            
            if endpoint == 'users':
                with open(USERS_FILE, 'r') as f: users = json.load(f)
                # Filter sensitive data
                safe_users = []
                for u in users:
                    safe_users.append({
                        'id': u.get('id'),
                        'name': u.get('name'),
                        'email': u.get('email'),
                        'phone': u.get('phone', 'N/A'), # phone might be in address/profile? 
                        'joined': u.get('joined'),
                        'last_login': u.get('last_login') # Need to ensure we track this on login
                    })
                self._set_headers(200)
                self.wfile.write(json.dumps(safe_users).encode())

            elif endpoint == 'carts':
                # Return active carts (non-empty)
                with open(USERS_FILE, 'r') as f: users = json.load(f)
                active_carts = []
                for u in users:
                    cart = u.get('cart', [])
                    if cart:
                        active_carts.append({
                            'user_id': u.get('id'),
                            'name': u.get('name'),
                            'cart_items': len(cart),
                            'last_updated': u.get('last_cart_update', time.time()) # track this?
                        })
                self._set_headers(200)
                self.wfile.write(json.dumps(active_carts).encode())

            elif endpoint == 'orders':
                # Active/Recent Orders
                with open(ORDERS_FILE, 'r') as f: orders = json.load(f)
                # Filter for active? Or just all? 
                # Request says "Orders Data" (Primary operational) vs "Saved / Archived" (Historical)
                # Let's assume 'Processing', 'Pending', 'Shipped' are active. 'Delivered', 'Cancelled' are archived.
                # For simplicity, let's return ALL orders here, and frontend filters, 
                # OR return active ones here and completed in archives.
                # Let's separate them.
                active_orders = [o for o in orders if o.get('status') not in ['Delivered', 'Cancelled', 'Archived']]
                # Sort by date desc
                active_orders.sort(key=lambda x: x['date'], reverse=True)
                self._set_headers(200)
                self.wfile.write(json.dumps(active_orders).encode())

            elif endpoint == 'archives':
                with open(ORDERS_FILE, 'r') as f: orders = json.load(f)
                archived_orders = [o for o in orders if o.get('status') in ['Delivered', 'Cancelled', 'Archived']]
                archived_orders.sort(key=lambda x: x['date'], reverse=True)
                self._set_headers(200)
                self.wfile.write(json.dumps(archived_orders).encode())
            
            else:
                self._set_headers(404)
                self.wfile.write(json.dumps({'success': False}).encode())

        # --- ADMIN CONFIG STATUS ---
        elif self.path == '/api/admin/config/razorpay/status':
             if not self._is_admin():
                self._set_headers(403)
                self.wfile.write(json.dumps({'success': False}).encode())
                return
             
             key, secret = get_razorpay_creds()
             self._set_headers(200)
             self.wfile.write(json.dumps({'configured': bool(key and secret)}).encode())

        # --- PUBLIC CONFIG CHECK (For Checkout) ---
        elif self.path == '/api/config/razorpay/status':
             # Publicly verify if online payment is available, DO NOT return keys
             key, secret = get_razorpay_creds()
             self._set_headers(200)
             self.wfile.write(json.dumps({'available': bool(key and secret)}).encode())

        # --- HERO CONFIG (PUBLIC) ---
        elif self.path == '/api/config/hero':
            try:
                config = {}
                if os.path.exists(ADMIN_CONFIG_FILE):
                     with open(ADMIN_CONFIG_FILE, 'r') as f:
                        try: config = json.load(f)
                        except: pass
                
                # Sane fallbacks
                default_desktop = [
                    "https://res.cloudinary.com/dwchxvpln/image/upload/q_auto/f_auto/v1778827257/Hero_1_tyebo9_469b5c.webp",
                    "https://res.cloudinary.com/dwchxvpln/image/upload/q_auto/f_auto/v1778827475/Hero_2_jzhmui_c725c5.webp",
                    "https://res.cloudinary.com/dwchxvpln/image/upload/q_auto/f_auto/v1778827873/Hero_3_etehtr_df7353.webp"
                ]
                default_mobile = [
                    "https://raw.githubusercontent.com/dipanjandatta3020-sys/HON-2/main/BEST%20SELLER/4.%20Bamboo%20Chairs/1.png",
                    "https://raw.githubusercontent.com/dipanjandatta3020-sys/HON-2/main/BEST%20SELLER/2.%20Bamboo%20Stools/1.png",
                    "https://raw.githubusercontent.com/dipanjandatta3020-sys/HON-2/main/BEST%20SELLER/3.%20Ceiling%20Bamboo%20Lamps/1.png"
                ]

                hero_config = config.get('hero_images', {})
                desktop = hero_config.get('desktop', default_desktop)
                mobile = hero_config.get('mobile', default_mobile)

                # Validate
                if len(desktop) != 3 or not all(x.strip() for x in desktop): desktop = default_desktop
                if len(mobile) != 3 or not all(x.strip() for x in mobile): mobile = default_mobile

                self._set_headers(200)
                self.wfile.write(json.dumps({
                    'desktop': desktop,
                    'mobile': mobile
                }).encode())
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({'error': str(e)}).encode())

        # --- PRODUCTS (GET) ---
        elif self.path == '/api/products':
            try:
                with open(PRODUCTS_FILE, 'r') as f:
                    products = json.load(f)
                self._set_headers(200)
                self.wfile.write(json.dumps(products).encode())
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({'error': str(e)}).encode())

        else:
            super().do_GET()

print(f"Starting server on port {PORT}")
class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True

with ThreadingHTTPServer(("", PORT), CustomHandler) as httpd:
    httpd.serve_forever()
