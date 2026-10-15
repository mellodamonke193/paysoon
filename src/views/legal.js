import { config, operatorName } from '../config.js';
import { html } from '../lib/html.js';
import { formatDate } from '../lib/time.js';
import { page } from './layout.js';

// Plain-language legal pages. The operator's details come from COMPANY_NAME, COMPANY_ADDRESS,
// GOVERNING_LAW and SUPPORT_EMAIL so the same text works for whoever runs the service.

const app = config.appName;
const effective = () => formatDate(config.termsVersion, 'long');
const contact = () =>
  config.supportEmail ? html`<a href="mailto:${config.supportEmail}">${config.supportEmail}</a>` : html`the contact details on our website`;
const operator = () => html`<strong>${operatorName()}</strong>${config.company.address ? html` (${config.company.address})` : ''}`;
const law = () => config.company.governingLaw || 'the jurisdiction where the operator is established';

const terms = () => html`
<p>These Terms of Service ("Terms") are an agreement between you and ${operator()} ("we", "us"), the operator of ${app} (the "Service"). By creating an account or using the Service you agree to these Terms, our <a href="/privacy">Privacy Policy</a>, our <a href="/acceptable-use">Acceptable Use Policy</a> and, where it applies, our <a href="/dpa">Data Processing Addendum</a>.</p>

<h2>1. Who can use ${app}</h2>
<ul>
  <li>You must be at least 18 years old and able to form a binding contract.</li>
  <li>${app} is for business and professional use: following up on invoices for goods or services you provided. If you use it on behalf of a company, you confirm you are authorized to accept these Terms for that company.</li>
</ul>

<h2>2. What the Service does, and what it does not</h2>
<ul>
  <li>${app} sends payment reminder emails to your clients, in your name and at your instruction, for invoices you add.</li>
  <li><strong>We are not a collection agency</strong>, law firm, bank or payment processor. We do not collect, hold or transmit your money. Your clients pay you directly using the payment link or instructions you provide.</li>
  <li><strong>We do not guarantee that any invoice will be paid</strong>, or paid by a particular date. We do not provide legal, tax or financial advice.</li>
  <li>Email delivery depends on third parties (email providers, spam filters). We can't guarantee that every email is delivered or read.</li>
</ul>

<h2>3. Your responsibilities</h2>
<ul>
  <li>You will only add invoices for amounts that are genuinely owed to you, by people you actually did business with, and you'll keep invoice details accurate.</li>
  <li>You are the sender of the reminders and are responsible for their content, including any personal message you add, and for having a lawful basis to contact each client.</li>
  <li>You'll comply with all laws that apply to you and your invoices, including consumer protection, anti-spam, data protection and debt collection laws (for example, laws that apply when a creditor collects its own debts from individuals, such as California's Rosenthal Fair Debt Collection Practices Act). If you invoice individuals (consumers) rather than businesses, it is your responsibility to make sure automated reminders are permitted for you.</li>
  <li>You won't use the Service in any way our <a href="/acceptable-use">Acceptable Use Policy</a> prohibits.</li>
  <li>You'll keep your login details secure and tell us promptly about any unauthorized use of your account.</li>
</ul>

<h2>4. Your clients' choices</h2>
<p>Every reminder lets the recipient say they've already paid, report a problem, say they don't recognize the invoice, or unsubscribe. We honor those choices automatically: reminders pause, and recipients who unsubscribe or don't recognize an invoice won't receive further reminders from your account. You'll be notified each time. Repeated "I don't recognize this invoice" reports can lead to your sending being suspended while we review the account.</p>

<h2>5. Plans, billing and cancellation</h2>
<ul>
  <li>The Free plan is free. Paid plans are billed in advance (monthly or yearly) through our payment processor, Stripe, and renew automatically until you cancel.</li>
  <li>If a free trial is offered, you won't be charged until it ends, and you can cancel before then at no cost.</li>
  <li><strong>You can cancel at any time</strong> from the Billing page. Your plan stays active until the end of the period you've paid for and won't renew.</li>
  <li>Fees already paid are non-refundable, except where the law requires a refund. We may issue refunds at our discretion. Questions about a charge? Contact us at ${contact()}.</li>
  <li>We may change prices with at least 30 days' notice by email. Changes apply from your next renewal; you can cancel before then.</li>
  <li>Prices exclude taxes unless stated. You are responsible for any taxes that apply to your purchase.</li>
</ul>

<h2>6. Your data</h2>
<p>You own the data you add. You give us permission to use it only to provide and improve the Service, as described in our <a href="/privacy">Privacy Policy</a>. For personal data about your clients, we act as your processor under our <a href="/dpa">Data Processing Addendum</a>. You can export your data or delete your account at any time from Settings.</p>

<h2>7. Our property</h2>
<p>The Service, including its software, design and content, belongs to us and our licensors. These Terms don't give you any rights to it beyond using the Service as offered. If you send us feedback, we may use it without any obligation to you.</p>

<h2>8. Suspension and termination</h2>
<p>You can stop using the Service and delete your account at any time. We may suspend or terminate your account, with or without notice, if you breach these Terms or the Acceptable Use Policy, if your use creates risk or legal exposure for us or others, or if required by law. If we terminate a paid account without cause, we'll refund any prepaid fees for the unused period.</p>

<h2>9. Disclaimers</h2>
<p>The Service is provided "as is" and "as available". To the fullest extent permitted by law, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose and non-infringement, and any warranty that the Service will be uninterrupted, error-free or that it will result in any payment.</p>

<h2>10. Limitation of liability</h2>
<p>To the fullest extent permitted by law: (a) we won't be liable for any indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue, data or goodwill; and (b) our total liability for all claims relating to the Service is limited to the greater of the amount you paid us in the 12 months before the claim arose, or US $100. Some jurisdictions don't allow certain limitations, so some of these may not apply to you.</p>

<h2>11. Indemnity</h2>
<p>You'll defend and indemnify us against claims, damages and costs (including reasonable legal fees) arising from your invoices, the reminders sent at your instruction, the content you add, your relationship with your clients, or your breach of these Terms or of any law.</p>

<h2>12. Disputes</h2>
<p>If you have a concern, contact us first at ${contact()}; we'll try to resolve it informally within 30 days. These Terms are governed by the laws of ${law()}, without regard to conflict-of-law rules, and the courts there have exclusive jurisdiction, except that either party may bring a claim in small-claims court. To the extent permitted by law, claims may only be brought individually and not as part of a class or representative action.</p>

<h2>13. Changes to these Terms</h2>
<p>We may update these Terms. For material changes we'll notify you by email or in the app at least 14 days before they take effect. Continuing to use the Service after that means you accept the updated Terms.</p>

<h2>14. General</h2>
<p>These Terms (with the policies linked above) are the entire agreement between you and us about the Service. If any part is unenforceable, the rest stays in effect. Not enforcing a provision isn't a waiver. You may not transfer these Terms without our consent; we may transfer them as part of a merger, acquisition or sale of assets. Neither party is responsible for delays caused by events beyond its reasonable control.</p>

<h2>15. Contact</h2>
<p>${operator()}. Email: ${contact()}.</p>`;

