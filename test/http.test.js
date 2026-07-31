import test from 'node:test';
import assert from 'node:assert/strict';
import {NoticeCatalog} from '../src/catalog.js';
import {createBridgeServer} from '../src/http.js';

test('HTTP answers, audience filters, calendar export and error boundaries', async () => {
  const catalog = new NoticeCatalog([{id:'one',title:'Registration',body:'Register by July 30, 2026.',url:'https://school.example',publishedAt:'2026-06-01'}]);
  const server = createBridgeServer(catalog,{clock:()=>new Date('2026-07-01')});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base + '/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:'registration'})});
    assert.equal(response.status,200);
    assert.equal((await response.json()).citations[0].id,'one');
    const calendar = await fetch(base + '/api/calendar.ics');
    assert.ok((await calendar.text()).includes('BEGIN:VEVENT'));
    const malformed = await fetch(base + '/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:'{bad'});
    assert.equal(malformed.status,400);
    const oversized = await fetch(base + '/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:'x'.repeat(20000)})});
    assert.equal(oversized.status,413);
    assert.equal((await fetch(base + '/api/notices?audience=INVALID!')).status,400);
    assert.equal((await fetch(base + '/src/server.js')).status,404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
