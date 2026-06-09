interface Product {
    id: number;
    name: string;
    price: number;
    categories: string;
    image: string;
}

function saveQuantities(quantities: Record<string, number>) {
    localStorage.setItem('cartQuantities', JSON.stringify(quantities));
}

function getSavedQuantities(): Record<string, number> {
    const data = localStorage.getItem('cartQuantities');
    return data ? JSON.parse(data) : {};
}

document.addEventListener("DOMContentLoaded", () => {
    const productGrid = document.querySelector(".product-grid") as HTMLElement;
    const paginationContainer = document.querySelector(".pagination") as HTMLElement;

    let products: Product[] = [];
    const productsPerPage = 20;
    let currentPage = 1;
    let totalPages = 1;

    async function fetchProducts() {
        try {
            const response = await fetch("/products.json");
            if (!response.ok) 
                throw new Error("[ERROR]: Failed to fetch products")

            products= await response.json();
            totalPages = Math.ceil(products.length / productsPerPage);

            renderPage(currentPage);
            renderPagination();
        } catch (err) {
            console.error(err);
            productGrid.innerHTML = `<p style="color:red;">Failed to load products.</p>`;
        }
    }

    function renderPage(page: number) {
        productGrid.innerHTML = "";

        const cartData = JSON.parse(localStorage.getItem("cartQuantities") || "{}");
        const start = (page - 1) * productsPerPage;
        const end = start + productsPerPage;
        const pageProducts = products.slice(start, end);
    
        pageProducts.forEach((prod) => {
          const card = document.createElement("div");
          card.classList.add("product-card");
          card.setAttribute("data-product-id", `${prod.id}`);

          const qty = cartData[prod.id] || 0;

          card.innerHTML = `
            <img src="${prod.image}" alt="${prod.name}" />
            <a class="product-title" href="/product/${prod.name}">${prod.name}</a>
            <p class="product-categories">${prod.categories}</p>
            <p class="product-price">$${prod.price.toFixed(2)}</p>
            <div class="quantity-selector">
              <button class="decrease">-</button>
              <span class="quantity">${qty}</span>
              <button class="increase">+</button>
            </div>
          `;

          if (qty > 0) {
            card.classList.add("highlight");
          }
          
          productGrid.appendChild(card);
        });
    }

    function renderPagination() {
        paginationContainer.innerHTML = "";
    
        const prevBtn = document.createElement("button");
        prevBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#FFFFFF"><path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/></svg>`;
        prevBtn.disabled = currentPage === 1;
        prevBtn.onclick = () => {
          if (currentPage > 1) {
            currentPage--;
            renderPage(currentPage);
            renderPagination();
          }
        };
        paginationContainer.appendChild(prevBtn);
    
        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement("span");
            pageBtn.textContent = i.toString();
            pageBtn.style.cursor = "pointer";
            pageBtn.classList.toggle("active", i === currentPage);
      
            pageBtn.onclick = () => {
              currentPage = i;
              renderPage(currentPage);
              renderPagination();
            };
            paginationContainer.appendChild(pageBtn);
        }

        const nextBtn = document.createElement("button");
        nextBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/></svg>';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderPage(currentPage);
            renderPagination();
           }
        };
        paginationContainer.appendChild(nextBtn);
    }

    fetchProducts();

// Insert Cart List on Overlay 
const overlay = document.getElementById('overlay') as HTMLElement;
const overlayList = overlay?.querySelector('ul') as HTMLElement;

    function populateOverlay() {
        if (!overlayList) return;

        const quantities = getSavedQuantities();
        console.log(quantities);
        overlayList.innerHTML = '';

        Object.keys(quantities).forEach(productId => {
            const qty = quantities[productId];
            console.log(qty);
            if (qty > 0) {
              const prod = products.find(p => p.id === Number(productId));
                // console.log(productCard);
                // console.log(title);
                // console.log(imgSrc);

                if (!prod) {
                    console.warn(`Product with ID ${productId} not found in data.`);
                    return;
                  }

                const totalPrice = prod.price * qty;

                const li = document.createElement('li');
                li.innerHTML = `
                      <img src="${prod.image}" alt="${prod.name}" width="64" height="64" />
                      <span>${prod.name} x ${qty}</span>
                      <p>$${totalPrice.toFixed(2)} (${prod.price.toFixed(2)} x ${qty})</p>
                `;
                overlayList.append(li);
            }
        });

        if (overlayList.children.length === 0) {
            overlayList.innerHTML = '<li>Your cart is empty.</li>';
        }
    }

