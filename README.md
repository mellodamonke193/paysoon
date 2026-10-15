# Paysoon: invoice reminders on autopilot

Freelancers and small businesses lose money and hours to late invoices. Writing the "just following up…" email
is awkward, so people put it off and get paid even later.

**Paysoon fixes that.** The user adds an invoice once. Paysoon then emails their client polite, well-timed
reminders that get firmer as the due date passes, and stops automatically when the client pays or says they've paid.

- **Customer value:** they get paid sooner without the awkward emails. One invoice paid a week earlier pays for the subscription.
- **Business model:** free plan (3 open invoices, branded emails) → **Pro at $19/mo or $190/yr** (unlimited, unbranded, Persistent cadence). An optional free trial is available.
- **Hands-off once live:** signup, verification, reminders, billing, upgrades, cancellations, abuse handling, weekly summaries, backups and cleanup all run on their own. Paysoon never handles anyone's money, so there are no payouts or disputes.
- **Built-in growth:** "Sent with Paysoon" on free-plan emails and client pages, plus free SEO tools and content (email generator, late fee calculator, template pages, guide). See [`marketing/LAUNCH_KIT.md`](marketing/LAUNCH_KIT.md) for the launch plan and ready-to-post copy.

---

## What's inside

| | |
|---|---|
| **Marketing site** | Landing page, pricing, FAQ, sitemap/robots, SEO meta, free late payment email generator, late fee calculator, 5 template pages, "how to ask for payment" guide |
| **Accounts** | Signup (explicit terms + 18+ consent, recorded), login, email verification, password reset, settings, data export, account deletion |
| **Dashboard** | Outstanding, overdue and collected totals (multi-currency), filters, status badges, next reminder, onboarding checklist |
| **Invoices** | Create/edit/pause/resume/mark paid/reopen/delete, per-invoice personal message, live schedule preview, timeline, next-email preview, **Send me a test**, **Send reminder now**, **New invoice for this client**, activity feed |
| **Reminder engine** | 3 cadences; tone escalates with lateness; 9 AM in the user's timezone; never on weekends; catch-up for already-overdue invoices; minimum 20 h gap; daily caps; retries with backoff; exactly-once sending |
| **Client page** | `/i/<token>`: amount, Pay button, notes/bank details, "I've already paid", and "Something wrong?" (wrong details / not mine / stop emailing me) |
| **Weekly summary** | Monday-morning email to each user: overdue, paid, reminders sent (opt-out in Settings) |
| **Billing** | Stripe Checkout (monthly/yearly, optional trial), Customer Portal, signed idempotent webhooks protected against out-of-order events |
| **Admin** | `/admin`: estimated MRR, signups, reminders, failures, recipient reports, suspended accounts with one-click unsuspend |
| **Ops** | Daily SQLite backups (14 kept), cleanup jobs, health check, `security.txt`, graceful shutdown |

**Zero npm dependencies.** Only the Node.js standard library (built-in SQLite, crypto, http, fetch) is used, so
there's no third-party code to be compromised and nothing to `npm install`.

## Security

- **XSS:** every template value is auto-escaped; strict CSP (`script-src 'self'`, no inline scripts or styles); user links must be `https:`
- **CSRF:** signed per-browser token on every form, plus `Origin` and `Sec-Fetch-Site` checks
- **Auth:** scrypt password hashing (memory-hard) behind a concurrency limiter; session tokens stored only as SHA-256 hashes; `HttpOnly` + `Secure` + `__Host-` cookies; session rotation on login; all sessions revoked on password reset
- **Brute force and DoS:** rate limits on login (per IP and per email), signup, reset, verification, checkout, test/manual sends and client actions; equal-time responses for unknown emails; request size/time limits
- **Access control:** every invoice query is scoped to its owner, and other users' invoices return 404 rather than 403
- **Injection:** prepared statements only; CR/LF stripped from single-line inputs so email headers can't be injected; open redirects blocked (including protocol-relative `//host` tricks)
- **Abuse:** reminders only send after email verification; daily caps; free-plan limit; sender names that impersonate brands, banks, governments or collection agencies are rejected; recipients can unsubscribe or report "not mine", which blocks that address for that sender, and repeated reports auto-suspend the account
- **Billing:** Stripe webhooks verified with HMAC and replay protection, processed once per event id, stale events ignored
- **Headers:** HSTS, `X-Frame-Options: DENY`, `nosniff`, COOP/CORP, `Referrer-Policy`, `Permissions-Policy`
- **Secrets:** env vars only (`.env` is git-ignored); production refuses to start without a strong `SECRET_KEY`

```bash
npm test     # 40+ end-to-end and unit tests covering all of the above
```

## Staying legally safe

**Built in:**
- Terms of Service (no guarantee of payment, not a collection agency, user responsibilities, billing/cancellation/refunds, liability cap, indemnity, disputes), Privacy Policy (GDPR/UK GDPR/CCPA rights, cookies, sub-processors, retention), Acceptable Use Policy and Data Processing Addendum: `/terms`, `/privacy`, `/acceptable-use`, `/dpa`
- Signup requires an explicit checkbox (18+, real invoices only, agree to the policies), stored with a timestamp and version
- Reminder wording never threatens, never implies lawyers, courts or agencies, and always offers "already paid", reply, and unsubscribe
- Every reminder carries a one-click unsubscribe (RFC 8058 `List-Unsubscribe`), identifies the sender, says Paysoon is not a collection agency, and includes your company address
- Opt-outs are honored automatically and permanently; users can't resume reminders to someone who opted out
- No tracking or advertising cookies (so no cookie banner needed); data export and deletion are self-service
- Honest marketing: no fake testimonials, no "most popular" claims, the example on the landing page is labeled as an example
- Accessibility: skip link, labelled controls, WCAG AA color contrast, keyboard-friendly forms

