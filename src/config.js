import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

// Minimal .env loader so the app has zero dependencies. Real environment variables win.
function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

if (process.env.APP_NO_DOTENV !== '1') loadDotEnv(resolve(process.cwd(), '.env'));

const env = process.env;
const int = (value, fallback) => (value && /^\d+$/.test(value) ? Number(value) : fallback);

const isProd = env.NODE_ENV === 'production';
const port = int(env.PORT, 3000);
// GitHub Codespaces serves the app on a forwarded https URL behind its own proxy; detect it so a test drive just works.
const codespaceUrl =
  env.CODESPACE_NAME && env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? `https://${env.CODESPACE_NAME}-${port}.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : '';
const appUrl = (env.APP_URL || codespaceUrl || `http://localhost:${port}`).replace(/\/+$/, '');
const secure = appUrl.startsWith('https://');

const problems = [];
let secretKey = env.SECRET_KEY || '';
if (secretKey.length < 32) {
  if (isProd) problems.push('SECRET_KEY must be at least 32 characters (generate one with: openssl rand -hex 32)');
  secretKey = randomBytes(32).toString('hex');
}
if (isProd && !secure) problems.push('APP_URL must start with https:// in production');
if (isProd && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) problems.push('RESEND_API_KEY and EMAIL_FROM are required in production');
if (problems.length) {
  console.error(`Configuration error:\n - ${problems.join('\n - ')}`);
  process.exit(1);
}

export const config = Object.freeze({
  isProd,
  port,
  host: env.HOST || '0.0.0.0',
  appUrl,
  appOrigin: new URL(appUrl).origin,
  secure,
  appName: env.APP_NAME || 'Paysoon',
  dbPath: env.DATABASE_PATH || resolve(process.cwd(), 'data/paysoon.db'),
  secretKey,
  trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true' || Boolean(codespaceUrl && !env.APP_URL),
  adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
  supportEmail: (env.SUPPORT_EMAIL || '').trim(),
  // Shown in the legal pages, footer and reminder emails. Fill these in before launch.
  company: {
    name: (env.COMPANY_NAME || '').trim(),
    address: (env.COMPANY_ADDRESS || '').trim(),
    governingLaw: (env.GOVERNING_LAW || '').trim(),
  },
  termsVersion: '2026-10-15',
  email: {
    resendKey: env.RESEND_API_KEY || '',
    from: env.EMAIL_FROM || '',
  },
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    pricePro: env.STRIPE_PRICE_PRO || '',
    priceProYearly: env.STRIPE_PRICE_PRO_YEARLY || '',
  },
  proPriceLabel: env.PRO_PRICE_LABEL || '$19',
  proPriceMonthly: Number(env.PRO_PRICE_MONTHLY || 19),
  proYearlyLabel: env.PRO_YEARLY_PRICE_LABEL || '$190',
  trialDays: int(env.PRO_TRIAL_DAYS, 0),
  limits: {
    freeActiveInvoices: int(env.FREE_ACTIVE_INVOICES, 3),
    freeDailyEmails: int(env.FREE_DAILY_EMAILS, 20),
    proDailyEmails: int(env.PRO_DAILY_EMAILS, 400),
    // "I don't recognize this invoice" reports from different recipients before sending is suspended for review.
    reportsToSuspend: int(env.ABUSE_REPORTS_TO_SUSPEND, 3),
  },
  workerEnabled: env.WORKER_DISABLED !== '1',
  workerIntervalMs: int(env.WORKER_INTERVAL_MS, 60_000),
  backupsEnabled: env.BACKUPS_DISABLED !== '1',
  cookies: {
    session: secure ? '__Host-sid' : 'ps_sid',
    csrf: secure ? '__Host-csrf' : 'ps_csrf',
  },
});

export const billingEnabled = () =>
  Boolean(config.stripe.secretKey && config.stripe.webhookSecret && config.stripe.pricePro);

export const yearlyEnabled = () => billingEnabled() && Boolean(config.stripe.priceProYearly);

// The legal entity that operates the service, used across legal pages and emails.
export const operatorName = () => config.company.name || config.appName;
