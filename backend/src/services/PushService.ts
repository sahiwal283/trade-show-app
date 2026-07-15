/**
 * Push Service
 *
 * Sends Web Push notifications to users (e.g. when a coordinator books a flight,
 * hotel, or car rental on their behalf).
 *
 * Configuration comes from env vars:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:admin@example.com)
 *
 * If the VAPID keys are missing the service reports disabled and every send is a
 * silent no-op — the app runs fine without push configured. All errors are caught
 * and logged; this service never throws into request handlers.
 */

import webpush from 'web-push';
import { query } from '../config/database';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface PushSubscriptionRow {
  id: number;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const GONE_STATUS_CODES = [404, 410];

class PushService {
  private enabled = false;
  private publicKey = '';

  constructor() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

    if (!publicKey || !privateKey) {
      console.log('[Push] VAPID keys not configured — push notifications disabled (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT to enable)');
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.publicKey = publicKey;
      this.enabled = true;
      console.log('[Push] Web push notifications enabled');
    } catch (error) {
      console.error('[Push] Invalid VAPID configuration — push notifications disabled:', error);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  /**
   * Save (upsert) a push subscription for a user.
   * If the endpoint already exists it is reassigned to this user with fresh keys.
   */
  async saveSubscription(userId: string, subscription: PushSubscriptionInput, userAgent?: string): Promise<boolean> {
    try {
      await query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint)
         DO UPDATE SET user_id = EXCLUDED.user_id,
                       p256dh = EXCLUDED.p256dh,
                       auth = EXCLUDED.auth,
                       user_agent = EXCLUDED.user_agent`,
        [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent || null]
      );
      console.log(`[Push] Saved subscription for user ${userId}`);
      return true;
    } catch (error) {
      console.error('[Push] Failed to save subscription:', error);
      return false;
    }
  }

  /**
   * Remove a push subscription by its endpoint.
   */
  async removeSubscription(endpoint: string): Promise<boolean> {
    try {
      const result = await query(
        `DELETE FROM push_subscriptions WHERE endpoint = $1`,
        [endpoint]
      );
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('[Push] Failed to remove subscription:', error);
      return false;
    }
  }

  /**
   * Send a notification to every subscription a user has.
   * Subscriptions the push service reports as gone (404/410) are deleted.
   * Never throws — safe to fire-and-forget from request handlers.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const result = await query(
        `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
        [userId]
      );
      const subscriptions = result.rows as PushSubscriptionRow[];

      if (subscriptions.length === 0) {
        return;
      }

      const body = JSON.stringify(payload);

      await Promise.all(subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth
              }
            },
            body
          );
        } catch (error: unknown) {
          const err = error as { statusCode?: number; message?: string };
          if (err.statusCode && GONE_STATUS_CODES.includes(err.statusCode)) {
            console.log(`[Push] Subscription gone (${err.statusCode}), removing endpoint for user ${userId}`);
            await this.removeSubscription(subscription.endpoint);
          } else {
            console.error(`[Push] Failed to send notification to user ${userId}:`, err.message || error);
          }
        }
      }));
    } catch (error) {
      console.error('[Push] Error sending notifications:', error);
    }
  }
}

// Export singleton instance
export const pushService = new PushService();
