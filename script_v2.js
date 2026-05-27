/**
 * Dynamic Product Loading & Interaction Logic
 */
document.addEventListener('DOMContentLoaded', async () => {
    // --- Configuration & State ---
    let allProducts = [];
    let cart = JSON.parse(localStorage.getItem('cart')) || [];

    // --- DOM Elements ---
    const bestSellerGrid = document.getElementById('best-seller-grid');
    const giftTrack = document.getElementById('giftTrack');

    // Modal Elements
    const fullPageModal = document.getElementById('product-full-page');
    const closeBtn = document.getElementById('close-full-page-btn');
    const fullPageImage = document.getElementById('full-page-product-image');
    // const fullPageTitle = document.getElementById('full-page-product-title'); // Not used?
    // const fullPagePrice = document.getElementById('full-page-product-price'); // Not used?
    const qtyInput = document.getElementById('qty-input-full');
    const qtyMinus = document.getElementById('qty-minus-full');
    const qtyPlus = document.getElementById('qty-plus-full');
    const addToCartBtn = document.getElementById('add-to-cart-btn-full');
    const buyNowBtn = document.getElementById('buy-now-btn-full');

    // Gallery Elements
    const galleryPrev = document.getElementById('gallery-prev');
    const galleryNext = document.getElementById('gallery-next');
    const itemsContainer = document.querySelector('.gallery-thumbnails');

    // Cart & Nav Elements
    const cartCountEl = document.getElementById('cart-count');
    const cartBtn = document.getElementById('cart-btn');
    const menuBtn = document.getElementById('menu-btn');
    const leftPanel = document.getElementById('left-side-panel');
    const closeLeftBtn = document.getElementById('close-left-panel-btn');
    const overlay = document.getElementById('overlay');

    // Current Product State
    let currentProduct = null;
    let currentImageIndex = 0;
    let productImages = [];

    // --- Initialization ---
    await initializeCart(); // Load user-specific cart first
    updateCartIcon();
    setupNavEvents();
    setupCartEvents();
    setupModalEvents();

    // Fetch and render LAST to ensure elements are ready and listeners can be attached
    await fetchAndRenderProducts();
    setupCarousel();

    // --- Functions ---

    async function fetchAndRenderProducts() {
        try {
            // Try fetching from API first, fallback to file if needed (though API is preferred)
            const response = await fetch('/api/products');
            if (response.ok) {
                allProducts = await response.json();
            } else {
                // Should not happen if server.py is running, but handling mainly for robustness
                const res = await fetch('products.json');
                allProducts = await res.json();
            }
            console.log('Products loaded:', allProducts.length); // DEBUG
        } catch (error) {
            console.error("Error loading products:", error);
            // Optional: Show error on UI
            return;
        }

        // Render Best Sellers
        if (bestSellerGrid) {
            const bestSellers = allProducts.filter(p => p.isBestSeller).slice(0, 8);
            bestSellerGrid.innerHTML = bestSellers.map(p => createProductCardHTML(p)).join('');
        }

        // Render Carousel (Bamboo Gifts)
        if (giftTrack) {
            const bambooGifts = allProducts.filter(p => p.isBambooGift);
            giftTrack.innerHTML = bambooGifts.map(p => createProductCardHTML(p, true)).join('');
        }

        // Render Category Page Grids
        const categoryGrid = document.getElementById('product-grid');

        // Detect category from filename if not explicitly set in dataset
        let category = categoryGrid ? categoryGrid.dataset.category : null;
        if (!category && categoryGrid) {
            const page = window.location.pathname.split('/').pop().replace('.html', '');
            // Map filename to category names in JSON
            const categoryMap = {
                'furniture': 'Furniture',
                'lighting': 'Lighting',
                'bags': 'Bags',
                // Add others as needed
            };
            category = categoryMap[page] || page.charAt(0).toUpperCase() + page.slice(1);
        }

        if (categoryGrid && category) {
            console.log('Loading products for category:', category);
            const categoryProducts = allProducts.filter(p => p.category === category || p.category.toLowerCase() === category.toLowerCase());

            if (categoryProducts.length === 0) {
                categoryGrid.innerHTML = '<p>No products found in this category.</p>';
            } else {
                categoryGrid.innerHTML = categoryProducts.map(p => createProductCardHTML(p)).join('');
            }
        }
    }

    function createProductCardHTML(product, isCarousel = false) {
        // Ensure images exist
        const defaultImg = product.images[0] || 'placeholder.png';
        const hoverImg = product.images[1] || defaultImg;

        const cardHtml = `
            <div class="product-card ${isCarousel ? 'carousel-card' : ''}" data-id="${product.id}">
                <div class="product-image">
                    <img src="${defaultImg}" alt="${product.title}" class="img-default">
                    <img src="${hoverImg}" alt="${product.title} Hover" class="img-hover">
                </div>
                <h3 class="product-title">${product.title}</h3>
                <p class="product-price">₹ ${product.price.toFixed(2)}</p>
            </div>
        `;
        return cardHtml;
    }

    // Event Delegation for Product Cards (Handles both initial and dynamic content)
    document.body.addEventListener('click', (e) => {
        const card = e.target.closest('.product-card');
        if (card) {
            const productId = card.getAttribute('data-id');
            // Redundant if onclick is present, but good for safety
            window.location.href = `product-details.html?id=${productId}`;
        }
    });



    // Quick Buy Function - Add to cart and open checkout
    window.quickBuyProduct = function (productId) {
        console.log('Quick buy for product:', productId);

        // Find the product
        const product = allProducts.find(p => p.id === productId);
        if (!product) {
            console.error('Product not found:', productId);
            return;
        }

        // Add to cart
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        const existingItemIndex = cart.findIndex(item => item.title === product.title);

        if (existingItemIndex > -1) {
            cart[existingItemIndex].quantity += 1;
        } else {
            cart.push({
                title: product.title,
                price: product.price,
                image: product.images[0],
                quantity: 1
            });
        }

        localStorage.setItem('cart', JSON.stringify(cart));
        window.dispatchEvent(new CustomEvent('cartUpdated'));

        // Open checkout modal
        window.checkoutState.cartItems = cart;
        if (typeof window.openCheckoutModal === 'function') {
            window.openCheckoutModal();
        } else {
            // Fallback - redirect to cart if checkout not available
            window.location.href = 'cart.html';
        }
    };

    // Kept for backward compatibility if called elsewhere, but we prefer navigation now.
    function openFullPageModal(product) {
        // Redirecting even if this internal function is called
        window.location.href = `product-details.html?id=${product.id}`;
    }

    // --- Carousel Logic ---
    function setupCarousel() {
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        if (!giftTrack || !prevBtn || !nextBtn) return;

        let currentSlide = 0;
        const itemsPerView = 4; // Simplified
        const totalSlides = Math.ceil(allProducts.length / itemsPerView);

        function updateCarouselView() {
            const percentage = currentSlide * -100;
            giftTrack.style.transform = `translateX(${percentage}%)`;

            prevBtn.style.display = currentSlide === 0 ? 'none' : 'flex';
            nextBtn.style.display = currentSlide >= totalSlides - 1 ? 'none' : 'flex';
        }

        nextBtn.addEventListener('click', () => {
            if (currentSlide < totalSlides - 1) {
                currentSlide++;
                updateCarouselView();
            }
        });

        prevBtn.addEventListener('click', () => {
            if (currentSlide > 0) {
                currentSlide--;
                updateCarouselView();
            }
        });

        // Initial state
        updateCarouselView();
    }

    // --- Toast Notification Logic ---
    function showToast(message, type = 'info') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = `
                position: fixed; bottom: 20px; right: 20px; z-index: 10000;
                display: flex; flex-direction: column; gap: 10px;
            `;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.style.cssText = `
            background: ${type === 'error' ? '#ffdddd' : '#333'};
            color: ${type === 'error' ? '#d8000c' : '#fff'};
            padding: 12px 24px; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            font-family: 'Outfit', sans-serif; opacity: 0; transform: translateY(20px);
            transition: all 0.3s ease; min-width: 250px;
        `;
        toast.innerText = message;

        container.appendChild(toast);

        // Animate In
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        // Remove after 3s
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // --- Modal Logic ---
    function setupModalEvents() {
        if (closeBtn) closeBtn.addEventListener('click', closeFullPage);

        // Gallery Nav
        if (galleryNext) galleryNext.addEventListener('click', () => {
            currentImageIndex = (currentImageIndex + 1) % productImages.length;
            updateGallery();
        });

        if (galleryPrev) galleryPrev.addEventListener('click', () => {
            // Correct modulo for negative numbers
            currentImageIndex = (currentImageIndex - 1 + productImages.length) % productImages.length;
            updateGallery();
        });

        // Quantity
        if (qtyMinus) qtyMinus.addEventListener('click', () => {
            let val = parseInt(qtyInput.value);
            if (val > 1) {
                qtyInput.value = val - 1;
                currentProduct.quantity = val - 1;
            }
        });

        if (qtyPlus) qtyPlus.addEventListener('click', () => {
            let val = parseInt(qtyInput.value);
            qtyInput.value = val + 1;
            currentProduct.quantity = val + 1;
        });

        // Add to Cart
        if (addToCartBtn) addToCartBtn.addEventListener('click', () => {
            if (!currentProduct) return;
            const existingItemIndex = cart.findIndex(item => item.title === currentProduct.title);
            if (existingItemIndex > -1) {
                cart[existingItemIndex].quantity += currentProduct.quantity;
            } else {
                cart.push({
                    title: currentProduct.title,
                    price: currentProduct.price,
                    image: currentProduct.images[0],
                    quantity: currentProduct.quantity
                });
            }
            saveCart();
            closeFullPage();
            showToast('Added to cart successfully!');
        });

        if (buyNowBtn) buyNowBtn.addEventListener('click', () => {
            const qtyInput = document.getElementById('detail-qty-input');
            const qty = qtyInput ? parseInt(qtyInput.value) : 1;

            // Add to cart first
            addToCartGlobal(currentProduct, qty);

            // Then open checkout
            if (typeof window.openCheckoutModal === 'function') {
                window.openCheckoutModal();
            } else {
                window.location.href = 'cart.html';
            }
        });
    }

    function closeFullPage() {
        fullPageModal.classList.remove('open');
        document.body.style.overflow = '';
    }

    function updateGallery() {
        const currentSrc = productImages[currentImageIndex];
        if (currentSrc) {
            fullPageImage.src = currentSrc;
            fullPageImage.style.opacity = '1';
        } else {
            fullPageImage.src = '';
            fullPageImage.style.opacity = '0';
        }
        renderThumbnails();
    }

    function renderThumbnails() {
        if (!itemsContainer) return;
        itemsContainer.innerHTML = '';
        productImages.forEach((src, index) => {
            const thumb = document.createElement('div');
            thumb.className = `thumb ${index === currentImageIndex ? 'active' : ''}`;
            if (src) {
                const img = document.createElement('img');
                img.src = src;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                thumb.appendChild(img);
            } else {
                thumb.classList.add('placeholder');
            }
            thumb.addEventListener('click', () => {
                currentImageIndex = index;
                updateGallery();
            });
            itemsContainer.appendChild(thumb);
        });
    }

    // --- Cart & Nav Logic ---
    function setupCartEvents() {
        if (cartBtn) cartBtn.addEventListener('click', () => window.location.href = 'cart.html');
    }

    /*
     * STRICT AUTH & CART LOGIC
     * 1. Guest: LocalStorage only ('guestCart').
     * 2. LoggedIn: Server Source of Truth.
     *    - On Login: Fetch from server -> Overwrite Local.
     *    - On Action: Update Local -> Sync Server.
     *    - On Logout: Clear Local.
     */

    async function initializeCart() {
        const userToken = localStorage.getItem('userToken');

        if (userToken) {
            // USER MODE
            try {
                // Fetch User Cart from Server (Source of Truth)
                const response = await fetch(`/api/user/cart/load?userId=${userToken}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        // REPLACES any local state with Server state
                        cart = data.cart || [];
                        localStorage.setItem('cart', JSON.stringify(cart)); // Persist for this session/refresh
                        console.log('[Auth] User cart loaded from server:', cart.length, 'items');
                    }
                } else {
                    console.warn('[Auth] Failed to load user cart, clearing local to avoid stale data.');
                    cart = JSON.parse(localStorage.getItem('cart')) || [];
                }
            } catch (error) {
                console.error('[Auth] Error loading user cart:', error);
                cart = JSON.parse(localStorage.getItem('cart')) || [];
            }
        } else {
            // GUEST MODE
            cart = JSON.parse(localStorage.getItem('cart')) || [];
            console.log('[Auth] Guest cart loaded:', cart.length, 'items');
        }
        updateCartIcon();
    }

    function saveCart() {
        // ALWAYS update local display/storage first for UI responsiveness
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartIcon();

        // If User, SYNC to Server
        const userToken = localStorage.getItem('userToken');
        if (userToken) {
            syncCartToServer();
        }
    }

    async function syncCartToServer() {
        const userToken = localStorage.getItem('userToken');
        if (!userToken) return;

        try {
            await fetch('/api/user/cart/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userToken,
                    cart: cart
                })
            });
            console.log('[Auth] Cart synced to server');
        } catch (error) {
            console.error('[Auth] Error syncing cart:', error);
        }
    }

    // --- Navigation & Cart UI Helper ---
    function setupNavEvents() {
        if (menuBtn && leftPanel && overlay) {
            menuBtn.addEventListener('click', () => {
                leftPanel.classList.add('open');
                overlay.classList.add('open');
            });

            if (closeLeftBtn) {
                closeLeftBtn.addEventListener('click', () => {
                    leftPanel.classList.remove('open');
                    overlay.classList.remove('open');
                });
            }

            overlay.addEventListener('click', () => {
                leftPanel.classList.remove('open');
                overlay.classList.remove('open');
            });
        }
    }

    function updateCartIcon() {
        if (cartCountEl) {
            const totalQty = cart.reduce((acc, item) => acc + (item.quantity || 1), 0);
            cartCountEl.innerText = totalQty;
        }
    }

    // --- Search & Auth Logic ---
    // Search Logic
    const searchBtn = document.getElementById('search-btn');
    const searchContainer = document.getElementById('search-container');
    const searchInput = document.getElementById('search-input');
    const closeSearch = document.getElementById('close-search');

    if (searchBtn && searchContainer) {
        searchBtn.addEventListener('click', () => {
            searchContainer.style.display = 'flex';
            searchInput.focus();
        });

        closeSearch.addEventListener('click', () => {
            searchContainer.style.display = 'none';
        });

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    window.location.href = `search.html?q=${encodeURIComponent(query)}`;
                }
            }
        });
    }

    // Account Logic
    const accountBtn = document.getElementById('account-btn');
    if (accountBtn) {
        accountBtn.addEventListener('click', () => {
            const token = localStorage.getItem('userToken');
            if (token) {
                window.location.href = 'profile.html';
            } else {
                window.location.href = 'login.html';
            }
        });
    }

    // --- Product Details Page Setup ---
    async function setupProductDetailsPage() {
        if (!window.location.pathname.includes('product-details.html')) return;

        const urlParams = new URLSearchParams(window.location.search);
        const productId = urlParams.get('id');
        if (!productId) return;

        // Wait for products if needed
        if (allProducts.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const product = allProducts.find(p => p.id === productId);
        if (!product) return;

        currentProduct = product;

        // Set title and price
        const titleEl = document.getElementById('detail-title');
        if (titleEl) titleEl.innerText = product.title;

        const priceEl = document.getElementById('detail-price');
        if (priceEl) priceEl.innerText = `₹ ${product.price.toFixed(2)}`;

        const descEl = document.getElementById('detail-description');
        if (descEl) descEl.innerHTML = product.description ? `<p>${product.description.replace(/\n/g, '<br>')}</p>` : `<p>Premium bamboo product.</p>`;

        // Set main image
        const mainImg = document.getElementById('detail-image');
        const images = product.images || ['placeholder.png'];
        if (mainImg) mainImg.src = images[0];

        // Create thumbnails
        const thumbContainer = document.getElementById('detail-thumbnails');
        if (thumbContainer) {
            thumbContainer.innerHTML = '';
            images.slice(0, 5).forEach((src, idx) => {
                const thumb = document.createElement('div');
                thumb.className = `thumbnail-item ${idx === 0 ? 'active' : ''}`;
                thumb.innerHTML = `<img src="${src}" alt="Thumbnail">`;
                thumb.onclick = () => {
                    if (mainImg) mainImg.src = src;
                    document.querySelectorAll('.thumbnail-item').forEach(t => t.classList.remove('active'));
                    thumb.classList.add('active');
                };
                thumbContainer.appendChild(thumb);
            });
        }

        // Setup Add to Cart button
        const addBtn = document.getElementById('detail-add-to-cart');
        if (addBtn) {
            addBtn.onclick = () => {
                const qtyInput = document.getElementById('detail-qty-input');
                const qty = qtyInput ? parseInt(qtyInput.value) : 1;
                addToCartGlobal(product, qty);
            };
        }

        const buyNowBtn = document.getElementById('detail-buy-now');
        if (buyNowBtn) {
            buyNowBtn.onclick = () => {
                const qtyInput = document.getElementById('detail-qty-input');
                const qty = (qtyInput && qtyInput.value) ? parseInt(qtyInput.value) : 1;

                // Add to cart
                addToCartGlobal(product, qty);

                // Open checkout
                if (typeof window.openCheckoutModal === 'function') {
                    // Sync state specifically for checkout
                    window.checkoutState.cartItems = JSON.parse(localStorage.getItem('cart')) || [];
                    window.openCheckoutModal();
                } else {
                    window.location.href = 'cart.html';
                }
            };
        }

        // Setup quantity buttons
        const minusBtn = document.getElementById('detail-qty-minus');
        const plusBtn = document.getElementById('detail-qty-plus');
        const qtyInput = document.getElementById('detail-qty-input');

        if (minusBtn && qtyInput) {
            minusBtn.onclick = () => {
                let val = parseInt(qtyInput.value);
                if (val > 1) qtyInput.value = val - 1;
            };
        }

        if (plusBtn && qtyInput) {
            plusBtn.onclick = () => {
                qtyInput.value = parseInt(qtyInput.value) + 1;
            };
        }
    }

    function addToCartGlobal(product, quantity) {
        const existingItemIndex = cart.findIndex(item => item.title === product.title);
        if (existingItemIndex > -1) {
            cart[existingItemIndex].quantity += quantity;
        } else {
            cart.push({
                title: product.title,
                price: product.price,
                image: product.images[0],
                quantity: quantity
            });
        }
        saveCart();
        showToast('Added to cart successfully!');

        // Dispatch custom event to update cart icon immediately
        window.dispatchEvent(new CustomEvent('cartUpdated'));
    }

    // Listen for cart updates from other pages/components
    window.addEventListener('cartUpdated', () => {
        cart = JSON.parse(localStorage.getItem('cart')) || [];
        updateCartIcon();
    });

    // Call setup immediately
    setupProductDetailsPage();
});

// ==========================================
// CHECKOUT FLOW LOGIC
// ==========================================
const API_URL = '/api';
window.checkoutState = {
    selectedMethod: null,
    userDetails: {},
    razorpayOrderId: null,
    finalOrderId: null,
    cartItems: []
};

// Expose as global for cart.html
window.openCheckoutModal = openCheckoutModal;

// Initialize Checkout Modal
document.addEventListener('DOMContentLoaded', () => {
    const checkoutModal = document.getElementById('checkout-modal');
    const closeCheckoutBtn = document.getElementById('close-checkout-btn');
    const checkoutBtn = document.querySelector('.checkout-btn'); // Assumes existing button

    // Open Checkout Modal when "Proceed to Buy" is clicked
    if (checkoutBtn) {
        checkoutBtn.onclick = () => {
            const cart = JSON.parse(localStorage.getItem('cart')) || [];
            if (cart.length === 0) {
                showToast('Your cart is empty!');
                return;
            }
            window.checkoutState.cartItems = cart;
            openCheckoutModal();
        };
    }

    // Close Checkout Modal
    if (closeCheckoutBtn) {
        closeCheckoutBtn.onclick = closeCheckoutModal;
    }

    // Step 1: Payment Method Selection
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.onclick = () => {
            window.checkoutState.selectedMethod = btn.dataset.method;
            showCheckoutStep(2);
        };
    });

    // Step 2: Back Button
    const backBtn = document.getElementById('back-to-step-1');
    if (backBtn) {
        backBtn.onclick = () => showCheckoutStep(1);
    }

    // Step 2: Form Submission
    const checkoutForm = document.getElementById('checkout-form');
    if (checkoutForm) {
        checkoutForm.onsubmit = async (e) => {
            e.preventDefault();

            const submitBtn = checkoutForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.dataset.originalText = submitBtn.innerText;
                submitBtn.innerText = 'Processing...';
                submitBtn.disabled = true;
            }

            window.checkoutState.userDetails = {
                name: document.getElementById('cust-name').value.trim(),
                phone: document.getElementById('cust-phone').value.trim(),
                altPhone: document.getElementById('cust-alt-phone').value.trim(),
                address: document.getElementById('cust-address').value.trim()
            };

            try {
                if (window.checkoutState.selectedMethod === 'COD') {
                    await processCODOrder();
                } else if (window.checkoutState.selectedMethod === 'ONLINE') {
                    await processOnlinePayment();
                }
            } finally {
                if (submitBtn) {
                    submitBtn.innerText = submitBtn.dataset.originalText;
                    submitBtn.disabled = false;
                }
            }
        };
    }

    // Check Razorpay availability on load
    checkRazorpayAvailability();
});

function loadRazorpayScript() {
    if (!document.getElementById('razorpay-checkout-script')) {
        const script = document.createElement('script');
        script.id = 'razorpay-checkout-script';
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.body.appendChild(script);
    }
}

function openCheckoutModal() {
    loadRazorpayScript();
    const modal = document.getElementById('checkout-modal');
    if (modal) {
        modal.style.display = 'flex';
        showCheckoutStep(1);
    }
}

function closeCheckoutModal() {
    document.getElementById('checkout-modal').style.display = 'none';
    resetCheckoutModal();
}

function showCheckoutStep(step) {
    document.getElementById('checkout-step-1').style.display = step === 1 ? 'block' : 'none';
    document.getElementById('checkout-step-2').style.display = step === 2 ? 'block' : 'none';
    document.getElementById('checkout-step-3').style.display = step === 3 ? 'block' : 'none';

    if (step === 3) {
        document.getElementById('checkout-processing').style.display = 'block';
        document.getElementById('checkout-success').style.display = 'none';
    }
}

function resetCheckoutModal() {
    showCheckoutStep(1);
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-phone').value = '';
    document.getElementById('cust-alt-phone').value = '';
    document.getElementById('cust-address').value = '';
    window.checkoutState = { selectedMethod: null, userDetails: {}, razorpayOrderId: null, finalOrderId: null, cartItems: [] };
}

async function checkRazorpayAvailability() {
    const onlineBtn = document.getElementById('online-payment-btn');
    if (!onlineBtn) return;

    try {
        const res = await fetch(`${API_URL}/config/razorpay/status`);
        const data = await res.json();

        if (data.available) {
            onlineBtn.disabled = false;
            onlineBtn.style.opacity = '1';
            onlineBtn.querySelector('p').innerText = "Secure payment via Razorpay.";
        } else {
            onlineBtn.disabled = true;
            onlineBtn.style.opacity = '0.6';
            onlineBtn.querySelector('p').innerText = "Currently unavailable.";
            onlineBtn.title = "Online payment is currently disabled.";
        }
    } catch (e) {
        console.error("Error checking Razorpay status:", e);
        onlineBtn.disabled = true;
        onlineBtn.style.opacity = '0.6';
    }
}

async function processCODOrder() {
    showCheckoutStep(3);

    try {
        const token = localStorage.getItem('token') || null;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/orders/place`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                type: 'COD',
                items: window.checkoutState.cartItems,
                userDetails: window.checkoutState.userDetails
            })
        });

        const data = await res.json();
        if (data.success) {
            window.checkoutState.finalOrderId = data.orderId;
            showOrderSuccess('COD');
            clearCart();
        } else {
            throw new Error(data.message || 'Order failed');
        }
    } catch (err) {
        console.error(err);
        showToast('Error placing order. Please try again.');
        closeCheckoutModal();
    }
}

