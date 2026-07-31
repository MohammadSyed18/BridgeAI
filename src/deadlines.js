import {createHash} from 'node:crypto';
import {sentences} from './text.js';

const months = new Map(['january','february','march','april','may','june','july','august','september','october','november','december'].map((value,index) => [value,index + 1]));

function isoDay(year, month, day) {
  if (year < 1900 || year > 2200) return null;
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() + 1 === month && value.getUTCDate() === day ? value.toISOString().slice(0,10) : null;
}

/** Only explicit full dates become calendar events; relative weekdays remain in answers. */
export function deadlines(documents, {now = new Date(), includePast = false} = {}) {
  if (!Number.isFinite(now.valueOf())) throw new Error('Invalid deadline clock');
  const result = new Map();
  for (const source of documents) {
    for (const text of sentences(source.body)) {
      if (!/\b(by|before|deadline|due|close|closes|submit|register|attend|pickup)\b/i.test(text)) continue;
      const dates = [];
      for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) dates.push(isoDay(+match[1], +match[2], +match[3]));
      for (const match of text.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi)) {
        dates.push(isoDay(+match[3], months.get(match[1].toLowerCase()), +match[2]));
      }
      for (const date of dates.filter(Boolean)) {
        if (!includePast && date < now.toISOString().slice(0,10)) continue;
        const id = createHash('sha256').update(`${source.id}\0${date}\0${text}`).digest('hex').slice(0,24);
        result.set(id, {id, date, title: source.title, action: text, sourceId: source.id, url: source.url});
      }
    }
  }
  return [...result.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

function escape(value) { return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
function fold(line) {
  const lines = []; let current = '', bytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character);
    if (bytes + size > 75) { lines.push(current); current = ' '; bytes = 1; }
    current += character; bytes += size;
  }
  return [...lines, current].join('\r\n');
}
export function toCalendar(events, {generatedAt = new Date()} = {}) {
  if (!Number.isFinite(generatedAt.valueOf())) throw new Error('Invalid generation clock');
  const stamp = generatedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//BridgeAI//School deadlines//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  for (const event of events) {
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.date);
    if (!date || !isoDay(+date[1], +date[2], +date[3])) throw new Error('Invalid event date');
    const url = new URL(event.url);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid event URL');
    lines.push('BEGIN:VEVENT', `UID:${escape(event.id)}@bridgeai.local`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${event.date.replace(/-/g, '')}`, `SUMMARY:${escape(event.title)}`,
      `DESCRIPTION:${escape(event.action)}`, `URL:${url.href}`, 'END:VEVENT');
  }
  return [...lines, 'END:VCALENDAR', ''].map(fold).join('\r\n');
}
