export const VERSION = 4;
export const OTHER_TIME_EVENT = Object.freeze({id:'@other-time',name:'其他时间',color:'#C3CBBE',categoryId:null,automatic:true});
export const PALETTE = ['#89A996', '#93A8CF', '#C2A0C9', '#D7B576', '#D99789', '#85B5BA', '#B2BA80', '#A8A2CB'];
export const DEFAULT_CATEGORIES = [
  { id: 'study', name: '学习', color: '#93A8CF' },
  { id: 'leisure', name: '娱乐', color: '#D7B576' },
  { id: 'sleep', name: '睡眠', color: '#A8A2CB' },
  { id: 'exercise', name: '运动', color: '#89A996' }
];
export const emptyData = () => ({ version: VERSION, categories: structuredClone(DEFAULT_CATEGORIES), events: [], entries: [] });
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const normalizeName = value => String(value ?? '').trim().replace(/\s+/g, ' ');
function colorPoint(hex) {
  const [r, g, b] = [1, 3, 5].map(i => { const value = parseInt(hex.slice(i, i + 2), 16) / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}
function mutedColor(hue, lightness, chroma) {
  const angle = hue * Math.PI / 180;
  let rgb;
  for (let attempt = 0; attempt < 10; attempt++) {
    const a = Math.cos(angle) * chroma, b = Math.sin(angle) * chroma;
    const l = (lightness + .3963377774 * a + .2158037573 * b) ** 3, m = (lightness - .1055613458 * a - .0638541728 * b) ** 3, s = (lightness - .0894841775 * a - 1.291485548 * b) ** 3;
    rgb = [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s];
    if (rgb.every(value => value >= 0 && value <= 1)) break;
    chroma *= .82;
  }
  return '#' + rgb.map(value => { const v = Math.max(0, Math.min(1, value)); return Math.round(255 * (v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055)).toString(16).padStart(2, '0'); }).join('').toUpperCase();
}
export function colorDistance(a, b) { const x = colorPoint(a), y = colorPoint(b); return 5 * Math.hypot(...x.map((v, i) => v - y[i])); }
export function nextEventColor(usedColors, random = Math.random, recentColors = []) {
  const used = new Set(usedColors.map(c => c.toUpperCase())), recent = new Set(recentColors.map(c => c.toUpperCase()));
  const points = [...used].map(colorPoint), history = [...recent].map(colorPoint), candidates = [];
  const distanceTo = (point, list) => list.length ? Math.min(...list.map(p => Math.hypot(...point.map((v, n) => v - p[n])))) : 1;
  for (let i = 0; i < 720; i++) {
    const color = mutedColor((random() * 360 + i * 137.508) % 360, .60 + random() * .22, .055 + random() * .065);
    if (used.has(color) || recent.has(color)) continue;
    const point = colorPoint(color); candidates.push({color, distance: distanceTo(point, points), novelty: distanceTo(point, history)});
  }
  const bestDistance = Math.max(...candidates.map(c => c.distance));
  // Pick from a broad safe pool instead of repeatedly selecting the same extrema.
  const safe = candidates.filter(c => c.distance >= Math.min(.065, bestDistance * .88));
  const bestNovelty = Math.max(...safe.map(c => c.novelty));
  const fresh = safe.filter(c => c.novelty >= Math.min(.028, bestNovelty * .85));
  return fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))]?.color || candidates[0]?.color || '#89A996';
}
export function randomColorOptions(usedColors, selected, count = 8, random = Math.random, recentColors = []) {
  const colors = selected ? [selected.toUpperCase()] : [];
  while (colors.length < count) colors.push(nextEventColor([...usedColors, ...colors], random, recentColors));
  return colors;
}
export function hexToHsv(hex) {
  const [r,g,b] = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255), max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
  let h = d === 0 ? 0 : max === r ? ((g-b)/d)%6 : max === g ? (b-r)/d+2 : (r-g)/d+4;
  return {h:(h*60+360)%360,s:max === 0 ? 0 : d/max,v:max};
}
export function hsvToHex({h,s,v}) {
  h=((h%360)+360)%360; s=Math.max(0,Math.min(1,s)); v=Math.max(0,Math.min(1,v));
  const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;
  const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
}
export function heatColor(color, minutes) {
  if (minutes <= 0) return '#EEF1E8';
  const strength = .12 + .88 * Math.sqrt(Math.min(1, minutes / 1440)), base = [245, 247, 240];
  return `#${[1, 3, 5].map((i, n) => Math.round(base[n] + (parseInt(color.slice(i, i + 2), 16) - base[n]) * strength).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
export const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const fromKey = key => new Date(`${key}T12:00:00`);
export const addDays = (key, amount) => { const d = fromKey(key); d.setDate(d.getDate() + amount); return dateKey(d); };
export const timeText = mins => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
export function parseTime(value) {
  if (!/^(?:[01]\d|2[0-3]):[0-5][05]$/.test(value) && value !== '24:00') return null;
  const [h, m] = value.split(':').map(Number); return h * 60 + m;
}
export function durationText(mins) { const h = Math.floor(mins / 60), m = mins % 60; return h ? `${h}时${m ? `${m}分` : ''}` : `${m}分`; }
export function validDate(key) { return /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= '1900-01-01' && key <= '9999-12-31' && !Number.isNaN(fromKey(key).getTime()) && dateKey(fromKey(key)) === key; }
export const entriesOn = (data, key) => data.entries.filter(e => e.date === key).sort((a, b) => a.start - b.start);
export const getEvent = (data, id) => id === OTHER_TIME_EVENT.id ? OTHER_TIME_EVENT : data.events.find(t => t.id === id);
export const getCategory = (data, id) => data.categories.find(c => c.id === id);
export const recordedMinutes = entries => entries.reduce((sum,e)=>sum+e.end-e.start,0);
export function statisticsEntries(data, today = dateKey(new Date())) {
  const byDate = new Map(), result = [...data.entries];
  for (const entry of data.entries) {
    if (entry.date >= today) continue;
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(entry);
  }
  // Derive gaps without storing them, so backfilling a past day stays editable.
  for (const [date, entries] of byDate) {
    let cutoff = 0;
    const addGap = (start, end) => {
      if (end <= start) return;
      result.push({id:`@other-time/${date}/${start}-${end}`,date,start,end,automatic:true,eventId:OTHER_TIME_EVENT.id});
    };
    for (const entry of [...entries].sort((a,b)=>a.start-b.start)) {
      addGap(cutoff,entry.start); cutoff = Math.max(cutoff,entry.end);
    }
    addGap(cutoff,1440);
  }
  return result.sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start);
}
export function categoryFocus(data, entries, categoryId) {
  const groups = categoryTotals(data, entries), total = groups.reduce((sum,[,minutes])=>sum+minutes,0);
  const minutes = groups.find(([id])=>id===categoryId)?.[1] || 0;
  return {minutes,total,share:total ? minutes/total : 0};
}
export function pruneUnusedEvents(data) {
  const used = new Set(data.entries.map(entry => entry.eventId));
  return { ...data, events: data.events.filter(item => used.has(item.id)) };
}
export function restoreEntry(data, entry, savedEvent) {
  const next = structuredClone(data), restored = structuredClone(entry);
  if (!savedEvent || savedEvent.id !== entry.eventId) throw new Error('无法恢复事件');
  let item = getEvent(next,savedEvent.id) || next.events.find(item=>item.name===savedEvent.name);
  if (!item) { item={...savedEvent,categoryId:getCategory(next,savedEvent.categoryId)?savedEvent.categoryId:null};next.events.push(item); }
  restored.eventId=item.id;
  next.entries.push(restored);
  return validateData(next);
}
export function categoryTotals(data, entries) {
  const result = new Map();
  for (const entry of entries) { const id = getEvent(data, entry.eventId)?.categoryId || null; result.set(id, (result.get(id) || 0) + entry.end-entry.start); }
  return [...result].sort((a, b) => b[1] - a[1]);
}
export function saveCategory(data, input) {
  const name = normalizeName(input.name);
  if (!name || name.length > 30) throw new Error('请填写 1 至 30 字的分类名称');
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new Error('请选择有效颜色');
  const next = structuredClone(data), existing = next.categories.find(c => c.name === name && c.id !== input.id);
  if (input.id) {
    const category = getCategory(next, input.id); if (!category) throw new Error('分类不存在');
    if (existing) { next.events.forEach(t => { if (t.categoryId === input.id) t.categoryId = existing.id; }); next.categories = next.categories.filter(c => c.id !== input.id); }
    else Object.assign(category, { name, color: input.color });
  } else if (!existing) next.categories.push({ id: uid(), name, color: input.color });
  return next;
}
export function deleteCategory(data, id) { const next = structuredClone(data); next.categories = next.categories.filter(c => c.id !== id); next.events.forEach(t => { if (t.categoryId === id) t.categoryId = null; }); return next; }
export function continuationRange(records) { const end = records.reduce((last, e) => Math.max(last, e.end), 0); return records.length && end < 1440 ? [end, Math.min(end + 30, 1440)] : null; }
export function snapMinute(minute, boundaries = [], tolerance = 4) {
  const nearest = boundaries.reduce((best, value) => Math.abs(value - minute) < Math.abs(best - minute) ? value : best, Infinity);
  return Math.max(0, Math.min(1440, Math.abs(nearest - minute) <= tolerance ? nearest : Math.round(minute / 5) * 5));
}
export function totals(entries) { const result = new Map(); for (const entry of entries) result.set(entry.eventId, (result.get(entry.eventId) ?? 0) + entry.end-entry.start); return [...result].sort((a, b) => b[1] - a[1]); }
export function conflict(data, entry) { return data.entries.find(e => e.id !== entry.id && e.date === entry.date && e.start < entry.end && e.end > entry.start); }
export function saveEntry(data, input) {
  const name = normalizeName(input.name);
  if (!name || name.length > 80) throw new Error('请填写 1 至 80 字的事件名称');
  if (!validDate(input.date)) throw new Error('请选择有效日期');
  if (!Number.isInteger(input.start) || !Number.isInteger(input.end) || input.start < 0 || input.end > 1440 || input.start % 5 || input.end % 5 || input.end <= input.start) throw new Error('请输入有效时段，时间须为 5 分钟的倍数');
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new Error('请选择有效颜色');
  const overlap = conflict(data, input);
  if (overlap) throw new Error(`${timeText(overlap.start)} — ${timeText(overlap.end)} 已有记录`);
  const next = structuredClone(data);
  if (input.categoryId != null && !getCategory(next,input.categoryId)) throw new Error('所选分类不存在');
  let item = next.events.find(item=>item.name===name);
  if (!item) { item={id:uid(),name,color:input.color,categoryId:input.categoryId||null};next.events.push(item); }
  else { item.color=input.color;if(input.categoryId!==undefined)item.categoryId=input.categoryId||null; }
  const entry = { id: input.id || uid(), date: input.date, start: input.start, end: input.end, eventId:item.id };
  const i = next.entries.findIndex(e => e.id === entry.id);
  if (i >= 0) next.entries[i] = entry; else next.entries.push(entry);
  return pruneUnusedEvents(next);
}
export function renameEvent(data, id, newName) {
  if (id === OTHER_TIME_EVENT.id) throw new Error('其他时间由系统自动统计');
  const name = normalizeName(newName);
  if (!name || name.length > 80) throw new Error('请填写 1 至 80 字的事件名称');
  const next = structuredClone(data), item = getEvent(next, id);
  if (!item) throw new Error('事件不存在');
  const target = next.events.find(t => t.name === name && t.id !== id);
  if (target) {
    next.entries.forEach(entry => {if(entry.eventId===id)entry.eventId=target.id;});
    next.events = next.events.filter(item => item.id !== id);
  }
  else item.name = name;
  return next;
}
export function validateData(raw) {
  if (!raw || raw.version !== VERSION || !Array.isArray(raw.events) || !Array.isArray(raw.entries)) throw new Error('备份格式不正确或版本不受支持');
  if (raw.events.length > 5000 || raw.entries.length > 100000) throw new Error('备份内容超过支持范围');
  const next = emptyData(), ids = new Set(), names = new Set();
  {
    if (!Array.isArray(raw.categories) || raw.categories.length > 1000) throw new Error('备份分类格式不正确');
    const categoryIds = new Set(), categoryNames = new Set(); next.categories = [];
    for (const c of raw.categories) {
      if (!c || typeof c.id !== 'string' || !c.id || categoryIds.has(c.id) || typeof c.name !== 'string' || !normalizeName(c.name) || c.name.length > 30 || categoryNames.has(normalizeName(c.name)) || !/^#[0-9a-fA-F]{6}$/.test(c.color)) throw new Error('备份中存在无效或重复分类');
      categoryIds.add(c.id); categoryNames.add(normalizeName(c.name)); next.categories.push({ id: c.id, name: normalizeName(c.name), color: c.color });
    }
  }
  for (const t of raw.events) {
    if (!t || typeof t.id !== 'string' || !t.id || t.id === OTHER_TIME_EVENT.id || ids.has(t.id) || typeof t.name !== 'string' || !normalizeName(t.name) || t.name.length > 80 || names.has(normalizeName(t.name)) || !/^#[0-9a-fA-F]{6}$/.test(t.color)) throw new Error('备份中存在无效或重复事件');
    const categoryId = t.categoryId ?? null;
    if (categoryId !== null && !getCategory(next, categoryId)) throw new Error('事件引用了不存在的分类');
    ids.add(t.id); names.add(normalizeName(t.name)); next.events.push({ id: t.id, name: normalizeName(t.name), color: t.color, categoryId });
  }
  const entryIds = new Set();
  for (const e of raw.entries) {
    if (!e || typeof e.id !== 'string' || !e.id || entryIds.has(e.id) || !validDate(e.date) || !ids.has(e.eventId) || !Number.isInteger(e.start) || !Number.isInteger(e.end) || e.start < 0 || e.end > 1440 || e.start >= e.end || e.start % 5 || e.end % 5) throw new Error('备份中存在无效记录');
    entryIds.add(e.id); next.entries.push({ id: e.id, date: e.date, start: e.start, end: e.end, eventId:e.eventId });
  }
  next.entries.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  for (let i = 1; i < next.entries.length; i++) { const a = next.entries[i - 1], b = next.entries[i]; if (a.date === b.date && a.end > b.start) throw new Error(`${b.date} 存在重叠时段`); }
  return pruneUnusedEvents(next);
}
// Read older backups at the boundary; stored records always use the current schema.
export function readBackup(raw) {
  if(raw?.version===VERSION)return validateData(raw);
  if(!raw||![1,2,3].includes(raw.version)||!Array.isArray(raw.tags)||!Array.isArray(raw.entries))throw new Error('备份格式不正确或版本不受支持');
  const next={version:VERSION,categories:structuredClone(raw.categories||DEFAULT_CATEGORIES),events:[],entries:[]};
  const source=new Map(raw.tags.map(item=>[item.id,item])),byName=new Map();
  for(const entry of raw.entries){
    const refs=entry.activities?entry.activities.map(item=>item.tagId):[entry.tagId];
    const items=[...new Set(refs)].map(id=>source.get(id));
    if(!items.length||items.some(item=>!item))throw new Error('旧备份中的记录引用了不存在的事件');
    const name=items.map(item=>normalizeName(item.name)).join(' + ');
    if(name.length>80)throw new Error('旧记录合并后的事件名称超过 80 字，请先保留原始备份');
    let item=byName.get(name);
    if(!item){item={id:items.length===1?items[0].id:uid(),name,color:items[0].color,categoryId:items.every(item=>item.categoryId===items[0].categoryId)?items[0].categoryId||null:null};byName.set(name,item);next.events.push(item);}
    next.entries.push({id:entry.id,date:entry.date,start:entry.start,end:entry.end,eventId:item.id});
  }
  return validateData(next);
}
export function mergeData(current, incoming) {
  current = validateData(current); incoming = validateData(incoming);
  const next = structuredClone(current), eventIds = new Map(), categoryIds = new Map();
  for (const c of incoming.categories) { let existing = next.categories.find(x => x.name === c.name); if (!existing) { existing = { ...c, id: uid() }; next.categories.push(existing); } categoryIds.set(c.id, existing.id); }
  for (const t of incoming.events) {
    let existing = next.events.find(x => x.name === t.name);
    if (!existing) { existing = { ...t, id: uid(), categoryId: categoryIds.get(t.categoryId) || null }; next.events.push(existing); }
    eventIds.set(t.id, existing.id);
  }
  const signatureOf=e=>JSON.stringify([e.date,e.start,e.end,e.eventId]);
  const signatures = new Set(next.entries.map(signatureOf));
  for (const e of incoming.entries) {
    const entry = { ...e, id: uid(), eventId:eventIds.get(e.eventId) }, signature = signatureOf(entry);
    if (!signatures.has(signature)) { next.entries.push(entry); signatures.add(signature); }
  }
  return validateData(next);
}
