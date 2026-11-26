import {
  CONFIG,
  FIREBASE_CONFIGURED,
  MENU_CONFIG,
  SERVICE_CENTER,
  SERVICE_RADIUS_METERS,
  getFirebase,
  loadGoogleMaps,
  money,
  midnightChargeFor,
  isServiceCenterConfigured,
} from "./config.js";

const CART_KEY = "andaaz-cart-v2";
const $ = (selector, root = document) => root.querySelector(selector);
const readCart = () => {
  try {
    const value = JSON.parse(localStorage.getItem(CART_KEY) || "{}");
    return Object.fromEntries(Object.entries(value).filter(([id, quantity]) =>
      MENU_CONFIG[id] && Number.isInteger(quantity) && quantity > 0 && quantity <= 20));
  } catch {
    return {};
  }
};
const saveCart = (cart) => localStorage.setItem(CART_KEY, JSON.stringify(cart));
const cartSubtotal = (cart) => Object.entries(cart).reduce((sum, [id, quantity]) => sum + MENU_CONFIG[id].price * quantity, 0);

function announce(element, text, success = false) {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle("success", success);
}

function renderMenu() {
  const grid = $("#menu-grid");
  if (!grid) return;
  grid.replaceChildren(...Object.entries(MENU_CONFIG).map(([id, item]) => {
    const card = document.createElement("article");
    card.className = "menu-card";
    const photo = document.createElement("div");
    photo.className = "menu-photo";
    const image = document.createElement("img");
    image.src = item.image;
    image.alt = item.imageAlt;
    image.loading = "lazy";
    image.onerror = () => photo.classList.add("image-fallback");
    photo.append(image);
    const copy = document.createElement("div");
    copy.className = "menu-card-copy";
    const title = document.createElement("div");
    title.className = "menu-card-title";
    const heading = document.createElement("h3");
    heading.textContent = item.name;
    const price = document.createElement("strong");
    price.textContent = money(item.price);
    title.append(heading, price);
    const description = document.createElement("p");
    description.textContent = item.description;
    const add = document.createElement("button");
    add.className = "add-button";
    add.type = "button";
    add.textContent = "Add to order";
    add.addEventListener("click", () => {
      const cart = readCart();
      if ((cart[id] || 0) >= 20) {
        announce($("#menu-message"), "Maximum quantity per item is 20.");
        return;
      }
      cart[id] = (cart[id] || 0) + 1;
      try {
        saveCart(cart);
        renderCartSummary();
        announce($("#menu-message"), `${item.name} added to your order.`, true);
      } catch (error) {
        console.error("Could not save your cart.", error);
        announce($("#menu-message"), "Your browser could not save the cart. Please enable site storage and try again.");
      }
    });
    copy.append(title, description, add);
    card.append(photo, copy);
    return card;
  }));
}

function renderCartSummary() {
  const cart = readCart();
  const count = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const subtotal = cartSubtotal(cart);
  const charge = subtotal > 0 ? midnightChargeFor() : 0;
  if ($("#cart-count")) $("#cart-count").textContent = String(count);
  if ($("#cart-subtotal")) $("#cart-subtotal").textContent = money(subtotal);
  if ($("#cart-midnight-charge")) $("#cart-midnight-charge").textContent = money(charge);
  if ($("#cart-midnight-line")) $("#cart-midnight-line").hidden = charge === 0;
  if ($("#cart-total")) $("#cart-total").textContent = money(subtotal + charge);
  if ($("#cart-link")) $("#cart-link").classList.toggle("disabled", count === 0);
}

function renderCheckoutItems() {
  const cart = readCart();
  const target = $("#checkout-items");
  if (!target) return;
  const entries = Object.entries(cart);
  target.replaceChildren();
  if (!entries.length) {
    target.textContent = "Your cart is empty. Choose an omelette from the menu first.";
    $("#place-order").disabled = true;
    return;
  }
  for (const [id, quantity] of entries) {
    const line = document.createElement("div");
    line.className = "bill-line";
    const name = document.createElement("span");
    name.textContent = `${MENU_CONFIG[id].name} × ${quantity}`;
    const price = document.createElement("strong");
    price.textContent = money(MENU_CONFIG[id].price * quantity);
    line.append(name, price);
    target.append(line);
  }
  $("#place-order").disabled = false;
}

function updateBill() {
  const subtotal = cartSubtotal(readCart());
  const charge = subtotal > 0 ? midnightChargeFor() : 0;
  $("#subtotal").textContent = money(subtotal);
  $("#midnight-charge").textContent = money(charge);
  $("#order-total").textContent = money(subtotal + charge);
  $("#midnight-line").hidden = charge === 0;
  $("#midnight-notice").hidden = charge === 0;
}

let mapState = { maps: null, map: null, marker: null, circle: null, place: null, distanceMeters: null, inArea: false };

