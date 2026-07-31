import test from 'node:test';
import assert from 'node:assert/strict';
import {NoticeCatalog} from '../src/catalog.js';
import {createBridgeServer} from '../src/http.js';
const now = new Date('2026-07-01');
const notice = (id, extra = {}) => ({id,title:`Scholarship ${id}`,body:`Submit scholarship application ${id} by August 1, 2026.`,url:`https://school.example/${id}`,publishedAt:'2026-06-01',...extra});
function catalog() { return new NoticeCatalog(Array.from({length:13}, (_, index) => notice(`id-${index}`))); }

test('pages have stable ordering, no repeats, and verbatim excerpts', () => {
  const source = catalog(), found = [];
  let cursor;
  do {
    const page = source.search('scholarship', {now,limit:5,cursor});
    for (const result of page.items) {
      assert.ok(source.documents.get(result.documentId).body.includes(result.excerpt));
      assert.deepEqual(result.explanation.matchedTerms, ['scholarship']);
      found.push(result.passageId);
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.equal(found.length,13); assert.equal(new Set(found).size,13);
});
test('scope, query, limit and catalog changes invalidate cursors', () => {
  const source = catalog();
  const {nextCursor:cursor} = source.search('scholarship',{now,limit:5});
  for (const options of [{audience:'seniors'},{limit:4}]) assert.throws(() => source.search('scholarship',{now,limit:5,cursor,...options}),error=>error.status===409);
  assert.throws(()=>source.search('application',{now,limit:5,cursor}),error=>error.status===409);
  source.ingest([notice('new')]);
  assert.throws(()=>source.search('scholarship',{now,limit:5,cursor}),error=>error.status===409);
});
test('expiry is enforced even during a paginated search', () => {
  const source = new NoticeCatalog([notice('a'),notice('b',{expiresAt:'2026-07-01T00:05:00Z'})]);
  const first = source.search('scholarship',{now,limit:1});
  assert.throws(()=>source.search('scholarship',{now:new Date('2026-07-01T00:06:00Z'),limit:1,cursor:first.nextCursor}),error=>error.status===409);
});
test('malformed, expired and out-of-range cursor values fail clearly', () => {
  const source = catalog(), first = source.search('scholarship',{now,limit:5});
  for (const cursor of ['!', 'a'.repeat(2001), Buffer.from('{}').toString('base64url')]) assert.throws(()=>source.search('scholarship',{now,limit:5,cursor}),/cursor/);
  assert.throws(()=>source.search('scholarship',{now:new Date(now.valueOf()+16*60000),limit:5,cursor:first.nextCursor}),/expired/);
  const value = JSON.parse(Buffer.from(first.nextCursor,'base64url').toString()); value.offset=99;
  assert.throws(()=>source.search('scholarship',{now,limit:5,cursor:Buffer.from(JSON.stringify(value)).toString('base64url')}),/outside/);
  for (const limit of [0,21,NaN,1.5]) assert.throws(()=>source.search('scholarship',{now,limit}));
});
test('HTTP source search exposes excerpts and rejects invalid parameters', async () => {
  const server = createBridgeServer(catalog(),{clock:()=>now});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const response=await fetch(base+'/api/search?q=scholarship&limit=5');
    assert.equal(response.status,200);
    const page=await response.json();assert.equal(page.items.length,5);assert.ok(page.nextCursor);
    assert.equal((await fetch(base+'/api/search?q=scholarship&limit=500')).status,400);
    assert.equal((await fetch(base+'/api/search')).status,400);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
