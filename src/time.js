import { DateTime } from 'luxon';

export const computeDayRange = (dateInput, timezone) => {
  const base = dateInput
    ? DateTime.fromISO(dateInput, { zone: timezone })
    : DateTime.now().setZone(timezone);
  if (!base.isValid) {
    throw new Error(`Invalid date input: ${dateInput}`);
  }
  const start = base.startOf('day');
  const end = start.plus({ days: 1 });
  return { start, end };
};

export const toJiraDateTime = (dt) => dt.toFormat('yyyy-LL-dd HH:mm');

export const formatLocalTime = (isoString, timezone) => {
  const dt = DateTime.fromISO(isoString, { zone: 'utc' }).setZone(timezone);
  return dt.isValid ? dt.toFormat('yyyy-LL-dd HH:mm') : isoString;
};

export const isWithinRange = (isoString, start, end) => {
  const dt = DateTime.fromISO(isoString, { zone: 'utc' });
  if (!dt.isValid) return false;
  return dt >= start.toUTC() && dt < end.toUTC();
};

export const countBusinessDaysSince = (fromDate, toDate, timezone) => {
  const start = DateTime.fromISO(fromDate, { zone: timezone }).startOf('day');
  const end = DateTime.fromISO(toDate, { zone: timezone }).startOf('day');
  if (!start.isValid || !end.isValid) return null;
  if (end <= start) return 0;
  let count = 0;
  let cursor = start.plus({ days: 1 });
  while (cursor <= end) {
    if (cursor.weekday <= 5) count += 1;
    cursor = cursor.plus({ days: 1 });
  }
  return count;
};
