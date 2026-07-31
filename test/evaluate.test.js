import test from 'node:test';
import assert from 'node:assert/strict';
import {NoticeCatalog} from '../src/catalog.js';
import {evaluate} from '../src/evaluate.js';
test('evaluation scores missed sources and correct abstention separately', () => {
  const catalog = new NoticeCatalog([{id:'one',title:'Robotics',body:'Robotics applications close July 30, 2026.',url:'https://school.example',publishedAt:'2026-06-01'}]);
  const result = evaluate(catalog,[{question:'robotics',expectedSources:['one'],now:'2026-07-01'},{question:'spaceship',expectedSources:[],now:'2026-07-01'},{question:'spaceship',expectedSources:['one'],now:'2026-07-01'}]);
  assert.equal(result.passed,2);
  assert.equal(result.results[2].recall,0);
});