function updateAreaStatus(position) {
  const status = $("#area-status");
  if (!status) return;
  if (!mapState.maps) {
    status.className = "map-status outside";
    status.textContent = "Map pin unavailable; your written address will be sent for staff review.";
    return;
  }
  if (!isServiceCenterConfigured()) {
    mapState.inArea = false;
    mapState.distanceMeters = null;
    status.className = "map-status outside";
    status.textContent = "Jhanjheri's verified map pin is not configured yet. Your request will still be sent and staff will confirm or decline it.";
    return;
  }
  if (!position) {
    mapState.inArea = false;
    mapState.distanceMeters = null;
    status.className = "map-status";
    status.textContent = `Choose a delivery pin within ${SERVICE_RADIUS_METERS} metres of Jhanjheri.`;
    return;
  }
  const center = new mapState.maps.LatLng(SERVICE_CENTER.lat, SERVICE_CENTER.lng);
  const point = new mapState.maps.LatLng(position.lat, position.lng);
  mapState.distanceMeters = mapState.maps.geometry.spherical.computeDistanceBetween(center, point);
  mapState.inArea = mapState.distanceMeters <= SERVICE_RADIUS_METERS;
  status.className = `map-status ${mapState.inArea ? "inside" : "outside"}`;
  status.textContent = mapState.inArea
    ? `You're within the delivery area (${Math.round(mapState.distanceMeters)} m from Jhanjheri).`
    : `You're outside our current delivery area (Jhanjheri). Your request will be sent to us and we will confirm or decline it. Distance: ${(mapState.distanceMeters / 1000).toFixed(1)} km.`;
}

function setPin(position, address = "") {
  if (!mapState.maps || !mapState.map || !mapState.marker) return;
  mapState.marker.setPosition(position);
  mapState.map.panTo(position);
  if (address) $("#delivery-address").value = address;
  const lat = typeof position.lat === "function" ? position.lat() : position.lat;
  const lng = typeof position.lng === "function" ? position.lng() : position.lng;
  mapState.place = {
    lat: Number(lat),
    lng: Number(lng),
    address: address || $("#delivery-address").value.trim(),
  };
  updateAreaStatus(mapState.place);
}

async function initializeMap() {
  const mapElement = $("#map");
  if (!mapElement) return;
  if (!CONFIG.googleMapsApiKey || CONFIG.googleMapsApiKey.startsWith("YOUR_")) {
    mapElement.hidden = true;
    announce($("#maps-message"), "Add your Google Maps JavaScript API key in js/config.js to enable the interactive map. You can still submit a request with a written address; staff will verify the area.", false);
    $("#use-location").disabled = true;
    updateAreaStatus(null);
    return;
  }
  try {
    const maps = await loadGoogleMaps();
    mapState.maps = maps;
    const center = isServiceCenterConfigured()
      ? { lat: SERVICE_CENTER.lat, lng: SERVICE_CENTER.lng }
      : { lat: 20.5937, lng: 78.9629 };
    mapState.map = new maps.Map(mapElement, { center, zoom: isServiceCenterConfigured() ? 13 : 5, mapTypeControl: false, streetViewControl: false });
    if (isServiceCenterConfigured()) {
      mapState.circle = new maps.Circle({ map: mapState.map, center, radius: SERVICE_RADIUS_METERS, fillColor: "#E1A900", fillOpacity: 0.16, strokeColor: "#8d6a00", strokeOpacity: 0.8 });
    }
    mapState.marker = new maps.Marker({ map: mapState.map, position: center, draggable: true, title: "Delivery pin" });
    mapState.marker.addListener("dragend", async () => {
      const position = mapState.marker.getPosition();
      setPin(position, $("#delivery-address").value.trim());
      try {
        const geocoder = new maps.Geocoder();
        const result = await geocoder.geocode({ location: position });
        const address = result.results?.[0]?.formatted_address;
        if (address) setPin(position, address);
      } catch (error) {
        console.error("Could not reverse-geocode the delivery pin.", error);
        announce($("#maps-message"), "The pin moved, but its address could not be looked up. Enter the address manually.");
      }
    });
    const autocomplete = new maps.places.Autocomplete($("#delivery-address"), { fields: ["formatted_address", "geometry", "name"] });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location) {
        announce($("#maps-message"), "Choose a suggested address with a map location, or move the pin manually.");
        return;
      }
      setPin(place.geometry.location, place.formatted_address || place.name);
      mapState.map.setZoom(16);
    });
    $("#use-location").disabled = false;
    $("#use-location").addEventListener("click", () => {
      if (!navigator.geolocation) {
        announce($("#maps-message"), "Location services aren't available in this browser.");
        return;
      }
      navigator.geolocation.getCurrentPosition(async (location) => {
        const point = { lat: location.coords.latitude, lng: location.coords.longitude };
        setPin(point);
        try {
          const geocoder = new maps.Geocoder();
          const result = await geocoder.geocode({ location: point });
          const address = result.results?.[0]?.formatted_address;
          if (address) setPin(point, address);
          mapState.map.setZoom(16);
        } catch (error) {
          console.error("Could not look up the current location.", error);
          announce($("#maps-message"), "Location found, but its address could not be looked up. Enter the address manually.");
        }
      }, (error) => {
        console.error("Could not access current location.", error);
        announce($("#maps-message"), "We couldn't access your location. Check browser permission or choose an address manually.");
      }, { enableHighAccuracy: true, timeout: 10000 });
    });
    $("#delivery-address").addEventListener("input", () => {
      if ($("#delivery-address").value.trim() !== mapState.place?.address) {
        mapState.place = null;
        updateAreaStatus(null);
      }
    });
    updateAreaStatus(null);
  } catch (error) {
    console.error("Google Maps failed to initialize.", error);
    mapElement.hidden = true;
    announce($("#maps-message"), "Google Maps could not load. You may still submit your written address for staff review.");
    $("#use-location").disabled = true;
  }
}

