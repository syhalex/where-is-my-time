import {VERSION,emptyData,readBackup,validateData,uid} from './core.js';

// This key is permanent. Schema versions belong inside the saved document.
export const STORAGE_KEY='where-is-my-time.data';
export const BACKUP_PREFIX='where-is-my-time.backup.';
export const LEGACY_KEYS=['where-is-my-time.data.v4','where-is-my-time.data.v3','where-is-my-time.data.v2','shiji.time.v1'];
const RECOVERY_PREFIX='where-is-my-time.recovery.';
export const BACKUP_LIMIT=5;

function savedSnapshots(storage){
  const snapshots=[];
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);
    if(!key?.startsWith(BACKUP_PREFIX)&&!key?.startsWith(RECOVERY_PREFIX))continue;
    const text=storage.getItem(key);
    if(text===null)continue;
    try{
      const snapshot=JSON.parse(text);
      const createdAt=typeof snapshot?.createdAt==='string'?snapshot.createdAt:undefined;
      if(typeof snapshot?.raw==='string')snapshots.push({key,text:snapshot.raw,createdAt,managed:key.startsWith(BACKUP_PREFIX)});
      else if(snapshot?.raw!==undefined||snapshot?.source){
        const original=snapshot.raw===undefined?snapshot.source:snapshot.raw;
        snapshots.push({key,text:typeof original==='string'?original:JSON.stringify(original),createdAt});
      }
      else snapshots.push({key,text,issue:'本机副本缺少原始数据'});
    }catch{snapshots.push({key,text,issue:'本机副本的封装不是有效的 JSON'});}
  }
  return snapshots.sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)||b.key.localeCompare(a.key));
}

export function preserveOriginal(storage,sourceKey,raw){
  const snapshots=savedSnapshots(storage).filter(snapshot=>snapshot.managed);
  const unique=new Map();
  for(const snapshot of snapshots){
    if(unique.has(snapshot.text))storage.removeItem(snapshot.key);
    else unique.set(snapshot.text,snapshot);
  }
  const existing=unique.get(raw);
  if(existing){
    const others=[...unique.values()].filter(snapshot=>snapshot!==existing);
    for(const snapshot of others.slice(BACKUP_LIMIT-1))storage.removeItem(snapshot.key);
    return existing.key;
  }
  const last=Date.parse(snapshots[0]?.createdAt),now=Date.now();
  const timestamp=Number.isFinite(last)&&last<8.64e15?Math.max(now,last+1):now;
  const key=BACKUP_PREFIX+timestamp+'.'+uid();
  const text=JSON.stringify({createdAt:new Date(timestamp).toISOString(),sourceKey,raw});
  storage.setItem(key,text);
  if(storage.getItem(key)!==text)throw new Error('原始备份校验失败，已停止升级');
  // Keep the new copy before removing older distinct snapshots.
  for(const snapshot of [...unique.values()].slice(BACKUP_LIMIT-1))storage.removeItem(snapshot.key);
  return key;
}
function verifyMigration(raw,next){
  if(raw.entries.length!==next.entries.length)throw new Error('迁移前后记录数量不一致');
  const records=new Map(next.entries.map(entry=>[entry.id,entry]));
  for(const old of raw.entries){
    const entry=records.get(old.id);
    if(!entry||entry.date!==old.date||entry.start!==old.start||entry.end!==old.end)throw new Error('迁移前后时段不一致');
  }
  if(raw.categories){
    if(raw.categories.length!==next.categories.length)throw new Error('迁移前后分类数量不一致');
    for(const old of raw.categories){const category=next.categories.find(item=>item.id===old.id);if(!category||category.name!==old.name.trim().replace(/\s+/g,' ')||category.color!==old.color)throw new Error('迁移前后分类不一致');}
  }
}
function activate(storage,next,metadata={}){
  const data=validateData(next),text=JSON.stringify({...data,...metadata,version:VERSION});
  // localStorage.setItem is atomic: quota failures leave the previous value intact.
  storage.setItem(STORAGE_KEY,text);
  return data;
}
export function loadStoredData(storage,{readOnly=false}={}){
  let sourceKey=STORAGE_KEY,raw=null,backupKey=null;
  try{
    raw=storage.getItem(STORAGE_KEY);
    if(raw===null){for(const key of LEGACY_KEYS){const value=storage.getItem(key);if(value!==null){sourceKey=key;raw=value;break;}}}
    if(raw===null)return {data:emptyData(),raw:null,locked:false,migrated:false};
    // Preserve the exact original before attempting a migration.
    const storedVersion=(()=>{try{return JSON.parse(raw)?.version;}catch{return null;}})();
    const needsUpgrade=sourceKey!==STORAGE_KEY||storedVersion!==VERSION;
    if(needsUpgrade&&!readOnly)backupKey=preserveOriginal(storage,sourceKey,raw);
    const original=JSON.parse(raw),next=readBackup(original);
    verifyMigration(original,next);
    if(needsUpgrade&&!readOnly)activate(storage,next,{updatedAt:original.updatedAt||new Date().toISOString()});
    return {data:next,raw,locked:false,migrated:needsUpgrade&&!readOnly,backupKey};
  }catch(error){return {data:emptyData(),raw,locked:true,migrated:false,backupKey,error:error.message};}
}
export function writeStoredData(storage,next,{recovery=false,expectedRaw}={}){
  const checked=validateData(next),raw=storage.getItem(STORAGE_KEY);
  if(expectedRaw!==undefined&&raw!==expectedRaw)throw new Error('当前记录已变化，请重新核对恢复预览');
  if(raw!==null){
    if(recovery)preserveOriginal(storage,STORAGE_KEY,raw);
    else validateData(JSON.parse(raw)); // An older open page must never overwrite a future schema.
  }
  if(expectedRaw!==undefined&&storage.getItem(STORAGE_KEY)!==expectedRaw)throw new Error('当前记录已变化，请重新核对恢复预览');
  return activate(storage,checked,{updatedAt:new Date().toISOString()});
}
export function inspectBackup(text){
  let raw;
  try{raw=JSON.parse(text);}catch(error){
    const line=error.message.match(/line (\d+) column (\d+)/),position=error.message.match(/position (\d+)/);
    const location=line?`第 ${line[1]} 行第 ${line[2]} 列`:position?`偏移 ${position[1]}`:'';
    return {error:`JSON 格式错误${location?`（${location}）`:''}，文件可能损坏或未完整导出`};
  }
  try{return {raw,converted:readBackup(raw)};}catch(error){return {raw,error:error.message};}
}
export function listRecoverySources(storage,{active=false}={}){
  const sources=savedSnapshots(storage),seen=new Set();
  for(const key of [...(active?[STORAGE_KEY]:[]),...LEGACY_KEYS]){
    const text=storage.getItem(key);
    if(text!==null)sources.push({key,text});
  }
  return sources.filter(source=>{
    if(seen.has(source.text))return false;
    seen.add(source.text);return true;
  }).map(source=>({...source,...(source.issue?{error:source.issue}:inspectBackup(source.text))}));
}
