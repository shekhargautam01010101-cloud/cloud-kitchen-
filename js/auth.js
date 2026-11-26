import { CONFIG, FIREBASE_CONFIGURED, getFirebase, money, orderItemsLabel, safeText } from "./config.js";
import { CART_KEY } from "./app.js";

const $ = (selector) => document.querySelector(selector);
const note = (element, text, success = false) => {
  element.textContent = text;
  element.classList.toggle("success", success);
};
let unsubscribeOrders = null;

function statusSteps(status) {
  const steps = ["Accepted", "Preparing", "Out for delivery", "Delivered"];
  const index = steps.indexOf(status);
  const container = document.createElement("div");
  container.className = "status-steps";
  for (const [position, label] of steps.entries()) {
    const step = document.createElement("span");
    step.className = `status-step${index >= position ? " active" : ""}`;
    step.textContent = label;
    container.append(step);
  }
  return container;
}

function renderOrders(snapshot, services) {
  const list = $("#customer-orders");
  list.replaceChildren();
  if (snapshot.empty) {
    list.textContent = "No orders yet. Your next favourite is waiting.";
    return;
  }
  snapshot.forEach((documentSnapshot) => {
    const order = documentSnapshot.data();
    const card = document.createElement("article");
    card.className = "order-card";
    const header = document.createElement("div");
    header.className = "order-card-header";
    const orderId = document.createElement("span");
    orderId.textContent = `Order ${documentSnapshot.id.slice(0, 8).toUpperCase()}`;
    const status = document.createElement("span");
    status.className = `order-status${order.outOfArea ? " danger" : ""}`;
    status.textContent = order.status;
    header.append(orderId, status);
    const items = document.createElement("p");
    items.className = "muted";
    items.textContent = orderItemsLabel(order.items);
    const total = document.createElement("p");
    total.textContent = `Total ${money(order.total)}`;
    card.append(header);
    if (order.status === "Pending – Out of Area" || order.status === "Pending") card.append(statusSteps(order.status));
    else card.append(statusSteps(order.status));
    card.append(items, total);
    if (order.outOfArea) {
      const warning = document.createElement("p");
      warning.className = "notice";
      warning.textContent = "Outside the current Jhanjheri delivery radius. Staff will confirm or decline your request.";
      card.append(warning);
    }
    if (order.declineReason) {
      const reason = document.createElement("p");
      reason.className = "notice";
      reason.textContent = `Reason: ${safeText(order.declineReason, 300)}`;
      card.append(reason);
    }
    const reorder = document.createElement("button");
    reorder.className = "button button-dark";
    reorder.type = "button";
    reorder.textContent = "Reorder";
    reorder.addEventListener("click", () => {
      localStorage.setItem(CART_KEY, JSON.stringify(order.items));
      window.location.href = "order.html";
    });
    card.append(reorder);
    list.append(card);
  });
}

async function setProfile(user, services) {
  const reference = services.doc(services.db, CONFIG.collectionNames.users, user.uid);
  const profile = await services.getDoc(reference);
  if (services.auth.currentUser?.uid !== user.uid) return;
  if (profile.exists()) {
    const data = profile.data();
    $("#profile-name").value = data.name || user.displayName || "";
    $("#profile-phone").value = data.phone || "";
    $("#profile-address").value = data.address || "";
  } else {
    $("#profile-name").value = user.displayName || "";
  }
  $("#profile-form").hidden = false;
  $("#login-panel").hidden = true;
  $("#account-state").textContent = user.isAnonymous ? "Guest account — link Google or create a password to keep this profile." : `Signed in as ${user.email || user.displayName || "customer"}.`;
  if (unsubscribeOrders) unsubscribeOrders();
  const ordersQuery = services.query(
    services.collection(services.db, CONFIG.collectionNames.orders),
    services.where("ownerUid", "==", user.uid),
    services.orderBy("createdAt", "desc"),
  );
  unsubscribeOrders = services.onSnapshot(ordersQuery, (snapshot) => renderOrders(snapshot, services), (error) => {
    console.error("Could not load customer orders.", error);
    note($("#account-message"), "Your orders could not be loaded. Check your connection.");
  });
}

