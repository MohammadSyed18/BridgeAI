import test from 'node:test';
import assert from 'node:assert/strict';
import {deadlines,toCalendar} from '../src/deadlines.js';
const source = {id:'a', title:'Apply; scholarship',url:'https://school.example',body:'Submit by July 30, 2026. Register before 2026-08-01. Apply by February 30, 2026. Register on Tuesday.'};
test('only valid explicit dates produce stable events', () => {
  const events = deadlines([source,source], {now:new Date('2026-07-01')});
  assert.deepEqual(events.map(item => item.date), ['2026-07-30','2026-08-01']);
  assert.equal(deadlines([source],{now:new Date('2027-01-01')}).length,0);
});
test('calendar escapes injection and folds UTF8 at 75 octets', () => {
  const events = deadlines([source], {now:new Date('2026-07-01')});
  events[0].title = 'Award; ' + 'é'.repeat(100) + '\nBEGIN:EVIL';
  const calendar = toCalendar(events,{generatedAt:new Date('2026-07-01')});
  assert.ok(calendar.includes('DTSTART;VALUE=DATE:20260730'));
  assert.ok(calendar.includes('Award\\;'));
  assert.ok(!calendar.includes('\r\nBEGIN:EVIL'));
  for (const line of calendar.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.throws(() => toCalendar([{...events[0],date:'2026-02-30'}]));
});
