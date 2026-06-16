const BEIJING_OFFSET_MINUTES = 8 * 60;

function pad(value) {
  return String(value).padStart(2, '0');
}

export function parseBeijingDateTimeInput(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - BEIJING_OFFSET_MINUTES * 60 * 1000;
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function formatBeijingDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const beijing = new Date(date.getTime() + BEIJING_OFFSET_MINUTES * 60 * 1000);
  return [
    beijing.getUTCFullYear(),
    pad(beijing.getUTCMonth() + 1),
    pad(beijing.getUTCDate())
  ].join('-') + `T${pad(beijing.getUTCHours())}:${pad(beijing.getUTCMinutes())}`;
}