const privacy = () => html`
<p>This policy explains how ${operator()} ("we") handles personal data in ${app}. We keep it simple: we collect what we need to run the Service, we don't sell data, and we don't use advertising trackers.</p>

<h2>1. Our role</h2>
<ul>
  <li>For <strong>your account</strong> (if you sign up), we are the controller of your data.</li>
  <li>For <strong>your clients' data</strong> that you add to send reminders, you are the controller and we are your processor, acting on your instructions under our <a href="/dpa">Data Processing Addendum</a>.</li>
</ul>

<h2>2. What we collect</h2>
<ul>
  <li><strong>Account data:</strong> email address, name or business name, reply-to address, email sign-off, timezone and your password (stored only as a salted, one-way scrypt hash).</li>
  <li><strong>Invoice data you add:</strong> client names and email addresses, invoice numbers, amounts, dates, payment links and notes or messages.</li>
  <li><strong>Activity data:</strong> when reminders are sent, and when a client views their invoice page or responds (for example "I've already paid").</li>
  <li><strong>Billing data:</strong> handled by Stripe. We receive your subscription status and a customer ID; we never see or store full card numbers.</li>
  <li><strong>Technical data:</strong> IP addresses and request details are processed briefly for security (rate limiting and abuse prevention) and may appear in short-lived server logs. We do not use them to track you.</li>
</ul>

<h2>3. Why we use it, and our legal bases</h2>
<ul>
  <li>To provide the Service you signed up for: sending your reminders, showing your dashboard, account emails (performance of a contract).</li>
  <li>To keep the Service secure and prevent abuse, fraud and spam (legitimate interests).</li>
  <li>To handle billing and meet tax and accounting obligations (contract; legal obligation).</li>
  <li>To send a weekly summary of your invoices, which you can turn off in Settings (legitimate interests).</li>
</ul>
<p>We do not sell personal data, "share" it for cross-context behavioral advertising, or use it to train advertising profiles.</p>

<h2>4. If you received a reminder from one of our users</h2>
<p>You received it because a business you dealt with added an invoice for you to ${app}. That business decides what to send; we send it on their behalf. Every reminder lets you say you've already paid, report a problem, say you don't recognize the invoice, or unsubscribe, and we stop reminders from that sender to your address automatically. For anything else, contact the business directly (just reply to the email) or contact us.</p>

<h2>5. Who we share data with</h2>
<p>Only service providers that help us run ${app}, under contracts that require them to protect it:</p>
<ul>
  <li><strong>Email delivery</strong> (Resend), to send reminders and account emails.</li>
  <li><strong>Payments</strong> (Stripe), to process subscriptions.</li>
  <li><strong>Hosting and infrastructure</strong>, to run the application and store its database.</li>
</ul>
<p>We may also disclose data if required by law, or to protect the rights, safety and property of our users, the public or us.</p>

<h2>6. Cookies</h2>
<p>We use only strictly necessary cookies: one that keeps you signed in, and one that protects forms against cross-site request forgery. We don't use analytics, advertising or tracking cookies, so there's nothing to opt into.</p>

<h2>7. International transfers</h2>
<p>Our providers may process data in countries other than yours, including the United States. Where required, transfers are protected by appropriate safeguards such as the EU Standard Contractual Clauses and the UK Addendum.</p>

<h2>8. How long we keep data</h2>
<ul>
  <li>Account and invoice data: until you delete it or delete your account.</li>
  <li>Account emails and logs: up to 90 days. Reminder history: as long as the invoice exists.</li>
  <li>Backups: kept for up to 14 days, after which deleted data is gone from them too.</li>
</ul>

<h2>9. Security</h2>
<p>We use encryption in transit (HTTPS), hashed passwords, hashed session tokens, strict security headers, rate limiting, least-privilege access and automated backups. No system is perfectly secure, but we work hard to protect your data and will notify you and the relevant authorities of a breach where the law requires.</p>

<h2>10. Your rights</h2>
<p>Depending on where you live (for example under the GDPR, UK GDPR or California law), you may have the right to access, correct, delete, export or restrict the use of your personal data, to object to certain uses, and to complain to a data protection authority. You can export all your data and delete your account yourself in Settings, or contact us at ${contact()}. We won't discriminate against you for exercising your rights. If you're a client of one of our users, we may refer your request to that business, since they control your data.</p>

<h2>11. Children</h2>
<p>${app} is not intended for anyone under 18, and we don't knowingly collect their data.</p>

<h2>12. Changes</h2>
<p>We'll post any changes here and update the date above. For significant changes we'll notify account holders by email.</p>

<h2>13. Contact</h2>
<p>${operator()}. Email: ${contact()}.</p>`;

