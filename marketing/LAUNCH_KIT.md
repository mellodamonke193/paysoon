# Paysoon launch kit

Everything you need to get the first customers: ready-to-post copy, a 30-day plan, and the rules that
keep you from getting banned from communities or into legal trouble. Replace `paysoon.com` with your real
domain everywhere.

---

## 1. The pitch

**One-liner:** Paysoon chases late invoices for you: polite, automatic reminders that stop the moment your client pays.

**Who it's for:** freelancers, consultants, designers, developers, photographers, small agencies and
trades: anyone who sends invoices and hates writing "just following up…".

**Why it wins:**
- **Works with any invoicing tool.** No accounting integration and nothing to switch. Add the invoice number, amount, due date and payment link.
- **Built for one job.** Full accounts-receivable tools cost far more and take days to set up. Paysoon takes two minutes.
- **Polite by design.** The tone escalates gently, there are no threats, clients can say "already paid" in one click, and reminders go out at 9 AM on weekdays only.

**Headlines to test:**
1. Get paid on time without chasing anyone.
2. Your invoices, followed up automatically.
3. Stop writing "just following up" emails.

---

## 2. Before you launch (one afternoon)

- [ ] Domain bought and `APP_URL` set. Check the name at https://tmsearch.uspto.gov (search "Paysoon" in class 9 and 42) before you buy.
- [ ] `COMPANY_NAME`, `COMPANY_ADDRESS`, `GOVERNING_LAW`, `SUPPORT_EMAIL` set (see README → Legal).
- [ ] Resend domain verified (SPF + DKIM), and a test email sent to Gmail **and** Outlook that lands in the inbox, not spam.
- [ ] Stripe in **live** mode, webhook added, Customer Portal on. Do a real $19 purchase yourself, then refund it.
- [ ] Sign up as a customer, add an invoice to your own second email address, click "Send me a test" and walk through the whole thing.
- [ ] Submit `https://paysoon.com/sitemap.xml` in **Google Search Console** and **Bing Webmaster Tools** (both free). That gets the free tools and templates indexed.

---

## 3. 30-day plan

| When | Do this | Time |
|---|---|---|
| Day 1 | Post on **Indie Hackers** (copy below). Share with friends who freelance and ask for honest feedback. | 1 h |
| Day 2 | **Show HN**, leading with the free tools (no signup needed). Reply to every comment. | 2 h |
| Day 3–5 | Fix whatever feedback came up. Ask your first users what almost stopped them from signing up. | — |
| Day 7 | **Product Hunt** launch (copy below), at 12:01 AM Pacific. Tell people you're live, but don't ask for upvotes. PH penalizes that. | 3 h |
| Day 8–14 | **Reddit**, the value-first way (see rules). One post per community, max. | 30 min/day |
| Week 2–4 | Post on **X** and **LinkedIn** twice a week: tips from the guide, before/after emails, build-in-public numbers. | 20 min/day |
| Week 3 | Email 10 **accountants/bookkeepers** and freelance coaches about a partnership (template below). | 1 h |
| Week 4 | Look at `/admin`: signups, activation, Pro conversions. Double down on whatever channel worked. | 30 min |

