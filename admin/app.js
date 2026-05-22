/**
 * Admin Panel Application Logic
 */

// API Base URL (relative)
const API_URL = 'http://localhost:8080/api';

// State
let allProducts = [];
let currentFilter = 'all';
let currentEditingId = null; // null for new product
let tempImages = [null, null, null, null, null]; // 5 slots

document.addEventListener('DOMContentLoaded', () => {
    // Determine current page
    const isLoginPage = document.getElementById('login-form');
    const isDashboard = document.getElementById('admin-dashboard');

    if (isLoginPage) {
        setupLogin();
    } else if (isDashboard) {
        checkAuth();
        setupDashboard();
    }
});

function getAuthHeaders() {
    const token = localStorage.getItem('adminToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

/**
 * Login Logic
 */
function setupLogin() {
    const form = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMsg = document.getElementById('error-msg');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value;
        const password = passwordInput.value;

        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                if (data.isAdmin) {
                    localStorage.setItem('adminToken', data.token);
                    window.location.href = 'index.html';
                } else {
                    errorMsg.innerText = 'Access Denied: Not an Admin';
                    errorMsg.style.display = 'block';
                }
            } else {
                errorMsg.innerText = data.message || 'Invalid Credentials';
                errorMsg.style.display = 'block';
            }
        } catch (error) {
            console.error('Login error:', error);
            errorMsg.innerText = 'Connection error. Check server.';
            errorMsg.style.display = 'block';
        }
    });
}

/**
 * Authentication Check
 */
function checkAuth() {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = 'login.html';
    }
}

/**
 * Dashboard Logic
 */
async function setupDashboard() {
    console.log('Initializing Dashboard...');

    // 0. Setup Logout first
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Logging out...');
            localStorage.removeItem('adminToken');
            window.location.href = 'login.html';
        });
    }

    // 1. Load Products
    await fetchProducts();

    // 2. Setup Navigation/Filtering
    setupNavigation();

    // 3. Setup Modal & Form
    setupModal();
}

async function fetchProducts() {
    try {
        const response = await fetch(`${API_URL}/products`);
        if (response.ok) {
            allProducts = await response.json();
            renderProducts();
        } else {
            console.error('Failed to load products');
            showNotification('Failed to load products', true);
        }
    } catch (error) {
        console.error('Error fetching products:', error);
        showNotification('Connection error', true);
    }
}

