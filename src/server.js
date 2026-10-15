import { config, billingEnabled } from './config.js';
import { db } from './db.js';
import { createApp } from './app.js';
import { startWorker, stopWorker } from './services/worker.js';

const server = createApp();

server.listen(config.port, config.host, () => {
  console.log(`${config.appName} running at ${config.appUrl} (listening on ${config.host}:${config.port})`);
  if (!config.email.resendKey) console.log('  • Email: development mode (emails are printed here, not sent). Set RESEND_API_KEY to send.');
  if (!billingEnabled()) console.log('  • Billing: disabled. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_PRICE_PRO to enable upgrades.');
  if (config.isProd && (!config.company.name || !config.supportEmail)) {
    console.warn('  • Legal: set COMPANY_NAME, COMPANY_ADDRESS, GOVERNING_LAW and SUPPORT_EMAIL so your Terms, Privacy Policy and emails identify you.');
  }
  startWorker();
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`${signal} received, shutting down…`);
  stopWorker();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => console.error('[process] unhandled rejection', err));
