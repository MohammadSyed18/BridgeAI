import {composeAnswer} from './evidence.js';
import {extractActions, normalize, sentences} from "./text.js";

export class KnowledgeIndex {
  constructor() {
    this.documents = new Map();
    this.passages = [];
    this.documentFrequency = new Map();
  }

  add(document) {
    if (![document.id, document.title, document.body, document.url].every(value => typeof value === "string" && value.trim())) {
      throw new Error("document requires id, title, body, and url");
    }
    const url = new URL(document.url);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("source URL must use HTTP or HTTPS");
    if (document.authority !== undefined && (!Number.isFinite(document.authority) || document.authority < 0 || document.authority > 1)) throw new Error("authority must be 0..1");
    if (this.documents.has(document.id)) throw new Error(`duplicate document: ${document.id}`);
    const publishedAt = new Date(document.publishedAt);
    if (Number.isNaN(publishedAt.valueOf())) throw new Error("publishedAt must be a valid date");
    const stored = {...document, publishedAt: publishedAt.toISOString()};
    const chunks = chunk(sentences(stored.body), 3);
    if (!chunks.length) throw new Error("document must contain searchable text");
    this.documents.set(stored.id, stored);
    for (let i = 0; i < chunks.length; i += 1) {
      const text = chunks[i].join(" ");
      const tokens = normalize(`${stored.title} ${text}`);
      const frequencies = frequency(tokens);
      const passage = {id: `${stored.id}#${i + 1}`, documentId: stored.id, text, tokens, frequencies};
      this.passages.push(passage);
      for (const token of new Set(tokens)) {
        this.documentFrequency.set(token, (this.documentFrequency.get(token) ?? 0) + 1);
      }
    }
  }

  remove(id) {
    if (!this.documents.delete(id)) return false;
    for (const passage of this.passages.filter(value => value.documentId === id)) {
      for (const token of new Set(passage.tokens)) {
        const count = this.documentFrequency.get(token) - 1;
        if (count) this.documentFrequency.set(token, count);
        else this.documentFrequency.delete(token);
      }
    }
    this.passages = this.passages.filter(value => value.documentId !== id);
    return true;
  }

  replace(document) {
    const validation = new KnowledgeIndex();
    validation.add(document);
    this.remove(document.id);
    this.add(document);
  }

  search(query, limit = 5, now = new Date()) {
    if (typeof query !== "string" || !Number.isInteger(limit) || limit < 1 || limit > 100 || Number.isNaN(now.valueOf())) throw new Error("invalid search parameters");
    if (!this.passages.length) return [];
    const queryTokens = [...new Set(normalize(query))];
    if (!queryTokens.length) return [];
    const averageLength = this.passages.reduce((sum, passage) => sum + passage.tokens.length, 0) / this.passages.length;
    return this.passages
      .map(passage => {
        const source = this.documents.get(passage.documentId);
        if (Date.parse(source.publishedAt) > now.valueOf()) return {...passage, source, score: 0};
        const bm25 = queryTokens.reduce((total, token) => {
          const tf = passage.frequencies.get(token) ?? 0;
          if (!tf) return total;
          const df = this.documentFrequency.get(token) ?? 0;
          const idf = Math.log(1 + (this.passages.length - df + 0.5) / (df + 0.5));
          const normalizedTf = tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * passage.tokens.length / averageLength));
          return total + idf * normalizedTf;
        }, 0);
        const ageDays = Math.max(0, (now - new Date(source.publishedAt)) / 86_400_000);
        const freshness = Math.exp(-ageDays / 180);
        const authority = source.authority ?? 0.7;
        return {...passage, source, score: bm25 * (0.65 + 0.2 * freshness + 0.15 * authority),
          explanation: {lexical: bm25, freshness, authority, matchedTerms: queryTokens.filter(token => passage.frequencies.has(token))}};
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, limit);
  }
}

export function answer(index, question, now = new Date()) {
  const results = index.search(question, 8, now);
  const result = composeAnswer(results, question);
  return {...result, actions: extractActions(result.evidence.map(item => item.text).join(' '))};
}

function frequency(tokens) {
  const values = new Map();
  for (const token of tokens) values.set(token, (values.get(token) ?? 0) + 1);
  return values;
}

function chunk(values, size) {
  const output = [];
  for (let i = 0; i < values.length; i += size) output.push(values.slice(i, i + size));
  return output;
}

