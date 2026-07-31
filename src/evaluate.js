import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {NoticeCatalog} from './catalog.js';

/** Evaluate retrieval expectations on held-out questions; these are fixture scores. */
export function evaluate(catalog, cases) {
  if (!Array.isArray(cases) || !cases.length) throw new Error('Evaluation cases are required');
  const results = cases.map(item => {
    if (!Array.isArray(item.expectedSources) || typeof item.question !== 'string') throw new Error('Invalid evaluation case');
    const result = catalog.ask(item.question, {now: new Date(item.now), audience: item.audience ?? 'all'});
    const retrieved = new Set(result.citations.map(source => source.id));
    const expected = new Set(item.expectedSources);
    const hits = [...retrieved].filter(id => expected.has(id)).length;
    const precision = retrieved.size ? hits / retrieved.size : expected.size ? 0 : 1;
    const recall = expected.size ? hits / expected.size : retrieved.size ? 0 : 1;
    return {question: item.question, precision, recall, abstained: !retrieved.size, passed: precision === 1 && recall === 1};
  });
  return {cases: results.length, passed: results.filter(item => item.passed).length,
    meanPrecision: results.reduce((sum,item) => sum + item.precision, 0) / results.length,
    meanRecall: results.reduce((sum,item) => sum + item.recall, 0) / results.length, results};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const catalog = await NoticeCatalog.load(process.argv[2] ?? new URL('../data/announcements.json', import.meta.url));
  const cases = JSON.parse(await readFile(process.argv[3] ?? new URL('../data/evaluation.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(evaluate(catalog, cases), null, 2));
}
