/**
 * Push Notification Routes
 * Handles Web Push subscription management and test notifications
 */

import express, { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { pushService, PushSubscriptionInput } from '../services/PushService';

const router = express.Router();

// Get the VAPID public key (and whether push is configured on the server)
router.get('/public-key', (req: AuthRequest, res: Response) => {
  res.json({
    publicKey: pushService.getPublicKey(),
    enabled: pushService.isEnabled()
  });
});

// Subscribe the current user's browser to push notifications
router.post('/subscribe', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const subscription = req.body?.subscription as PushSubscriptionInput | undefined;

    if (!subscription || typeof subscription.endpoint !== 'string' || !subscription.keys ||
        typeof subscription.keys.p256dh !== 'string' || typeof subscription.keys.auth !== 'string') {
      return res.status(400).json({ error: 'Invalid subscription payload' });
    }

    const saved = await pushService.saveSubscription(req.user.id, subscription, req.get('user-agent'));

    if (!saved) {
      return res.status(500).json({ error: 'Failed to save subscription' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Push] Error subscribing:', error);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// Unsubscribe an endpoint from push notifications
router.post('/unsubscribe', async (req: AuthRequest, res: Response) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ error: 'Endpoint is required' });
    }

    await pushService.removeSubscription(endpoint);
    res.json({ success: true });
  } catch (error) {
    console.error('[Push] Error unsubscribing:', error);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

// Send a test notification to the requesting user
router.post('/test', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!pushService.isEnabled()) {
      return res.status(400).json({ error: 'Push notifications are not configured on the server' });
    }

    await pushService.sendToUser(req.user.id, {
      title: 'Test notification',
      body: 'Push notifications are working on this device.',
      url: '/'
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Push] Error sending test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

export default router;