// Check Cart List Button Logic
document.getElementById('checkcart')?.addEventListener('click', togglePopup);

function togglePopup() {
    const checkCart = document.getElementById('overlay') as HTMLElement;
    checkCart.classList.add('show');
    populateOverlay();
} 

const closeBtn = document.querySelector('.close-btn') as HTMLElement;
closeBtn?.addEventListener('click', () => {
        const overlay = document.getElementById('overlay') as HTMLElement;
        overlay.classList.remove('show');
});

const overlayPanel = document.getElementById('overlay') as HTMLElement;
overlayPanel?.addEventListener('click', (e) => {
    if (e.target === overlay) {
        overlay.classList.remove('show');
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        overlay.classList.remove('show');
    }
});

});

// Quantity Selector Logic with Persistence (LocalStroage)
// This is to prevent from losing track of the list when/after refresh
// Only hard refresh can wipe out the LocalStorage
document.addEventListener('DOMContentLoaded', () => {
    const productList = document.querySelector('.product-grid');

    function populateQuantities() {
        const quantities = getSavedQuantities();
        console.log('Saved quantities:', quantities);

        const cards = document.querySelectorAll('.product-card')
        cards.forEach(card => {
            const productId = card.getAttribute('data-product-id');
            console.log('Product ID:', productId);
            if (!productId) return;

            const quantitySpan = card.querySelector('.quantity');
            if (quantitySpan && quantities[productId] !== undefined) {
                const qty = quantities[productId];
                quantitySpan.textContent = String(qty);

                if (qty > 0) {
                    card.classList.add('highlight');
                } else {
                    card.classList.remove('highlight');
                }
            }
        });
    }

    const observer = new MutationObserver(() => {
        if (document.querySelectorAll('.product-card').length > 0) {
            populateQuantities();
            observer.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    productList?.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;

        if (!target.classList.contains('increase') && !target.classList.contains('decrease')) return;
        
        const productCard = target.closest(".product-card");
        if (!productCard) return;
        
        const quantitySpan = productCard.querySelector('.quantity') as HTMLElement || null;
        if (!quantitySpan) return;

        const productId = productCard.getAttribute('data-product-id');
        if (!productId) return;

        let currentQuantity = parseInt(quantitySpan.textContent || "0", 10);
        if (isNaN(currentQuantity) || currentQuantity < 0) 
            currentQuantity = 0;

        let newQuantity: number;
        if (target.classList.contains('increase')) {
            newQuantity = Math.min(currentQuantity + 1, 99);
        } else {
            newQuantity = Math.max(currentQuantity - 1, 0);
        }

        try {
            quantitySpan.textContent = String(newQuantity);
        } catch (err) {
            console.error('Failed to update quantity: ', err);
        }

        const quantities = getSavedQuantities();
        quantities[productId] = newQuantity;
        saveQuantities(quantities);

        console.log(`Updated Quantity: ${newQuantity}`);

        if (newQuantity > 0) {
            productCard.classList.add('highlight');
        } else {
            productCard.classList.remove('highlight');
        }
    });
});

// Scroll To Top Button Logic
const scrollBtn = document.getElementById('scrollToTopBtn') as HTMLElement;
scrollBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth'})
});

// Display Cart List on Checkout Page
console.log(localStorage);
console.log('Quantities on checkout page:', getSavedQuantities());

async function populateCheckOut() {
    const checkout = document.getElementById('checkout') as HTMLElement;
    const checkoutList = checkout?.querySelector('ul') as HTMLElement;
        if (!checkoutList) return;

        const CheckOutquantities = getSavedQuantities() || {};
        console.log("A", CheckOutquantities);
        checkoutList.innerHTML = '';

        let productsData: {
            id: number;
            name: string;
            price: number;
            image: string;
        }[] = [] 

        try {
            const response = await fetch('/products.json');
            productsData = await response.json();
        } catch (err) {
            console.error('Failed to load products.json', err);
            checkoutList.innerHTML = '<li>Unable to load products.</li>';
            return;
        }

        const productsMap: Record<string, { name: string; price: number; image: string }> = {};
        productsData.forEach(product => {
            productsMap[product.id] = {
                name: product.name,
                price: product.price,
                image: product.image
            };
        });

        let grandTotal = 0;

        Object.keys(CheckOutquantities).forEach(productId => {
            const qty = CheckOutquantities[productId];
            if (qty > 0) {
                const product = productsMap[productId];
                const title = product?.name || 'Unknown Entity';
                const priceNum = product?.price || 0;
                const imgSrc = product?.image || '';
                const totalPrice = priceNum * qty;

                grandTotal += totalPrice;

                const li = document.createElement('li');
                li.innerHTML = `
                <img src="${imgSrc}" alt="${title}" width="64" height="64" />
                <span>${title} x ${qty}</span>
                <p>$${totalPrice.toFixed(2)} (${priceNum.toFixed(2)} x ${qty})</p>
            `;
            checkoutList.append(li);
            }
        });

        console.log("Grand Total: $" + grandTotal.toFixed(2));
        const totalElement = document.querySelector('#grand-total span:last-child') as HTMLElement;
        totalElement.textContent = `$${grandTotal.toFixed(2)}`;

        if (checkoutList.children.length === 0) {
            checkoutList.innerHTML = '<li>Your cart is empty.</li>';
        }
    }

