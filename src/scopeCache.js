import {KnowledgeIndex} from './index.js';

/** Bounded LRU of indexes keyed by revision and visible notice IDs.
 * Visibility is recomputed on every request so expiry cannot leak through a cache hit.
 * Ranking still uses the request clock; answers themselves are never cached.
 */
export class ScopeIndexCache {
  constructor({capacity = 16} = {}) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) throw new Error('Invalid cache capacity');
    this.capacity = capacity;
    this.entries = new Map();
    this.hits = 0;
    this.misses = 0;
  }
  get(documents, revision) {
    const key = JSON.stringify([revision, documents.map(item => item.id).sort()]);
    if (this.entries.has(key)) {
      const index = this.entries.get(key);
      this.entries.delete(key);
      this.entries.set(key, index);
      this.hits++;
      return index;
    }
    const index = new KnowledgeIndex();
    for (const document of documents) index.add(document);
    this.entries.set(key, index);
    this.misses++;
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value);
    return index;
  }
  clear() { this.entries.clear(); }
  statistics() { return {size:this.entries.size, capacity:this.capacity, hits:this.hits, misses:this.misses}; }
}
