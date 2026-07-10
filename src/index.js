import {extractActions, normalize, sentences} from "./text.js";

export class KnowledgeIndex {
  constructor() {
    this.documents = new Map();
    this.passages = [];
    this.documentFrequency = new Map();
  }

  add(document) {
    if (!document.id || !document.title || !document.body || !document.url) {
      throw new Error("document requires id, title, body, and url");
    }
    if (this.documents.has(document.id)) throw new Error(`duplicate document: ${document.id}`);
    const publishedAt = new Date(document.publishedAt);
    if (Number.isNaN(publishedAt.valueOf())) throw new Error("publishedAt must be a valid date");
    const stored = {...document, publishedAt: publishedAt.toISOString()};
    this.documents.set(stored.id, stored);

    const chunks = chunk(sentences(stored.body), 3);
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

  search(query, limit = 5, now = new Date()) {
    const queryTokens = normalize(query);
    if (!queryTokens.length) return [];
    const averageLength = this.passages.reduce((sum, passage) => sum + passage.tokens.length, 0) / this.passages.length;
    return this.passages
      .map(passage => {
        const source = this.documents.get(passage.documentId);
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
        return {...passage, source, score: bm25 * (0.65 + 0.2 * freshness + 0.15 * authority)};
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

export function answer(index, question, now = new Date()) {
  const results = index.search(question, 4, now);
  if (!results.length) {
    return {answer: "I could not find a source that answers that yet.", confidence: 0.08, citations: [], actions: []};
  }
  const queryTokens = new Set(normalize(question));
  const selected = results
    .flatMap(result => sentences(result.text).map(sentence => ({sentence, result})))
    .map(candidate => ({
      ...candidate,
      overlap: normalize(candidate.sentence).filter(token => queryTokens.has(token)).length
    }))
    .sort((a, b) => b.overlap - a.overlap || b.result.score - a.result.score)
    .slice(0, 3);
  const citations = [...new Map(selected.map(({result}) => [result.documentId, {
    id: result.documentId,
    title: result.source.title,
    url: result.source.url,
    publishedAt: result.source.publishedAt,
    passage: result.id
  }])).values()];
  const coverage = Math.min(1, new Set(results.flatMap(result => result.tokens.filter(token => queryTokens.has(token)))).size / queryTokens.size);
  const corroboration = Math.min(1, new Set(results.map(result => result.documentId)).size / 2);
  const topStrength = Math.min(1, results[0].score / 5);
  const confidence = Number((0.55 * coverage + 0.25 * corroboration + 0.2 * topStrength).toFixed(2));
  const prefix = confidence < 0.45 ? "The available announcement suggests: " : "Based on the school announcements: ";
  return {
    answer: prefix + selected.map(({sentence}, index) => `${sentence} [${index + 1}]`).join(" "),
    confidence,
    citations,
    actions: extractActions(selected.map(item => item.sentence).join(" "))
  };
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

