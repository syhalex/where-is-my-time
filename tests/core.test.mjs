import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERSION, emptyData, saveEntry, parseTime, validateData, mergeData, renameEvent,
  dateKey, addDays, totals, categoryTotals, saveCategory, deleteCategory,
  continuationRange, snapMinute, PALETTE, nextEventColor, randomColorOptions,
  colorDistance, heatColor, recordedMinutes, hexToHsv, hsvToHex,
  pruneUnusedEvents, restoreEntry, OTHER_TIME_EVENT, statisticsEntries, categoryFocus
} from '../core.js';

const first = {date:'2026-10-29',start:540,end:600,name:'写作',color:'#89A996'};
const record = (data, changes={}) => saveEntry(data,{...first,...changes});
const invalidCopy = (data, change) => { const copy=structuredClone(data);change(copy);return copy; };

test('each record contains one event reference and derives its duration from the range',()=>{
  const data=record(emptyData(),{name:'C++练习'});
  assert.equal(data.version,VERSION);assert.equal(data.events.length,1);
  assert.equal(data.events[0].name,'C++练习');
  assert.deepEqual(Object.keys(data.entries[0]).sort(),['date','end','eventId','id','start']);
  assert.equal(data.entries[0].eventId,data.events[0].id);assert.equal(totals(data.entries)[0][1],60);
});

test('editing either boundary updates every duration total without retaining a stale value',()=>{
  const original=record(emptyData(),{start:565,end:670,name:'玩'});
  const edited=record(original,{id:original.entries[0].id,start:525,end:700,name:'玩'});
  assert.equal(totals(edited.entries)[0][1],175);assert.equal(recordedMinutes(edited.entries),175);
  assert.equal(totals(original.entries)[0][1],105);assert.equal(edited.events.length,1);
});

test('identical normalized names reuse the same event and category',()=>{
  const original=record(emptyData(),{name:' 阅读  论文 ',categoryId:'study'});
  const next=record(original,{name:'阅读 论文',start:600,end:660,color:'#93A8CF'});
  assert.equal(next.events.length,1);assert.equal(next.events[0].categoryId,'study');
  assert.equal(next.events[0].color,'#93A8CF');assert.equal(totals(next.entries)[0][1],120);
});

test('five-minute times include midnight and 24:00',()=>{
  assert.equal(parseTime('00:00'),0);assert.equal(parseTime('17:55'),1075);assert.equal(parseTime('24:00'),1440);
  for(const text of ['24:05','18:03','7:00','-1:00',''])assert.equal(parseTime(text),null);
  assert.doesNotThrow(()=>record(emptyData(),{start:1075,end:1085}));
});

test('record validation rejects empty names, invalid dates, colors and ranges',()=>{
  for(const changes of [{name:''},{name:'x'.repeat(81)},{date:'2026-02-30'},{color:'green'},{start:541},{end:540},{start:-5},{end:1445},{categoryId:'missing'}])assert.throws(()=>record(emptyData(),changes));
});

test('overlaps are blocked but touching records and self-edits are accepted',()=>{
  const data=record(emptyData());
  assert.throws(()=>record(data,{start:595,end:650}),/已有记录/);
  assert.doesNotThrow(()=>record(data,{start:600,end:660}));
  assert.doesNotThrow(()=>record(data,{id:data.entries[0].id,start:535,end:605}));
});

test('replacing or deleting the final reference removes the unused event',()=>{
  const data=record(emptyData());const changed=record(data,{id:data.entries[0].id,name:'跑步'});
  assert.deepEqual(changed.events.map(e=>e.name),['跑步']);
  assert.equal(pruneUnusedEvents({...data,entries:[]}).events.length,0);
});

test('renaming to an existing event merges references and retains record ranges',()=>{
  let data=record(emptyData());data=record(data,{name:'阅读',start:600,end:640});
  const renamed=renameEvent(data,data.events[0].id,'阅读');
  assert.equal(renamed.events.length,1);assert.equal(new Set(renamed.entries.map(e=>e.eventId)).size,1);
  assert.equal(totals(renamed.entries)[0][1],100);assert.equal(data.events.length,2);
});

