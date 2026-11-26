export const CONFIG = Object.freeze({
  firebase: Object.freeze({
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_FIREBASE_PROJECT_ID",
    appId: "YOUR_FIREBASE_APP_ID",
  }),
  googleMapsApiKey: "YOUR_GOOGLE_MAPS_API_KEY",
  menu: Object.freeze({
    plain: Object.freeze({ name: "Plain Omelette", price: 5000, description: "A classic, fluffy omelette made fresh.", image: "images/plain-omelette.jpg", imageAlt: "Fresh plain omelette" }),
    veg: Object.freeze({ name: "Veg Omelette", price: 5000, description: "A fresh mix of vegetables folded into eggs.", image: "images/veg-omelette.jpg", imageAlt: "Egg and vegetable breakfast, representative photo" }),
    paneer: Object.freeze({ name: "Paneer Omelette", price: 6000, description: "Soft paneer, spices, and a golden omelette.", image: "images/paneer-omelette.jpg", imageAlt: "Paneer curry, representative photo" }),
    masala: Object.freeze({ name: "Masala Omelette", price: 5000, description: "A savoury Indian masala omelette with a little kick.", image: "images/masala-omelette.jpg", imageAlt: "Fresh omelette, representative photo" }),
    chocolate: Object.freeze({ name: "Chocolate Omelette", price: 5000, description: "A sweet chocolate twist for your adventurous side.", image: "images/chocolate-omelette.jpg", imageAlt: "Sweet breakfast pancakes, representative photo" }),
    oats: Object.freeze({ name: "Oats Omelette", price: 8000, description: "A hearty oats and egg omelette.", image: "images/oats-omelette.jpg", imageAlt: "Fresh omelette, representative photo" }),
  }),
  serviceCenter: Object.freeze({ label: "Jhanjheri, Punjab, India", lat: null, lng: null }),
  serviceRadiusMeters: 2500,
  operatingHours: Object.freeze({ opens: "17:00", closes: "22:30", timeZone: "Asia/Kolkata" }),
  midnightCharge: Object.freeze({ after: "22:30", amountPaise: 2000 }),
  collectionNames: Object.freeze({ orders: "orders", users: "users", admins: "admins" }),
});

export const SERVICE_CENTER = CONFIG.serviceCenter;
export const SERVICE_RADIUS_METERS = CONFIG.serviceRadiusMeters;
export const MENU_CONFIG = CONFIG.menu;
export const FIREBASE_CONFIGURED = Object.values(CONFIG.firebase).every(
  (value) => typeof value === "string" && value.length > 0 && !value.startsWith("YOUR_"),
);
export const MAPS_CONFIGURED = CONFIG.googleMapsApiKey.length > 0
  && !CONFIG.googleMapsApiKey.startsWith("YOUR_");

let firebasePromise;
export function getFirebase() {
  if (!FIREBASE_CONFIGURED) return Promise.reject(new Error("Firebase web configuration is not set."));
  if (!firebasePromise) {
    firebasePromise = Promise.all([
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"),
    ]).then(([appSdk, authSdk, storeSdk]) => {
      const app = appSdk.initializeApp(CONFIG.firebase);
      return {
        app,
        auth: authSdk.getAuth(app),
        db: storeSdk.getFirestore(app),
        ...authSdk,
        ...storeSdk,
      };
    });
  }
  return firebasePromise;
}

let mapsPromise;
export function loadGoogleMaps() {
  if (!MAPS_CONFIGURED) return Promise.reject(new Error("Google Maps API key is not configured."));
  if (!mapsPromise) {
    mapsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CONFIG.googleMapsApiKey)}&v=weekly&libraries=places,geometry&loading=async`;
      script.async = true;
      script.onerror = () => reject(new Error("Google Maps could not be loaded."));
      script.onload = () => resolve(window.google.maps);
      document.head.append(script);
    });
  }
  return mapsPromise;
}

export function money(paise) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

export function currentBusinessMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CONFIG.operatingHours.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour").value);
  const minute = Number(parts.find((part) => part.type === "minute").value);
  return hour * 60 + minute;
}

export function midnightChargeFor(date = new Date()) {
  return currentBusinessMinutes(date) > 22 * 60 + 30 ? CONFIG.midnightCharge.amountPaise : 0;
}

export function isServiceCenterConfigured() {
  return Number.isFinite(SERVICE_CENTER.lat) && Number.isFinite(SERVICE_CENTER.lng)
    && SERVICE_CENTER.lat >= -90 && SERVICE_CENTER.lat <= 90
    && SERVICE_CENTER.lng >= -180 && SERVICE_CENTER.lng <= 180;
}

export function safeText(value, maxLength = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

export function orderItemsLabel(items) {
  return Object.entries(items || {}).map(([id, quantity]) => {
    const item = MENU_CONFIG[id];
    return item ? `${quantity} × ${item.name}` : "Unrecognized item";
  }).join(", ");
}
