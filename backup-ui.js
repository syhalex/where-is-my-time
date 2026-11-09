import {dateKey, mergeData, pruneUnusedCategories, timeText, validDate} from './core.js';
import {LEGACY_KEYS, STORAGE_KEY, inspectBackup, listRecoverySources, loadStoredData} from './storage.js';

// An unreadable backup can still show recognizable rows without treating them as restorable.
function recordsByDate(document){
  const days=new Map();
  if(!Array.isArray(document?.entries))return days;
  const byId=items=>new Map((Array.isArray(items)?items:[]).filter(item=>item?.id!==undefined).map(item=>[item.id,item]));
  const events=byId(document.events), tags=byId(document.tags), categories=byId(document.categories);
  for(const entry of document.entries){
    if(typeof entry?.date!=='string'||!validDate(entry.date))continue;
    const event=events.get(entry.eventId)||tags.get(entry.tagId);
    const names=Array.isArray(entry.activities)?entry.activities.map(activity=>tags.get(activity?.tagId)?.name):[event?.name];
    const name=names.map(name=>typeof name==='string'&&name?name:'未知事件').join(' + ')||'未知事件';
    const category=categories.get(event?.categoryId)?.name;
    const color=typeof event?.color==='string'&&/^#[0-9a-f]{6}$/i.test(event.color)?event.color:'#BEC7B5';
    if(!days.has(entry.date))days.set(entry.date,[]);
    days.get(entry.date).push({start:entry.start,end:entry.end,name,category:typeof category==='string'?category:'',color});
  }
  for(const rows of days.values())rows.sort((a,b)=>(Number.isInteger(a.start)?a.start:Infinity)-(Number.isInteger(b.start)?b.start:Infinity));
  return days;
}

