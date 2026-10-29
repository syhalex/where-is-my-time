import {VERSION,emptyData,readBackup,validateData,uid} from './core.js';

// This key is permanent. Schema versions belong inside the saved document.
export const STORAGE_KEY='where-is-my-time.data';
export const BACKUP_PREFIX='where-is-my-time.backup.';
export const LEGACY_KEYS=['where-is-my-time.data.v4','where-is-my-time.data.v3','where-is-my-time.data.v2','shiji.time.v1'];

export function preserveOriginal(storage,sourceKey,raw){
  const key=BACKUP_PREFIX+Date.now()+'.'+uid();
  const text=JSON.stringify({createdAt:new Date().toISOString(),sourceKey,raw});
  storage.setItem(key,text);
  if(storage.getItem(key)!==text)throw new Error('原始备份校验失败，已停止升级');
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
export function loadStoredData(storage){
  let sourceKey=STORAGE_KEY,raw=null,backupKey=null;
  try{
    raw=storage.getItem(STORAGE_KEY);
    if(raw===null){for(const key of LEGACY_KEYS){const value=storage.getItem(key);if(value!==null){sourceKey=key;raw=value;break;}}}
    if(raw===null)return {data:emptyData(),raw:null,locked:false,migrated:false};
    // Every attempted upgrade gets an exact original, including malformed documents.
    const storedVersion=(()=>{try{return JSON.parse(raw)?.version;}catch{return null;}})();
    const needsUpgrade=sourceKey!==STORAGE_KEY||storedVersion!==VERSION;
    if(needsUpgrade)backupKey=preserveOriginal(storage,sourceKey,raw);
    const original=JSON.parse(raw),next=readBackup(original);
    verifyMigration(original,next);
    if(needsUpgrade)activate(storage,next,{updatedAt:original.updatedAt||new Date().toISOString()});
    return {data:next,raw,locked:false,migrated:needsUpgrade,backupKey};
  }catch(error){return {data:emptyData(),raw,locked:true,migrated:false,backupKey,error:error.message};}
}
export function writeStoredData(storage,next,{recovery=false}={}){
  const checked=validateData(next),raw=storage.getItem(STORAGE_KEY);
  if(raw!==null){
    if(recovery)preserveOriginal(storage,STORAGE_KEY,raw);
    else validateData(JSON.parse(raw)); // An older open page must never overwrite a future schema.
  }
  return activate(storage,checked,{updatedAt:new Date().toISOString()});
}
export function listRecoverySources(storage){
  const sources=[];
  const add=(key,text)=>{
    if(typeof text!=='string')text=JSON.stringify(text);
    let raw,converted,error;
    try{raw=JSON.parse(text);converted=readBackup(raw);}catch(problem){error=problem.message;}
    sources.push({key,text,raw,converted,error});
  };
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);
    if(LEGACY_KEYS.includes(key))add(key,storage.getItem(key));
    else if(key.startsWith(BACKUP_PREFIX)||key.startsWith('where-is-my-time.recovery.')){
      try{const snapshot=JSON.parse(storage.getItem(key));if(snapshot.raw!==undefined)add(key,snapshot.raw);else if(snapshot.source)add(key,snapshot.source);}catch{}
    }
  }
  return sources.sort((a,b)=>(b.converted?.entries.length||0)-(a.converted?.entries.length||0));
}
