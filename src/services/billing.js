import { createHmac } from 'node:crypto';
import { config } from '../config.js';
import { db, get, run } from '../db.js';
import { safeEqual } from '../lib/security.js';

// Stripe's REST API speaks form-encoding with bracketed keys: { a: { b: 1 } } -> a[b]=1
function encode(params, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') encode(value, name, out);
    else out.append(name, String(value));
  }
  return out;
}

async function stripe(method, path, params) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.stripe.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params ? encode(params) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${method} ${path} failed: ${res.status} ${body?.error?.message || ''}`);
  return body;
}

export async function createCheckoutSession(user, interval = 'month') {
  const price = interval === 'year' && config.stripe.priceProYearly ? config.stripe.priceProYearly : config.stripe.pricePro;
  // Free trial only for people who have never subscribed before.
  const trial = config.trialDays > 0 && !user.stripe_subscription_id ? config.trialDays : undefined;
  const session = await stripe('POST', '/checkout/sessions', {
    mode: 'subscription',
    line_items: { 0: { price, quantity: 1 } },
    success_url: `${config.appUrl}/app/billing?m=upgraded`,
    cancel_url: `${config.appUrl}/app/billing`,
    client_reference_id: String(user.id),
    ...(user.stripe_customer_id ? { customer: user.stripe_customer_id } : { customer_email: user.email }),
    allow_promotion_codes: 'true',
    metadata: { user_id: String(user.id) },
    subscription_data: { metadata: { user_id: String(user.id) }, trial_period_days: trial },
  });
  if (typeof session.url !== 'string' || !session.url.startsWith('https://checkout.stripe.com/')) {
    throw new Error('Unexpected Stripe checkout URL');
  }
  return session.url;
}

export async function createPortalSession(user) {
  const session = await stripe('POST', '/billing_portal/sessions', {
    customer: user.stripe_customer_id,
    return_url: `${config.appUrl}/app/billing`,
  });
  if (typeof session.url !== 'string' || !session.url.startsWith('https://billing.stripe.com/')) {
    throw new Error('Unexpected Stripe portal URL');
  }
  return session.url;
}

export async function cancelSubscriptionNow(subscriptionId) {
  return stripe('DELETE', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

/** Verifies the Stripe-Signature header (HMAC-SHA256 over "timestamp.payload") with replay protection. */
export function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  let timestamp = null;
  const signatures = [];
  for (const part of String(header).split(',')) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = Number(value);
    if (key === 'v1' && value) signatures.push(value);
  }
  if (!Number.isFinite(timestamp) || !signatures.length) return false;
  if (Math.abs(nowSec - timestamp) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
  return signatures.some((sig) => safeEqual(sig, expected));
}

const PRO_STATUSES = new Set(['active', 'trialing', 'past_due']);

function userForSubscription(sub) {
  const metaId = Number(sub.metadata?.user_id);
  if (Number.isSafeInteger(metaId) && metaId > 0) {
    const user = get('SELECT * FROM users WHERE id = ?', metaId);
    if (user && (!user.stripe_customer_id || user.stripe_customer_id === sub.customer)) return user;
  }
  return sub.customer ? get('SELECT * FROM users WHERE stripe_customer_id = ?', sub.customer) : undefined;
}

function applySubscription(user, sub, eventCreated) {
  if (eventCreated < user.stripe_event_at) return; // stale, out-of-order event
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  run(
    `UPDATE users SET plan = ?, stripe_customer_id = COALESCE(stripe_customer_id, ?), stripe_subscription_id = ?,
            subscription_status = ?, current_period_end = ?, cancel_at_period_end = ?, stripe_event_at = ?, updated_at = ?
      WHERE id = ?`,
    PRO_STATUSES.has(sub.status) ? 'pro' : 'free',
    sub.customer ?? null,
    sub.id,
    sub.status,
    periodEnd ? periodEnd * 1000 : null,
    sub.cancel_at_period_end ? 1 : 0,
    eventCreated,
    Date.now(),
    user.id,
  );
}

/** Applies a verified Stripe event exactly once. Returns false if it was already processed. */
export function handleStripeEvent(event) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const { changes } = run('INSERT OR IGNORE INTO stripe_events (id, type, created_at) VALUES (?, ?, ?)', event.id, event.type, Date.now());
    if (!changes) {
      db.exec('COMMIT');
      return false;
    }
    const object = event.data?.object || {};
    switch (event.type) {
      case 'checkout.session.completed': {
        const userId = Number(object.client_reference_id);
        const user = Number.isSafeInteger(userId) ? get('SELECT * FROM users WHERE id = ?', userId) : undefined;
        if (user && object.mode === 'subscription' && object.customer) {
          run(
            'UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, ?), stripe_subscription_id = COALESCE(?, stripe_subscription_id), updated_at = ? WHERE id = ?',
            object.customer,
            object.subscription ?? null,
            Date.now(),
            user.id,
          );
          if (event.created >= user.stripe_event_at && object.payment_status !== 'unpaid') {
            run(`UPDATE users SET plan = 'pro', subscription_status = COALESCE(subscription_status, 'active'), stripe_event_at = ? WHERE id = ?`, event.created, user.id);
          }
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const user = userForSubscription(object);
        if (user) applySubscription(user, object, event.created);
        break;
      }
      default:
        break;
    }
    db.exec('COMMIT');
    return true;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
