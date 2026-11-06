import { VERSION, PALETTE, validDate, validateData } from './core.js';

const MAX_TEXT = 100000;
export function snapshotDay(data, date) {
  const events = new Map(data.events.map(event => [event.id, event.name]));
  return {v:1, date, records:data.entries.filter(entry => entry.date === date).map(entry => [events.get(entry.eventId), entry.start, entry.end])};
}
export function readSnapshot(raw) {
  if (!raw || raw.v !== 1 || !validDate(raw.date) || !Array.isArray(raw.records) || !raw.records.length || raw.records.length > 288) throw new Error('分享链接内容无效或版本不受支持');
  const data = {version:VERSION, categories:[], events:[], entries:[]}, names = new Map();
  raw.records.forEach((record, index) => {
    if (!Array.isArray(record) || record.length !== 3 || typeof record[0] !== 'string') throw new Error('分享记录格式无效');
    const [name, start, end] = record;
    if (!names.has(name)) {
      const id = `share-event-${names.size}`;
      data.events.push({id, name, color:PALETTE[names.size % PALETTE.length], categoryId:null}); names.set(name, id);
    }
    data.entries.push({id:`share-entry-${index}`, date:raw.date, start, end, eventId:names.get(name)});
  });
  return {date:raw.date, data:validateData(data)};
}
export async function encodeSnapshot(snapshot) {
  readSnapshot(snapshot);
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const compressed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  return '1.' + btoa(String.fromCharCode(...compressed)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/, '');
}
export async function decodeSnapshot(token) {
  if (!/^1\.[A-Za-z0-9_-]+$/.test(token) || token.length > MAX_TEXT) throw new Error('分享链接无效或过长');
  const bytes = Uint8Array.from(atob(token.slice(2).replaceAll('-','+').replaceAll('_','/')), char => char.charCodeAt(0));
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > MAX_TEXT) throw new Error('分享内容超过支持范围');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return readSnapshot(JSON.parse(await new Blob(chunks).text()));
}

// Read embedded data only; never navigate to or fetch a supplied address.
export async function readShareLink(value, resolveLocal = () => null) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('请输入完整的分享链接'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('请输入 HTTP 或 HTTPS 分享链接');
  let token;
  if (url.hash.startsWith('#share=')) token = url.hash.slice(7);
  else if (/^#shared=[a-zA-Z0-9-]{1,40}$/.test(url.hash)) token = resolveLocal(url.hash.slice(8));
  if (!token) throw new Error('请粘贴原始完整分享链接，此链接不包含可读取的分享内容');
  return decodeSnapshot(token);
}