populateCheckOut();

// Gather Cart Data Function
async function gatherCartData() {
    const quantities = getSavedQuantities() || {};
    if (Object.keys(quantities).length === 0) return { items: [], grandTotal: 0 };

    let productsData: { id: number; name: string; price: number; image: string }[] = [];
    try {
        const response = await fetch('/products.json');
        productsData = await response.json();
    } catch (err) {
        console.error('Failed to load products.json', err);
        return { items: [], grandTotal: 0 };
    }

    const productsMap: Record<string, { name: string; 
        price: number; 
        image: string }> = {};
    productsData.forEach(p => productsMap[p.id] = { name: p.name, 
        price: p.price, 
        image: p.image });

    const items: any[] = [];
    let grandTotal = 0;

    Object.keys(quantities).forEach(productId => {
        const qty = quantities[productId];
        if (qty > 0) {
            const product = productsMap[productId];
            const totalPrice = (product?.price || 0) * qty;
            grandTotal += totalPrice;

            items.push({
                id: productId,
                name: product?.name || 'Unknown',
                price: product?.price || 0,
                quantity: qty,
                totalPrice
            });
        }
    });

    return { items, grandTotal };
}

const checkoutForm = document.getElementById('checkout-form') as HTMLFormElement;
const confirmBtn = document.getElementById('confirm-btn') as HTMLButtonElement;
const paymentCards = document.querySelectorAll<HTMLDivElement>('.payment-card');

let selectedPaymentMethod: string | null = null;

paymentCards.forEach(card => {
    card.addEventListener('click', () => {
        paymentCards.forEach(c => c.classList.remove('selected'));

        card.classList.add('selected');

        selectedPaymentMethod = card.dataset.method || null;

        checkFormValidity();
    });
});

checkoutForm.addEventListener('input', checkFormValidity);
function checkFormValidity() {
    const isFormValid = checkoutForm.checkValidity();
    confirmBtn.disabled = !(isFormValid && selectedPaymentMethod !== null);
}

function showModal(message: string, type: 'success' | 'error'): void {
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    console.log("Div element is created.")
    overlay.className = 'modal-overlay';

    const modalBox = document.createElement('div');
    modalBox.className = `modal-box modal-${type}`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '&times;';

    const messageElem = document.createElement('p');
    messageElem.innerHTML = message;

    const okBtn = document.createElement('button');
    okBtn.className = 'modal-ok';
    okBtn.textContent = 'OK';

    modalBox.appendChild(closeBtn);
    modalBox.appendChild(messageElem);
    modalBox.appendChild(okBtn);
    overlay.appendChild(modalBox);
    document.body.appendChild(overlay);

    const closeModal = () => {
        overlay.classList.add('closing');
        setTimeout(() => {
            overlay.remove();
            if (type === 'success') {
                localStorage.removeItem('cartQuantities');
                window.location.href = "/";
            }
        }, 200); 
    };

    closeBtn.addEventListener('click', closeModal);
    okBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(); 
    });
}

confirmBtn.addEventListener('click', async () => {
    if (!selectedPaymentMethod) return;

    const customerData = Object.fromEntries(new FormData(checkoutForm).entries());

    const { items, grandTotal } = await gatherCartData();

    if (items.length === 0) {
        alert("Your cart is empty.");
        return;
    }

    const payload = {
        customer: customerData,
        paymentMethod: selectedPaymentMethod,
        items,
        grandTotal
    };

    try {
        const response = await fetch('/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Network response was not ok');

        const result = await response.json();

        if (result.success) {
            showModal(
                `Order submitted successfully.<br>
                Please check your email inbox for order confirmation.<br><br>
                Contact us for support and more information.`,
                'success'
            );
        } else {
            showModal('Error: ' + result.message, 'error');
        }

    } catch (err) {
        console.error(err);
        showModal('Failed to submit order. Please try again.', 'error');
    }
});
