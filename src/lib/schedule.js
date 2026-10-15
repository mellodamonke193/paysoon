import { addDays, weekday, zonedToUtc, localDate, localHour, MINUTE, HOUR } from './time.js';

export const SEND_HOUR = 9;
export const MIN_GAP_MS = 20 * HOUR;

// Offsets are days relative to the due date. Negative = before it's due.
export const CADENCES = {
  gentle: { label: 'Gentle', blurb: '4 reminders, light touch', offsets: [-3, 0, 7, 21], pro: false },
  standard: { label: 'Standard', blurb: '6 reminders over 30 days', offsets: [-3, 0, 3, 7, 14, 30], pro: false },
  persistent: {
    label: 'Persistent',
    blurb: '10 reminders over 45 days',
    offsets: [-5, -1, 0, 2, 5, 9, 14, 21, 30, 45],
    pro: true,
  },
};

export const STAGES = {
  upcoming: 'Friendly heads-up',
  due: 'Due today',
  overdue: 'Overdue follow-up',
  firm: 'Firm reminder',
  final: 'Final notice',
};

// The tone is chosen from how late the invoice actually is when the email goes out.
export function stageFor(daysLate, isLastStep) {
  if (daysLate < 0) return 'upcoming';
  if (daysLate === 0) return 'due';
  if (isLastStep) return 'final';
  if (daysLate >= 14) return 'firm';
  return 'overdue';
}

export function nominalStage(offset, isLastStep) {
  return stageFor(offset, isLastStep && offset > 0);
}

const nextWeekday = (dateStr) => {
  const day = weekday(dateStr);
  if (day === 6) return addDays(dateStr, 2);
  if (day === 0) return addDays(dateStr, 1);
  return dateStr;
};

// 9:00 AM in the sender's timezone, never on a weekend.
export const stepSendAt = (dueDate, offset, tz) => zonedToUtc(nextWeekday(addDays(dueDate, offset)), SEND_HOUR, 0, tz);

export const stepTimes = (dueDate, cadence, tz) => CADENCES[cadence].offsets.map((o) => stepSendAt(dueDate, o, tz));

export function businessMorningOnOrAfter(ms, tz) {
  let date = localDate(ms, tz);
  for (let i = 0; i < 10; i++) {
    date = nextWeekday(date);
    const at = zonedToUtc(date, SEND_HOUR, 0, tz);
    if (at >= ms) return at;
    date = addDays(date, 1);
  }
  return ms;
}

// "Soon" means a few minutes from now during working hours, otherwise the next business morning.
export function soonDuringBusinessHours(now, tz) {
  const date = localDate(now, tz);
  const hour = localHour(now, tz);
  const isWeekday = nextWeekday(date) === date;
  if (isWeekday && hour >= 8 && hour < 17) return now + 5 * MINUTE;
  return businessMorningOnOrAfter(now, tz);
}

/**
 * Decide which reminder is next when an invoice is created, edited, resumed or reopened.
 * Reminders whose time has passed are skipped, except the most recent one at/after the due
 * date: if the client hasn't received it yet, it goes out soon so an overdue invoice is never silent.
 */
export function planSchedule({ dueDate, cadence, tz, now, sentSteps = new Set(), lastSentAt = null }) {
  const offsets = CADENCES[cadence].offsets;
  const times = stepTimes(dueDate, cadence, tz);
  const firstFuture = times.findIndex((t) => t > now);
  const lastPast = firstFuture === -1 ? times.length - 1 : firstFuture - 1;

  let plan;
  if (lastPast >= 0 && offsets[lastPast] >= 0 && !sentSteps.has(lastPast)) {
    plan = { step: lastPast, sendAt: soonDuringBusinessHours(now, tz) };
  } else if (firstFuture === -1) {
    return { step: offsets.length, sendAt: null };
  } else {
    plan = { step: firstFuture, sendAt: times[firstFuture] };
  }
  if (lastSentAt && plan.sendAt < lastSentAt + MIN_GAP_MS) {
    plan.sendAt = businessMorningOnOrAfter(lastSentAt + MIN_GAP_MS, tz);
  }
  return plan;
}

// After a reminder is sent, the next one is never sooner than MIN_GAP_MS later.
export function planAfterSend({ dueDate, cadence, tz, step, now }) {
  const offsets = CADENCES[cadence].offsets;
  const next = step + 1;
  if (next >= offsets.length) return { step: next, sendAt: null };
  let sendAt = stepSendAt(dueDate, offsets[next], tz);
  if (sendAt < now + MIN_GAP_MS) sendAt = businessMorningOnOrAfter(now + MIN_GAP_MS, tz);
  return { step: next, sendAt };
}
