import http from 'node:http';
import { Router, Context, HttpError, Redirect, applySecurityHeaders, STATUS_TEXT } from './lib/http.js';
import { loadSession, verifyCsrf } from './lib/auth.js';
import { errorPage } from './views/layout.js';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import invoiceRoutes from './routes/invoices.js';
import accountRoutes from './routes/account.js';

export function createApp() {
  const router = new Router();
  publicRoutes(router);
  authRoutes(router);
  invoiceRoutes(router);
  accountRoutes(router);

  async function handle(req, res) {
    const ctx = new Context(req, res);
    applySecurityHeaders(res);
    try {
      if (!['GET', 'HEAD', 'POST'].includes(ctx.method)) throw new HttpError(405);
      if (ctx.path.length > 1 && ctx.path.endsWith('/') && ctx.method !== 'POST') {
        // Collapse leading slashes too: "//evil.com/" must never become a protocol-relative redirect.
        return ctx.redirect(`/${ctx.path.replace(/^\/+|\/+$/g, '')}`, 308);
      }
      const match = router.match(ctx.method, ctx.path);
      if (!match) throw new HttpError(404);
      if (match === 'method-not-allowed') throw new HttpError(405);
      ctx.params = match.params;
      loadSession(ctx);
      if (ctx.method === 'POST' && match.route.opts.csrf !== false) await verifyCsrf(ctx);
      await match.route.handler(ctx);
      if (!res.headersSent) throw new Error(`No response sent for ${ctx.method} ${ctx.path}`);
    } catch (err) {
      if (err instanceof Redirect) return ctx.redirect(err.location);
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error(`[http] ${ctx.method} ${ctx.path}:`, err);
      if (res.headersSent) return res.destroy();
      if (status === 413) res.setHeader('Connection', 'close');
      const message = err instanceof HttpError ? err.message : STATUS_TEXT[500];
      try {
        ctx.html(errorPage(ctx, status, status === 404 ? "The page you're looking for doesn't exist or has moved." : message), status);
      } catch {
        ctx.text(message, status);
      }
    }
  }

  const server = http.createServer({ maxHeaderSize: 16 * 1024 }, (req, res) => {
    handle(req, res).catch((err) => {
      console.error('[http] unhandled', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal error');
      }
    });
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 200;
  return server;
}
