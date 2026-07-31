import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NoticeCatalog} from '../src/catalog.js';
const notice = (id, extra = {}) => ({id,title:'Scholarship deadline',body:'Submit the scholarship application by July 30, 2026.',url:'https://school.example/notice',publishedAt:'2026-06-01',...extra});
const now = new Date('2026-07-01');
test('ingestion is atomic on stale or malformed updates', () => {
  const catalog = new NoticeCatalog([notice('a')]);
  assert.throws(() => catalog.ingest([notice('b'), notice('a',{publishedAt:'2026-05-01'})]), /Stale/);
  assert.equal(catalog.documents.size, 1);
  assert.equal(catalog.revision, 1);
  assert.throws(() => catalog.ingest([notice('a',{body:'Different body'})]), /Conflicting/);
  assert.throws(() => catalog.ingest([notice('b'),notice('b')]), /Duplicate/);
});
test('scope excludes future and expired notices and unrelated audiences', () => {
  const catalog = new NoticeCatalog([notice('all'), notice('seniors',{audiences:['seniors']}), notice('future',{publishedAt:'2027-01-01'}), notice('expired',{expiresAt:'2026-06-15'})]);
  assert.deepEqual(catalog.list({audience:'juniors',now}).map(item => item.id), ['all']);
  assert.deepEqual(catalog.list({audience:'seniors',now}).map(item => item.id), ['all','seniors']);
  assert.equal(catalog.ask('scholarship', {audience:'seniors',now}).citations.length, 1); // identical evidence is cited once
  const copy = catalog.list({now}); copy[0].audiences.push('mutated');
  assert.ok(!catalog.list({now})[0].audiences.includes('mutated'));
});
test('versioned snapshots persist and reload without changing retrieval', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bridge-'));
  try {
    const catalog = new NoticeCatalog([notice('a')]);
    catalog.ingest([notice('a',{updatedAt:'2026-06-02',body:'Submit the scholarship by August 1, 2026.'})]);
    await catalog.save(join(dir,'catalog.json'));
    const loaded = await NoticeCatalog.load(join(dir,'catalog.json'));
    assert.deepEqual(loaded.ask('scholarship',{now}), catalog.ask('scholarship',{now}));
    assert.equal(loaded.audit.length, 2);
    const before = loaded.revision;
    loaded.ingest([...loaded.documents.values()]);
    assert.equal(loaded.revision, before);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
