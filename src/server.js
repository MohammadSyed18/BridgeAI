import {fileURLToPath} from 'node:url';
import {NoticeCatalog} from './catalog.js';
import {createBridgeServer} from './http.js';

const path = process.env.BRIDGE_CATALOG ?? fileURLToPath(new URL('../data/announcements.json', import.meta.url));
const catalog = await NoticeCatalog.load(path);
const server = createBridgeServer(catalog);
const port = Number(process.env.PORT ?? 8080);
server.listen(port, '127.0.0.1', () => console.log(`BridgeAI listening on http://localhost:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close());