async function processOnlinePayment() {
    showCheckoutStep(3);

    try {
        // Step 1: Create Razorpay Order
        const total = window.checkoutState.cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        const createRes = await fetch(`${API_URL}/orders/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: total })
        });

        const createData = await createRes.json();
        if (!createData.success) throw new Error('Failed to initialize payment');

        window.checkoutState.razorpayOrderId = createData.orderId;

        // Step 2: Open Razorpay Checkout
        const options = {
            key: createData.keyId,
            amount: createData.amount,
            currency: createData.currency,
            order_id: createData.orderId,
            name: 'House of Natures',
            description: 'Order Payment',
            handler: async function (response) {
                await finalizeOnlineOrder(response);
            },
            modal: {
                ondismiss: function () {
                    showToast('Payment cancelled');
                    closeCheckoutModal();
                }
            },
            prefill: {
                name: window.checkoutState.userDetails.name,
                contact: window.checkoutState.userDetails.phone
            }
        };

        const rzp = new Razorpay(options);
        rzp.open();

    } catch (err) {
        console.error(err);
        showToast('Error initializing payment');
        closeCheckoutModal();
    }
}

async function finalizeOnlineOrder(razorpayResponse) {
    try {
        const token = localStorage.getItem('token') || null;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/orders/place`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                type: 'ONLINE',
                items: window.checkoutState.cartItems,
                userDetails: window.checkoutState.userDetails,
                paymentData: {
                    razorpay_order_id: razorpayResponse.razorpay_order_id,
                    razorpay_payment_id: razorpayResponse.razorpay_payment_id,
                    razorpay_signature: razorpayResponse.razorpay_signature
                }
            })
        });

        const data = await res.json();
        if (data.success) {
            window.checkoutState.finalOrderId = data.orderId;
            showOrderSuccess('ONLINE', razorpayResponse.razorpay_payment_id);
            clearCart();
        } else {
            throw new Error(data.message || 'Order verification failed');
        }
    } catch (err) {
        console.error(err);
        showToast('Error finalizing order');
        closeCheckoutModal();
    }
}

