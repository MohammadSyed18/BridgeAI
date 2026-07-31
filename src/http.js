import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {CatalogError} from './catalog.js';
import {deadlines, toCalendar} from './deadlines.js';

const publicRoot = new URL('../public/', import.meta.url);
const assets = new Map([['/', ['index.html','text/html; charset=utf-8']], ['/app.js',['app.js','text/javascript; charset=utf-8']], ['/styles.css',['styles.css','text/css; charset=utf-8']]]);
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
async function readJson(request, limit = 16384) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new HttpError(415, 'Use application/json');
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid JSON'); }
}
function send(response, status, value, type = 'application/json; charset=utf-8') {
  response.writeHead(status, {'content-type': type, 'x-content-type-options':'nosniff', 'cache-control':'no-store'});
  response.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
}
export function createBridgeServer(catalog, {clock = () => new Date()} = {}) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://bridgeai.local');
      const options = {audience: url.searchParams.get('audience') ?? 'all', now: clock()};
      if (request.method === 'GET' && url.pathname === '/api/health') return send(response, 200, {status:'ok', documents:catalog.documents.size, revision:catalog.revision});
      if (request.method === 'POST' && url.pathname === '/api/ask') {
        const payload = await readJson(request);
        if (!payload || typeof payload !== 'object') throw new HttpError(400, 'Expected an object');
        return send(response, 200, catalog.ask(payload.question, {...options, audience: payload.audience ?? options.audience}));
      }
      if (request.method === 'GET' && url.pathname === '/api/notices') {
        return send(response, 200, {revision: catalog.revision, notices: catalog.list(options)});
      }
      if (request.method === 'GET' && ['/api/deadlines','/api/calendar.ics'].includes(url.pathname)) {
        const events = deadlines(catalog.list(options), options);
        if (url.pathname.endsWith('.ics')) return send(response, 200, toCalendar(events, {generatedAt: options.now}), 'text/calendar; charset=utf-8');
        return send(response, 200, {events});
      }
      if (request.method === 'GET' && assets.has(url.pathname)) {
        const [filename, mime] = assets.get(url.pathname);
        const content = await readFile(fileURLToPath(new URL(filename, publicRoot)));
        return send(response, 200, content, mime);
      }
      return send(response, request.method === 'GET' ? 404 : 405, {error:'Route not found'});
    } catch (error) {
      if (error instanceof CatalogError || error instanceof HttpError) return send(response, error.status ?? 400, {error:error.message});
      console.error('BridgeAI request failed:', error.message);
      if (!response.headersSent) send(response, 500, {error:'Internal error'});
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
