import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {answer, KnowledgeIndex} from "./index.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const index = new KnowledgeIndex();
const documents = JSON.parse(await readFile(join(root, "data", "announcements.json"), "utf8"));
documents.forEach(document => index.add(document));

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/ask") {
      const body = await readBody(request);
      const payload = JSON.parse(body);
      if (typeof payload.question !== "string" || payload.question.length > 500) return json(response, 400, {error: "invalid question"});
      return json(response, 200, answer(index, payload.question));
    }
    if (request.method === "GET" && request.url === "/api/health") return json(response, 200, {status: "ok", documents: index.documents.size});
    const requested = request.url === "/" ? "index.html" : request.url.slice(1);
    if (requested.includes("..")) return json(response, 400, {error: "invalid path"});
    const content = await readFile(join(root, "public", requested));
    response.writeHead(200, {"content-type": mime(extname(requested))});
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") return json(response, 404, {error: "not found"});
    console.error(error);
    json(response, 500, {error: "internal error"});
  }
});

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 32_000) reject(new Error("request too large"));
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function json(response, status, value) {
  response.writeHead(status, {"content-type": "application/json; charset=utf-8"});
  response.end(JSON.stringify(value));
}

function mime(extension) {
  return ({".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript"})[extension] ?? "application/octet-stream";
}

const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => console.log(`BridgeAI listening on http://localhost:${port}`));

