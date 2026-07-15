/**
 * Push Notifications Utility
 *
 * Client-side helpers for Web Push: feature detection, subscription state,
 * and enabling/disabling push notifications against the /api/push endpoints.
 */

import { apiClient } from './apiClient';

const PUSH_SERVICE_WORKER_URL = '/push-sw.js';

export interface PushPublicKeyResponse {
  publicKey: string;
  enabled: boolean;
}

export type PushSubscriptionState = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

/**
 * Whether this browser supports Web Push (service worker + PushManager + Notification).
 */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Current push subscription state for this browser.
 */
export async function getSubscriptionState(): Promise<PushSubscriptionState> {
  if (!isPushSupported()) {
    return 'unsupported';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration(PUSH_SERVICE_WORKER_URL);
    const subscription = await registration?.pushManager.getSubscription();
    return subscription ? 'subscribed' : 'unsubscribed';
  } catch (error) {
    console.error('[Push] Failed to read subscription state:', error);
    return 'unsubscribed';
  }
}

/**
 * Fetch server push configuration (VAPID public key + enabled flag).
 */
export function fetchPushConfig(): Promise<PushPublicKeyResponse> {
  return apiClient.get<PushPublicKeyResponse>('/push/public-key');
}

/**
 * Convert a URL-safe base64 VAPID key to the Uint8Array PushManager expects.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * Enable push notifications: register the push service worker, request permission,
 * subscribe with the server's VAPID key, and save the subscription on the backend.
 */
export async function enablePush(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  const config = await fetchPushConfig();
  if (!config.enabled || !config.publicKey) {
    throw new Error('Push notifications are not configured on the server yet.');
  }

  const registration = await navigator.serviceWorker.register(PUSH_SERVICE_WORKER_URL);

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(config.publicKey)
  });

  await apiClient.post('/push/subscribe', { subscription: subscription.toJSON() });
}

/**
 * Disable push notifications: unsubscribe locally and remove the subscription
 * from the backend.
 */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration(PUSH_SERVICE_WORKER_URL);
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) {
    return;
  }

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await apiClient.post('/push/unsubscribe', { endpoint });
}

/**
 * Ask the backend to send a test notification to the current user.
 */
export async function sendTestPushNotification(): Promise<void> {
  await apiClient.post('/push/test');
}