**Things only you can do (please do them):**
1. **Form an LLC** (or your country's equivalent) and run Paysoon through it, so your personal assets are separate from the business. Then set `COMPANY_NAME`, `COMPANY_ADDRESS`, `GOVERNING_LAW` and `SUPPORT_EMAIL`.
2. **Have a lawyer review the Terms and Privacy Policy** once before launch. A one-time flat-fee review is common and inexpensive compared to the risk.
3. **Check the name** at https://tmsearch.uspto.gov before buying the domain. (The original name "Duely" was dropped because another invoice-collection product already uses it.)
4. **Stripe and taxes:** the Stripe account must be opened by an adult (18+) and the business owner. Turn on Stripe Tax if you sell to places that charge sales tax or VAT on software.
5. **Answer support and abuse emails** at `SUPPORT_EMAIL`. It's rare, but it's your strongest protection.

This is practical guidance, not legal advice.

## Run locally

Requires Node.js 22.13+.

```bash
cp .env.example .env          # then set NODE_ENV=development and APP_URL=http://localhost:3000
npm run dev
```

Open http://localhost:3000. With no `RESEND_API_KEY`, emails are printed in the terminal (including verification
links) instead of being sent. Use `localhost`, not `127.0.0.1`, so the browser's Origin matches `APP_URL`.

## Test drive in GitHub Codespaces (free, nothing to install)

On the repo page click **Code → Codespaces → Create codespace on main**. The app starts by itself and opens in a
browser tab (the link is private to you). Emails, including the verification link, are printed in the terminal.

## Host it on a DigitalOcean droplet (or any Ubuntu server)

Open the droplet's **Console** in DigitalOcean, then:

```bash
# 1. Give the server read access to the private repo (one-time)
ssh-keygen -t ed25519 -N "" -f ~/.ssh/paysoon -q && cat ~/.ssh/paysoon.pub
#    → copy the printed key into GitHub: repo Settings → Deploy keys → Add deploy key (leave "write" unticked)

# 2. Download the code and start it
GIT_SSH_COMMAND="ssh -i ~/.ssh/paysoon -o StrictHostKeyChecking=accept-new" git clone git@github.com:mellodamonke193/paysoon.git
cd paysoon && git config core.sshCommand "ssh -i ~/.ssh/paysoon"
sudo bash deploy/setup.sh
```

`setup.sh` installs Docker, asks for your domain (or uses the droplet's IP for a quick test), generates the secret
key, and runs Paysoon behind Caddy, which gets a free HTTPS certificate automatically once your domain's DNS **A
record** points at the droplet. It starts in test mode (emails go to the logs); fill in Resend/Stripe in `.env`, set
`NODE_ENV=production` and re-run the script to go live. To deploy updates later: `git pull && sudo bash deploy/setup.sh`.

## Go live (one-time, about an hour)

1. **Domain.** Buy one and set `APP_URL`. Fill in the legal identity variables (see above).
2. **Email: [Resend](https://resend.com).** Verify a sending domain (e.g. `mail.yourdomain.com`; Resend gives you the SPF/DKIM DNS records). Set `RESEND_API_KEY` and `EMAIL_FROM=reminders@mail.yourdomain.com`.
3. **Payments: [Stripe](https://stripe.com).**
   - Create a product "Pro" with a monthly price (and optionally a yearly one). Put the price IDs in `STRIPE_PRICE_PRO` / `STRIPE_PRICE_PRO_YEARLY`.
   - Copy your secret key into `STRIPE_SECRET_KEY`.
   - Add a webhook endpoint `https://yourdomain.com/webhooks/stripe` with the events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`, then copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
   - Turn on the **Customer Portal** (Settings → Billing → Customer portal) so users can cancel or update cards themselves.
4. **Deploy** (any host with a persistent disk). With [Fly.io](https://fly.io) and the included `fly.toml`:
   ```bash
   fly launch --no-deploy
   fly volumes create paysoon_data --size 1
   fly secrets set SECRET_KEY=$(openssl rand -hex 32) RESEND_API_KEY=... EMAIL_FROM=... \
     STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... STRIPE_PRICE_PRO=... ADMIN_EMAIL=you@example.com \
     COMPANY_NAME="Your LLC" COMPANY_ADDRESS="..." GOVERNING_LAW="the State of ..." SUPPORT_EMAIL=support@yourdomain.com
   fly deploy
   ```
   Or use the `Dockerfile` on Render or Railway: mount a volume at `/data`, set `TRUST_PROXY=1`, and run **exactly one instance**, because the reminder worker runs inside the app.
5. Sign up with your `ADMIN_EMAIL`, verify it, and open `/admin`. Submit `/sitemap.xml` to Google Search Console.

## Project layout

```
src/
  server.js            entry point (HTTP server + background worker)
  app.js               request pipeline: security headers → routing → session → CSRF → handler
  config.js            env config + production safety checks
  db.js                SQLite schema, migrations, prepared statements
  lib/                 http, auth/sessions/CSRF, security (hashing, rate limits, impersonation guard),
                       html escaping, validation, money, time zones, reminder scheduling
  services/            invoices, worker (reminders, tests, digests, backups), abuse (opt-outs, reports),
                       email (Resend), email templates, Stripe billing
  routes/              public (landing, tools, content, legal, client page, unsubscribe, webhook), auth, invoices, account/admin
  views/               server-rendered pages (marketing, content, legal, auth, app, client)
public/                app.css, app.js, favicon
marketing/             LAUNCH_KIT.md: launch plan and ready-to-post copy
test/                  unit + end-to-end tests (node:test)
```
