import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

const menu = [
  { id: "classic", name: "The Classic", description: "Three eggs, cheddar, chives, a little black pepper.", price: 14900, tag: "The original" },
  { id: "masala", name: "Desi Masala", description: "Onion, tomato, green chilli, coriander, house masala.", price: 17900, tag: "A little kick" },
  { id: "cheese", name: "Cheese Please", description: "Melted cheddar, mozzarella, chives, extra comfort.", price: 19900, tag: "Cheesy goodness" },
  { id: "paneer", name: "Paneer Tikka", description: "Tandoori paneer, peppers, onion, mint chutney.", price: 22900, tag: "Local favourite" },
  { id: "mushroom", name: "Mushroom Melt", description: "Garlic mushrooms, spinach, parmesan, thyme.", price: 21900, tag: "Earthy & good" },
  { id: "chicken", name: "Chicken Pepper Fry", description: "Peppery chicken, caramelized onion, a squeeze of lime.", price: 24900, tag: "The hearty one" },
];
const cart = new Map();
const $ = (selector) => document.querySelector(selector);
const menuGrid = $("#menu-grid");
const cartItems = $("#cart-items");
const cartCount = $("#cart-count");
const checkoutDialog = $("#checkout-dialog");
const checkoutForm = $("#checkout-form");
const checkoutMessage = $("#checkout-message");
const adminMessage = $("#admin-message");
const adminOrders = $("#admin-orders");
let firebaseServices = null;
const money = (paise) => `₹${(paise / 100).toFixed(0)}`;
const total = () => [...cart].reduce((sum, [id, quantity]) => sum + menu.find((item) => item.id === id).price * quantity, 0);

function message(element, text, success = false) {
  element.textContent = text;
  element.classList.toggle("success", success);
}

function renderCart() {
  const entries = [...cart].filter(([, quantity]) => quantity > 0);
  const count = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
  cartCount.textContent = String(count);
  $("#cart-total").textContent = money(total());
  $("#checkout-total").textContent = money(total());
  $("#checkout-open").disabled = count === 0;
  if (!entries.length) {
    cartItems.innerHTML = '<p class="empty-cart">Your next favourite is one click away.</p>';
    return;
  }
  cartItems.replaceChildren(...entries.map(([id, quantity]) => {
    const item = menu.find((entry) => entry.id === id);
    const row = document.createElement("div");
    row.className = "cart-item";
    const name = document.createElement("span");
    name.className = "cart-item-name";
    name.textContent = item.name;
    const price = document.createElement("span");
    price.className = "cart-item-price";
    price.textContent = money(item.price * quantity);
    const controls = document.createElement("div");
    controls.className = "quantity-control";
    const changeButton = (label, text, change) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.setAttribute("aria-label", label);
      button.addEventListener("click", change);
      return button;
    };
    const quantityText = document.createElement("span");
    quantityText.textContent = String(quantity);
    controls.append(
      changeButton(`Remove one ${item.name}`, "−", () => { quantity === 1 ? cart.delete(id) : cart.set(id, quantity - 1); renderCart(); }),
      quantityText,
      changeButton(`Add one ${item.name}`, "+", () => { cart.set(id, Math.min(20, quantity + 1)); renderCart(); }),
    );
    controls.lastElementChild.disabled = quantity >= 20;
    row.append(name, price, controls);
    return row;
  }));
}

function renderMenu() {
  menuGrid.replaceChildren(...menu.map((item) => {
    const card = document.createElement("article");
    card.className = "menu-card";
    const top = document.createElement("div");
    top.className = "menu-card-top";
    const description = document.createElement("div");
    const name = document.createElement("h3");
    name.textContent = item.name;
    const details = document.createElement("p");
    details.textContent = item.description;
    description.append(name, details);
    const price = document.createElement("span");
    price.className = "menu-price";
    price.textContent = money(item.price);
    top.append(description, price);
    const bottom = document.createElement("div");
    bottom.className = "menu-card-bottom";
    const tag = document.createElement("span");
    tag.className = "menu-tag";
    tag.textContent = item.tag;
    const add = document.createElement("button");
    add.className = "add-button";
    add.type = "button";
    add.textContent = "+";
    add.setAttribute("aria-label", `Add ${item.name} to your order`);
    add.addEventListener("click", () => { cart.set(item.id, Math.min(20, (cart.get(item.id) || 0) + 1)); renderCart(); });
    bottom.append(tag, add);
    card.append(top, bottom);
    return card;
  }));
}

renderMenu();
renderCart();
$("#year").textContent = String(new Date().getFullYear());
$("#checkout-open").addEventListener("click", () => {
  $("#checkout-total").textContent = money(total());
  message(checkoutMessage, "");
  checkoutDialog.showModal();
});
$("#checkout-close").addEventListener("click", () => checkoutDialog.close());
checkoutDialog.addEventListener("click", (event) => { if (event.target === checkoutDialog) checkoutDialog.close(); });

