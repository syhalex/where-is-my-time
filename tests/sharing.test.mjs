import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyData, saveEntry} from '../core.js';
import {snapshotDay, readSnapshot, encodeSnapshot, decodeSnapshot} from '../sharing.js';
const date = '2026-11-06';
const fixture = () => saveEntry(saveEntry(emptyData(), {name:'阅读 <书> + 中文', date, start:0, end:60, color:'#123456', categoryId:'study'}), {name:'其他一天',date:'2026-11-05',start:60,end:120,color:'#654321',categoryId:null});
test('sharing carries only selected day names and times, without changing original data', async () => {
  const original = fixture(), before = JSON.stringify(original), snapshot = snapshotDay(original, date);
  assert.deepEqual(snapshot, {v:1,date,records:[['阅读 <书> + 中文',0,60]]});
  const token = await encodeSnapshot(snapshot), result = await decodeSnapshot(token);
  assert.equal(result.data.entries.length,1); assert.equal(result.data.events[0].name,'阅读 <书> + 中文');
  assert.notEqual(result.data.events[0].color,'#123456'); assert.deepEqual(result.data.categories,[]);
  assert.equal(JSON.stringify(original), before);
});
test('sharing rejects malformed, empty, overlapping, unsupported and invalid time records', async () => {
  for (const records of [[],[['a',1,60]],[['a',60,1445]],[['a',0,60],['b',30,90]],[['a',90,60]],[['',0,60]]]) assert.throws(() => readSnapshot({v:1,date,records}));
  assert.throws(() => readSnapshot({v:2,date,records:[['a',0,60]]}));
  assert.throws(() => readSnapshot({v:1,date:'2026-02-30',records:[['a',0,60]]}));
  for (const token of ['garbage','2.abc','1.@@','1.abc']) await assert.rejects(decodeSnapshot(token));
});
test('sharing rejects decompression bombs', async () => {
  const compressed = new Uint8Array(await new Response(new Blob(['x'.repeat(110000)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const token = '1.' + Buffer.from(compressed).toString('base64url');
  await assert.rejects(decodeSnapshot(token), /超过/);
});
