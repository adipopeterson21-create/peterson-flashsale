// ================================
// FlashSale Frontend - Dark Neon Edition
// ================================

// ✅ Your live backend URL (change this if needed)
const API_BASE = "https://peterson-flashsale.onrender.com";

// Animate page load
window.addEventListener("load", () => {
  document.body.classList.add("loaded");
  loadProducts();
});

// Load products from backend
async function loadProducts() {
  try {
    const res = await fetch(`${API_BASE}/api/products`);
    const products = await res.json();

    const container = document.getElementById("products");
    container.innerHTML = "";

    if (!products.length) {
      container.innerHTML = `<p class="no-products">No products available yet.</p>`;
      return;
    }

    products.forEach((p) => {
      const div = document.createElement("div");
      div.className = "product neon-card";
      div.innerHTML = `
        <img src="${API_BASE}${p.image_url}" alt="${p.name}" class="product-img"/>
        <div class="product-info">
          <h3 class="glow">${p.name}</h3>
          <p>${p.description}</p>
          <strong>$${p.price}</strong>
          <button class="buy-btn" onclick="checkoutProduct(${p.id})">Buy Now</button>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    console.error("Failed to load products:", err);
    document.getElementById("products").innerHTML =
      `<p class="error">Unable to load products. Please try again later.</p>`;
  }
}

// Checkout single product
async function checkoutProduct(productId) {
  try {
    const res = await fetch(`${API_BASE}/api/orders/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ id: productId, quantity: 1 }] }),
    });
    const data = await res.json();
    if (data.url) window.location = data.url;
    else alert("Checkout failed.");
  } catch (err) {
    console.error(err);
    alert("Unable to process checkout.");
  }
}

// Handle donation form
document.addEventListener("DOMContentLoaded", () => {
  const donationForm = document.getElementById("donationForm");
  if (donationForm) {
    donationForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const amount = Number(document.getElementById("donAmount").value || 0);
      const name = document.getElementById("donName").value || "Supporter";
      if (amount <= 0) return alert("Please enter a valid amount.");

      try {
        const res = await fetch(`${API_BASE}/api/donations/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount, name }),
        });
        const data = await res.json();
        if (data.url) window.location = data.url;
        else alert("Donation error.");
      } catch (err) {
        console.error(err);
        alert("Unable to complete donation.");
      }
    });
  }
});

// WhatsApp chat shortcut
function openWhatsApp() {
  window.open("https://wa.me/254700000000?text=Hello%20FlashSale%20Team!", "_blank");
}