if (isFirebaseConfigured) {
  try {
    const [appSdk, storeSdk, authSdk] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
    ]);
    const app = appSdk.initializeApp(firebaseConfig);
    firebaseServices = { db: storeSdk.getFirestore(app), auth: authSdk.getAuth(app), ...storeSdk, ...authSdk };
  } catch (error) {
    console.error("Firebase could not be initialized.", error);
    message($("#cart-message"), "Ordering is temporarily unavailable. Please try again later.");
  }
} else {
  message($("#cart-message"), "Online ordering is not set up yet. Please contact the kitchen to order.");
}

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!firebaseServices) {
    message(checkoutMessage, "Online ordering is not available yet. Please contact the kitchen directly.");
    return;
  }
  const submit = $("#checkout-submit");
  submit.disabled = true;
  message(checkoutMessage, "Sending your order…");
  try {
    const { auth, db, signInAnonymously, collection, addDoc, serverTimestamp } = firebaseServices;
    if (!auth.currentUser) await signInAnonymously(auth);
    const form = new FormData(checkoutForm);
    const order = {
      ownerUid: auth.currentUser.uid,
      customerName: String(form.get("name")).trim(),
      phone: String(form.get("phone")).trim(),
      address: String(form.get("address")).trim(),
      notes: String(form.get("notes") || "").trim(),
      items: Object.fromEntries(cart),
      subtotal: total(),
      status: "received",
      createdAt: serverTimestamp(),
    };
    const saved = await addDoc(collection(db, "orders"), order);
    checkoutForm.reset();
    cart.clear();
    renderCart();
    message(checkoutMessage, `Order ${saved.id.slice(0, 8).toUpperCase()} received. Thanks — the kitchen will be in touch!`, true);
    window.setTimeout(() => checkoutDialog.close(), 2600);
  } catch (error) {
    console.error("Could not place the order.", error);
    message(checkoutMessage, "We couldn't send that order. Please check your connection and try again.");
  } finally {
    submit.disabled = false;
  }
});

async function loadAdminOrders() {
  const { db, collection, query, orderBy, limit, getDocs, doc, updateDoc } = firebaseServices;
  const result = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(50)));
  adminOrders.replaceChildren();
  if (result.empty) { adminOrders.textContent = "No orders yet."; return; }
  for (const snapshot of result.docs) {
    const order = snapshot.data();
    const card = document.createElement("article");
    card.className = "admin-order";
    const top = document.createElement("div");
    top.className = "admin-order-top";
    const title = document.createElement("span");
    title.textContent = `#${snapshot.id.slice(0, 8).toUpperCase()} · ${order.customerName}`;
    const price = document.createElement("span");
    price.textContent = money(order.subtotal);
    top.append(title, price);
    const contact = document.createElement("p");
    contact.textContent = `${order.phone} · ${order.address}${order.notes ? ` · Note: ${order.notes}` : ""}`;
    const lineItems = document.createElement("p");
    lineItems.textContent = Object.entries(order.items || {}).map(([id, quantity]) => {
      const item = menu.find((entry) => entry.id === id);
      return item ? `${quantity} × ${item.name}` : "Unrecognized item";
    }).join(", ");
    const status = document.createElement("select");
    status.setAttribute("aria-label", `Update status for order ${snapshot.id.slice(0, 8)}`);
    for (const value of ["received", "preparing", "ready", "completed", "cancelled"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value[0].toUpperCase() + value.slice(1);
      option.selected = order.status === value;
      status.append(option);
    }
    status.addEventListener("change", async () => {
      status.disabled = true;
      try {
        await updateDoc(doc(db, "orders", snapshot.id), { status: status.value });
        message(adminMessage, `Order ${snapshot.id.slice(0, 8).toUpperCase()} updated.`, true);
      } catch (error) {
        console.error("Could not update order status.", error);
        status.value = order.status;
        message(adminMessage, "Could not update order status. Check staff access and try again.");
      } finally { status.disabled = false; }
    });
    card.append(top, contact, lineItems, status);
    adminOrders.append(card);
  }
}

$("#admin-login").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!firebaseServices) { message(adminMessage, "Firebase is not configured. Follow the setup guide before signing in."); return; }
  const form = event.currentTarget;
  const submit = form.querySelector("button");
  submit.disabled = true;
  message(adminMessage, "Checking staff access…");
  try {
    const { auth, db, signInWithEmailAndPassword, doc, getDoc, signOut } = firebaseServices;
    await signInWithEmailAndPassword(auth, $("#admin-email").value, $("#admin-password").value);
    const record = await getDoc(doc(db, "admins", auth.currentUser.uid));
    if (!record.exists() || record.data().enabled !== true) {
      await signOut(auth);
      message(adminMessage, "This account is not authorized for staff access.");
      return;
    }
    await loadAdminOrders();
    message(adminMessage, "Signed in. Showing the latest orders.", true);
    form.hidden = true;
    const logout = document.createElement("button");
    logout.className = "button button-dark";
    logout.type = "button";
    logout.textContent = "Sign out";
    logout.addEventListener("click", async () => {
      await signOut(auth);
      form.hidden = false;
      adminOrders.replaceChildren();
      logout.remove();
      message(adminMessage, "Signed out.");
    });
    $(".admin-panel").append(logout);
  } catch (error) {
    console.error("Staff sign-in failed.", error);
    message(adminMessage, "Sign-in failed or staff access is not configured. Check credentials and admin setup.");
  } finally { submit.disabled = false; }
});
