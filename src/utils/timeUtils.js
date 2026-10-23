// Small helpers for working with timestamps (milliseconds since epoch).

export const MINUTE = 60 * 1000;

export function minutesFromNow(ts, now) {
  return (ts - now) / MINUTE;
}

// 75 -> "1h 15m", 20 -> "20 min", 3000 -> "2d 2h"
export function formatDuration(mins) {
  if (mins === null || mins === undefined || Number.isNaN(mins)) return '—';
  const sign = mins < 0 ? '-' : '';
  const m = Math.round(Math.abs(mins));
  if (m < 60) return `${sign}${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h < 48) return `${sign}${h}h${r ? ` ${r}m` : ''}`;
  const d = Math.floor(h / 24);
  return `${sign}${d}d ${h % 24}h`;
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatTimeWithSeconds(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(ts) {
  return new Date(ts).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(ts, now) {
  const mins = (now - ts) / MINUTE;
  if (mins < 1) return 'just now';
  if (mins < 60) return `${Math.floor(mins)} min ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

// Converts a timestamp to the value format used by <input type="datetime-local">
export function toLocalInput(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}