test('undo restores a pruned event or reuses a recreated name',()=>{
  const data=record(emptyData()),entry=data.entries[0],saved=data.events[0];
  const blank=pruneUnusedEvents({...data,entries:[]});assert.deepEqual(restoreEntry(blank,entry,saved),data);
  const recreated=record(blank,{start:600,end:630});const restored=restoreEntry(recreated,entry,saved);
  assert.equal(restored.events.length,1);assert.equal(restored.entries.length,2);
  assert.throws(()=>restoreEntry(blank,entry,{...saved,id:'wrong'}));
});

test('undo after category deletion restores the event as unclassified',()=>{
  const data=record(emptyData(),{categoryId:'study'});const blank=deleteCategory(pruneUnusedEvents({...data,entries:[]}),'study');
  assert.equal(restoreEntry(blank,data.entries[0],data.events[0]).events[0].categoryId,null);
});

test('categories can be created, renamed, merged and deleted without deleting records',()=>{
  let data=saveCategory(record(emptyData(),{categoryId:'study'}),{name:'工作',color:'#D99789'});assert.equal(data.categories.length,5);
  data=saveCategory(data,{id:'study',name:'工作',color:'#93A8CF'});
  assert.equal(data.categories.length,4);assert.equal(data.events[0].categoryId,data.categories.find(c=>c.name==='工作').id);
  data=deleteCategory(data,data.events[0].categoryId);assert.equal(data.events[0].categoryId,null);assert.equal(data.entries.length,1);
});

test('backup validation round-trips the current single-event schema',()=>{
  const data=record(emptyData(),{categoryId:'study'});assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))),data);
  assert.throws(()=>validateData({...data,version:VERSION-1}),/版本/);
});

test('backups reject duplicate names and IDs, invalid references and overlapping ranges',()=>{
  const data=record(emptyData());
  for(const change of [d=>d.events.push({...d.events[0]}),d=>d.events.push({...d.events[0],id:'new'}),d=>{d.events[0].categoryId='missing';},d=>{d.entries[0].eventId='missing';},d=>d.entries.push({...d.entries[0],id:'other'}),d=>{d.entries[0].end=602;},d=>d.categories.push({...d.categories[0]})])assert.throws(()=>validateData(invalidCopy(data,change)));
});

test('backup merge maps events and categories by name and deduplicates matching records',()=>{
  const data=record(emptyData(),{categoryId:'study'});let incoming=record(emptyData(),{categoryId:'study',color:'#D99789'});
  incoming=record(incoming,{name:'跑步',start:600,end:630,categoryId:'exercise'});const merged=mergeData(data,incoming);
  assert.equal(merged.entries.length,2);assert.equal(merged.events.length,2);assert.equal(merged.categories.length,4);
  assert.equal(merged.events.find(e=>e.name==='写作').color,first.color);
  assert.throws(()=>mergeData(data,record(emptyData(),{name:'冲突',start:560,end:580})),/重叠/);
});

test('past-day statistics fill leading, internal and trailing gaps with unclassified other time',()=>{
  let data=record(emptyData(),{categoryId:'study'});data=record(data,{name:'运动',start:660,end:720,categoryId:'exercise'});
  const stats=statisticsEntries(data,'2026-10-30'),other=stats.filter(e=>e.automatic);
  assert.deepEqual(other.map(e=>[e.start,e.end]),[[0,540],[600,660],[720,1440]]);assert.ok(other.every(e=>e.eventId===OTHER_TIME_EVENT.id));
  assert.equal(recordedMinutes(stats),1440);assert.deepEqual(categoryTotals(data,stats),[[null,1320],['study',60],['exercise',60]]);
});

test('only observed past dates are completed, leaving today, future and empty dates alone',()=>{
  let data=record(emptyData(),{date:'2026-10-27'});data=record(data);data=record(data,{date:'2026-10-30'});
  const stats=statisticsEntries(data,'2026-10-29');assert.deepEqual([...new Set(stats.filter(e=>e.automatic).map(e=>e.date))],['2026-10-27']);
  assert.ok(!stats.some(e=>e.date==='2026-10-28'));assert.equal(statisticsEntries(emptyData(),'2026-10-29').length,0);
});

test('complete past days need no gaps and incomplete observed days total 24 hours',()=>{
  let data=record(emptyData(),{start:0,end:1440});data=record(data,{date:'2026-10-28'});const stats=statisticsEntries(data,'2026-10-30');
  assert.ok(!stats.some(e=>e.date===first.date&&e.automatic));
  for(const date of ['2026-10-28',first.date])assert.equal(recordedMinutes(stats.filter(e=>e.date===date)),1440);
});

