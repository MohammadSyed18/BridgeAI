# bridgeai

school notices -> answers, deadlines, next steps

local retrieval with sources attached. BM25-style matching + freshness + source authority. English/Spanish query normalization.

confidence depends on how much the sources actually cover.

```sh
npm test
npm start
# http://localhost:8080
```

includes a small HTTP API and demo ui. the notices are local; there is no live school-district connection yet.