const acceptableUse = () => html`
<p>${app} exists to help businesses get paid for real work. To protect recipients, our users and the Service, you may not use ${app} to:</p>
<ul>
  <li>Send reminders for amounts that aren't genuinely owed to you, or to people you didn't do business with.</li>
  <li>Send spam, bulk unsolicited email, or email addresses you bought, scraped or guessed.</li>
  <li>Harass, threaten, shame or intimidate anyone, or send abusive, obscene, defamatory or discriminatory content.</li>
  <li>Impersonate any person or organization, or use a sender name that suggests you are a bank, payment company, government agency, law firm, court or collection agency when you are not.</li>
  <li>Make false or misleading statements, including threats of legal action, arrest, credit reporting or other consequences you don't intend or aren't legally entitled to take.</li>
  <li>Link to phishing pages, malware or any payment page that isn't genuinely yours.</li>
  <li>Collect debts that are illegal, time-barred where collection is prohibited, or that you aren't licensed to collect.</li>
  <li>Keep contacting someone who has unsubscribed or said the invoice isn't theirs, including by re-adding them under a different invoice.</li>
  <li>Break any law, including consumer protection, debt collection, anti-spam and privacy laws.</li>
  <li>Probe, scan or test the Service's security, or overload it, except through responsible disclosure to us. Found a vulnerability? Please report it to ${contact()}.</li>
  <li>Get around plan limits, sending limits or account suspensions, or create accounts to do so.</li>
</ul>
<h2>Enforcement</h2>
<p>We may remove content, pause reminders, suspend or terminate accounts, and report illegal activity to the authorities. Recipients' reports are reviewed, and accounts with repeated "I don't recognize this invoice" reports are suspended automatically pending review.</p>
<h2>Report abuse</h2>
<p>If you received a reminder you think is abusive or fraudulent, use the "Something wrong?" options on the invoice page, or email ${contact()}.</p>`;

