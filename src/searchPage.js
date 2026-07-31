import {createHash} from 'node:crypto';

export class SearchError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const MAX_RESULTS = 100;
const CURSOR_LIFETIME = 15 * 60_000;

function decodeCursor(raw) {
  if (typeof raw !== 'string' || raw.length > 2000 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new SearchError('Invalid search cursor');
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!value || value.version !== 1 || typeof value.scope !== 'string' || !Number.isSafeInteger(value.offset) ||
        value.offset < 0 || value.offset > MAX_RESULTS || !Number.isSafeInteger(value.asOf)) throw new Error();
    return value;
  } catch { throw new SearchError('Invalid search cursor'); }
}

/** Freeze ranking time across pages, but recheck current notice visibility each time. */
export function searchPage(index, {question, revision, audience, documents, now = new Date(), limit = 10, cursor} = {}) {
  if (typeof question !== 'string' || !question.trim() || question.length > 500 ||
      !Number.isInteger(limit) || limit < 1 || limit > 20 || !(now instanceof Date) || !Number.isFinite(now.valueOf())) {
    throw new SearchError('Search requires a question and a limit from 1 to 20');
  }
  const scope = fingerprint([revision, audience, question.trim(), limit, documents.map(item => item.id).sort()]);
  let offset = 0, asOf = now.valueOf();
  if (cursor !== undefined) {
    const previous = decodeCursor(cursor);
    if (previous.scope !== scope) throw new SearchError('Search changed; start again from the first page', 409);
    if (previous.asOf > asOf || asOf - previous.asOf > CURSOR_LIFETIME) throw new SearchError('Search cursor expired; start again', 409);
    offset = previous.offset; asOf = previous.asOf;
  }
  const matches = index.search(question, MAX_RESULTS, new Date(asOf));
  if (offset > matches.length) throw new SearchError('Search cursor is outside the result set');
  const items = matches.slice(offset, offset + limit).map(item => ({
    passageId:item.id, documentId:item.documentId, excerpt:item.text,
    title:item.source.title, url:item.source.url, publishedAt:item.source.publishedAt,
    score:Number(item.score.toFixed(6)), explanation:item.explanation
  }));
  const nextOffset = offset + items.length;
  const nextCursor = nextOffset < matches.length
    ? Buffer.from(JSON.stringify({version:1, scope, offset:nextOffset, asOf})).toString('base64url') : null;
  return {items, nextCursor, revision, audience, asOf:new Date(asOf).toISOString(),
    total:matches.length, resultLimit:MAX_RESULTS, capped:matches.length === MAX_RESULTS};
}