async function initAccount() {
  if (!FIREBASE_CONFIGURED) {
    note($("#account-message"), "Add Firebase web configuration in js/config.js to sign in or load orders.");
    $("#login-panel").hidden = true;
    return;
  }
  try {
    const services = await getFirebase();
    services.onAuthStateChanged(services.auth, (user) => {
      if (user) setProfile(user, services).catch((error) => {
        console.error("Could not load your profile.", error);
        note($("#account-message"), "Your profile could not be loaded. Try signing in again.");
      });
      else {
        if (unsubscribeOrders) unsubscribeOrders();
        unsubscribeOrders = null;
        $("#profile-form").hidden = true;
        $("#login-panel").hidden = false;
        $("#account-state").textContent = "Sign in to save your profile and track orders. You can also keep ordering as a guest.";
        $("#customer-orders").textContent = "Sign in or continue as guest to view orders tied to this device.";
      }
    });

    $("#email-login").addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = $("#account-email").value.trim();
      const password = $("#account-password").value;
      try {
        const current = services.auth.currentUser;
        if (current?.isAnonymous) {
          const credential = services.EmailAuthProvider.credential(email, password);
          await services.linkWithCredential(current, credential);
        } else await services.signInWithEmailAndPassword(services.auth, email, password);
        note($("#account-message"), "Signed in.", true);
      } catch (error) {
        console.error("Email sign-in failed.", error);
        note($("#account-message"), error.code === "auth/credential-already-in-use"
          ? "This email already has an account. Sign in with that account to continue."
          : "Sign-in failed. Check your email and password.");
      }
    });
    $("#email-register").addEventListener("click", async () => {
      const email = $("#account-email").value.trim();
      const password = $("#account-password").value;
      if (!email || password.length < 6) {
        note($("#account-message"), "Enter an email and a password of at least 6 characters.");
        return;
      }
      try {
        const current = services.auth.currentUser;
        if (current?.isAnonymous) {
          await services.linkWithCredential(current, services.EmailAuthProvider.credential(email, password));
        } else await services.createUserWithEmailAndPassword(services.auth, email, password);
        note($("#account-message"), "Account created.", true);
      } catch (error) {
        console.error("Email account creation failed.", error);
        note($("#account-message"), "Could not create the account. Check the email and try another password.");
      }
    });
    $("#google-login").addEventListener("click", async () => {
      try {
        const provider = new services.GoogleAuthProvider();
        const current = services.auth.currentUser;
        if (current?.isAnonymous) await services.linkWithPopup(current, provider);
        else await services.signInWithPopup(services.auth, provider);
        note($("#account-message"), "Google account connected.", true);
      } catch (error) {
        console.error("Google sign-in failed.", error);
        note($("#account-message"), "Google sign-in failed. Confirm the provider and authorized domain are enabled.");
      }
    });
    $("#customer-profile").addEventListener("submit", async (event) => {
      event.preventDefault();
      const user = services.auth.currentUser;
      if (!user) return;
      try {
        await services.setDoc(services.doc(services.db, CONFIG.collectionNames.users, user.uid), {
          name: safeText($("#profile-name").value, 80),
          phone: safeText($("#profile-phone").value, 20),
          address: safeText($("#profile-address").value, 300),
          updatedAt: services.serverTimestamp(),
        }, { merge: true });
        note($("#account-message"), "Profile saved.", true);
      } catch (error) {
        console.error("Could not save customer profile.", error);
        note($("#account-message"), "Profile could not be saved.");
      }
    });
    $("#sign-out").addEventListener("click", async () => {
      await services.signOut(services.auth);
      note($("#account-message"), "Signed out.", true);
    });
    $("#guest-account").addEventListener("click", async () => {
      if (!services.auth.currentUser) await services.signInAnonymously(services.auth);
      note($("#account-message"), "Guest profile ready. You can continue to checkout.");
    });
  } catch (error) {
    console.error("Firebase isn't ready for accounts.", error);
    note($("#account-message"), "Firebase setup is required for customer accounts.");
  }
}

if (document.body.dataset.page === "account") initAccount();