const dpa = () => html`
<p>This Data Processing Addendum ("DPA") forms part of the <a href="/terms">Terms of Service</a> between you (the "Controller") and ${operator()} (the "Processor") and applies when we process personal data on your behalf that is subject to the GDPR, the UK GDPR or similar data protection laws.</p>
<h2>1. Details of processing</h2>
<ul>
  <li><strong>Subject matter and purpose:</strong> sending invoice payment reminders and providing the related client invoice page and activity tracking, as instructed by you through the Service.</li>
  <li><strong>Duration:</strong> for as long as you use the Service, plus the retention periods in our Privacy Policy.</li>
  <li><strong>Data subjects:</strong> your clients and their contact persons.</li>
  <li><strong>Personal data:</strong> names, email addresses, invoice details, messages you write, and interactions with reminders and invoice pages.</li>
  <li><strong>Special categories:</strong> none. You agree not to add them.</li>
</ul>
<h2>2. Processor obligations</h2>
<ul>
  <li>Process personal data only on your documented instructions (your use of the Service and its settings), unless the law requires otherwise.</li>
  <li>Ensure everyone authorized to process the data is bound by confidentiality.</li>
  <li>Implement appropriate technical and organizational security measures (described in our Privacy Policy), including encryption in transit, access control, hashed credentials and backups.</li>
  <li>Assist you, taking into account the nature of processing, with data subject requests, security, breach notifications and data protection impact assessments.</li>
  <li>Notify you without undue delay, and where feasible within 72 hours, after becoming aware of a personal data breach affecting your data.</li>
  <li>At the end of the Service, delete your personal data (you can export it first from Settings), except where the law requires us to keep it. Backups roll off within 14 days.</li>
  <li>Make available the information reasonably necessary to demonstrate compliance with this DPA.</li>
</ul>
<h2>3. Sub-processors</h2>
<p>You authorize us to use sub-processors for email delivery (Resend), payments (Stripe) and hosting and infrastructure. We impose data protection obligations on them equivalent to this DPA and remain responsible for them. We'll give notice of new sub-processors by updating our Privacy Policy, and you may object on reasonable grounds by contacting us; if we can't resolve your objection, you may terminate the affected Service.</p>
<h2>4. International transfers</h2>
<p>Where personal data is transferred outside the EEA or UK to a country without an adequacy decision, the EU Standard Contractual Clauses (Module 2 or 3, as applicable) and the UK International Data Transfer Addendum are incorporated by reference.</p>
<h2>5. Your obligations</h2>
<p>You confirm you have a lawful basis to provide the personal data and to have reminders sent, and that your instructions comply with applicable law.</p>
<h2>6. Liability</h2>
<p>Each party's liability under this DPA is subject to the limitations in the Terms of Service.</p>
<h2>Contact</h2>
<p>${operator()}. Email: ${contact()}.</p>`;

export const LEGAL_PAGES = {
  terms: { title: 'Terms of Service', body: terms },
  privacy: { title: 'Privacy Policy', body: privacy },
  'acceptable-use': { title: 'Acceptable Use Policy', body: acceptableUse },
  dpa: { title: 'Data Processing Addendum', body: dpa },
};

export function legalPage(ctx, slug) {
  const doc = LEGAL_PAGES[slug];
  return page(ctx, {
    title: doc.title,
    canonical: `/${slug}`,
    body: html`<div class="page container"><article class="prose">
  <h1>${doc.title}</h1>
  <p class="faint">Effective ${effective()}</p>
  ${doc.body()}
</article></div>`,
  });
}
