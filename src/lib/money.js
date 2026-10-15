// Currency -> number of minor-unit digits.
export const CURRENCIES = {
  USD: 2, EUR: 2, GBP: 2, CAD: 2, AUD: 2, NZD: 2, CHF: 2, SEK: 2, NOK: 2, DKK: 2, PLN: 2,
  CZK: 2, JPY: 0, INR: 2, SGD: 2, HKD: 2, ZAR: 2, BRL: 2, MXN: 2, AED: 2, ILS: 2, PHP: 2,
};

export function parseAmount(input, currency) {
  const digits = CURRENCIES[currency];
  if (digits === undefined) return null;
  const cleaned = String(input ?? '').trim().replace(/[\s,'_]/g, '').replace(/^[$€£¥₹]/, '');
  const match = (digits ? /^(\d{1,10})(?:\.(\d{1,2}))?$/ : /^(\d{1,12})$/).exec(cleaned);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = digits ? Number((match[2] || '').padEnd(digits, '0')) : 0;
  const minor = whole * 10 ** digits + fraction;
  return Number.isSafeInteger(minor) && minor > 0 && minor <= 1e12 ? minor : null;
}

const formatters = new Map();
export function formatMoney(minor, currency) {
  const digits = CURRENCIES[currency] ?? 2;
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(currency, formatter);
  }
  return formatter.format(minor / 10 ** digits);
}

export function amountInputValue(minor, currency) {
  const digits = CURRENCIES[currency] ?? 2;
  return digits ? (minor / 10 ** digits).toFixed(digits) : String(minor);
}
