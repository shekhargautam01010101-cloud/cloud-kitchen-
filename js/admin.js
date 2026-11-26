import { CONFIG, FIREBASE_CONFIGURED, SERVICE_CENTER, getFirebase, isServiceCenterConfigured, money, orderItemsLabel, safeText } from "./config.js";

const $ = (selector) => document.querySelector(selector);
let unsubscribeOrders = null;
let knownOrderIds = null;
let soundEnabled = false;
let audioContext = null;
let cachedOrders = [];
let mapsApi = null;

function message(text, success = false) {
  $("#admin-message").textContent = text;
  $("#admin-message").classList.toggle("success", success);
}

function playNewOrderSound() {
  if (!soundEnabled || !audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.35);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.36);
}

function todayOrders(orders) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return orders.filter((order) => {
    const date = order.createdAt?.toDate?.();
    return date && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) === today;
  });
}

function updateMetrics(orders) {
  const todays = todayOrders(orders);
  $("#today-orders").textContent = String(todays.length);
  $("#today-out-area").textContent = String(todays.filter((order) => order.outOfArea).length);
  const revenue = todays.filter((order) => ["Accepted", "Preparing", "Out for delivery", "Delivered"].includes(order.status))
    .reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  $("#today-revenue").textContent = money(revenue);
}

function distanceText(order, maps) {
  if (!isServiceCenterConfigured() || !Number.isFinite(order.lat) || !Number.isFinite(order.lng)) return "Distance unavailable until the verified service pin and customer pin are available.";
  let meters;
  if (maps?.geometry?.spherical) {
    meters = maps.geometry.spherical.computeDistanceBetween(
      new maps.LatLng(SERVICE_CENTER.lat, SERVICE_CENTER.lng),
      new maps.LatLng(order.lat, order.lng),
    );
  } else {
    const radians = (degrees) => degrees * Math.PI / 180;
    const latitudeDelta = radians(order.lat - SERVICE_CENTER.lat);
    const longitudeDelta = radians(order.lng - SERVICE_CENTER.lng);
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(radians(SERVICE_CENTER.lat)) * Math.cos(radians(order.lat))
      * Math.sin(longitudeDelta / 2) ** 2;
    meters = 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  }
  return `${(meters / 1000).toFixed(2)} km from Jhanjheri`;
}

function addDetail(parent, text) {
  const p = document.createElement("p");
  p.textContent = text;
  parent.append(p);
}

function actionButton(label, callback, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", callback);
  return button;
}

async function updateOrder(id, status, declineReason, services) {
  try {
    await services.updateDoc(services.doc(services.db, CONFIG.collectionNames.orders, id), {
      status,
      declineReason: declineReason || "",
      updatedAt: services.serverTimestamp(),
    });
    message(`Order ${id.slice(0, 8).toUpperCase()} updated to ${status}.`, true);
  } catch (error) {
    console.error("Could not update order.", error);
    message("The order could not be updated. Check staff authorization and Firestore rules.");
  }
}

function renderOrder(documentSnapshot, services, maps) {
  const order = documentSnapshot.data();
  const card = document.createElement("article");
  card.className = "order-card";
  const header = document.createElement("div");
  header.className = "order-card-header";
  const identity = document.createElement("span");
  identity.textContent = `#${documentSnapshot.id.slice(0, 8).toUpperCase()} · ${safeText(order.customerName, 80)}`;
  const status = document.createElement("span");
  status.className = `order-status${order.outOfArea ? " danger" : ""}`;
  status.textContent = safeText(order.status, 50);
  header.append(identity, status);
  card.append(header);
  if (order.outOfArea) {
    const badge = document.createElement("p");
    badge.innerHTML = '<span class="out-badge">OUT OF AREA</span>';
    card.append(badge);
  }
  const details = document.createElement("div");
  details.className = "admin-order-details";
  const phone = safeText(order.phone, 20).replace(/[^0-9+]/g, "");
  const phoneDigits = phone.replace(/\D/g, "");
  const whatsappNumber = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
  addDetail(details, `Phone: ${safeText(order.phone, 20) || "not provided"}`);
  const call = document.createElement("a");
  call.href = `tel:${phone}`;
  call.textContent = "Call customer";
  const whatsapp = document.createElement("a");
  whatsapp.href = `https://wa.me/${whatsappNumber}`;
  whatsapp.target = "_blank";
  whatsapp.rel = "noopener noreferrer";
  whatsapp.textContent = "WhatsApp";
  details.append(call, document.createTextNode(" · "), whatsapp);
  addDetail(details, `Address: ${safeText(order.formattedAddress || order.address, 300)}`);
  addDetail(details, `Notes: ${safeText(order.notes, 300) || "—"}`);
  addDetail(details, `Items: ${orderItemsLabel(order.items)}`);
  addDetail(details, `Subtotal ${money(order.subtotal)} · Midnight charge ${money(order.midnightCharge)} · Total ${money(order.total)}`);
  addDetail(details, distanceText(order, maps));
  if (Number.isFinite(order.lat) && Number.isFinite(order.lng)) {
    const mapLink = document.createElement("a");
    mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.lat},${order.lng}`)}`;
    mapLink.target = "_blank";
    mapLink.rel = "noopener noreferrer";
    mapLink.textContent = "Open in Google Maps";
    details.append(mapLink);
  }
  if (order.declineReason) addDetail(details, `Decline reason: ${safeText(order.declineReason, 300)}`);
  card.append(details);
  const actions = document.createElement("div");
  actions.className = "admin-actions";
  if (order.status === "Pending" || order.status === "Pending – Out of Area") {
    actions.append(actionButton("Accept", () => updateOrder(documentSnapshot.id, "Accepted", "", services)));
    actions.append(actionButton("Decline", () => {
      const reason = window.prompt("Reason for declining this request:");
      if (reason === null) return;
      if (!reason.trim()) { message("Enter a reason before declining."); return; }
      updateOrder(documentSnapshot.id, "Declined", safeText(reason, 300), services);
    }, "decline"));
  }
  const nextStatus = { Accepted: "Preparing", Preparing: "Out for delivery", "Out for delivery": "Delivered" }[order.status];
  if (nextStatus) actions.append(actionButton(nextStatus, () => updateOrder(documentSnapshot.id, nextStatus, "", services)));
  if (actions.childElementCount) card.append(actions);
  return card;
}

