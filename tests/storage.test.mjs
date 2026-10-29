import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyData,saveEntry,VERSION} from '../core.js';
import {STORAGE_KEY,BACKUP_PREFIX,LEGACY_KEYS,loadStoredData,writeStoredData,listRecoverySources} from '../storage.js';
function memory(initial={}){
  const map=new Map(Object.entries(initial));
  return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),map};
}
const current=()=>saveEntry(emptyData(),{name:'阅读',date:'2026-10-29',start:540,end:600,color:'#89A996',categoryId:'study'});
function legacy(){const data=current();return {version:3,categories:data.categories,tags:data.events,entries:data.entries.map(({eventId,...entry})=>({...entry,activities:[{tagId:eventId,minutes:60}]}))};}
test('empty storage is writable and uses a permanent unversioned key',()=>{
  const storage=memory();assert.equal(loadStoredData(storage).locked,false);writeStoredData(storage,current());assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version,VERSION);assert.ok(!STORAGE_KEY.endsWith('.v4'));
});
test('upgrade preserves exact original before activating and leaves the legacy key intact',()=>{
  const raw=JSON.stringify(legacy(),null,2),storage=memory({[LEGACY_KEYS.at(-1)]:raw}),writes=[];
  const original=storage.setItem;storage.setItem=(key,value)=>{writes.push(key);return original(key,value);};
  const loaded=loadStoredData(storage);
  assert.equal(loaded.migrated,true);assert.equal(loaded.data.entries.length,1);assert.equal(loaded.data.events[0].categoryId,'study');
  assert.ok(writes[0].startsWith(BACKUP_PREFIX));assert.equal(writes[1],STORAGE_KEY);
  assert.equal(JSON.parse(storage.getItem(loaded.backupKey)).raw,raw);assert.equal(storage.getItem(LEGACY_KEYS.at(-1)),raw);
});
test('a versioned v4 key is adopted once, with no repeated snapshots on refresh',()=>{
  const storage=memory({[LEGACY_KEYS[0]]:JSON.stringify(current())});loadStoredData(storage);const size=storage.length;
  assert.equal(loadStoredData(storage).migrated,false);assert.equal(storage.length,size);
});
test('stable data is authoritative even when an older key has more records',()=>{
  const storage=memory({[STORAGE_KEY]:JSON.stringify(emptyData()),[LEGACY_KEYS[0]]:JSON.stringify(current())});assert.equal(loadStoredData(storage).data.entries.length,0);
});
test('invalid references leave original data intact and lock writes',()=>{
  const old=legacy();old.entries[0].activities[0].tagId='missing';const raw=JSON.stringify(old),storage=memory({[STORAGE_KEY]:raw});
  const loaded=loadStoredData(storage);assert.equal(loaded.locked,true);assert.equal(storage.getItem(STORAGE_KEY),raw);assert.equal(listRecoverySources(storage).length,1);assert.ok(listRecoverySources(storage)[0].error);
});
test('malformed data remains exportable from its exact snapshot',()=>{
  const raw='{incomplete',storage=memory({[STORAGE_KEY]:raw});const loaded=loadStoredData(storage);
  assert.equal(loaded.locked,true);assert.equal(JSON.parse(storage.getItem(loaded.backupKey)).raw,raw);assert.equal(storage.getItem(STORAGE_KEY),raw);
});
test('backup quota failure stops migration before changing any source',()=>{
  const raw=JSON.stringify(legacy()),storage=memory({[LEGACY_KEYS[0]]:raw});storage.setItem=()=>{throw new Error('quota');};
  assert.equal(loadStoredData(storage).locked,true);assert.equal(storage.getItem(STORAGE_KEY),null);assert.equal(storage.getItem(LEGACY_KEYS[0]),raw);
});
test('activation failure retains backup and old key, and can retry successfully',()=>{
  const raw=JSON.stringify(legacy()),storage=memory({[LEGACY_KEYS[0]]:raw}),set=storage.setItem;
  storage.setItem=(key,value)=>{if(key===STORAGE_KEY)throw new Error('quota');return set(key,value);};
  const failed=loadStoredData(storage);assert.equal(failed.locked,true);assert.ok(failed.backupKey);assert.equal(storage.getItem(STORAGE_KEY),null);
  storage.setItem=set;assert.equal(loadStoredData(storage).migrated,true);
});
test('future schemas stay untouched and cannot be overwritten by an older app',()=>{
  const raw=JSON.stringify({...current(),version:99}),storage=memory({[STORAGE_KEY]:raw});assert.equal(loadStoredData(storage).locked,true);
  assert.throws(()=>writeStoredData(storage,current()));assert.equal(storage.getItem(STORAGE_KEY),raw);
});
test('recovery writes preserve the previous active document and support rollback',()=>{
  const raw=JSON.stringify(current()),storage=memory({[STORAGE_KEY]:raw});writeStoredData(storage,emptyData(),{recovery:true});
  const backup=listRecoverySources(storage)[0];assert.equal(backup.text,raw);writeStoredData(storage,backup.converted,{recovery:true});assert.equal(loadStoredData(storage).data.entries.length,1);
});
