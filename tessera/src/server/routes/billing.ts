import { Hono } from 'hono';
import { requireViewer, type AppEnv } from '../http/context';
import { getBilling, handleStripeWebhook, openPortal, startCheckout } from '../services/billing';
import { enforceRateLimit } from '../services/rate-limit';

export const billingRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await getBilling(requireViewer(c))))

  .post('/checkout', async (c) => {
    const viewer = requireViewer(c);
    await enforceRateLimit(`checkout:${viewer.id}`, { window: 3600, max: 20 });
    return c.json(await startCheckout(viewer));
  })

  .post('/portal', async (c) => {
    const viewer = requireViewer(c);
    await enforceRateLimit(`portal:${viewer.id}`, { window: 3600, max: 30 });
    return c.json(await openPortal(viewer));
  })

  // Called by Stripe, not the browser: authenticated by its signature, and
  // exempt from the origin check. The raw body is needed to verify it.
  .post('/webhook', async (c) => {
    await handleStripeWebhook(await c.req.text(), c.req.header('stripe-signature'));
    return c.json({ received: true });
  });
