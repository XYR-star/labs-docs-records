const BEIJING_TIME_ZONE = 'Asia/Shanghai';

function partsFor(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: BEIJING_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
}

export function formatBeijingDateTime(value) {
  const parts = partsFor(value);
  if (!parts) return '';
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatBeijingDate(value) {
  const parts = partsFor(value);
  if (!parts) return '';
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function toBeijingDateTimeLocal(value) {
  const parts = partsFor(value);
  if (!parts) return '';
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
