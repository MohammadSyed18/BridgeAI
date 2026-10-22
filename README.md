# BridgeAI

School announcements are easy to lose track of. This prototype searches a local set of notices and pulls out answers, deadlines, and next steps with links back to the source.

The retrieval combines BM25-style text matching with freshness and source authority. It also handles English/Spanish query normalization. Confidence scores reflect the available source coverage.

```sh
npm test
npm start
# http://localhost:8080
```

Includes a small HTTP API and demo UI. The notices are local; there is no live school-district connection yet.
