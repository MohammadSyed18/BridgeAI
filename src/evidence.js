import {normalize, sentences} from './text.js';

function overlap(left, right) {
  return [...left].filter(token => right.has(token)).length;
}
function similarity(left, right) {
  const intersection = overlap(left, right);
  return intersection / Math.max(1, left.size + right.size - intersection);
}

/** Select exact source sentences while penalizing repetition and redundant evidence. */
export function selectEvidence(results, question, {limit = 3, minimumCoverage = 0.25} = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10 || !Number.isFinite(minimumCoverage) || minimumCoverage < 0 || minimumCoverage > 1) {
    throw new Error('Invalid evidence policy');
  }
  const query = new Set(normalize(question));
  if (!query.size || !results.length) return {items: [], coverage: 0, missingTerms: [...query], reason: 'no-matching-source'};
  const candidates = [];
  const seen = new Set();
  for (const result of results) {
    for (const sentence of sentences(result.text)) {
      const tokens = new Set(normalize(sentence));
      const key = sentence.trim().toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key) || overlap(tokens, query) === 0) continue;
      seen.add(key);
      candidates.push({sentence, tokens, result, matchedTerms: [...query].filter(term => tokens.has(term))});
    }
  }
  const selected = [], covered = new Set();
  const strongest = Math.max(1, ...results.map(item => item.score));
  while (candidates.length && selected.length < limit) {
    let bestIndex = -1, bestScore = -Infinity;
    for (let index = 0; index < candidates.length; index++) {
      const item = candidates[index];
      const novelty = item.matchedTerms.filter(term => !covered.has(term)).length / query.size;
      const coverage = item.matchedTerms.length / query.size;
      const redundancy = Math.max(0, ...selected.map(previous => similarity(item.tokens, previous.tokens)));
      const score = 0.5 * coverage + 0.3 * novelty + 0.2 * item.result.score / strongest - 0.4 * redundancy;
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    }
    if (bestIndex < 0 || bestScore <= 0) break;
    const [item] = candidates.splice(bestIndex, 1);
    selected.push(item);
    item.matchedTerms.forEach(term => covered.add(term));
  }
  const coverage = covered.size / query.size;
  const missingTerms = [...query].filter(term => !covered.has(term));
  if (coverage < minimumCoverage || !selected.length) return {items: [], coverage, missingTerms, reason: 'insufficient-evidence'};
  return {items: selected, coverage, missingTerms, reason: 'supported'};
}

export function composeAnswer(results, question, options) {
  const evidence = selectEvidence(results, question, options);
  if (!evidence.items.length) return {
    answer: 'I could not find enough source evidence to answer that. Try naming the program or topic more specifically.',
    confidence: 0.08, citations: [], actions: [], evidence: [],
    retrieval: {coverage: evidence.coverage, missingTerms: evidence.missingTerms, reason: evidence.reason}
  };
  const citations = [], citationNumbers = new Map();
  const items = evidence.items.map(item => {
    if (!citationNumbers.has(item.result.documentId)) {
      citations.push({id:item.result.documentId, title:item.result.source.title, url:item.result.source.url,
        publishedAt:item.result.source.publishedAt, passage:item.result.id});
      citationNumbers.set(item.result.documentId, citations.length);
    }
    return {text:item.sentence, citation:citationNumbers.get(item.result.documentId),
      passage:item.result.id, matchedTerms:item.matchedTerms};
  });
  // This is an explicit retrieval heuristic, not a probability of factual correctness.
  const strength = Math.min(1, results[0].score / 5);
  const confidence = Number(Math.min(0.95, 0.8 * evidence.coverage + 0.2 * strength).toFixed(2));
  return {answer: 'Based on the school announcements: ' + items.map(item => `${item.text} [${item.citation}]`).join(' '),
    confidence, citations, evidence:items,
    retrieval:{coverage:evidence.coverage, missingTerms:evidence.missingTerms, reason:evidence.reason}};
}