test('backfilling and deleting manual records recalculate other time without mutating storage',()=>{
  const original=record(emptyData()),before=JSON.stringify(original);
  assert.equal(totals(statisticsEntries(original,'2026-10-30')).find(([id])=>id===OTHER_TIME_EVENT.id)[1],1380);
  const filled=record(original,{start:600,end:660});assert.equal(totals(statisticsEntries(filled,'2026-10-30')).find(([id])=>id===OTHER_TIME_EVENT.id)[1],1320);
  assert.equal(JSON.stringify(original),before);assert.deepEqual(statisticsEntries({...filled,entries:[]},'2026-10-30'),[]);
});

test('rolling to the next local date completes the previous day on demand',()=>{
  const data=record(emptyData());assert.equal(statisticsEntries(data,'2026-10-29').filter(e=>e.automatic).length,0);
  const nextDay=statisticsEntries(data,'2026-10-30');assert.equal(nextDay.filter(e=>e.automatic).reduce((s,e)=>s+e.end-e.start,0),1380);
  assert.equal(data.entries.length,1);assert.equal(data.events.length,1);
});

test('focus share includes other time in its denominator and supports unclassified',()=>{
  const data=record(emptyData(),{categoryId:'study'}),stats=statisticsEntries(data,'2026-10-30');
  assert.deepEqual(categoryFocus(data,stats,'study'),{minutes:60,total:1440,share:60/1440});
  assert.deepEqual(categoryFocus(data,stats,null),{minutes:1380,total:1440,share:1380/1440});assert.deepEqual(categoryFocus(data,[],'study'),{minutes:0,total:0,share:0});
});

test('automatic other time remains absent from backups and does not capture a similarly named event',()=>{
  const data=record(emptyData(),{name:'其他时间',categoryId:'study'}),before=structuredClone(data);const stats=statisticsEntries(data,'2026-10-30');
  assert.deepEqual(data,before);assert.deepEqual(validateData(data),before);assert.deepEqual(categoryTotals(data,stats),[[null,1380],['study',60]]);
  assert.throws(()=>validateData({...data,entries:stats}));assert.throws(()=>renameEvent(data,OTHER_TIME_EVENT.id,'新名称'),/自动统计/);
});

test('continuation and boundary snapping keep exact adjacent five-minute ranges',()=>{
  assert.equal(continuationRange([]),null);assert.deepEqual(continuationRange([{end:1230},{end:600}]),[1230,1260]);assert.equal(continuationRange([{end:1440}]),null);
  assert.equal(snapMinute(1233,[1230]),1230);assert.equal(snapMinute(1238,[1230]),1240);assert.equal(snapMinute(-10),0);assert.equal(snapMinute(1450),1440);
});

test('calendar arithmetic respects local month and leap-year boundaries',()=>{
  assert.equal(dateKey(new Date(2026,9,30,23,59)),'2026-10-30');assert.equal(addDays('2026-10-31',1),'2026-11-01');assert.equal(addDays('2024-02-28',1),'2024-02-29');
});

test('new colors avoid existing and recently offered colors with perceptual separation',()=>{
  let seed=123456789;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};const recent=[];
  for(let i=0;i<12;i++) {const color=nextEventColor(PALETTE,random,recent);assert.ok(!PALETTE.includes(color));assert.ok(!recent.includes(color));assert.ok(Math.min(...PALETTE.map(used=>colorDistance(used,color)))>.25);recent.push(color);}
  const a=randomColorOptions(PALETTE,'#ABCDEF',8,random),b=randomColorOptions(PALETTE,'#ABCDEF',8,random,a);
  assert.equal(a[0],'#ABCDEF');assert.equal(new Set(a).size,8);assert.ok(b.slice(1).every(color=>!a.includes(color)));
});

test('visual picker and hexadecimal input share accurate HSV conversion',()=>{
  for(const hex of ['#89A996','#FF0000','#00FF00','#0000FF','#000000','#FFFFFF','#3DC0C9'])assert.equal(hsvToHex(hexToHsv(hex)),hex);
});

test('annual heat uses the selected category color with monotonic intensity',()=>{
  assert.equal(heatColor('#93A8CF',0),'#EEF1E8');assert.equal(heatColor('#93A8CF',1440),'#93A8CF');assert.notEqual(heatColor('#93A8CF',60),heatColor('#93A8CF',600));
});
