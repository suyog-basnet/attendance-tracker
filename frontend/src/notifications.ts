import { getVapidPublicKey, subscribePush, unsubscribePush } from "./api";

// Converts the base64url VAPID public key into the Uint8Array format
// the Push API's applicationServerKey option requires.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export async function getSubscriptionStatus(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function enableNotifications(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) {
    return { ok: false, reason: "This browser doesn't support push notifications." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Notification permission was not granted." };
  }

  const { publicKey, configured } = await getVapidPublicKey();
  if (!configured || !publicKey) {
    return { ok: false, reason: "Push notifications aren't configured on the server yet." };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as ArrayBuffer,
    });
  }

  await subscribePush(subscription.toJSON());
  return { ok: true };
}

export async function disableNotifications(): Promise<void> {
  const sub = await getSubscriptionStatus();
  if (!sub) return;
  await unsubscribePush(sub.endpoint);
  await sub.unsubscribe();
}

// Shows a notification straight from the browser, with no server or push
// service involved. If this works, permissions and the service worker are fine
// — so a failure of the server-side test points at the push service/network.
export async function showLocalTestNotification(): Promise<{ ok: boolean; reason?: string }> {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    return { ok: false, reason: "This browser doesn't support notifications." };
  }
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission !== "granted") {
    return {
      ok: false,
      reason: "Notifications are blocked for this site. Click the lock icon next to the address bar and allow them.",
    };
  }
  await navigator.serviceWorker.register("/sw.js");
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification("✅ KU Tracker test", {
    body: "This one came from your browser, not the server.",
    icon: "/icon-192.png",
    tag: "local-test",
  });
  return { ok: true };
}