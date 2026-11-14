import type { BillingStatus } from '@shared/api';
import { PREMIUM_PRICE } from '@shared/entitlements';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { db } from '../db/client';
import { billingEvents, subscriptions, users } from '../db/schema';
import { env } from '../env';
import type { Viewer } from '../http/context';
import { badRequest, conflict, forbidden, HttpError } from '../http/errors';
import { log } from '../log';

/**
 * Premium billing. Stripe (test or live keys) in real deployments; an explicit
 * mock provider for development and tests, which grants premium without
 * payment and is refused in production by env.ts.
 */

const ACTIVE = new Set(['active', 'trialing', 'past_due']);
/** Days of access kept when a renewal payment is late, before Stripe gives up. */
const GRACE_DAYS = 3;

let stripeClient: Stripe | null = null;
function stripe(): Stripe {
  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2 });
  return stripeClient;
}

function requireProvider(): 'stripe' | 'mock' {
  if (env.paymentsProvider === 'off') throw new HttpError(503, 'payments_unavailable', 'Payments are not set up on this server.');
  return env.paymentsProvider;
}

/** Writes the subscription row and the plan it implies, in one transaction. */
async function applySubscription(
  userId: string,
  sub: { provider: string; customerId: string | null; subscriptionId: string | null; status: string; periodEnd: Date | null; cancelAtPeriodEnd: boolean },
): Promise<void> {
  const active = ACTIVE.has(sub.status);
  const expires = active && sub.periodEnd ? new Date(sub.periodEnd.getTime() + GRACE_DAYS * 86_400_000) : new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(subscriptions)
      .values({
        userId,
        provider: sub.provider,
        customerId: sub.customerId,
        subscriptionId: sub.subscriptionId,
        status: sub.status,
        currentPeriodEnd: sub.periodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          provider: sub.provider,
          customerId: sub.customerId,
          subscriptionId: sub.subscriptionId,
          status: sub.status,
          currentPeriodEnd: sub.periodEnd,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          updatedAt: new Date(),
        },
      });
    await tx
      .update(users)
      .set({ plan: active ? 'premium' : 'free', planExpiresAt: expires })
      .where(eq(users.id, userId));
  });
  log.info({ userId, status: sub.status, provider: sub.provider }, 'subscription updated');
}

export async function getBilling(viewer: Viewer): Promise<BillingStatus> {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, viewer.id)).limit(1);
  return {
    plan: viewer.plan,
    provider: env.paymentsProvider,
    price: PREMIUM_PRICE,
    subscription: row
      ? {
          status: row.status,
          currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: row.cancelAtPeriodEnd,
          manageable: row.provider === env.paymentsProvider,
        }
      : null,
  };
}

export async function startCheckout(viewer: Viewer): Promise<{ url: string }> {
  const provider = requireProvider();
  if (viewer.isChild) throw forbidden('child_restricted', 'Accounts for under-13s cannot buy Premium.');
  if (viewer.plan === 'premium') throw conflict('already_premium', 'You already have Premium.');

  if (provider === 'mock') {
    await applySubscription(viewer.id, {
      provider: 'mock',
      customerId: null,
      subscriptionId: `mock_${viewer.id}`,
      status: 'active',
      periodEnd: new Date(Date.now() + 30 * 86_400_000),
      cancelAtPeriodEnd: false,
    });
    return { url: '/upgrade?checkout=success' };
  }

  const [user] = await db.select({ customerId: users.stripeCustomerId }).from(users).where(eq(users.id, viewer.id)).limit(1);
  let customerId = user?.customerId ?? null;
  if (!customerId) {
    const customer = await stripe().customers.create({ email: viewer.email, name: viewer.name, metadata: { userId: viewer.id } });
    customerId = customer.id;
    await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, viewer.id));
  }
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: viewer.id,
    line_items: [{ price: env.STRIPE_PRICE_ID!, quantity: 1 }],
    subscription_data: { metadata: { userId: viewer.id } },
    allow_promotion_codes: true,
    success_url: `${env.appUrl}/upgrade?checkout=success`,
    cancel_url: `${env.appUrl}/upgrade?checkout=cancelled`,
  });
  if (!session.url) throw new HttpError(502, 'payments_failed', 'Could not start checkout. Try again.');
  return { url: session.url };
}

export async function openPortal(viewer: Viewer): Promise<{ url: string }> {
  const provider = requireProvider();
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, viewer.id)).limit(1);
  if (!row) throw badRequest('no_subscription', 'There is no subscription to manage.');

  if (provider === 'mock') {
    // The mock "portal" toggles cancellation at the end of the period.
    await applySubscription(viewer.id, {
      provider: 'mock',
      customerId: null,
      subscriptionId: row.subscriptionId,
      status: row.status,
      periodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: !row.cancelAtPeriodEnd,
    });
    return { url: '/settings?billing=updated' };
  }
  if (!row.customerId) throw badRequest('no_subscription', 'There is no subscription to manage.');
  const session = await stripe().billingPortal.sessions.create({ customer: row.customerId, return_url: `${env.appUrl}/settings` });
  return { url: session.url };
}

async function syncStripeSubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  let userId = sub.metadata?.userId ?? null;
  if (!userId) {
    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
    userId = owner?.id ?? null;
  }
  if (!userId) {
    log.warn({ subscription: sub.id }, 'stripe subscription without a matching user');
    return;
  }
  const periodEnd = sub.items.data.reduce<number | null>((max, item) => Math.max(max ?? 0, item.current_period_end), null);
  await applySubscription(userId, {
    provider: 'stripe',
    customerId,
    subscriptionId: sub.id,
    status: sub.status,
    periodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  });
}

/** Verifies and applies one Stripe webhook. Each event id is handled once. */
export async function handleStripeWebhook(payload: string, signature: string | undefined): Promise<void> {
  if (env.paymentsProvider !== 'stripe' || !env.STRIPE_WEBHOOK_SECRET) throw new HttpError(404, 'not_found');
  if (!signature) throw badRequest('bad_signature', 'Missing signature.');
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw badRequest('bad_signature', 'Invalid signature.');
  }
  const fresh = await db.insert(billingEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning({ id: billingEvents.id });
  if (fresh.length === 0) return;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const id = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
          await syncStripeSubscription(await stripe().subscriptions.retrieve(id));
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        // Fetch the latest state: events can arrive out of order.
        await syncStripeSubscription(await stripe().subscriptions.retrieve(event.data.object.id));
        break;
      default:
        break;
    }
  } catch (error) {
    // Let Stripe retry: forget the event so the retry is processed.
    await db.delete(billingEvents).where(eq(billingEvents.id, event.id));
    throw error;
  }
}

/** Stops future charges when an account is deleted. */
export async function cancelBillingForDeletion(userId: string): Promise<void> {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!row || row.provider !== 'stripe' || !row.subscriptionId || !ACTIVE.has(row.status) || env.paymentsProvider !== 'stripe') return;
  await stripe().subscriptions.cancel(row.subscriptionId);
  log.info({ userId }, 'account deletion: cancelled subscription');
}