function renderProducts() {
    const grid = document.getElementById('admin-product-grid');
    grid.innerHTML = '';

    const pageTitle = document.getElementById('page-title');
    pageTitle.innerText = currentFilter === 'all' ? 'All Products' : currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1);

    const filtered = currentFilter === 'all'
        ? allProducts
        : allProducts.filter(p => p.category === currentFilter);

    filtered.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        const displayImg = product.images && product.images[0] ? `${product.images[0]}` : '';

        card.innerHTML = `
            <div class="card-img-container">
                <img src="${displayImg}" alt="${product.title}" class="card-img">
            </div>
            <div class="card-body">
                <div class="card-category">${product.category || 'Uncategorized'}</div>
                <h3 class="card-title">${product.title}</h3>
                <div class="card-price">₹ ${product.price.toFixed(2)}</div>
                <button class="edit-btn" onclick="openEditModal('${product.id}')">Edit</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Global scope for onclick
window.openEditModal = (id) => {
    const product = allProducts.find(p => p.id === id);
    if (product) {
        currentEditingId = id;
        openModal(product);
    }
};

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            // Update UI
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Filter
            const filter = link.getAttribute('data-filter');
            if (filter === 'data') {
                setupDataView();
            } else {
                // Restore Product View
                document.getElementById('data-view').style.display = 'none';
                document.getElementById('admin-product-grid').style.display = 'grid'; // grid or flex? Check CSS. Usually grid.
                document.getElementById('add-product-btn').style.display = 'block';

                currentFilter = filter;
                renderProducts();
            }
        });
    });

    document.getElementById('add-product-btn').addEventListener('click', () => {
        currentEditingId = null;
        openModal(null); // New product
    });
}

// Modal & Form Logic
const modal = document.getElementById('product-modal');
const form = document.getElementById('product-form');
const urlInputs = [
    document.getElementById('img-url-0'),
    document.getElementById('img-url-1'),
    document.getElementById('img-url-2'),
    document.getElementById('img-url-3'),
    document.getElementById('img-url-4')
];

function openModal(product) {
    const titleEl = document.getElementById('modal-title');

    // Reset Form
    form.reset();
    tempImages = [null, null, null, null, null];

    if (product) {
        titleEl.innerText = 'Edit Product';
        document.getElementById('edit-title').value = product.title;
        document.getElementById('edit-price').value = product.price;
        document.getElementById('edit-description').value = product.description || '';
        document.getElementById('edit-category').value = product.category || 'other';
        document.getElementById('edit-bestseller').checked = !!product.isBestSeller;
        document.getElementById('edit-bamboogifts').checked = !!product.isBambooGift;

        // Allow up to 5 images
        for (let i = 0; i < 5; i++) {
            if (product.images && product.images[i]) {
                tempImages[i] = product.images[i];
                urlInputs[i].value = product.images[i];
            } else {
                urlInputs[i].value = '';
            }
        }
    } else {
        titleEl.innerText = 'Add New Product';
        for (let i = 0; i < 5; i++) urlInputs[i].value = '';
        // Defaults
    }

    renderImagePreviews();
    modal.classList.add('open');
}

function closeModal() {
    modal.classList.remove('open');
}

document.getElementById('close-modal').addEventListener('click', closeModal);
document.getElementById('cancel-modal').addEventListener('click', closeModal);

// Image URL Handling
const previewBoxes = document.querySelectorAll('.img-preview-box');
urlInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        tempImages[index] = url ? url : null;
        renderImagePreviews();
    });
});

function renderImagePreviews() {
    previewBoxes.forEach((box, index) => {
        const path = tempImages[index];
        box.innerHTML = '';
        if (path) {
            const displayPath = `${path}`;
            box.innerHTML = `<img src="${displayPath}">`;
        } else {
            box.innerHTML = `<span>${index === 0 ? 'Main' : (index === 1 ? 'Hover' : index + 1)}</span>`;
        }

        // Highlight active or filled?
        if (path) box.classList.add('filled');
        else box.classList.remove('filled');
    });
}

// Form Submit (Save)
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Construct Product Object
    const title = document.getElementById('edit-title').value;
    const price = parseFloat(document.getElementById('edit-price').value);
    const description = document.getElementById('edit-description').value;
    const category = document.getElementById('edit-category').value;
    const isBestSeller = document.getElementById('edit-bestseller').checked;
    const isBambooGift = document.getElementById('edit-bamboogifts').checked;

    const images = tempImages.filter(img => img !== null);

    if (images.length === 0) {
        showNotification('Please upload at least one image (Main)', true);
        return;
    }

    const newProduct = {
        id: currentEditingId || Date.now().toString(), // Generate ID if new
        title,
        price,
        description,
        category,
        isBestSeller,
        isBambooGift,
        images
    };

    // Note: We don't update local array here, we wait for server confirmation and reload or trust server?
    // Let's optimistic update for now or just reload. 
    // Actually, pushing to local array then sending ALL products is what the original code did.
    // Ideally we should just send the ONE product to save, but server expects ALL products or implies it?
    // Checking server.py: '/api/products' calls 'log_system_action' and overwrites PRODUCTS_FILE with data.
    // So YES, we must send ALL products.

    // Update Local Data Copy
    let updatedProducts = [...allProducts];
    if (currentEditingId) {
        const index = updatedProducts.findIndex(p => p.id === currentEditingId);
        if (index > -1) updatedProducts[index] = newProduct;
    } else {
        updatedProducts.push(newProduct);
    }

    // Save to Server
    try {
        const response = await fetch(`${API_URL}/products`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(updatedProducts)
        });

        if (response.ok) {
            allProducts = updatedProducts; // Confirm update
            closeModal();
            renderProducts();
            showNotification('Changes saved successfully!');
        } else {
            showNotification('Failed to save product', true);
        }
    } catch (error) {
        console.error('Save error:', error);
        showNotification('Save error', true);
    }
});

// --- DATA VIEW LOGIC ---
async function setupDataView() {
    const dataView = document.getElementById('data-view');
    const productGrid = document.getElementById('admin-product-grid');
    const pageTitle = document.getElementById('page-title');
    const addBtn = document.getElementById('add-product-btn');
    const dataTabs = document.querySelectorAll('.data-tab-btn');

    // Switch to Data View
    dataView.style.display = 'block';
    productGrid.style.display = 'none';
    addBtn.style.display = 'none'; // Hide Add Product button in Data view
    pageTitle.innerText = 'Data Dashboard';

    // Tab Click
    dataTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            dataTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadData(tab.dataset.type);
        });
    });

    // Setup Config Logic
    setupRazorpayConfig();

    // Load default
    loadData('users');
}

async function setupRazorpayConfig() {
    const statusEl = document.getElementById('config-status');
    const saveBtn = document.getElementById('save-config-btn');

    // Check Status
    try {
        const res = await fetch(`${API_URL}/admin/config/razorpay/status`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.configured) {
            statusEl.innerText = "Current Status: Keys Configured ✅";
            statusEl.style.color = "green";
        } else {
            statusEl.innerText = "Current Status: Not Configured ⚠️";
            statusEl.style.color = "orange";
        }
    } catch (e) { console.error(e); }

    // Save Logic
    saveBtn.onclick = async () => {
        const keyId = document.getElementById('razorpay-key-id').value.trim();
        const keySecret = document.getElementById('razorpay-key-secret').value.trim();

        if (!keyId || !keySecret) {
            showNotification('Please enter both keys', true);
            return;
        }

        try {
            const res = await fetch(`${API_URL}/admin/config/razorpay`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ keyId, keySecret })
            });
            const data = await res.json();
            if (data.success) {
                showNotification('Keys saved successfully');
                statusEl.innerText = "Current Status: Keys Configured ✅";
                statusEl.style.color = "green";
                // Clear inputs for security
                document.getElementById('razorpay-key-id').value = '';
                document.getElementById('razorpay-key-secret').value = '';
            } else {
                showNotification(data.message || 'Error saving keys', true);
            }
        } catch (e) {
            showNotification('Connection error', true);
        }
    };
}

async function loadData(type) {
    const container = document.getElementById('data-table-container');
    container.innerHTML = '<p>Loading...</p>';

    try {
        const res = await fetch(`${API_URL}/admin/data/${type}`, {
            headers: getAuthHeaders()
        });

        if (res.status === 401 || res.status === 403) {
            container.innerHTML = `<p style="color:red">Unauthorized. <a href="login.html">Login</a></p>`;
            return;
        }

        const data = await res.json();
        renderDataTable(type, data);
    } catch (e) {
        container.innerHTML = `<p style="color:red">Error loading data: ${e.message}</p>`;
    }
}

function renderDataTable(type, data) {
    const container = document.getElementById('data-table-container');

    if (!data || data.length === 0) {
        container.innerHTML = '<p>No records found.</p>';
        return;
    }

    let headers = [];
    if (type === 'users') {
        headers = ['User ID', 'Name', 'Email', 'Phone', 'Created', 'Last Login'];
    } else if (type === 'carts') {
        headers = ['User ID', 'Name', 'Items Count', 'Last Updated'];
    } else if (type === 'orders' || type === 'archives') {
        headers = ['Order ID', 'User ID', 'Customer Info', 'Address', 'Products', 'Total', 'Type', 'Status', 'Payment ID', 'Date'];
    }

    let html = '<table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.9rem;">';
    html += '<thead><tr style="background:#f9f9f9; border-bottom:2px solid #eee;">';
    headers.forEach(h => html += `<th style="padding:12px; font-weight:600;">${h}</th>`);
    html += '</tr></thead><tbody>';

    data.forEach(row => {
        html += '<tr style="border-bottom:1px solid #eee;">';
        if (type === 'users') {
            html += `<td style="padding:12px;">${row.id}</td>`;
            html += `<td style="padding:12px;">${row.name}</td>`;
            html += `<td style="padding:12px;">${row.email}</td>`;
            html += `<td style="padding:12px;">${row.phone || 'N/A'}</td>`;
            html += `<td style="padding:12px;">${new Date(row.joined * 1000).toLocaleDateString()}</td>`;
            html += `<td style="padding:12px;">${row.last_login ? new Date(row.last_login * 1000).toLocaleString() : 'Never'}</td>`;
        } else if (type === 'carts') {
            html += `<td style="padding:12px;">${row.user_id}</td>`;
            html += `<td style="padding:12px;">${row.name || 'Guest'}</td>`;
            html += `<td style="padding:12px;">${row.cart_items}</td>`;
            html += `<td style="padding:12px;">${new Date(row.last_updated * 1000).toLocaleString()}</td>`;
        } else if (type === 'orders' || type === 'archives') {
            html += `<td style="padding:12px;">${row.id}</td>`;
            html += `<td style="padding:12px;">${row.user_id}</td>`;
            html += `<td style="padding:12px;"><strong>${row.customer_name}</strong><br>${row.phone}</td>`;
            html += `<td style="padding:12px; max-width:150px;">${row.address}</td>`;

            // Products List
            let productsHtml = '<ul style="padding-left:15px; margin:0;">';
            if (row.items && Array.isArray(row.items)) {
                row.items.forEach(item => {
                    productsHtml += `<li>${item.title} (x${item.quantity})</li>`;
                });
            }
            productsHtml += '</ul>';
            html += `<td style="padding:12px;">${productsHtml}</td>`;

            html += `<td style="padding:12px;">₹${row.total}</td>`;
            html += `<td style="padding:12px;">${row.order_type}</td>`;

            // Payment Status Color
            let pStatusColor = row.payment_status === 'Paid' ? 'green' : (row.payment_status === 'Pending' ? 'orange' : 'black');
            html += `<td style="padding:12px;"><span style="color:${pStatusColor}; font-weight:bold">${row.payment_status}</span><br><span style="font-size:0.8em; color:#666">${row.status}</span></td>`;

            html += `<td style="padding:12px;">${row.payment_id || '-'}</td>`;
            html += `<td style="padding:12px;">${new Date(row.date * 1000).toLocaleString()}</td>`;
        }
        html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

function showNotification(msg, isError = false) {
    const notif = document.getElementById('notification');
    notif.innerText = msg;
    notif.style.backgroundColor = isError ? '#f8d7da' : '#d4edda';
    notif.style.color = isError ? '#721c24' : '#155724';
    notif.style.display = 'block';
    setTimeout(() => {
        notif.style.display = 'none';
    }, 3000);
}