function showOrderSuccess(type, paymentId = null) {
    document.getElementById('checkout-processing').style.display = 'none';
    document.getElementById('checkout-success').style.display = 'block';
    document.getElementById('success-order-id').innerText = window.checkoutState.finalOrderId;

    if (type === 'ONLINE' && paymentId) {
        document.getElementById('payment-info-display').innerHTML = `<strong>Payment ID:</strong> ${paymentId}<br><span style="color:green;">✓ Payment Successful</span>`;
    } else {
        document.getElementById('payment-info-display').innerHTML = `<span style="color:orange;">Cash on Delivery</span>`;
    }

    // Setup WhatsApp Button - Use event delegation for reliability
    const whatsappBtn = document.getElementById('send-whatsapp-btn');
    if (whatsappBtn) {
        // Remove any existing listeners
        whatsappBtn.onclick = null;
        whatsappBtn.addEventListener('click', () => sendWhatsAppMessage(type, paymentId));
    }
}

function sendWhatsAppMessage(type, paymentId) {
    const orderDetails = window.checkoutState;
    const itemsList = orderDetails.cartItems.map(item =>
        `${item.title} x${item.quantity} - ₹${item.price * item.quantity}`
    ).join('\n');

    const total = orderDetails.cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    let message = `*New Order: ${orderDetails.finalOrderId}*\n\n`;

    message += `*Customer Details:*\n`;
    message += `Name: ${orderDetails.userDetails.name}\n`;
    message += `Phone: ${orderDetails.userDetails.phone}\n`;
    if (orderDetails.userDetails.altPhone) message += `Alt Phone: ${orderDetails.userDetails.altPhone}\n`;
    message += `Address: ${orderDetails.userDetails.address}\n\n`;

    message += `*Order Items:*\n${itemsList}\n\n`;
    message += `*Total Amount:* ₹${total}\n`;
    message += `*Payment Mode:* ${type === 'COD' ? 'Cash on Delivery' : 'Online Payment'}\n`;

    if (type === 'ONLINE' && paymentId) {
        message += `*Payment Status:* Paid\n`;
        message += `*Payment ID:* ${paymentId}\n`;
    } else {
        message += `*Payment Status:* Pending\n`;
    }

    const encodedMessage = encodeURIComponent(message);
    const whatsappURL = `https://wa.me/919176733560?text=${encodedMessage}`;

    window.open(whatsappURL, '_blank');

    // Close modal after a short delay
    setTimeout(() => {
        closeCheckoutModal();
        showToast('Order placed successfully!');
    }, 1000);
}

function clearCart() {
    localStorage.setItem('cart', JSON.stringify([]));
    window.dispatchEvent(new CustomEvent('cartUpdated'));
}
