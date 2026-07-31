# BridgeAI

A source-grounded school-information assistant: indexed notices become cited answers, next steps, and explicit-date calendar entries. The included browser interface and HTTP service run locally without an API key.

## Run

Node 20 or newer; no runtime packages are required.

```sh
npm test
npm start
# http://localhost:8080
node src/evaluate.js
```

## Implementation

| Module | Responsibility |
| --- | --- |
| [index.js](src/index.js) | BM25-style passage retrieval, freshness and authority weighting, cited extractive answers |
| [catalog.js](src/catalog.js) | Validated batch ingestion, revision hashes, stale-update protection, audience/expiry filtering, atomic snapshots |
| [evidence.js](src/evidence.js) | Exact source-sentence selection, redundancy penalties, coverage-based abstention, and evidence metadata |
| [scopeCache.js](src/scopeCache.js) | Bounded LRU indexes keyed by catalog revision and currently visible notices |
| [text.js](src/text.js) | Tokenization, limited English/Spanish query normalization, sentence and action extraction |
| [deadlines.js](src/deadlines.js) | Explicit-date parsing, deduplicated events, escaped and UTF-8-folded iCalendar export |
| [http.js](src/http.js) | Testable HTTP application with body limits, validation, static-asset allowlist, and error responses |
| [evaluate.js](src/evaluate.js) | Fixture-based source precision, recall, and abstention checks |
| [ingest.js](src/ingest.js) | Local operator ingestion command |
| [public/](public/) | Question interface, source links, next steps, upcoming deadlines, calendar download |

A batch is checked in full before the searchable catalog changes. Updates require a newer `updatedAt` if their content differs; stale and conflicting same-version updates are rejected. Optional `audiences` and `expiresAt` fields limit retrieval scope, and future notices are omitted. Audience filtering personalizes public notices; it is not an authorization mechanism for private student data.

Answers are assembled from retrieved source sentences. Citation numbers point to the unique source list. Confidence is a retrieval heuristic rather than a calibrated probability or a claim of correctness. The small Spanish dictionary normalizes selected query terms; it does not translate all answers.

## API

| Method | Path | Result |
| --- | --- | --- |
| POST | `/api/ask` | `{question, audience?}` → answer, confidence, citations, actions, catalog revision |
| GET | `/api/search?q=registration&limit=5` | Ranked source excerpts, score explanations, and continuation cursor |
| GET | `/api/notices?audience=seniors` | Currently visible notices |
| GET | `/api/deadlines` | Upcoming explicit-date events with source links |
| GET | `/api/calendar.ics` | Downloadable all-day calendar entries |
| GET | `/api/health` | Document count and catalog revision |

Calendar extraction deliberately requires a full date with a year. Relative weekdays and ambiguous numeric dates stay in source text rather than becoming guessed events. Events are all-day entries, not inferred closing times.

## Updating a local catalog

```sh
cp data/announcements.json /tmp/bridge-catalog.json
node src/ingest.js /tmp/bridge-catalog.json /path/to/notice-batch.json
BRIDGE_CATALOG=/tmp/bridge-catalog.json npm start
```

The batch is an array using the existing notice schema. Restart the service after updating its snapshot. The operator command assumes a single writer. No unauthenticated ingestion endpoint is exposed.

The bundled notices use example source URLs; there is no live school-district connection. Confirm real deadlines against original sources before relying on them.

## Verification

`npm test` covers retrieval updates, citation numbering, atomic ingestion, persistence, audience scope, future/expired notices, invalid dates, calendar escaping, UTF-8 line folding, and actual HTTP requests including malformed and oversized input. `node src/evaluate.js` runs the small, hand-authored question fixture; its scores describe that fixture, not an external accuracy benchmark.

## Evidence selection and retrieval cost

Repeated query words count once. Ranking exposes lexical, freshness, authority, and matched-term components. Candidate source sentences are selected for query coverage and new evidence while penalizing repetition; identical sentences are shown once. Questions with less than 25% unique-term coverage abstain. This threshold is a configurable policy in `selectEvidence`, not a measured guarantee of answer correctness. Exact source excerpts appear under the browser citations and in the API's `evidence` array. `retrieval` reports coverage, unmatched terms, and the support/abstention reason.

The catalog reuses at most 16 scoped indexes. Visibility is checked on every request before cache lookup, including expiry and future publication. A catalog change invalidates cached indexes; the request clock still controls freshness ranking. This cache holds indexes rather than answers. These are local public-notice scopes, not authentication or a private student-data boundary.

## Source explorer

The browser source explorer and `GET /api/search` return exact passage excerpts and matched terms independently of answer generation. Optional `audience`, `limit` (1–20), and `cursor` parameters support bounded pagination over the top 100 passages. Cursor ranking uses a fixed timestamp for at most 15 minutes. Changing the query, page size, audience, catalog revision, or visible notice set invalidates the cursor with HTTP 409; restart from page one. Notice visibility is checked at the current time on every page, so an expired item cannot remain available through an older cursor. Cursors carry no private records and are not authorization tokens.

`searchPage.js` owns cursor validation and result serialization. The browser cancels superseded searches, prevents stale responses from replacing newer results, and inserts source text as plain text rather than HTML.