function download(text,filename){
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'})), link=document.createElement('a');
  link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function sourceName(item){
  if(item.key===STORAGE_KEY)return '当前存储原件';
  if(LEGACY_KEYS.includes(item.key))return `旧版存储原件 ${item.key}`;
  const date=new Date(item.createdAt);
  return Number.isNaN(date.getTime())?'本机副本':`本机副本 ${date.toLocaleString('zh-CN',{hour12:false})}`;
}

export function setupBackups({$,h,toast,openDatePicker,closeDatePicker,getData,getLocked,getRaw,restore}){
  const list=$('recoveryDialog'), preview=$('backupPreviewDialog'), dateField=$('backupDate'), dateButton=$('backupDateButton');
  const modes=[...preview.querySelectorAll('input[name="backupMode"]')];
  let sources=[], source, sourceDays, current, currentDays, result, resultDays, expectedRaw, mode, dates, fileRead=0;
  const closeMenu=()=>{$('backupMenu').hidden=true;$('backupButton').setAttribute('aria-expanded','false');};

  $('backupButton').onclick=()=>{
    $('backupMenu').hidden=!$('backupMenu').hidden;
    $('backupButton').setAttribute('aria-expanded',String(!$('backupMenu').hidden));
  };
  const exportCurrent=()=>{
    const raw=getLocked()?getRaw():null;
    download(raw??JSON.stringify({...getData(),exportedAt:new Date().toISOString()},null,2),`WhereIsMyTime-${raw===null?'backup':'recovery'}-${dateKey(new Date())}.json`);
    closeMenu();toast('备份已导出');
  };
  $('exportButton').onclick=$('storageExport').onclick=exportCurrent;
  $('recoverButton').onclick=$('storageRestore').onclick=()=>{
    closeMenu();
    try{
      sources=listRecoverySources(localStorage,{active:getLocked()}).map(item=>({...item,name:sourceName(item),days:recordsByDate(item.converted||item.raw)}));
      $('recoverySources').innerHTML=sources.map((item,index)=>{
        const days=[...item.days.keys()].sort();
        const summary=days.length?`${days.length} 个记录日期 ${days[0]}${days.length>1?` 至 ${days.at(-1)}`:''}`:'未找到有效记录日期';
        return `<article class="backup-source"><h3>${h(item.name)}</h3><p>${h(summary)}</p>${item.error?`<p class="form-error">${h(item.error)}</p>`:''}<div class="backup-source-actions"><button type="button" class="button quiet small" data-original="${index}">导出原件</button><button type="button" class="button primary small" data-preview="${index}">预览备份</button></div></article>`;
      }).join('')||'<p>此地址未找到本机备份。</p>';
      list.showModal();
    }catch(error){toast(`无法读取本机备份：${error.message}`);}
  };
  list.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-original')){
      const item=sources[Number(button.dataset.original)];
      const version=Number.isInteger(item.raw?.version)?item.raw.version:'unknown';
      download(item.text,`WhereIsMyTime-original-v${version}.json`);
    }
    if(button.hasAttribute('data-preview'))openPreview(sources[Number(button.dataset.preview)],'恢复本机备份');
  });

  $('importButton').onclick=()=>{++fileRead;closeMenu();$('importFile').value='';$('importFile').click();};
  $('importFile').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    const read=++fileRead;
    let item;
    try{item=file.size>25*1024*1024?{error:'备份文件超过 25 MB，无法读取'}:inspectBackup(await file.text());}
    catch{item={error:'无法读取此文件，请检查文件是否仍可访问'};}
    if(read===fileRead)openPreview({...item,name:file.name},'导入备份');
  };

  function openPreview(item,title){
    source=item;
    sourceDays=item.days||recordsByDate(item.converted||item.raw);
    $('backupPreviewTitle').textContent=title;
    $('backupFilename').textContent=item.name||'';
    $('backupFilename').hidden=!item.name;
    $('backupFileIssue').textContent=item.error||'';
    $('backupFileIssue').hidden=!item.error;
    $('backupModes').hidden=!item.converted;
    $('backupApply').hidden=!item.converted;
    try{readCurrent();}catch(error){toast(`无法读取当前记录：${error.message}`);return;}
    if(item.converted&&!current.locked)modes.find(input=>input.value==='merge').checked=true;
    updateMode([...sourceDays.keys()].sort().at(-1)||'');
    preview.showModal();
  }

  function readCurrent(){
    expectedRaw=localStorage.getItem(STORAGE_KEY);
    current=loadStoredData(localStorage,{readOnly:true});
    currentDays=current.locked?recordsByDate(inspectBackup(current.raw).raw):recordsByDate(pruneUnusedCategories(current.data));
    modes.forEach(input=>{input.checked=false;input.disabled=input.value==='merge'&&current.locked;});
    $('backupMergeHint').textContent=current.locked?'当前数据无法读取，合并找回不可用。':'保留现有记录并找回缺失时段。相同时段和事件只保留一条，冲突时暂停。';
  }

  function updateMode(preferredDate){
    if(dateButton.getAttribute('aria-expanded')==='true')closeDatePicker();
    mode=modes.find(input=>input.checked)?.value;
    let issue='';result=null;
    if(mode==='replace')result=pruneUnusedCategories(source.converted);
    if(mode==='merge'){
      try{result=pruneUnusedCategories(mergeData(current.data,source.converted));}
      catch(error){issue=`无法合并找回。${error.message}。可预览替换回滚的效果。`;}
    }
    resultDays=result?recordsByDate(result):sourceDays;
    $('backupActionIssue').textContent=issue;
    $('backupActionIssue').hidden=!issue;
    $('backupApply').disabled=!result;
    $('backupApply').classList.toggle('danger-solid',mode==='replace');
    $('backupApply').classList.toggle('primary',mode!=='replace');
    $('backupApply').textContent=mode==='replace'?'确认替换回滚':mode==='merge'?'确认合并找回':'确认恢复';
    $('backupBefore').hidden=!source.converted;
    $('backupBeforeTitle').textContent=result?mode==='replace'?'替换前':'合并前':'当前记录';
    $('backupAfterTitle').textContent=result?mode==='replace'?'替换后':'合并后':source.error?'可读取的备份记录':'备份内容';
    $('backupDatePrompt').textContent=mode==='replace'?'替换前后变化：':'合并前后变化：';
    $('backupDatePrompt').hidden=!result;
    dates=new Set(result||mode==='merge'?[...currentDays.keys(),...resultDays.keys()]:sourceDays.keys());
    const describe=(rows,entries)=>`${entries.length} 条记录 ${rows.size} 个日期`;
    $('backupBeforeCount').textContent=current.locked?'当前数据无法读取':describe(currentDays,current.data.entries);
    $('backupAfterCount').textContent=result?describe(resultDays,result.entries):source.converted?describe(sourceDays,source.converted.entries):`${sourceDays.size} 个可预览日期`;
    dateField.value=dates.has(preferredDate)?preferredDate:[...dates].sort().at(-1)||'';
    $('backupDateNav').hidden=!dates.size;
    renderDay();
  }

  function renderDay(){
    const date=dateField.value;
    const changed=result&&JSON.stringify(currentDays.get(date)||[])!==JSON.stringify(resultDays.get(date)||[]);
    $('backupDateValue').textContent=changed?`${date} 有变化`:date;
    const minute=value=>Number.isInteger(value)&&value>=0&&value<=1440?timeText(value):'时间无效';
    const markup=rows=>rows?.length?rows.map(row=>`<div class="backup-record"><span>${minute(row.start)}–${minute(row.end)}</span><i class="legend-dot" style="background:${row.color}"></i><div><strong>${h(row.name)}</strong>${row.category?`<small>${h(row.category)}</small>`:''}</div></div>`).join(''):'<p class="backup-empty">没有可预览的记录</p>';
    $('backupBeforeRows').innerHTML=markup(currentDays.get(date));
    $('backupAfterRows').innerHTML=markup(resultDays.get(date));
  }

  modes.forEach(input=>input.onchange=()=>updateMode(dateField.value));
  dateButton.onclick=()=>openDatePicker(dateField.id,dateButton,{
    dates,onSelect(date){dateField.value=date;renderDay();}
  });
  $('backupApply').onclick=()=>{
    if(!result)return;
    try{
      if(localStorage.getItem(STORAGE_KEY)!==expectedRaw){
        readCurrent();updateMode(dateField.value);toast('当前记录已变化，请重新核对恢复预览');return;
      }
      if(restore(result,expectedRaw,Boolean(source.key))){
        preview.close();if(list.open)list.close();
        toast(mode==='replace'?(current.raw===null?'已替换为备份记录':'已替换为备份记录，替换前的本机原件已保留'):'已合并备份记录');
      }
    }catch(error){toast(error.message);}
  };
  return {closeMenu};
}
