import test from 'node:test';
import assert from 'node:assert/strict';
import {KnowledgeIndex, answer} from '../src/index.js';
import {NoticeCatalog} from '../src/catalog.js';
import {ScopeIndexCache} from '../src/scopeCache.js';
const notice=(id,extra={})=>({id,title:'Scholarship',body:'Submit the scholarship application by July 30, 2026.',url:'https://school.example/'+id,publishedAt:'2026-06-01',...extra});
const now=new Date('2026-07-01');
test('answers expose verbatim evidence with valid citation references',()=>{
  const index=new KnowledgeIndex();index.add(notice('a'));
  const result=answer(index,'scholarship application',now);
  assert.equal(result.retrieval.reason,'supported');
  assert.equal(result.retrieval.coverage,1);
  for(const item of result.evidence){
    assert.ok(index.documents.get(result.citations[item.citation-1].id).body.includes(item.text));
    assert.match(result.answer,new RegExp('\\['+item.citation+'\\]'));
  }
});
test('a single incidental term does not support an unrelated question',()=>{
  const index=new KnowledgeIndex();index.add(notice('a'));
  const result=answer(index,'scholarship football uniform bus parking cafeteria menu robotics',now);
  assert.equal(result.retrieval.reason,'insufficient-evidence');
  assert.equal(result.citations.length,0);
  assert.equal(result.evidence.length,0);
});
test('identical sentences are not repeated and query repetition does not inflate rank',()=>{
  const index=new KnowledgeIndex();index.add(notice('a'));index.add(notice('b'));
  const result=answer(index,'scholarship application',now);
  assert.equal(new Set(result.evidence.map(item=>item.text)).size,result.evidence.length);
  assert.equal(index.search('scholarship scholarship',5,now)[0].score,index.search('scholarship',5,now)[0].score);
});
test('direct index search excludes future sources and reports score factors',()=>{
  const index=new KnowledgeIndex();index.add(notice('a'));index.add(notice('future',{publishedAt:'2027-01-01'}));
  const result=index.search('scholarship',5,now);
  assert.equal(result.length,1);
  assert.deepEqual(result[0].explanation.matchedTerms,['scholarship']);
  assert.ok(result[0].explanation.lexical>0);
});
test('cached indexes respect audience, expiry and revision changes',()=>{
  const catalog=new NoticeCatalog([notice('a',{audiences:['seniors'],expiresAt:'2026-07-02'})]);
  assert.equal(catalog.ask('scholarship',{audience:'seniors',now}).citations.length,1);
  catalog.ask('scholarship',{audience:'seniors',now});
  assert.equal(catalog.indexCache.statistics().hits,1);
  assert.equal(catalog.ask('scholarship',{audience:'juniors',now}).citations.length,0);
  assert.equal(catalog.ask('scholarship',{audience:'seniors',now:new Date('2026-07-03')}).citations.length,0);
  catalog.ingest([notice('b')]);
  assert.equal(catalog.indexCache.statistics().size,0);
  assert.equal(catalog.ask('scholarship',{now:new Date('2026-07-03')}).citations[0].id,'b');
});
test('LRU eviction stays bounded and promotes cache hits',()=>{
  const cache=new ScopeIndexCache({capacity:2});
  cache.get([notice('a')],1);cache.get([notice('b')],1);cache.get([notice('a')],1);cache.get([notice('c')],1);
  assert.equal(cache.statistics().size,2);
  assert.equal(cache.statistics().hits,1);
  cache.get([notice('b')],1);
  assert.equal(cache.statistics().misses,4);
});
