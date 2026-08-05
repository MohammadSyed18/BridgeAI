import test from "node:test";
import assert from "node:assert/strict";
import {answer, KnowledgeIndex} from "../src/index.js";
import {extractActions, normalize} from "../src/text.js";

function fixture() {
  const index = new KnowledgeIndex();
  index.add({
    id:"registration", title:"Registration update", url:"https://example.test/r",
    publishedAt:"2026-08-01", authority:.9,
    body:"Registration closes August 18, 2026. Students must upload proof of residency before registering."
  });
  return index;
}

test("ranks a directly relevant source", () => {
  const results = fixture().search("registration deadline", 3, new Date("2026-08-04"));
  assert.equal(results[0].documentId, "registration");
});

test("answers include citations and extracted actions", () => {
  const result = answer(fixture(), "When does registration close and what do I upload?", new Date("2026-08-04"));
  assert.equal(result.citations.length, 1);
  assert.match(result.answer, /August 18/);
  assert.ok(result.actions.some(action => /upload/i.test(action.text)));
});

test("Spanish query terms are normalized", () => {
  assert.deepEqual(normalize("¿Cuándo necesito registrar?"), ["when", "need", "register"]);
});

test("low coverage produces an explicit refusal", () => {
  const result = answer(fixture(), "What is the marching band uniform color?", new Date("2026-08-04"));
  assert.equal(result.citations.length, 0);
});

test("action extraction keeps associated dates", () => {
  const actions = extractActions("Submit the application by August 18, 2026. Lunch is available.");
  assert.deepEqual(actions[0].dates, ["August 18, 2026"]);
});

test("each answer marker points to its supporting source and conflicts lower confidence", () => {
  const index = fixture();
  index.add({
    id:"reminder", title:"Registration reminder", url:"https://example.test/reminder",
    publishedAt:"2026-08-02", authority:.8,
    body:"Families should register online. Registration closes August 20, 2026."
  });
  const result = answer(index, "When does registration close?", new Date("2026-08-04"));
  assert.equal(result.evidence.length, 2);
  for (const item of result.evidence) {
    assert.equal(item.passage.split("#")[0], result.citations[item.citation - 1].id);
  }
  assert.equal(result.conflicts[0].type, "date");
  assert.ok(result.confidence < .8);
});
