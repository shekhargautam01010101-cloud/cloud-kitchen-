# ANDAAZ – The Omelette Kitchen

Responsive plain HTML/CSS/JavaScript ordering site with Firebase Authentication, Cloud Firestore, Google Maps/Places checkout, customer accounts, and an owner dashboard.

## Run locally

Serve the repository root over HTTP (ES modules don't work reliably from `file://`), for example:

```sh
python -m http.server 8000
```

Open `http://localhost:8000`. Menu browsing and cart changes work without external credentials; Firebase order submission, accounts, staff access, and interactive maps require setup below.

## Project structure

- `index.html`, `order.html`, `account.html`, `admin.html` — menu, checkout, customer account/order tracking, and private staff dashboard.
- `css/style.css` — shared responsive styles.
- `js/app.js`, `js/auth.js`, `js/admin.js` — menu/checkout, customer auth/profile/orders, and staff dashboard.
- `js/config.js` — public Firebase/Maps configuration, the single menu/price object, service-area configuration, and opening/charge settings.
- `images/` — local menu image assets. If an image file is absent, its card shows a built-in fallback.
- `images/credits.md` — image credits and source licenses.
- `firestore.rules` — server-enforced customer ownership, staff authorization, menu/total validation, and status transitions.
- `firestore.indexes.json` — composite index for a customer's live order history.

## Firebase and Maps setup

1. Create a Firebase project and register a Web app. Replace the `YOUR_FIREBASE_*` values in `js/config.js` with the Firebase web configuration.
2. Enable **Anonymous**, **Google**, and **Email/Password** authentication. Add your production domain and localhost to Firebase Authentication's authorized domains.
3. Create a Cloud Firestore database and deploy `firestore.rules` and its customer order-history index using `firebase deploy --only firestore:rules,firestore:indexes --project YOUR_FIREBASE_PROJECT_ID` or the Firebase console.
4. Create staff email/password accounts in Firebase Authentication. For each authorized staff UID, create `admins/{UID}` using the Firebase console or a trusted administrative environment with boolean `enabled: true`. Website writes to `admins` are denied.
5. In Google Cloud, enable Maps JavaScript API, Places API (Places library), and billing. Add the browser key to `googleMapsApiKey` as `YOUR_GOOGLE_MAPS_API_KEY`, and restrict the key by website referrer and API.
6. Set `serviceCenter.lat` and `serviceCenter.lng` in `js/config.js` to a **verified** Jhanjheri kitchen pin. The checked-in `null` values are intentionally unconfigured, not coordinates. `serviceRadiusMeters` defaults to 2500 m. Until the center is set, delivery area cannot be verified; requests are still accepted but marked `Pending – Out of Area` for staff confirmation.
7. Serve the production site over HTTPS. Test guest, linked Google/email account, map, customer order read, and staff status flows against deployed Firestore rules.

The map uses the configured service center and Google's geometry library for radius checks. If Maps or its key is unavailable, customers can still submit a written-address request; it is marked for staff review. Client geofence values and addresses are customer-supplied data, not an authorization boundary. Staff must verify locations before accepting out-of-area requests.

## Menu, service time, and order states

The six menu products and paise prices live together in `CONFIG.menu` in `js/config.js`. Firestore rules independently enforce those same IDs/prices; update both when the menu changes. Prices are in paise (₹50 is `5000`).

Operating hours are configured as 5:00 PM–10:30 PM Asia/Kolkata. Requests remain submittable outside these hours; after 10:30 PM IST, a separate ₹20 (`2000` paise) charge is included. Firestore rules independently calculate this from trusted server request time (UTC 17:00 corresponds to 22:30 IST) and reject a mismatched client total.

Out-of-area orders are retained as requests with `outOfArea: true` and status `Pending – Out of Area`; the site does not block the customer. Staff can accept or decline with a reason, then advance accepted orders through Preparing, Out for delivery, and Delivered. Dashboard "revenue" is an estimated total for accepted/active orders, not payment revenue: this site does not process payments.

## Security

Firebase web configuration and the Google Maps browser key are public because they are delivered to visitors. They identify services; they are **not secrets**. Never put service-account keys, private credentials, or privileged server secrets in client code. Restrict the Maps key by referrer/API and configure Firebase App Check and abuse protections before launch.

Firestore Security Rules are the security boundary, not JavaScript UI checks. Customers can create orders and read only documents whose `ownerUid` matches their authenticated UID; profile reads/writes are limited to that UID. Staff reads/updates require an enabled `admins/{UID}` document, which cannot be managed from the site. Rules validate order structure, item quantities/prices, server timestamp, midnight charge, and permitted status transitions. They cannot validate geospatial distance from a client-supplied map pin; use trusted staff confirmation or a trusted backend before treating a location/status as authoritative. Keep rules deployed and test them with the Firebase Emulator Suite before accepting real orders.

Customer accounts are optional. Anonymous guest authentication preserves guest order ownership on the same browser; linking Google/email to that anonymous user keeps its UID. A different device/account cannot read a guest's orders.

## Brand and contact

Brand colours: black `#111111`, mustard `#E1A900`, cream `#FFF6E0`. Instagram: [@ANDAAZ.EAT](https://instagram.com/ANDAAZ.EAT). Call/WhatsApp: [7011282410](tel:+917011282410). Footer tagline: “ANDAAZ – Not Just An Omelette. It's A Whole New Andaz Of Eating.”
