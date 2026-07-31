import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, rename, rm} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {searchPage} from './searchPage.js';
import {ScopeIndexCache} from './scopeCache.js';
import {KnowledgeIndex, answer} from './index.js';

export class CatalogError extends Error {}

export function validateNotice(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CatalogError('Notice must be an object');
  const index = new KnowledgeIndex();
  try { index.add(raw); } catch (error) { throw new CatalogError(error.message); }
  const audiences = raw.audiences ?? ['all'];
  if (!Array.isArray(audiences) || !audiences.length || audiences.some(item => typeof item !== 'string' || !/^[a-z0-9-]{1,40}$/.test(item))) {
    throw new CatalogError('Invalid audience tags');
  }
  const updatedAt = raw.updatedAt ?? raw.publishedAt;
  if (typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt)) || Date.parse(updatedAt) < Date.parse(raw.publishedAt)) {
    throw new CatalogError('Invalid update timestamp');
  }
  if (raw.expiresAt !== undefined && (typeof raw.expiresAt !== 'string' || !Number.isFinite(Date.parse(raw.expiresAt)) || Date.parse(raw.expiresAt) <= Date.parse(raw.publishedAt))) {
    throw new CatalogError('Invalid expiry timestamp');
  }
  return {
    id: raw.id.trim(), title: raw.title.trim(), body: raw.body.trim(),
    url: new URL(raw.url).href, publishedAt: new Date(raw.publishedAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(), authority: raw.authority ?? 0.7,
    audiences: [...new Set(audiences)].sort(),
    ...(raw.expiresAt ? {expiresAt: new Date(raw.expiresAt).toISOString()} : {})
  };
}

function fingerprint(notice) {
  return createHash('sha256').update(JSON.stringify(notice)).digest('hex');
}

/** Batch ingestion validates every document before swapping the searchable catalog. */
export class NoticeCatalog {
  constructor(documents = []) {
    this.documents = new Map();
    this.indexCache = new ScopeIndexCache();
    this.revision = 0;
    this.audit = [];
    this.ingest(documents);
  }
  ingest(documents, {replaceAll = false} = {}) {
    if (!Array.isArray(documents) || documents.length > 10000) throw new CatalogError('Expected at most 10000 notices');
    const checked = documents.map(validateNotice);
    if (new Set(checked.map(item => item.id)).size !== checked.length) throw new CatalogError('Duplicate notice ID in batch');
    const next = replaceAll ? new Map() : new Map(this.documents);
    const changes = [];
    for (const notice of checked) {
      const old = this.documents.get(notice.id);
      if (old && Date.parse(notice.updatedAt) < Date.parse(old.updatedAt)) throw new CatalogError(`Stale update: ${notice.id}`);
      if (old && notice.updatedAt === old.updatedAt && fingerprint(old) !== fingerprint(notice)) throw new CatalogError(`Conflicting update: ${notice.id}`);
      next.set(notice.id, notice);
      if (!old || fingerprint(old) !== fingerprint(notice)) changes.push({type: old ? 'updated' : 'added', id: notice.id, hash: fingerprint(notice)});
    }
    if (replaceAll) for (const id of this.documents.keys()) if (!next.has(id)) changes.push({type: 'removed', id});
    if (!changes.length) return {revision: this.revision, changes: []};
    const candidate = new KnowledgeIndex();
    for (const notice of next.values()) candidate.add(notice);
    this.documents = next;
    this.indexCache.clear();
    this.revision++;
    this.audit.push(...changes.map(change => ({...change, revision: this.revision})));
    return {revision: this.revision, changes};
  }
  list({audience = 'all', now = new Date(), includeExpired = false} = {}) {
    if (typeof audience !== 'string' || !/^[a-z0-9-]{1,40}$/.test(audience) || !Number.isFinite(now.valueOf())) throw new CatalogError('Invalid catalog filter');
    return [...this.documents.values()]
      .filter(item => Date.parse(item.publishedAt) <= now.valueOf())
      .filter(item => audience === 'all' || item.audiences.includes('all') || item.audiences.includes(audience))
      .filter(item => includeExpired || !item.expiresAt || Date.parse(item.expiresAt) > now.valueOf())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
      .map(item => ({...item, audiences: [...item.audiences]}));
  }
  ask(question, options = {}) {
    if (typeof question !== 'string' || !question.trim() || question.length > 500) throw new CatalogError('Question must contain 1–500 characters');
    const index = this.indexCache.get(this.list(options), this.revision);
    const result = answer(index, question, options.now ?? new Date());
    return {...result, revision: this.revision, scope: options.audience ?? 'all', extractive: true};
  }
  search(question, options = {}) {
    const documents = this.list(options);
    const index = this.indexCache.get(documents, this.revision);
    return searchPage(index, {question, revision:this.revision, audience:options.audience ?? 'all',
      documents, now:options.now ?? new Date(), limit:options.limit ?? 10, cursor:options.cursor});
  }
  async save(path) {
    const payload = JSON.stringify({version: 1, revision: this.revision, documents: [...this.documents.values()], audit: this.audit}, null, 2);
    await mkdir(dirname(path), {recursive: true});
    const temporary = `${path}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, payload); await rename(temporary, path); }
    finally { await rm(temporary, {force: true}); }
  }
  static async load(path) {
    const raw = JSON.parse(await readFile(path, 'utf8'));
    if (Array.isArray(raw)) return new NoticeCatalog(raw);
    if (raw.version !== 1 || !Number.isInteger(raw.revision) || raw.revision < 0 || !Array.isArray(raw.audit)) throw new CatalogError('Unsupported catalog snapshot');
    const catalog = new NoticeCatalog(raw.documents);
    catalog.revision = raw.revision;
    catalog.audit = raw.audit;
    return catalog;
  }
}
