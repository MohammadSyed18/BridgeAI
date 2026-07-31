/** Local operator command; no public write endpoint is exposed by the demo server. */
import {readFile} from 'node:fs/promises';
import {NoticeCatalog} from './catalog.js';

const [snapshot, batch] = process.argv.slice(2);
if (!snapshot || !batch) {
  console.error('Usage: node src/ingest.js <catalog.json> <batch.json>');
  process.exitCode = 2;
} else {
  try {
    const catalog = await NoticeCatalog.load(snapshot);
    const documents = JSON.parse(await readFile(batch, 'utf8'));
    const result = catalog.ingest(documents);
    await catalog.save(snapshot);
    console.log(JSON.stringify(result,null,2));
  } catch (error) {
    console.error(`Ingestion rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