**After month one:** add a new free template or guide page every week or two (for example "payment reminder for
photographers", or "late payment fees in the UK"). SEO is slow, but it compounds and keeps working while you sleep.

---

## 4. Ready-to-post copy

### Product Hunt
- **Name:** Paysoon
- **Tagline (≤60 chars):** Invoice reminders that chase late payments for you
- **Description (≤260 chars):** Add an invoice once. Paysoon emails your client polite, perfectly timed reminders that get firmer as the due date passes, and stops the moment they pay. Works with any invoicing tool. Free for 3 invoices.
- **First comment (from you, the maker):**
  > Hey Product Hunt 👋 I built Paysoon because chasing late invoices is the worst part of freelancing: it's awkward, you put it off, and you get paid even later.
  >
  > Paysoon does the follow-up for you. You add the invoice (number, amount, due date, payment link) and it sends a friendly heads-up before it's due, a nudge on the day, then gradually firmer (never rude) reminders, at 9 AM on weekdays, in your name. Clients can click "I've already paid" and it stops instantly.
  >
  > There are also two free tools that need no signup: a late payment email generator and a late fee calculator.
  >
  > I'd love feedback, especially on the email wording. What would make you trust a tool to email your clients?

### Show HN
- **Title:** Show HN: Paysoon – automatic, polite reminders for unpaid invoices
- **Text:**
  > I kept forgetting to follow up on invoices, and when I remembered, I'd spend 20 minutes writing a polite-but-firm email. So I built a small tool that does it.
  >
  > You can try the free parts without signing up:
  > - Late payment email generator: https://paysoon.com/tools/late-payment-email
  > - Late fee calculator: https://paysoon.com/tools/late-fee-calculator
  >
  > The app sends a reminder sequence (before due, on the day, then escalating) at 9 AM in your timezone, skips weekends, and stops when the client pays or clicks "already paid". Every email has a one-click unsubscribe.
  >
  > Tech, since people ask: Node.js with zero npm dependencies (built-in SQLite, crypto and fetch), server-rendered HTML, a strict CSP with no inline JS, and scrypt password hashing. Happy to go into any of it.

### Indie Hackers
- **Title:** I built a tool that chases late invoices so freelancers don't have to
- **Body:**
  > The problem: freelancers wait weeks for money they're owed, mostly because following up is awkward.
  >
  > The product: Paysoon. Add an invoice and it sends escalating, polite reminders in your name until the client pays. Free for 3 invoices, $19/mo for unlimited.
  >
  > Distribution plan: free SEO tools (email generator, late fee calculator, templates) plus a small "Sent with Paysoon" line on free-plan emails, since every client who receives one is a potential user.
  >
  > I'll share numbers as they come in. What would you do differently?

### Reddit: read this first
Most subreddits **ban self-promotion** outside designated threads, and the mods will ban you. Rules:
- **r/SideProject** and **r/IMadeThis**: sharing what you built is the point. Post the Indie Hackers text.
- **r/SaaS** and **r/EntrepreneurRideAlong**: share the story and what you learned, not an ad.
- **r/freelance**, **r/smallbusiness**, **r/Entrepreneur**: **no links to your product.** Only post in their weekly promo threads if they have one. Otherwise just be helpful: answer "client won't pay" questions with real advice, and link the free guide only if it genuinely answers the question.
- Say you're the founder. One post per community. Never use alt accounts to upvote.

**Value-first post (for communities that allow links to resources):**
> **The reminder schedule that got my invoices paid faster**
> 3 days before due: friendly heads-up. On the due date: short nudge. 3–7 days late: polite follow-up. 2–3 weeks late: firmer, plus a phone call. 30–45 days: last reminder, then talk to them personally.
> Two things matter more than wording: always include a one-click payment link, and give clients an easy way to say "I already paid".
> I wrote up the full guide with copy-paste templates here (free, no signup): https://paysoon.com/guides/how-to-ask-for-payment

### X / Twitter thread
1. Freelancers lose weeks of cash flow to one thing: not following up on invoices. Not because they're lazy, but because it's awkward. 🧵
2. The fix is a schedule, not better wording: 3 days before due, on the due date, 3–7 days late, 2–3 weeks late, then a last reminder.
3. Always include a one-click payment link. Every extra step ("log into the portal", "find the bank details") adds days.
4. Give clients an easy way to say "already paid". Chasing someone who paid is the fastest way to lose them.
5. I got tired of doing this by hand, so I built Paysoon: it sends that exact schedule in your name and stops when they pay. Free for 3 invoices → https://paysoon.com

### LinkedIn
> Late invoices aren't a client problem, they're a follow-up problem.
>
> Most clients mean to pay. Invoices get buried, approvals stall, someone's on holiday. The freelancers who get paid on time aren't pushier. They're just consistent: a reminder before the due date, one on the day, then polite follow-ups.
>
> I built a small tool that does that consistency for you: Paysoon. If you invoice clients, I'd love your feedback: https://paysoon.com
>
> (Free guide with templates, no signup: https://paysoon.com/guides/how-to-ask-for-payment)

### Partnership email (accountants, bookkeepers, freelance coaches)
Only send this to individual professionals whose business email is published for business enquiries, one at a time, written by you. **Never** buy lists or blast templates.
> **Subject:** A free resource for your clients who get paid late
>
> Hi {name},
>
> I noticed you work with freelancers and small businesses. Late payments must come up a lot with your clients.
>
> I built Paysoon, a simple tool that sends polite, automatic invoice reminders and stops when the client pays. There's also a free guide and templates your clients can use without signing up: https://paysoon.com/guides/how-to-ask-for-payment
>
> If it's useful, feel free to share it. And if you'd like to recommend Paysoon to clients, I'm happy to set up a discount for them.
>
> Thanks,
> {your name}, founder of Paysoon
> {your company address} · Reply "no thanks" and I won't email again.

---

## 5. Rules that keep you safe

- **No fake anything.** No made-up testimonials, user counts, logos or "as seen in". The FTC fines for this. Add real testimonials only with the customer's written permission.
- **Never promise results.** Don't say "guaranteed to get you paid". Say it "helps you get paid sooner".
- **No bought email lists and no mass cold email.** It burns your sending domain (and with it, every customer's reminders), and in the EU/UK it's often illegal.
- **Disclose that you're the founder** whenever you mention Paysoon in communities.
- **Don't impersonate or name competitors negatively** in ads.

---

## 6. The math to $10K/month

| Price | Paying customers needed |
|---|---|
| $19/mo | ~527 |
| $29/mo | ~345 |
| Mix of monthly and $190/yr | similar; annual plans reduce churn |

**Typical funnel for small SaaS (rough benchmarks, not promises):** 2–5% of visitors sign up, and 3–10% of signups
become paying customers within a few months. So 527 customers takes something like 5,000–25,000 signups. That's why
compounding channels (SEO pages, the "Sent with Paysoon" footer, word of mouth) matter more than one big launch day.
Check `/admin` weekly and put your time into whatever is actually bringing in signups.
