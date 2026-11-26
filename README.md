# ANDAAZ – The Omelette Kitchen

A responsive plain HTML/CSS/JavaScript ordering site with Firebase Authentication and Cloud Firestore.

## Run locally

Serve this directory over HTTP (ES modules do not run reliably from `file://`), for example with `python -m http.server 8000`, then open `http://localhost:8000`. Menu browsing and cart controls work without Firebase; checkout and staff sign-in need Firebase setup.

## Firebase setup

1. Create a Firebase project, register a Web app, and replace the sample values in `firebase-config.js` with its web-app configuration.
2. Enable **Anonymous** and **Email/Password** sign-in in Firebase Authentication. Create staff accounts using the Firebase console.
3. Create a Cloud Firestore database and deploy `firestore.rules` using `firebase deploy --only firestore:rules` or the Firebase console Rules editor.
4. To authorize staff, get the account's Authentication UID and create `admins/{UID}` in Firestore with boolean `enabled: true`. Do this only through the Firebase console or a trusted administrative environment. Website writes to `admins` are denied.
5. Serve the production site over HTTPS, configure the Firebase authorized domains, and test customer and staff flows against deployed rules.

The sample menu uses fixed item IDs and prices. Keep the menu in `app.js` and matching IDs/prices in `firestore.rules` synchronized when changing products or prices. Rules store prices in paise (₹149 is `14900`).

The location link searches for **Jhanjheri, Punjab, India**, without unverified coordinates or a Maps API key. Replace it with the kitchen's verified address when available.

## Security

Firebase web configuration, including its API key, is delivered to every browser. It identifies the Firebase project; it is **not a secret** and must not be used as authorization. Never place service-account keys, private credentials, or privileged server secrets in this repository or client code.

Firestore Security Rules are the security boundary. These rules restrict customers to creating and reading their own orders, validate order fields, menu quantities and totals, and permit staff order access only when `admins/{UID}` is enabled. Admin records cannot be created or changed by the website. JavaScript UI checks do not protect Firestore data; deploy and test the rules before accepting orders. Anonymous ordering can be abused or spammed; configure Firebase App Check and suitable abuse controls.

Orders are customer-submitted requests, not payment confirmations. The site does not process payments or claim kitchen acceptance before staff confirmation.

## Files

- `index.html` – customer ordering and staff sign-in.
- `styles.css` – responsive styling.
- `app.js` – menu, cart, checkout, Firebase Auth, and staff order management.
- `firebase-config.js` – public Firebase web-app configuration.
- `firestore.rules` – server-enforced access and validation rules.
