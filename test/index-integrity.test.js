import test from "node:test";
import assert from "node:assert/strict";
import {KnowledgeIndex, answer} from "../src/index.js";
const document = {id:"a",title:"Registration",body:"Register for school today. School registration closes tomorrow. Bring school documents.",url:"https://example.org/notice",publishedAt:"2026-01-01"};
test("citations stay within the unique citation list", () => {
  const index = new KnowledgeIndex(); index.add(document);
  const result = answer(index,"school registration");
  for (const match of result.answer.matchAll(/\[(\d+)\]/g)) assert.ok(Number(match[1]) <= result.citations.length);
});
test("failed replacement leaves the existing index intact", () => {
  const index = new KnowledgeIndex(); index.add(document);
  assert.throws(() => index.replace({...document,url:"javascript:alert(1)"}));
  assert.equal(index.search("registration").length,1);
  index.replace({...document,body:"A new tuition notice."});
  assert.equal(index.search("registration").length,1); // title remains searchable
  assert.equal(index.remove("a"),true);
  assert.equal(index.documentFrequency.size,0);
  assert.deepEqual(index.search("registration"),[]);
});