async function renderOrders(services) {
  const filter = $("#order-filter").value;
  const orders = cachedOrders.filter((order) => {
    const data = order.data;
    if (filter === "out-of-area") return data.outOfArea;
    if (filter === "new") return data.status === "Pending" || data.status === "Pending – Out of Area";
    if (filter === "accepted") return ["Accepted", "Preparing", "Out for delivery"].includes(data.status);
    if (filter === "delivered") return data.status === "Delivered";
    if (filter === "declined") return data.status === "Declined";
    return true;
  });
  const target = $("#orders-list");
  target.replaceChildren();
  if (!orders.length) { target.textContent = "No orders match this filter."; return; }
  for (const order of orders) {
    const documentSnapshot = { id: order.id, data: () => order.data };
    target.append(renderOrder(documentSnapshot, services, mapsApi));
  }
}

async function startDashboard(services) {
  if (unsubscribeOrders) unsubscribeOrders();
  mapsApi = null;
  try {
    if (CONFIG.googleMapsApiKey && !CONFIG.googleMapsApiKey.startsWith("YOUR_")) {
      const { loadGoogleMaps } = await import("./config.js");
      mapsApi = await loadGoogleMaps();
    }
  } catch (error) {
    console.warn("Google Maps unavailable in staff portal.", error);
  }
  const orderQuery = services.query(
    services.collection(services.db, CONFIG.collectionNames.orders),
    services.orderBy("createdAt", "desc"),
  );
  unsubscribeOrders = services.onSnapshot(orderQuery, (snapshot) => {
    if (knownOrderIds) {
      const added = snapshot.docChanges().some((change) => change.type === "added" && !knownOrderIds.has(change.doc.id));
      if (added) playNewOrderSound();
    }
    knownOrderIds = new Set(snapshot.docs.map((documentSnapshot) => documentSnapshot.id));
    cachedOrders = snapshot.docs.map((documentSnapshot) => ({ id: documentSnapshot.id, data: documentSnapshot.data() }));
    updateMetrics(cachedOrders.map(({ data }) => data));
    renderOrders(services);
  }, (error) => {
    console.error("Could not listen for orders.", error);
    message("Could not load orders. Confirm staff authorization and Firestore rules.");
  });
}

async function initAdmin() {
  if (!FIREBASE_CONFIGURED) {
    message("Add Firebase web configuration in js/config.js before staff can sign in.");
    return;
  }
  try {
    const services = await getFirebase();
    $("#staff-login").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = $("#staff-login button[type=submit]");
      submit.disabled = true;
      message("Checking staff access…");
      try {
        await services.signInWithEmailAndPassword(services.auth, $("#staff-email").value.trim(), $("#staff-password").value);
        const record = await services.getDoc(services.doc(services.db, CONFIG.collectionNames.admins, services.auth.currentUser.uid));
        if (!record.exists() || record.data().enabled !== true) {
          await services.signOut(services.auth);
          message("This account is not authorized for the staff portal.");
          return;
        }
        $("#staff-login").hidden = true;
        $("#dashboard").hidden = false;
        await startDashboard(services);
        message("Staff access verified.", true);
      } catch (error) {
        console.error("Staff sign-in failed.", error);
        message("Sign-in failed or staff access has not been configured.");
      } finally { submit.disabled = false; }
    });
    $("#order-filter").addEventListener("change", () => renderOrders(services));
    $("#enable-sound").addEventListener("click", async () => {
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) { message("Audio alerts are not supported in this browser."); return; }
      audioContext ||= new AudioContextConstructor();
      await audioContext.resume();
      soundEnabled = !soundEnabled;
      $("#enable-sound").textContent = soundEnabled ? "Disable new-order sound" : "Enable new-order sound";
      message(soundEnabled ? "New-order sound enabled." : "New-order sound disabled.", true);
    });
    $("#staff-sign-out").addEventListener("click", async () => {
      if (unsubscribeOrders) unsubscribeOrders();
      unsubscribeOrders = null;
      knownOrderIds = null;
      cachedOrders = [];
      await services.signOut(services.auth);
      $("#dashboard").hidden = true;
      $("#staff-login").hidden = false;
      message("Signed out.");
    });
  } catch (error) {
    console.error("Firebase isn't ready for staff sign-in.", error);
    message("Firebase setup is required for staff access.");
  }
}

if (document.body.dataset.page === "admin") initAdmin();