async function fillSavedProfile(user) {
  const { db, doc, getDoc } = await getFirebase();
  if (!user) return;
  try {
    const snapshot = await getDoc(doc(db, CONFIG.collectionNames.users, user.uid));
    if (!snapshot.exists()) return;
    const profile = snapshot.data();
    $("#customer-name").value ||= profile.name || "";
    $("#customer-phone").value ||= profile.phone || "";
    $("#delivery-address").value ||= profile.address || "";
  } catch (error) {
    console.error("Could not load the saved customer profile.", error);
  }
}

async function submitOrder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("#place-order");
  if (!form.reportValidity()) return;
  const cart = readCart();
  if (!Object.keys(cart).length) {
    announce($("#checkout-message"), "Your cart is empty.");
    return;
  }
  const address = $("#delivery-address").value.trim();
  if (!address) {
    announce($("#checkout-message"), "Enter or choose a delivery address.");
    return;
  }
  button.disabled = true;
  announce($("#checkout-message"), "Sending your order…");
  try {
    const services = await getFirebase();
    if (!services.auth.currentUser) await services.signInAnonymously(services.auth);
    const orderMidnightCharge = midnightChargeFor();
    const subtotal = cartSubtotal(cart);
    const configuredCenter = isServiceCenterConfigured();
    const outOfArea = !configuredCenter || !mapState.place || !mapState.inArea;
    const data = {
      ownerUid: services.auth.currentUser.uid,
      customerName: $("#customer-name").value.trim(),
      phone: $("#customer-phone").value.trim(),
      address,
      formattedAddress: mapState.place?.address || address,
      lat: mapState.place?.lat ?? null,
      lng: mapState.place?.lng ?? null,
      distanceMeters: mapState.distanceMeters,
      notes: $("#order-notes").value.trim(),
      items: cart,
      subtotal,
      midnightCharge: orderMidnightCharge,
      total: subtotal + orderMidnightCharge,
      outOfArea,
      status: outOfArea ? "Pending – Out of Area" : "Pending",
      declineReason: "",
      createdAt: services.serverTimestamp(),
      updatedAt: services.serverTimestamp(),
    };
    const result = await services.addDoc(services.collection(services.db, CONFIG.collectionNames.orders), data);
    const profile = { name: data.customerName, phone: data.phone, address: data.address, updatedAt: services.serverTimestamp() };
    let profileSaved = true;
    if ($("#save-address").checked) {
      try {
        await services.setDoc(services.doc(services.db, CONFIG.collectionNames.users, data.ownerUid), profile, { merge: true });
      } catch (error) {
        profileSaved = false;
        console.error("Order succeeded but the customer profile could not be saved.", error);
      }
    }
    localStorage.removeItem(CART_KEY);
    form.reset();
    const state = $("#checkout-message");
    state.classList.add("success");
    state.replaceChildren(document.createTextNode(`Request ${result.id.slice(0, 8).toUpperCase()} sent. `));
    const link = document.createElement("a");
    link.href = "account.html";
    link.textContent = "Track your order";
    state.append(link);
    if (!profileSaved) state.append(document.createTextNode(" Your saved details could not be updated."));
    renderCheckoutItems();
    updateBill();
  } catch (error) {
    console.error("Could not place the order.", error);
    announce($("#checkout-message"), error.message.includes("not configured")
      ? "Online ordering is not ready yet. Please contact the kitchen."
      : "Your request could not be sent. Please check your connection and try again.");
  } finally {
    button.disabled = false;
  }
}

async function initCheckout() {
  renderCheckoutItems();
  updateBill();
  window.setInterval(updateBill, 30000);
  $("#checkout-form").addEventListener("submit", submitOrder);
  $("#use-location").disabled = true;
  initializeMap();
  if (FIREBASE_CONFIGURED) {
    try {
      const services = await getFirebase();
      services.onAuthStateChanged(services.auth, (user) => {
        if (user) fillSavedProfile(user);
      });
    } catch (error) {
      console.error("Firebase isn't ready for checkout.", error);
      announce($("#checkout-message"), "Online ordering is not configured yet. You can review your cart, but submission is unavailable.");
    }
  } else {
    announce($("#checkout-message"), "Firebase setup is required to send orders. Please contact the kitchen meanwhile.");
  }
}

if (document.body.dataset.page === "menu") {
  renderMenu();
  renderCartSummary();
  window.setInterval(renderCartSummary, 30000);
}
if (document.body.dataset.page === "checkout") initCheckout();

export { CART_KEY, readCart, saveCart, cartSubtotal };
