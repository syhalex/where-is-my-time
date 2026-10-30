import { PALETTE, OTHER_TIME_EVENT, emptyData, normalizeName, dateKey, fromKey, addDays, timeText, parseTime, durationText, validDate, entriesOn, getEvent, getCategory, totals, categoryTotals, statisticsEntries, categoryFocus, saveCategory, deleteCategory, continuationRange, snapMinute, nextEventColor, randomColorOptions, heatColor, hexToHsv, hsvToHex, recordedMinutes, pruneUnusedEvents, restoreEntry, saveEntry, renameEvent, validateData, readBackup, mergeData } from './core.js';
import {STORAGE_KEY,loadStoredData,writeStoredData,listRecoverySources,preserveOriginal} from './storage.js';

const $ = id => document.getElementById(id);
const h = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paths = {
  left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>', down: '<path d="m7 10 5 5 5-5"/>', plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
  events: '<path d="M3 4h8l10 10-7 7L3 10Z"/><circle cx="7.5" cy="8" r="1"/>', backup: '<path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/>', filter: '<path d="M4 5h16l-6 7v7l-4-2v-5Z"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>', collapse: '<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"/>',
  palette: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 8 8c0 3-4 0-5 2s2 6-2 6"/><circle cx="8" cy="9" r=".8"/><circle cx="12" cy="7.5" r=".8"/><circle cx="16" cy="9" r=".8"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>', check: '<path d="m5 12 4 4L19 6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', calendar: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-11 4h2m3 0h2m-7 3h2"/>'
};
const icon = name => `<svg${name==='down'?' class="dropdown-chevron"':''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
const FOCUS_KEY = 'where-is-my-time.focus-category.v1';
let data = emptyData(), rawStorage = null, persistenceLocked = false, selected = dateKey(new Date()), cursor = selected, view = 'month', filter = null;
let editing = null, modalColor = PALETTE[0], imported = null, toastTimer, drag = null, confirmAction = null;
let pickerCursor = selected, pickerMonthMode = false, categoryTarget = null, categoryFormColor = PALETTE[0], colorTarget = null, hoverTrack = null;
let aggregation = 'events', yearCategory = 'study', modalColorManual = false, modalMatchedName = null, modalCategoryId = null;
let focusCategory = 'study', statisticalCache = null, calendarDay = dateKey(new Date()), midnightTimer;
let entryPalette = [], categoryPalette = [], pickerPalette = [];
let colorHsv = {h:0,s:0,v:1};
const colorHistory = new Set();
function rememberColors(colors) { colors.forEach(c=>colorHistory.add(c));while(colorHistory.size>1024)colorHistory.delete(colorHistory.values().next().value); }
function freshColor(extra = []) { const color=nextEventColor([...usedColors(),...extra],Math.random,[...colorHistory]); rememberColors([color]); return color; }
function freshPalette(color) { const colors=randomColorOptions(usedColors(),color,8,Math.random,[...colorHistory]); rememberColors(colors); return colors; }
const dropdownAnchors = new Map();
const monthHighlights = new Map();
let startup;
try { startup=loadStoredData(localStorage); }
catch(error){startup={data:emptyData(),raw:null,locked:true,error:error.message};}
data=startup.data;rawStorage=startup.raw;persistenceLocked=startup.locked;
try {
  const stored = localStorage.getItem(FOCUS_KEY);
  if (stored !== null) { const id = JSON.parse(stored); if (id === null || typeof id === 'string') focusCategory = id; }
} catch { /* Keep the default category if the saved preference cannot be read. */ }

function toast(message, actionLabel, action) {
  clearTimeout(toastTimer); $('toast').innerHTML = `<span>${h(message)}</span>${actionLabel ? `<button>${h(actionLabel)}</button>` : ''}`; $('toast').hidden = false;
  if (action) $('toast').querySelector('button').onclick = () => { $('toast').hidden = true; try { action(); } catch (error) { toast(error.message); } };
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, action ? 9000 : 5000);
}
function commit(next, allowRecovery = false) {
  if (persistenceLocked && !allowRecovery) { toast('本地数据无法读取，请先导出备份，再导入有效备份'); return false; }
  try { next=writeStoredData(localStorage,pruneUnusedEvents(next),{recovery:allowRecovery}); }
  catch(error){toast(`未能保存记录：${error.message}。请保留备份并使用恢复入口`);return false;}
  data = next; persistenceLocked = false;$('storageNotice').hidden=true;
  if (!validFilter()) filter = null;
  render(); return true;
}
const weekday = key => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][fromKey(key).getDay()];
const fullDate = key => { const d = fromKey(key); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekday(key)}`; };
const sortedEvents = () => [...data.events].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
const usedColors = () => [...data.events, ...data.categories, OTHER_TIME_EVENT].map(t => t.color);
const validFilter = () => !filter || (filter.kind === 'events' ? !!getEvent(data, filter.id) : filter.id === null || !!getCategory(data, filter.id));
const filteredEntries = entries => view === 'year' || !filter ? entries : entries.filter(entry=>filter.kind==='events'?entry.eventId===filter.id:(getEvent(data,entry.eventId).categoryId||null)===filter.id);
const displayGroup = (id, mode = aggregation) => mode === 'events' ? getEvent(data, id) : getCategory(data, id) || { id: null, name: '未分类', color: '#BEC7B5' };
const displayTotals = entries => aggregation === 'events' ? totals(entries) : categoryTotals(data, entries);
function statisticalRecords() {
  const today = dateKey(new Date());
  if (statisticalCache?.data !== data || statisticalCache.today !== today) {
    const entries = statisticsEntries(data,today), byDate = new Map();
    for (const entry of entries) { if (!byDate.has(entry.date)) byDate.set(entry.date,[]); byDate.get(entry.date).push(entry); }
    statisticalCache = {data,today,entries,byDate};
  }
  return statisticalCache;
}
function entryBackground(entry, mode='events') { const item=getEvent(data,entry.eventId);return (mode==='events'?item.color:displayGroup(item.categoryId,'categories').color)+'70'; }
function weekStart(key) { return addDays(key, -((fromKey(key).getDay() + 6) % 7)); }
function periodRange(mode=view,key=cursor) {
  const d = fromKey(key), y = d.getFullYear(), m = d.getMonth();
  if (mode === 'month') return [dateKey(new Date(y, m, 1, 12)), dateKey(new Date(y, m + 1, 1, 12))];
  if (mode === 'week') { const first = weekStart(key); return [first, addDays(first, 7)]; }
  if (mode === 'day') return [key, addDays(key, 1)];
  return [`${y}-01-01`, `${y + 1}-01-01`];
}
function fullPeriodEntries() { const [start,end] = periodRange(); return statisticalRecords().entries.filter(entry=>entry.date>=start&&entry.date<end); }
function periodEntries() { return filteredEntries(fullPeriodEntries()); }
function selectDate(key) {
  if (!validDate(key)) { toast('请选择 1900 年至 9999 年之间的有效日期'); return; }
  selected = key; cursor = key; render();
}
function periodMove(amount) {
  const d = fromKey(cursor);
  if (view === 'month') { d.setDate(1); d.setMonth(d.getMonth() + amount); }
  else if (view === 'year') { d.setMonth(0, 1); d.setFullYear(d.getFullYear() + amount); }
  else d.setDate(d.getDate() + amount * (view === 'week' ? 7 : 1));
  const next = dateKey(d); if (validDate(next)) { cursor = next; renderOverview(); }
}
function renderFocusChoices() {
  $('focusCategoryChoices').innerHTML = [...data.categories,{id:'',name:'未分类',color:'#BEC7B5'}].map(category=>pickerOption(category,`data-focus-category="${h(category.id)}"`,(category.id||null)===focusCategory)).join('');
}
function legendItem(id, minutes, interactive = true, mode = interactive ? aggregation : 'events') {
  const item = displayGroup(id, mode); if (!item) return '';
  if (item.automatic) interactive = false;
  return `<${interactive ? 'button' : 'span'} class="legend-item" ${interactive ? `data-filter="${h(id || '')}" data-filter-kind="${mode}"` : ''} title="${h(item.name)} ${durationText(minutes)}"><span class="legend-dot" style="background:${item.color}"></span>${h(item.name)}</${interactive ? 'button' : 'span'}>`;
}
function heatmapLegend(color){
  return `<span class="heatmap-legend-title">全天占比</span><div class="heatmap-scale">${[0,25,50,75,100].map(percent=>`<span><i style="background:${heatColor(color,percent/100*1440)}"></i>${percent}%</span>`).join('')}</div>`;
}
function categoryStatMarkup(entries){
  const categories=categoryTotals(data,entries),spending=categories.reduce((sum,[,minutes])=>sum+minutes,0);
  const visible=categories.length?categories:data.categories.map(category=>[category.id,0]);
  return `<div class="category-stat"><span class="stat-label">分类占比</span><div class="category-share-bar">${categories.map(([id,minutes])=>`<span style="background:${getCategory(data,id)?.color||'#BEC7B5'};flex:${minutes}" title="${h(getCategory(data,id)?.name||'未分类')} ${spending?Math.round(minutes/spending*100):0}%"></span>`).join('')}</div><div class="category-percentages">${visible.map(([id,minutes])=>`<span><i style="background:${getCategory(data,id)?.color||'#BEC7B5'}"></i>${h(getCategory(data,id)?.name||'未分类')}<strong>${spending?Math.round(minutes/spending*100):0}%</strong></span>`).join('')}</div></div>`;
}
function focusStatMarkup(entries,exportControl=false){
  const focus=categoryFocus(data,entries,focusCategory),category=displayGroup(focusCategory,'categories'),percent=`${Number((focus.share*100).toFixed(1))}%`;
  return `<div class="focus-stat"><div class="focus-heading"><span class="stat-label">关注分类</span><button type="button" ${exportControl?'data-export-category="focus"':'id="focusCategoryButton"'} class="focus-category-trigger" aria-label="选择关注分类" aria-haspopup="listbox" aria-controls="focusDropdown" aria-expanded="false"><i class="legend-dot" style="background:${category.color}"></i><span>${h(category.name)}</span>${icon('down')}</button></div><div class="focus-value"><span class="stat-value">${durationText(focus.minutes)}</span><span class="focus-percent">${percent}</span></div><div class="focus-share-track" role="img" aria-label="${h(category.name)}占比 ${percent}"><span style="width:${focus.share*100}%;background:${category.color}"></span></div></div>`;
}
function daysStatMarkup(entries){
  return `<div class="days-stat"><span class="stat-label">记录天数</span><span class="stat-value">${new Set(entries.map(entry=>entry.date)).size}<span class="stat-unit">天</span></span></div>`;
}
function renderOverview() {
  closeDropdown('filterDropdown', false);
  closeDropdown('focusDropdown', false);
  document.querySelectorAll('[data-view]').forEach(b => { b.setAttribute('aria-selected', String(b.dataset.view === view)); b.tabIndex = b.dataset.view === view ? 0 : -1; });
  const entries = periodEntries(), groups = displayTotals(entries), d = fromKey(cursor), [first, last] = periodRange();
  if (yearCategory && !getCategory(data, yearCategory)) yearCategory = data.categories[0]?.id || null;
  if (focusCategory && !getCategory(data,focusCategory)) focusCategory = data.categories[0]?.id || null;
  $('aggregationSwitch').hidden = view === 'year';
  document.querySelectorAll('[data-aggregation]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.aggregation === aggregation)));
  let title = `${d.getFullYear()}年${d.getMonth() + 1}月`;
  if (view === 'year') title = `${d.getFullYear()}年`;
  if (view === 'week') { const a = fromKey(first), b = fromKey(addDays(last, -1)); title = a.getFullYear() === b.getFullYear() ? `${a.getFullYear()}年 ${a.getMonth() + 1}/${a.getDate()} — ${b.getMonth() + 1}/${b.getDate()}` : `${a.getFullYear()}/${a.getMonth() + 1}/${a.getDate()} — ${b.getFullYear()}/${b.getMonth() + 1}/${b.getDate()}`; }
  if (view === 'day') title = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  $('periodTitle').textContent = title;
  $('stats').innerHTML=categoryStatMarkup(entries)+focusStatMarkup(fullPeriodEntries())+daysStatMarkup(entries);
  const filterEvent = view === 'year' ? displayGroup(yearCategory, 'categories') : filter ? displayGroup(filter.id, filter.kind) : null;
  $('filterButton').innerHTML = (view === 'year' ? `<span class="legend-dot" style="background:${filterEvent.color}"></span>` : icon('filter')) + h(filterEvent ? filterEvent.name : aggregation === 'events' ? '全部事件' : '全部分类') + (view === 'year' ? icon('down') : ''); $('filterButton').classList.toggle('active', view === 'year' || !!filter);
  $('filterButton').setAttribute('aria-label', view === 'year' ? '选择年度分类' : aggregation === 'events' ? '筛选事件' : '筛选分类');
  $('filterButton').setAttribute('aria-haspopup', 'listbox');
  $('filterButton').setAttribute('aria-controls', 'filterDropdown');
  $('filterButton').title = filterEvent ? `当前${view === 'year' ? '年度分类' : '筛选'}：${filterEvent.name}` : '筛选';
  $('legend').innerHTML = view === 'year' ? heatmapLegend(filterEvent.color) : groups.slice(0, 8).map(([id, mins]) => legendItem(id, mins)).join('') || '<span class="legend-item"><span class="legend-empty"></span>暂无事件</span>';
  $('periodTotal').textContent = `${entries.filter(entry=>!entry.automatic).length} 条记录`;
  if (view === 'month') renderMonth(); else if (view === 'week') renderWeek(); else if (view === 'day') renderDayOverview(entries); else renderYear();
  if($('timelineExportDialog').open){renderExportWidgets();updateExportSelection();}
}
function renderMonth() {
  const d = fromKey(cursor), first = dateKey(new Date(d.getFullYear(), d.getMonth(), 1, 12)), start = weekStart(first), next = dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
  const days = Math.ceil((Math.round((fromKey(next) - fromKey(start)) / 86400000)) / 7) * 7;
  let html = '<div class="weekdays">' + ['一', '二', '三', '四', '五', '六', '日'].map(x => `<span class="weekday">${x}</span>`).join('') + '</div><div class="calendar-grid">';
  for (let i = 0; i < days; i++) {
    const key = addDays(start, i), records = filteredEntries(statisticalRecords().byDate.get(key)||[]), groups = displayTotals(records), manual = records.filter(entry=>!entry.automatic), highlights = displayTotals(manual), today = key === dateKey(new Date());
    html += `<button class="calendar-day${key < first || key >= next ? ' outside' : ''}${key === selected ? ' selected' : ''}" data-date="${key}" aria-label="${fullDate(key)}，${manual.length} 条记录" aria-pressed="${key === selected}"><span class="day-number"><span class="${today ? 'today-number' : ''}">${fromKey(key).getDate()}</span></span>`;
    const sampleKey = `${key}|${aggregation}|${JSON.stringify(highlights.map(([id])=>id).sort())}`;
    if (!monthHighlights.has(sampleKey)) {
      const candidates = highlights.map(([id])=>id);
      for (let j=candidates.length-1;j>0;j--) { const pick=Math.floor(Math.random()*(j+1));[candidates[j],candidates[pick]]=[candidates[pick],candidates[j]]; }
      monthHighlights.set(sampleKey,candidates.slice(0,2));
    }
    html += monthHighlights.get(sampleKey).map((id, index) => { const t = displayGroup(id); return `<span class="calendar-event" style="background:${t.color}35"><span class="calendar-event-name">${h(t.name)}</span>${index === 1 && highlights.length > 2 ? `<small>+${highlights.length - 2}</small>` : ''}</span>`; }).join('');
    html += `<span class="calendar-colors">${groups.map(([id, mins]) => `<i style="background:${displayGroup(id).color};flex:${mins}"></i>`).join('')}</span></button>`;
  }
  $('overview').innerHTML = html + '</div>';
}
function renderWeek() {
  const start = weekStart(cursor); let html = '<div class="week-chart"><div class="week-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>';
  for (let i = 0; i < 7; i++) {
    const key = addDays(start, i), records = filteredEntries(entriesOn(data, key));
    html += `<div class="week-column"><button class="week-day-label${key === selected ? ' selected' : ''}" data-date="${key}">${weekday(key)}<span>${fromKey(key).getDate()}${key === dateKey(new Date()) ? '<i class="day-selected-badge"></i>' : ''}</span></button><div class="week-track"><button class="week-empty" data-date="${key}" aria-label="选择${fullDate(key)}"></button>`;
    html += records.map(e => { const item = getEvent(data,e.eventId), t=aggregation==='categories'?displayGroup(item.categoryId,'categories'):item; return `<button class="week-entry" data-entry="${h(e.id)}" style="top:${e.start / 1440 * 100}%;height:${(e.end - e.start) / 1440 * 100}%;background:${entryBackground(e,aggregation)}" title="${h(t.name)} ${aggregation === 'categories' ? h(item.name) + ' ' : ''}${timeText(e.start)} — ${timeText(e.end)}" aria-label="编辑${h(item.name)} ${timeText(e.start)} — ${timeText(e.end)}"><span>${e.end - e.start >= 60 ? h(t.name) : ''}</span></button>`; }).join('');
    html += '</div></div>';
  }
  $('overview').innerHTML = html + '</div>';
}
function renderDayOverview(entries) {
  const groups = displayTotals(entries), total = groups.reduce((sum,[,minutes])=>sum+minutes,0); let stops = [], start = 0;
  for (const [id, mins] of groups) { const end = start + mins / total * 100; stops.push(`${displayGroup(id).color} ${start}% ${end}%`); start = end; }
  stops.push(`#eef1e7 ${start}% 100%`);
  $('overview').innerHTML = `<div class="day-overview"><div class="donut" style="background:conic-gradient(${stops.join(',')})"><div class="donut-content"><span class="donut-number spending-number">${durationText(total)}</span><span class="donut-label">事件合计</span></div></div><div class="day-bars">${groups.map(([id, mins]) => { const t = displayGroup(id); return `<div><div class="day-bar-header"><span>${h(t.name)}</span><span>${durationText(mins)}</span></div><div class="day-bar-track"><div class="day-bar-fill" style="background:${t.color};width:${mins / total * 100}%"></div></div></div>`; }).join('') || `<div class="empty-chart"><button class="button quiet" data-new-date="${cursor}">${icon('plus')}添加记录</button></div>`}</div></div>`;
}
function yearChartMarkup(key=cursor,categoryId=yearCategory) {
  const year = fromKey(key).getFullYear(), first = `${year}-01-01`, end = `${year + 1}-01-01`, start = weekStart(first), weeks = Math.ceil((Math.round((fromKey(end) - fromKey(start)) / 86400000)) / 7);
  const category = displayGroup(categoryId, 'categories');
  const byDate = new Map(); for (const e of statisticalRecords().entries.filter(e => e.date >= first && e.date < end)) if((getEvent(data,e.eventId).categoryId||null)===categoryId) byDate.set(e.date,(byDate.get(e.date)||0)+e.end-e.start);
  let html = `<div class="year-scroll"><div class="year-chart" data-weeks="${weeks}"><div class="year-labels"><span>一</span><span></span><span>三</span><span></span><span>五</span><span></span><span>日</span></div><div class="year-weeks" style="grid-template-columns:repeat(${weeks},var(--year-cell-size,16px))">`;
  let previousMonth = -1;
  for (let w = 0; w < weeks; w++) {
    let monthLabel = ''; const dates = Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i));
    const monthStart = dates.find(key => key >= first && key < end && (fromKey(key).getDate() === 1 || key === first));
    if (monthStart && fromKey(monthStart).getMonth() !== previousMonth) { previousMonth = fromKey(monthStart).getMonth(); monthLabel = `${previousMonth + 1}月`; }
    html += `<div class="year-week"><span class="year-month-label">${monthLabel}</span>`;
    for (const key of dates) {
      const total = byDate.get(key) || 0, outside = key < first || key >= end;
      const label = `${fullDate(key)}，${category.name} ${durationText(total)}，全天占比 ${Number((total / 1440 * 100).toFixed(1))}%`;
      html += `<button class="year-day${outside ? ' outside' : ''}${key === selected ? ' selected' : ''}" data-date="${key}" title="${h(label)}" aria-label="${h(label)}" style="background:${heatColor(category.color, total)}" ${outside ? 'tabindex="-1" disabled' : ''}></button>`;
    }
    html += '</div>';
  }
  return html + `</div></div></div><div class="year-bottom"><span>${h(category.name)}</span><span>${byDate.size} 天</span></div>`;
}
function renderYear() {
  $('overview').innerHTML=yearChartMarkup();
  updateYearLayout();
}
function updateYearLayout() {
  const chart = $('overview').querySelector('.year-chart'); if (!chart) return;
  const ratio = window.devicePixelRatio || 1, weeks = Number(chart.dataset.weeks), available = chart.parentElement.clientWidth;
  const gapPixels = Math.round(4 * ratio), axisPixels = Math.round(32 * ratio);
  const cellPixels = Math.max(Math.round(12 * ratio), Math.min(Math.round(20 * ratio), Math.floor((Math.floor(available * ratio) - axisPixels - (weeks - 1) * gapPixels) / weeks)));
  chart.style.setProperty('--year-cell-size', `${cellPixels / ratio}px`); chart.style.setProperty('--year-cell-gap', `${gapPixels / ratio}px`);
}
function renderRecording() {
  const d = fromKey(selected), records = entriesOn(data, selected), statsRecords = statisticalRecords().byDate.get(selected)||[], today = selected === dateKey(new Date());
  $('selectedDate').value = selected;
  $('selectedDateLabel').textContent = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${weekday(selected)}`;
  $('dayHeading').textContent = today ? '今天' : `${d.getMonth() + 1}月${d.getDate()}日`;
  const continuation = continuationRange(records);
  $('continueEntry').hidden = !continuation;
  if (continuation) $('continueEntry').innerHTML = `${icon('plus')}从 ${timeText(continuation[0])} 继续`;
  $('entryCount').textContent = records.length;
  let bands = '';
  for (let band = 0; band < 4; band++) {
    const base = band * 360, recordsInBand = records.filter(e => e.start < base + 360 && e.end > base);
    bands += `<div class="band"><div class="band-heading"><span class="band-label">${['凌晨', '上午', '下午', '晚间'][band]}</span></div><div class="hour-labels">${Array.from({ length: 7 }, (_, i) => `<span>${timeText(base + i * 60)}</span>`).join('')}</div><div class="time-track" data-base="${base}" tabindex="0" role="group" aria-label="${timeText(base)}至${timeText(base + 360)}，拖选时间或按回车添加记录">`;
    bands += recordsInBand.map(e => { const t = getEvent(data,e.eventId), start = Math.max(base, e.start), end = Math.min(base + 360, e.end), width = (end - start) / 360 * 100; return `<button class="time-block${width < 8 ? ' narrow' : ''}" data-entry="${h(e.id)}" style="left:${(start - base) / 360 * 100}%;width:${width}%;background:${entryBackground(e)};--block-color:${t.color}" title="${h(t.name)} ${timeText(e.start)} — ${timeText(e.end)}" aria-label="编辑${h(t.name)} ${timeText(e.start)} — ${timeText(e.end)}"><span>${h(t.name)}</span></button>`; }).join('');
    if (continuation && continuation[0] >= base && continuation[0] < base + 360) bands += `<button class="continue-marker${continuation[0] - base > 310 ? ' marker-edge' : ''}" data-continue="${continuation[0]}" style="left:${(continuation[0] - base) / 360 * 100}%" aria-label="从${timeText(continuation[0])}继续记录"><span class="boundary-stem"></span><span class="boundary-label">${timeText(continuation[0])}${icon('plus')}</span></button>`;
    bands += '</div></div>';
  }
  $('timeBands').innerHTML = bands;
  queueTimelineLabels();
  $('entryList').innerHTML = records.map(e => { const t = getEvent(data, e.eventId); return `<button class="entry-row" data-entry="${h(e.id)}" aria-label="编辑${h(t.name)} ${timeText(e.start)} — ${timeText(e.end)}"><span class="entry-stripe" style="background:${t.color}"></span><span class="entry-info"><span class="entry-name">${h(t.name)}</span><span class="entry-times">${timeText(e.start)} — ${timeText(e.end)}</span></span><span class="entry-duration">${durationText(e.end-e.start)}</span></button>`; }).join('') || `<div class="empty-records"><button class="empty-add" data-new="true">${icon('clock')}<span>添加第一条记录</span></button></div>`;
  $('dayLegend').innerHTML = totals(records).map(([id, mins]) => legendItem(id, mins, false)).join('');
  const blank = Math.max(0,1440-recordedMinutes(statsRecords));
  $('dayDistribution').innerHTML = `<div class="distribution-bar">${totals(statsRecords).map(([id,mins])=>`<span style="flex:${mins};background:${getEvent(data,id).color}" title="${h(getEvent(data,id).name)} ${durationText(mins)}"></span>`).join('')}${blank?`<span style="flex:${blank};background:#f0f3e9"></span>`:''}</div><div class="distribution-row"><span>24 小时</span></div>`;
}
function render() { renderOverview(); renderRecording(); }
function availableRange(base = 0, limit = 1440) {
  const records = entriesOn(data, selected); let point = base;
  for (const e of records) { if (e.end <= point) continue; if (e.start > point) return [point, Math.min(point + 30, e.start, limit)]; point = Math.max(point, e.end); if (point >= limit) break; }
  if (point < limit) return [point, Math.min(point + 30, limit)];
  return null;
}
function openNew(base, limit = 1440) {
  const range = base === undefined ? continuationRange(entriesOn(data, selected)) || availableRange() : availableRange(base, limit);
  if (!range) { toast('这个时段已经记满了'); return; } openEntry(null, range[0], range[1]);
}
function openEntry(id=null,start=540,end=570) {
  editing=id;const entry=id?data.entries.find(entry=>entry.id===id):null;
  if(id&&!entry)return;
  if(entry){selected=entry.date;cursor=selected;render();start=entry.start;end=entry.end;}
  const item=entry?getEvent(data,entry.eventId):null;
  modalCategoryId=item?.categoryId||null;
  modalColor=item?.color||freshColor();modalColorManual=false;modalMatchedName=item?.name||null;entryPalette=freshPalette(modalColor);
  $('entryDialogTitle').textContent=entry?'编辑记录':'记录时间';$('modalDate').textContent=fullDate(selected);
  $('startTime').value=timeText(start);$('endTime').value=timeText(end);$('entryName').value=item?.name||'';
  $('deleteEntry').hidden=!entry;$('entryError').hidden=true;
  clearHover();updateDuration();renderColors();$('entryDialog').showModal();requestAnimationFrame(()=>$('entryName').focus({preventScroll:true}));
}
function updateDuration() {
  const start=parseTime($('startTime').value),end=parseTime($('endTime').value),continuation=continuationRange(entriesOn(data,selected));
  $('durationOutput').textContent=start!==null&&end!==null&&end>start?durationText(end-start):'';
  $('continuationBadge').hidden=!!editing||!continuation||continuation[0]!==start;
}
function pickerOption(item,attributes,selected) {
  return `<button type="button" class="filter-choice" ${attributes} aria-selected="${selected}"><i class="legend-dot" style="background:${item.color}"></i><span>${h(item.name)}</span><span class="checkmark">${selected?icon('check'):''}</span></button>`;
}
function swatches(colors, selected, attribute, label) {
  return colors.map(color => { const active = color.toUpperCase() === selected.toUpperCase(); return `<button type="button" class="color-choice${active ? ' selected' : ''}" ${attribute}="${color}" aria-label="${label} ${color}" aria-pressed="${active}" style="background:${color}">${active ? icon('check') : ''}</button>`; }).join('');
}
function paintSwatches(id, colors, selected, attribute, label, trailing = '') {
  const container = $(id), buttons = [...container.querySelectorAll('.color-choice')];
  if (buttons.length === colors.length && buttons.every((button, i) => button.getAttribute(attribute) === colors[i])) {
    buttons.forEach((button, i) => { const active = colors[i].toUpperCase() === selected.toUpperCase(); button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active)); button.innerHTML = active ? icon('check') : ''; });
  } else container.innerHTML = swatches(colors, selected, attribute, label) + trailing;
}
function renderColors() {
  if (!entryPalette.some(color => color.toUpperCase() === modalColor.toUpperCase())) entryPalette = freshPalette(modalColor);
  paintSwatches('colorChoices', entryPalette, modalColor, 'data-color', '事件颜色', `<button type="button" class="custom-color" id="customColorButton" title="自选颜色" aria-label="自选事件颜色">${icon('palette')}</button>`);
  renderEntryEventChoices();
  renderEntryCategoryChoices();
}
function renderEntryCategoryChoices() {
  if(modalCategoryId&&!getCategory(data,modalCategoryId))modalCategoryId=null;
  $('entryCategoryChoices').innerHTML=[{id:'',name:'未分类'},...data.categories].map(item=>`<button type="button" class="entry-event-choice" data-entry-category="${h(item.id)}" aria-pressed="${(item.id||null)===modalCategoryId}">${item.color?`<i class="legend-dot" style="background:${item.color}"></i>`:''}${h(item.name)}</button>`).join('');
}
$('entryCategoryChoices').addEventListener('click',event=>{
  const button=event.target.closest('[data-entry-category]');if(!button)return;
  modalCategoryId=button.dataset.entryCategory||null;renderEntryCategoryChoices();
});
$('entryNewCategory').onclick=()=>openCategoryForm({kind:'entry'});
function renderEntryEventChoices() {
  const container=$('entryEventChoices'),name=normalizeName($('entryName').value);
  container.hidden=!data.events.length;
  container.innerHTML=sortedEvents().map(item=>`<button type="button" class="entry-event-choice" data-entry-event="${h(item.id)}" aria-pressed="${item.name===name}"><i class="legend-dot" style="background:${item.color}"></i>${h(item.name)}</button>`).join('');
}
$('entryEventChoices').addEventListener('click',event=>{
  const button=event.target.closest('[data-entry-event]');if(!button)return;
  const item=getEvent(data,button.dataset.entryEvent);if(!item)return;
  $('entryName').value=item.name;modalMatchedName=item.name;modalColor=item.color;modalColorManual=false;modalCategoryId=item.categoryId||null;
  renderColors();$('entryName').focus({preventScroll:true});
});
function renderEventManager() {
  const counts = new Map(); data.entries.forEach(e => counts.set(e.eventId, (counts.get(e.eventId) || 0) + 1));
  $('eventManager').innerHTML = sortedEvents().map(t => `<div class="manager-row" data-event="${h(t.id)}"><button class="manager-color-button" style="background:${t.color}" data-event-color="${h(t.id)}" aria-label="修改${h(t.name)}的颜色"></button><div class="manager-details"><input class="manager-name" value="${h(t.name)}" maxlength="80" aria-label="修改事件名称"><button class="category-assignment" data-assign-category="${h(t.id)}"><i style="background:${getCategory(data, t.categoryId)?.color || '#BEC7B5'}"></i>${h(getCategory(data, t.categoryId)?.name || '未分类')}${icon('down')}</button></div><span class="manager-count">${counts.get(t.id) || 0} 条</span><button class="icon-button" data-delete-event="${h(t.id)}" aria-label="删除事件${h(t.name)}">${icon('trash')}</button></div>`).join('') || '<div class="empty-events">还没有事件</div>';
  renderCategoryManager();
}

function renderCategoryManager() {
  $('categoryManager').innerHTML = data.categories.map(c => `<div class="manager-row" data-category="${h(c.id)}"><button class="manager-color-button" style="background:${c.color}" data-category-edit-color="${h(c.id)}" aria-label="修改分类${h(c.name)}的颜色"></button><input class="manager-name category-name" value="${h(c.name)}" maxlength="30" aria-label="修改分类${h(c.name)}的名称"><button class="manager-count manager-count-button" data-category-events="${h(c.id)}" aria-label="查看${h(c.name)}分类中的事件" aria-haspopup="dialog" aria-controls="categoryEventsDropdown" aria-expanded="false">${data.events.filter(item => item.categoryId === c.id).length} 个事件</button><button class="icon-button" data-delete-category="${h(c.id)}" aria-label="删除分类${h(c.name)}">${icon('trash')}</button></div>`).join('') + `<button class="button quiet category-new-button" id="managerNewCategory">${icon('plus')}新建分类</button>`;
}
function openCategoryEvents(id,anchor) {
  const category=getCategory(data,id);if(!category)return;
  const spent=new Map(totals(data.entries));$('categoryEventsTitle').textContent=category.name;
  $('categoryEventList').innerHTML=sortedEvents().filter(item=>item.categoryId===id).map(item=>`<div class="usage-row" role="listitem"><i class="legend-dot" style="background:${item.color}"></i><span class="usage-name">${h(item.name)}</span><span class="usage-duration">${durationText(spent.get(item.id)||0)}</span></div>`).join('')||'<div class="empty-events">暂无事件</div>';
  openDropdown('categoryEventsDropdown',anchor,'start');
}
function setManagerTab(tabName) {
  document.querySelectorAll('[data-manager-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.managerTab === tabName)));
  $('eventManager').hidden = tabName !== 'events'; $('categoryManager').hidden = tabName !== 'categories';
}
function openCategoryPicker(id,anchor) {
  categoryTarget={kind:'event',id};const selectedId=getEvent(data,id)?.categoryId||null;
  $('categoryPickerChoices').innerHTML=[{id:'',name:'未分类',color:'#BEC7B5'},...data.categories].map(category=>pickerOption(category,`data-pick-category="${h(category.id)}"`,(category.id||null)===selectedId)).join('');
  openDropdown('categoryDropdown',anchor,'start');
}
function renderCategoryFormColors() {
  if (!categoryPalette.some(color => color.toUpperCase() === categoryFormColor.toUpperCase())) categoryPalette = freshPalette(categoryFormColor);
  paintSwatches('categoryFormColors', categoryPalette, categoryFormColor, 'data-category-color', '分类颜色', `<button type="button" class="custom-color" id="categoryCustomColor" aria-label="自选分类颜色">${icon('palette')}</button>`);
}
function openCategoryForm(target) {
  categoryTarget = target; categoryFormColor = freshColor(); categoryPalette = freshPalette(categoryFormColor); $('categoryName').value = ''; $('categoryError').hidden = true; renderCategoryFormColors(); $('categoryFormDialog').showModal(); requestAnimationFrame(() => $('categoryName').focus());
}
function openColor(target,color,anchor) {
  colorTarget=target;$('hexColor').value=color;$('hexPreview').style.background=color;$('colorError').hidden=true;
  pickerPalette=freshPalette(color);colorHsv=hexToHsv(color);paintColorPicker();
  openDropdown('colorDropdown',anchor,target.kind==='entry'||target.kind==='categoryForm'?'end':'start');
}
function paintColorPicker(writeHex=false) {
  const color=hsvToHex(colorHsv);if(writeHex)$('hexColor').value=color;$('hexPreview').style.background=color;
  $('colorPlane').style.backgroundColor=hsvToHex({h:colorHsv.h,s:1,v:1});$('colorThumb').style.left=`${colorHsv.s*100}%`;$('colorThumb').style.top=`${(1-colorHsv.v)*100}%`;$('colorThumb').style.background=color;
  $('colorPlane').setAttribute('aria-valuenow',String(Math.round(colorHsv.v*100)));$('colorPlane').setAttribute('aria-valuetext',`饱和度 ${Math.round(colorHsv.s*100)}%，明度 ${Math.round(colorHsv.v*100)}%`);$('hueSlider').value=Math.round(colorHsv.h);
  paintSwatches('customPalette',pickerPalette,color,'data-hex-color','选择颜色');
}
function colorPlanePoint(event) {const r=$('colorPlane').getBoundingClientRect();colorHsv.s=Math.max(0,Math.min(1,(event.clientX-r.left)/r.width));colorHsv.v=1-Math.max(0,Math.min(1,(event.clientY-r.top)/r.height));paintColorPicker(true);}
$('colorPlane').addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();$('colorPlane').focus();$('colorPlane').setPointerCapture(event.pointerId);colorPlanePoint(event);});
$('colorPlane').addEventListener('pointermove',event=>{if($('colorPlane').hasPointerCapture(event.pointerId))colorPlanePoint(event);});
$('colorPlane').addEventListener('pointerup',event=>{if($('colorPlane').hasPointerCapture(event.pointerId))$('colorPlane').releasePointerCapture(event.pointerId);});
$('colorPlane').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const step=event.shiftKey?.1:.01;if(event.key==='ArrowLeft')colorHsv.s-=step;if(event.key==='ArrowRight')colorHsv.s+=step;if(event.key==='ArrowUp')colorHsv.v+=step;if(event.key==='ArrowDown')colorHsv.v-=step;colorHsv.s=Math.max(0,Math.min(1,colorHsv.s));colorHsv.v=Math.max(0,Math.min(1,colorHsv.v));paintColorPicker(true);});
$('hueSlider').oninput=()=>{colorHsv.h=Number($('hueSlider').value);paintColorPicker(true);};
function applyColor(color) {
  if(colorTarget.kind==='entry'){modalColor=color;modalColorManual=true;renderColors();$('customColorButton').focus({preventScroll:true});}
  else if(colorTarget.kind==='categoryForm'){categoryFormColor=color;renderCategoryFormColors();$('categoryCustomColor').focus({preventScroll:true});}
  else {
    const next=structuredClone(data),item=colorTarget.kind==='event'?getEvent(next,colorTarget.id):getCategory(next,colorTarget.id);if(!item)return;item.color=color;
    if(commit(next)){renderEventManager();const attr=colorTarget.kind==='event'?'data-event-color':'data-category-edit-color';[...document.querySelectorAll(`[${attr}]`)].find(button=>button.getAttribute(attr)===colorTarget.id)?.focus({preventScroll:true});}
  }
}
function renderDatePicker() {
  const d = fromKey(pickerCursor), year = d.getFullYear(), month = d.getMonth();
  $('pickerTitle').innerHTML = `${year}年${month + 1}月${icon('down')}`; $('pickerTitle').setAttribute('aria-expanded', String(pickerMonthMode));
  $('pickerMonthPanel').hidden = !pickerMonthMode; $('pickerCalendar').hidden = pickerMonthMode; $('pickerYear').value = year;
  $('pickerMonths').innerHTML = Array.from({ length: 12 }, (_, i) => `<button type="button" data-picker-month="${i}" class="${i === month ? 'selected' : ''}">${i + 1}月</button>`).join('');
  const first = dateKey(new Date(year, month, 1, 12)), start = weekStart(first); let html = '';
  for (let i = 0; i < 42; i++) {
    const key = addDays(start, i), outside = fromKey(key).getMonth() !== month, today = key === dateKey(new Date());
    html += `<button type="button" data-picker-date="${key}" class="picker-day${outside ? ' outside' : ''}${key === selected ? ' selected' : ''}${today ? ' today' : ''}" aria-label="${fullDate(key)}" aria-pressed="${key === selected}" ${validDate(key) ? '' : 'disabled'}>${fromKey(key).getDate()}</button>`;
  }
  $('pickerDays').innerHTML = html;
  $('pickerPrev').disabled = year === 1900 && month === 0; $('pickerNext').disabled = year === 9999 && month === 11;
  if ($('dateDropdown').matches(':popover-open')) positionDropdown('dateDropdown', 'start');
}
function openDatePicker() {
  if ($('dateDropdown').matches(':popover-open')) { closeDropdown('dateDropdown'); return; }
  pickerCursor = selected; pickerMonthMode = false; renderDatePicker(); openDropdown('dateDropdown', $('dateTrigger'), 'start');
}
function closeDropdown(id, restoreFocus = true) {
  const panel = $(id); if (!panel) return;
  const anchor = dropdownAnchors.get(id),wasOpen=panel.matches(':popover-open');
  if(wasOpen)panel.hidePopover();anchor?.setAttribute('aria-expanded','false');
  if (wasOpen && restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
}
// Native light dismissal happens before click, so remember an open trigger at pointerdown.
let dropdownPointerAction=null;
document.addEventListener('pointerdown',event=>{
  dropdownPointerAction=null;if(event.button!==0)return;
  for(const [id,anchor] of dropdownAnchors){
    if(anchor.contains(event.target)&&$(id).matches(':popover-open')){dropdownPointerAction={id,anchor};break;}
  }
},true);
document.addEventListener('pointercancel',()=>{dropdownPointerAction=null;},true);
document.addEventListener('click',event=>{
  const action=dropdownPointerAction;dropdownPointerAction=null;
  if(!action||event.detail===0||!action.anchor.contains(event.target))return;
  closeDropdown(action.id,false);event.preventDefault();event.stopPropagation();
},true);
function openDropdown(id, anchor, align = 'end') {
  const panel = $(id);
  if (panel.matches(':popover-open')) {
    if(dropdownAnchors.get(id)===anchor){closeDropdown(id);return;}
    closeDropdown(id,false);
  }
  for (const otherId of dropdownAnchors.keys()) if (otherId !== id) closeDropdown(otherId, false);
  const host = anchor.closest('dialog') || document.body;
  if (panel.parentElement !== host) host.append(panel);
  dropdownAnchors.set(id, anchor); anchor.setAttribute('aria-controls', id); anchor.setAttribute('aria-expanded', 'true'); anchor.setAttribute('aria-haspopup', ['filterDropdown','categoryDropdown','focusDropdown','exportRangeDropdown'].includes(id) ? 'listbox' : 'dialog');
  if (id === 'dateDropdown' || id === 'colorDropdown') { panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); }
  panel.querySelectorAll('.filter-choice').forEach(button => { button.setAttribute('role', 'option'); button.tabIndex = -1; });
  panel.style.maxHeight = `${Math.max(150, Math.min(420, innerHeight - 32))}px`; panel.showPopover();
  positionDropdown(id, align);
  const focusable = [...panel.querySelectorAll('button,input')].filter(el => !el.disabled && el.getClientRects().length);
  const active = focusable.find(el => el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true') || focusable[0];
  active?.focus({ preventScroll: true });
}
function positionDropdown(id, align = 'end') {
  const panel = $(id), anchor = dropdownAnchors.get(id); if (!anchor || !panel.matches(':popover-open')) return;
  panel.dataset.align = align;
  const viewportWidth = document.documentElement.clientWidth;
  panel.style.maxWidth = `${Math.max(0, viewportWidth - 24)}px`; panel.style.maxHeight = `${Math.max(100, innerHeight - 24)}px`;
  const rect = anchor.getBoundingClientRect(), box = panel.getBoundingClientRect();
  const below = innerHeight - rect.bottom - 12, above = rect.top - 12, up = below < Math.min(box.height, 220) && above > below;
  const top = up ? Math.max(12, rect.top - box.height - 7) : Math.min(innerHeight - box.height - 12, rect.bottom + 7);
  panel.style.left = `${Math.round(Math.max(12, Math.min(viewportWidth - box.width - 12, align === 'end' ? rect.right - box.width : rect.left)))}px`;
  panel.style.top = `${Math.round(Math.max(12, top))}px`;
}
function pickerMove(amount, years = false) { const d = fromKey(pickerCursor); d.setDate(1); if (years) d.setFullYear(d.getFullYear() + amount); else d.setMonth(d.getMonth() + amount); const key = dateKey(d); if (validDate(key)) { pickerCursor = key; renderDatePicker(); } }
function stepTime(id, step) { const value = parseTime($(id).value) ?? 0; $(id).value = timeText(Math.max(0, Math.min(id === 'startTime' ? 1435 : 1440, value + step))); updateDuration(); }
function askConfirm(title, action) { $('confirmTitle').textContent = title; confirmAction = action; $('confirmDialog').showModal(); }
function renderFilters() {
  if(view==='year'){
    $('filterChoices').setAttribute('aria-label','年度分类');
    $('filterChoices').innerHTML=[...data.categories,{id:'',name:'未分类',color:'#BEC7B5'}].map(category=>pickerOption(category,`data-year-category="${h(category.id)}"`,(category.id||null)===yearCategory)).join('');return;
  }
  $('filterChoices').setAttribute('aria-label',aggregation==='events'?'筛选事件':'筛选分类');
  const choices=aggregation==='events'?sortedEvents():[...data.categories,{id:null,name:'未分类',color:'#BEC7B5'}];
  $('filterChoices').innerHTML=`<button class="filter-choice" data-filter-all="true" aria-selected="${!filter}"><span>${aggregation==='events'?'全部事件':'全部分类'}</span>${!filter?`<span class="checkmark">${icon('check')}</span>`:''}</button>`+choices.map(item=>pickerOption(item,`data-filter-choice="${h(item.id||'')}" data-filter-kind="${aggregation}"`,filter?.kind===aggregation&&filter.id===item.id)).join('');
}
function downloadBackup() {
  const body = persistenceLocked && rawStorage ? rawStorage : JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' })), anchor = document.createElement('a'); anchor.href = url; anchor.download = `WhereIsMyTime-${persistenceLocked ? 'recovery' : 'backup'}-${dateKey(new Date())}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); closeBackup(); toast('备份已导出');
}
function closeBackup() { $('backupMenu').hidden = true; $('backupButton').setAttribute('aria-expanded', 'false'); }

// Recovery reads old keys without modifying or removing them.
let recoverySources=[];
const recoveryButton=document.createElement('button');recoveryButton.id='recoverButton';recoveryButton.textContent='找回本机记录';$('backupMenu').append(recoveryButton);
const recoveryDialog=document.createElement('dialog');recoveryDialog.id='recoveryDialog';recoveryDialog.className='wide-dialog';
recoveryDialog.innerHTML='<div class="dialog-heading"><h2>找回本机记录</h2><button class="icon-button" data-close="recoveryDialog" aria-label="关闭"></button></div><div id="recoverySources"></div><p id="recoveryError" class="form-error" role="alert" hidden></p>';
document.body.append(recoveryDialog);
function findRecoverySources(){
  return listRecoverySources(localStorage);
}
recoveryButton.onclick=()=>{
  closeBackup();$('recoveryError').hidden=true;
  try{recoverySources=findRecoverySources();$('recoverySources').innerHTML=recoverySources.map((source,index)=>{
    const dates=(source.converted?.entries||[]).map(entry=>entry.date).sort();
    return `<div class="manager-row"><div class="manager-details"><strong>${source.converted?`${source.converted.entries.length} 条记录`:'原始数据'}</strong><p>${h(dates.length?`${dates[0]} — ${dates.at(-1)}`:source.error||'空备份')}</p><p>${h(source.key)}</p></div><button class="button quiet small" data-export-recovery="${index}">保留原件</button><button class="button primary small" data-recover-source="${index}" ${source.converted?'':'disabled'}>恢复</button></div>`;
  }).join('')||'<p>此地址未找到旧记录。</p>';recoveryDialog.showModal();}catch(error){toast(error.message);}
};
recoveryDialog.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-export-recovery')){
    const source=recoverySources[Number(button.dataset.exportRecovery)],url=URL.createObjectURL(new Blob([source.text],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download=`WhereIsMyTime-original-v${source.raw?.version||'unknown'}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(button.hasAttribute('data-recover-source')){
    try{
      const source=recoverySources[Number(button.dataset.recoverSource)],next=data.entries.length?mergeData(data,source.converted):source.converted;
      preserveOriginal(localStorage,source.key,source.text);
      if(commit(next,true)){if(next.entries.length)selectDate(next.entries.at(-1).date);recoveryDialog.close();toast(`已恢复 ${source.converted.entries.length} 条记录，原始数据已保留`);}
    }catch(error){$('recoveryError').textContent=error.message;$('recoveryError').hidden=false;}
  }
});
$('storageRestore').onclick=()=>recoveryButton.click();
$('storageExport').onclick=downloadBackup;
function showStorageFailure(message){$('storageNotice').hidden=false;$('storageNoticeText').textContent=`数据未能启用，原始记录已保留。${message||'请使用恢复入口或导出原件'}`;}

$('manageEvents').innerHTML = icon('events') + '时间与分类'; $('backupButton').innerHTML = icon('backup') + '备份'; $('addEntry').innerHTML = icon('plus') + '记录时间';
const timelineFullscreen=$('timelineFullscreenDialog'),timelineCard=$('timelineCard'),timelineFullscreenButton=$('timelineFullscreenButton');
let timelinePlaceholder=null,timelinePageOverflow='';
let timelineLabelsFrame=0,timelineLabelsWidth=0;
function queueTimelineLabels(){cancelAnimationFrame(timelineLabelsFrame);timelineLabelsFrame=requestAnimationFrame(()=>layoutTimelineLabels());}
function layoutTimelineLabels(card=timelineCard,expanded=timelineFullscreen.open){
  for(const band of card.querySelectorAll('.band')){
    band.querySelector('.time-band-callouts')?.remove();
    const blocks=[...band.querySelectorAll('.time-block')];
    blocks.forEach(block=>block.classList.remove('needs-callout'));
    if(!expanded)continue;
    const track=band.querySelector('.time-track'),width=track.clientWidth;
    if(!width)continue;
    const overflow=blocks.filter(block=>{
      const text=block.querySelector('span');
      return block.clientWidth<32||text.scrollWidth>text.clientWidth+1||text.scrollHeight>Math.min(text.clientHeight,block.clientHeight)+1;
    });
    if(!overflow.length)continue;
    const labels=document.createElement('div');labels.className='time-band-callouts';band.append(labels);
    const lanes=[],placements=[];
    for(const block of overflow){
      block.classList.add('needs-callout');
      const text=block.querySelector('span'),label=document.createElement('button');
      label.type='button';label.className='time-band-callout';label.dataset.entry=block.dataset.entry;
      label.title=block.title;label.setAttribute('aria-label',block.getAttribute('aria-label'));
      const dot=document.createElement('i');dot.className='legend-dot';dot.style.background=block.style.getPropertyValue('--block-color');
      const name=document.createElement('span');name.textContent=text.textContent;label.append(dot,name);labels.append(label);
      const labelWidth=label.offsetWidth,labelHeight=label.offsetHeight,center=block.offsetLeft+block.offsetWidth/2;
      const left=Math.max(0,Math.min(width-labelWidth,center-labelWidth/2)),right=left+labelWidth;
      let lane=lanes.findIndex(row=>row.items.every(item=>right+10<=item.left||left>=item.right+10));
      if(lane<0){lane=lanes.length;lanes.push({height:0,items:[]});}
      lanes[lane].height=Math.max(lanes[lane].height,labelHeight);lanes[lane].items.push({left,right});
      placements.push({label,left,center,lane,color:block.style.getPropertyValue('--block-color')});
    }
    let height=12;const tops=lanes.map(row=>{const top=height;height+=row.height+10;return top;});
    labels.style.height=`${height}px`;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('time-band-connectors');svg.setAttribute('aria-hidden','true');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    for(const {label,left,center,lane,color} of placements){
      const top=tops[lane];label.style.left=`${left}px`;label.style.top=`${top}px`;
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',`M${center} 0V${top-5}H${left+12}V${top}`);path.setAttribute('stroke',color);svg.append(path);
    }
    labels.prepend(svg);
  }
}
new ResizeObserver(()=>{const width=timelineCard.clientWidth;if(width!==timelineLabelsWidth){timelineLabelsWidth=width;queueTimelineLabels();}}).observe(timelineCard);
function updateTimelineFullscreenButton(){
  const expanded=timelineFullscreen.open;
  timelineFullscreenButton.innerHTML=icon(expanded?'collapse':'expand');
  timelineFullscreenButton.setAttribute('aria-expanded',String(expanded));
  timelineFullscreenButton.setAttribute('aria-label',expanded?'退出时间带全屏':'全屏展示时间带');
  timelineFullscreenButton.title=expanded?'退出全屏':'全屏展示';
}
timelineFullscreenButton.onclick=()=>{
  if(timelineFullscreen.open){timelineFullscreen.close();return;}
  closeBackup();for(const id of dropdownAnchors.keys())closeDropdown(id,false);
  cancelDrag();clearHover();
  timelinePlaceholder=document.createComment('timeline position');timelineCard.before(timelinePlaceholder);
  timelineFullscreen.append(timelineCard);timelinePageOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  timelineFullscreen.showModal();updateTimelineFullscreenButton();queueTimelineLabels();timelineFullscreenButton.focus({preventScroll:true});
};
timelineFullscreen.addEventListener('close',()=>{
  cancelDrag();clearHover();timelinePlaceholder?.replaceWith(timelineCard);timelinePlaceholder=null;
  document.body.style.overflow=timelinePageOverflow;updateTimelineFullscreenButton();queueTimelineLabels();timelineFullscreenButton.focus({preventScroll:true});
});
updateTimelineFullscreenButton();
$('timelineDownloadButton').innerHTML=icon('backup');
$('timelineDownloadButton').onclick=()=>{
  exportForm.reset();
  const mode=['year','day'].includes(view)?view:'month';
  exportRanges.categories=mode;exportRanges.focus=mode;exportRanges.days=view==='year'?'year':'month';
  $('exportViewLabel').textContent=`当前${{year:'年',month:'月',week:'周',day:'日'}[view]}视图`;
  $('exportOverviewModule').closest('.export-widget-option').hidden=view==='year';
  renderExportWidgets();
  $('timelineExportDialog').showModal();
  updateExportSelection();
};
const exportForm=$('timelineExportForm');
let exportPreviewData=null,exportPreviewVersion=0,exportPreviewFrame=0;
const exportRanges={categories:'month',focus:'month',days:'month'};
let exportRangeTarget=null;
function exportPeriodTitle(mode){
  const date=fromKey(cursor),year=date.getFullYear();
  return mode==='year'?`${year}年`:mode==='month'?`${year}年${date.getMonth()+1}月`:`${year}年${date.getMonth()+1}月${date.getDate()}日`;
}
function buildExportStat(kind){
  const [start,end]=periodRange(exportRanges[kind]),records=statisticalRecords().entries.filter(entry=>entry.date>=start&&entry.date<end);
  const holder=document.createElement('div');
  holder.innerHTML=kind==='focus'?focusStatMarkup(records,true):kind==='categories'?categoryStatMarkup(filteredEntries(records)):daysStatMarkup(filteredEntries(records));
  const content=holder.firstElementChild,label=content.querySelector('.stat-label');
  label.textContent=`${exportPeriodTitle(exportRanges[kind])} ${label.textContent}`;
  return content;
}
function buildExportDistribution(exportDate){
  const content=$('dayDistribution').cloneNode(true),records=statisticalRecords().byDate.get(exportDate)||[];
  const items=totals(records).map(([id,minutes])=>({...getEvent(data,id),minutes})),blank=Math.max(0,1440-recordedMinutes(records));
  if(blank)items.push({name:'空白',color:'#F0F3E9',minutes:blank});
  const legend=document.createElement('div');legend.className='distribution-legend';
  legend.innerHTML=items.map(item=>`<span class="distribution-legend-item"><i class="legend-dot" style="background:${item.color}"></i><span class="distribution-legend-name">${h(item.name)}</span><span class="distribution-legend-duration">${durationText(item.minutes)}</span></span>`).join('');
  content.append(legend);return content;
}
function buildExportYear(){
  const card=document.createElement('div');card.className='overview-card export-year-component';
  const year=fromKey(cursor).getFullYear(),category=displayGroup(yearCategory,'categories');
  card.innerHTML=`<div class="overview-toolbar"><h2>${year}年</h2><button type="button" class="export-year-category" data-export-category="year" aria-label="选择年度分类" aria-haspopup="listbox" aria-expanded="false"><i class="legend-dot" style="background:${category.color}"></i><span>${h(category.name)}</span>${icon('down')}</button></div><div class="overview-body">${yearChartMarkup()}</div><div class="overview-footer"><div class="legend">${heatmapLegend(category.color)}</div></div>`;
  return card;
}
function renderExportWidgets(){
  const sources={timeline:$('timeBands'),entries:$('entryList'),overview:$('overview')};
  for(const button of exportForm.querySelectorAll('[data-export-range]'))button.innerHTML=`${exportPeriodTitle(exportRanges[button.dataset.exportRange])}${icon('down')}`;
  for(const widget of exportForm.querySelectorAll('[data-export-widget]')){
    const kind=widget.dataset.exportWidget;
    const content=kind==='distribution'?buildExportDistribution(selected):kind==='year'?buildExportYear():Object.hasOwn(exportRanges,kind)?buildExportStat(kind):sources[kind].cloneNode(true);
    if(widget.dataset.exportWidget==='timeline')content.append($('dayLegend').cloneNode(true));
    content.removeAttribute('id');content.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));
    content.querySelectorAll('.stat-label,.continue-marker,.hover-cursor,.selection,.drag-readout,.time-band-callouts,.timeline-actions').forEach(element=>element.remove());
    content.querySelectorAll('.needs-callout').forEach(element=>element.classList.remove('needs-callout'));
    if(widget.dataset.exportWidget==='entries'){
      [...content.children].slice(3).forEach(element=>element.remove());
      if(!entriesOn(data,selected).length)content.textContent='暂无记录';
    }
    if(kind==='year')content.querySelectorAll('.overview-body,.overview-footer').forEach(element=>element.inert=true);
    widget.replaceChildren(content);
  }
}
exportForm.addEventListener('click',event=>{
  const control=event.target.closest('button');
  if(control?.dataset.exportCategory){
    event.stopPropagation();
    if(control.dataset.exportCategory==='focus'){renderFocusChoices();openDropdown('focusDropdown',control);}
    else{
      $('filterChoices').setAttribute('aria-label','年度分类');
      $('filterChoices').innerHTML=[...data.categories,{id:'',name:'未分类',color:'#BEC7B5'}].map(category=>pickerOption(category,`data-year-category="${h(category.id)}"`,(category.id||null)===yearCategory)).join('');
      openDropdown('filterDropdown',control);
    }
    return;
  }
  if(control?.dataset.exportRange){
    event.stopPropagation();exportRangeTarget=control.dataset.exportRange;
    const modes=exportRangeTarget==='days'?['year','month']:['year','month','day'];
    $('exportRangeChoices').innerHTML=modes.map(mode=>`<button type="button" class="filter-choice" data-export-period="${mode}" aria-selected="${exportRanges[exportRangeTarget]===mode}"><span>当前${{year:'年',month:'月',day:'日'}[mode]}</span><span class="export-period-value">${exportPeriodTitle(mode)}</span><span class="checkmark">${exportRanges[exportRangeTarget]===mode?icon('check'):''}</span></button>`).join('');
    openDropdown('exportRangeDropdown',control,'start');return;
  }
  if(event.target.closest('input,button,label'))return;
  const checkbox=event.target.closest('.export-widget-option')?.querySelector('input[name="modules"]');
  if(checkbox){checkbox.checked=!checkbox.checked;updateExportSelection();}
});
$('exportRangeDropdown').addEventListener('click',event=>{
  const choice=event.target.closest('[data-export-period]');if(!choice)return;
  const target=exportRangeTarget;exportRanges[target]=choice.dataset.exportPeriod;
  closeDropdown('exportRangeDropdown',false);renderExportWidgets();updateExportSelection();
  exportForm.querySelector(`[data-export-range="${target}"]`).focus({preventScroll:true});
});
function updateExportSelection(){
  const modules=new Set(new FormData(exportForm).getAll('modules')),version=++exportPreviewVersion;
  exportPreviewData=null;$('timelineExportConfirm').disabled=true;cancelAnimationFrame(exportPreviewFrame);
  const status=$('timelineExportStatus'),image=$('timelineExportPreview'),panel=image.parentElement;
  status.hidden=false;status.textContent=modules.size?'正在生成预览…':'选择要导出的模块';
  panel.setAttribute('aria-busy',String(!!modules.size));
  if(!modules.size){image.hidden=true;image.removeAttribute('src');return;}
  exportPreviewFrame=requestAnimationFrame(async()=>{
    try{
      const preview=await createTimelineExportPreview(modules,selected);
      if(version!==exportPreviewVersion||!$('timelineExportDialog').open)return;
      exportPreviewData=preview;image.src=preview.image.src;image.hidden=false;status.hidden=true;
      $('timelineExportConfirm').disabled=exportForm.getAttribute('aria-busy')==='true';
    }catch(error){
      if(version!==exportPreviewVersion)return;
      image.hidden=true;status.textContent=`无法生成预览：${error.message}`;
    }finally{if(version===exportPreviewVersion)panel.setAttribute('aria-busy','false');}
  });
}
exportForm.addEventListener('change',updateExportSelection);
function buildTimelineExport(modules,exportDate){
  const page=document.createElement('div');page.className=`timeline-export-surface${modules.size===1&&modules.has('timeline')?' export-timeline-only':''}`;
  const sectionHeading=title=>{
    const heading=document.createElement('div');heading.className='section-heading export-section-heading';
    const name=document.createElement('h2');name.textContent=title;heading.append(name);
    return heading;
  };
  const summaryChoices=[['categories','.category-stat'],['focus','.focus-stat'],['days','.days-stat']].filter(([key])=>modules.has(key));
  const includeOverview=modules.has('overview')&&!(view==='year'&&modules.has('year'));
  const hasOverview=includeOverview||summaryChoices.length>0;
  if(modules.has('year')){
    const section=document.createElement('section');section.append(sectionHeading('当前年视图'),buildExportYear());page.append(section);
  }
  if(hasOverview){
    const section=document.createElement('section'),card=document.createElement('div');card.className='overview-card';
    section.append(sectionHeading('时间总览'),card);
    if(summaryChoices.length){
      const stats=document.createElement('div');stats.className='stats';stats.style.gridTemplateColumns=`repeat(${summaryChoices.length},minmax(0,1fr))`;
      summaryChoices.forEach(([kind])=>stats.append(buildExportStat(kind)));card.append(stats);
    }
    if(includeOverview){
      const toolbar=document.createElement('div');toolbar.className='overview-toolbar';
      const title=document.createElement('h2');title.textContent=$('periodTitle').textContent;toolbar.append(title);card.append(toolbar);
      const chart=$('overview').cloneNode(true);if(!summaryChoices.length)chart.classList.add('export-chart-spaced');card.append(chart);
      card.append(document.querySelector('.overview-footer').cloneNode(true));
    }
    page.append(section);
  }
  const hasTimeline=modules.has('timeline'),hasEntries=modules.has('entries'),hasDistribution=modules.has('distribution');
  if(hasDistribution){
    const distribution=document.createElement('section');distribution.className='daily-card export-distribution';
    const heading=document.createElement('h3');heading.textContent='全天分布';distribution.append(heading,buildExportDistribution(exportDate));
    page.append(distribution);
  }
  if(hasTimeline||hasEntries){
    const section=document.createElement('section');section.className='export-record-section';
    const layout=document.createElement('div');layout.className=`record-layout export-record-layout${hasTimeline&&hasEntries?' export-record-paired':''}`;section.append(layout);
    let timeline;
    if(hasTimeline){
      timeline=timelineCard.cloneNode(true);timeline.classList.add('export-timeline');
      timeline.querySelector('#dayHeading').textContent='全天记录';
      timeline.querySelectorAll('.timeline-actions,.continue-button,.continue-marker,.hover-cursor,.selection,.drag-readout').forEach(element=>element.remove());
      const date=document.createElement('span');date.className='export-date';date.textContent=fullDate(exportDate);timeline.querySelector('.day-summary').append(date);
      timeline.style.minHeight='870px';
      layout.append(timeline);
    }
    if(hasEntries){
      const daily=document.createElement('aside');daily.className='daily-card export-daily-card';
      const heading=document.querySelector('.daily-card .aside-heading').cloneNode(true);heading.querySelector('h3').textContent='记录事件';
      const list=$('entryList').cloneNode(true);list.classList.add('export-entry-list');daily.append(heading,list);
      layout.append(daily);
    }
    page.append(section);
  }
  page.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));
  page.querySelectorAll('.focus-category-trigger svg,[data-export-category] svg').forEach(element=>element.remove());
  page.querySelectorAll('.empty-add,.empty-chart').forEach(element=>{
    const empty=document.createElement('span');empty.className='export-empty';empty.textContent='暂无记录';element.replaceWith(empty);
  });
  return page;
}
async function createTimelineExportPreview(modules,exportDate){
  const width=1600,surface=buildTimelineExport(modules,exportDate);
  Object.assign(surface.style,{position:'fixed',left:'-100000px',top:'0',width:`${width}px`,pointerEvents:'none'});
  surface.setAttribute('aria-hidden','true');document.body.append(surface);
  try{
    if(document.fonts)await document.fonts.ready;
    layoutTimelineLabels(surface,true);
    const height=Math.ceil(surface.offsetHeight),content=surface.cloneNode(true);
    Object.assign(content.style,{position:'relative',left:'0',top:'0',height:`${height}px`,overflow:'hidden'});
    content.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
    const style=document.createElement('style');
    style.textContent=[...document.styleSheets].flatMap(sheet=>{try{return [...sheet.cssRules].map(rule=>rule.cssText);}catch{return [];}}).join('\n');content.prepend(style);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width',width);svg.setAttribute('height',height);
    const foreign=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');foreign.setAttribute('width','100%');foreign.setAttribute('height','100%');foreign.append(content);svg.append(foreign);
    const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await image.decode();
    return {image,width,height,date:exportDate};
  }finally{surface.remove();}
}
exportForm.onsubmit=async event=>{
  event.preventDefault();if(exportForm.getAttribute('aria-busy')==='true'||!exportPreviewData)return;
  const {image,width,height,date}=exportPreviewData;
  const button=$('timelineExportConfirm');button.disabled=true;button.textContent='正在生成…';exportForm.setAttribute('aria-busy','true');
  try{
    const scale=Math.min(2,Math.sqrt(32000000/(width*height)),16384/height),canvas=document.createElement('canvas');
    canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
    const context=canvas.getContext('2d');if(!context)throw new Error('浏览器无法创建图片');
    context.scale(scale,scale);context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('图片生成失败');
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`WhereIsMyTime-${date}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('timelineExportDialog').close();toast('图片已导出');
  }catch(error){toast(`未能导出图片：${error.message}`);}
  finally{button.textContent='导出 PNG';exportForm.removeAttribute('aria-busy');button.disabled=!exportPreviewData;}
};
$('timelineExportDialog').addEventListener('close',()=>{
  ++exportPreviewVersion;cancelAnimationFrame(exportPreviewFrame);exportPreviewData=null;
  $('timelineExportPreview').removeAttribute('src');$('timelineExportPreview').hidden=true;
});
for (const id of ['periodPrev', 'dayPrev']) $(id).innerHTML = icon('left');
for (const id of ['periodNext', 'dayNext']) $(id).innerHTML = icon('right');
$('dateChevron').innerHTML = icon('down');
for (const id of ['pickerPrev', 'pickerYearPrev']) $(id).innerHTML = icon('left');
for (const id of ['pickerNext', 'pickerYearNext']) $(id).innerHTML = icon('right');
document.querySelectorAll('.dialog-heading [data-close]').forEach(b => b.innerHTML = icon('close'));
document.querySelectorAll('[data-dismiss-popover].icon-button').forEach(button=>button.innerHTML=icon('close'));
$('periodPrev').onclick = () => periodMove(-1); $('periodNext').onclick = () => periodMove(1);
$('periodToday').onclick = () => selectDate(dateKey(new Date()));
$('dayPrev').onclick = () => selectDate(addDays(selected, -1)); $('dayNext').onclick = () => selectDate(addDays(selected, 1));
$('dateTrigger').onclick = openDatePicker;
$('pickerPrev').onclick = () => pickerMove(-1); $('pickerNext').onclick = () => pickerMove(1);
$('pickerYearPrev').onclick = () => pickerMove(-1, true); $('pickerYearNext').onclick = () => pickerMove(1, true);
$('pickerTitle').onclick = () => { pickerMonthMode = !pickerMonthMode; renderDatePicker(); };
$('pickerYear').oninput = () => { const value = $('pickerYear').value, year = Number(value); if (value.length === 4 && Number.isInteger(year) && year >= 1900 && year <= 9999) { const d = fromKey(pickerCursor); d.setFullYear(year); pickerCursor = dateKey(d); $('pickerTitle').innerHTML = `${year}年${d.getMonth() + 1}月${icon('down')}`; } };
$('pickerYear').onchange = () => { const year = Number($('pickerYear').value); if (Number.isInteger(year) && year >= 1900 && year <= 9999) { const d = fromKey(pickerCursor); d.setFullYear(year); pickerCursor = dateKey(d); } renderDatePicker(); };
$('pickerToday').onclick = () => { selectDate(dateKey(new Date())); closeDropdown('dateDropdown'); };
$('addEntry').onclick = () => openNew();
$('continueEntry').onclick = () => { const range = continuationRange(entriesOn(data, selected)); if (range) openEntry(null, ...range); };
$('manageEvents').onclick = () => { renderEventManager(); $('eventsDialog').showModal(); };
$('pickerNewCategory').onclick=()=>{closeDropdown('categoryDropdown');openCategoryForm(categoryTarget);};
$('categoryForm').onsubmit=function submitCategory(event) {
  event.preventDefault();
  try {
    const name=normalizeName($('categoryName').value),next=saveCategory(data,{name,color:categoryFormColor}),category=next.categories.find(item=>item.name===name);
    if(categoryTarget?.kind==='event'){const item=getEvent(next,categoryTarget.id);if(item)item.categoryId=category.id;}
    if(commit(next)){if(categoryTarget?.kind==='entry'){modalCategoryId=category.id;renderEntryCategoryChoices();}renderEventManager();$('categoryFormDialog').close();toast('分类已创建');}
  }catch(error){$('categoryError').textContent=error.message;$('categoryError').hidden=false;}
};
$('hexColor').oninput=function inputHex() {
  if(/^#[0-9a-fA-F]{6}$/.test($('hexColor').value)){colorHsv=hexToHsv($('hexColor').value);paintColorPicker();$('colorError').hidden=true;}
  positionDropdown('colorDropdown',$('colorDropdown').dataset.align);
};
$('colorForm').onsubmit=function submitColor(event) {
  event.preventDefault();const color=$('hexColor').value.trim().toUpperCase();
  if(!/^#[0-9A-F]{6}$/.test(color)){$('colorError').textContent='请输入有效颜色，例如 #89A996';$('colorError').hidden=false;positionDropdown('colorDropdown',$('colorDropdown').dataset.align);return;}
  closeDropdown('colorDropdown');applyColor(color);
};
$('filterButton').onclick = () => { renderFilters(); openDropdown('filterDropdown', $('filterButton')); };
$('backupButton').onclick = () => { $('backupMenu').hidden = !$('backupMenu').hidden; $('backupButton').setAttribute('aria-expanded', String(!$('backupMenu').hidden)); };
$('exportButton').onclick = downloadBackup;
$('importButton').onclick = () => { closeBackup(); $('importFile').value = ''; $('importFile').click(); };
$('importFile').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 25 * 1024 * 1024) { toast('备份文件不能超过 25 MB'); return; }
  try { imported = readBackup(JSON.parse(await file.text())); $('importSummary').innerHTML = `<span><strong>${imported.entries.length}</strong>条记录</span><span><strong>${imported.events.length}</strong>个事件</span><span><strong>${imported.categories.length}</strong>个分类</span>`; $('importError').hidden = true; document.querySelector(`input[name="importMode"][value="${persistenceLocked ? 'replace' : 'merge'}"]`).checked = true; $('importDialog').showModal(); }
  catch (error) { toast(error instanceof SyntaxError ? '无法读取 JSON 备份文件' : error.message); }
};
$('confirmImport').onclick = () => {
  try {
    const mode = document.querySelector('input[name="importMode"]:checked').value;
    const next = mode === 'replace' ? imported : mergeData(data, imported);
    if (commit(next, true)) { $('importDialog').close(); imported = null; toast('备份已导入'); }
  } catch (error) { $('importError').textContent = error.message; $('importError').hidden = false; }
};
$('startTime').oninput = updateDuration; $('endTime').oninput = updateDuration;
for (const id of ['startTime', 'endTime']) $(id).onblur = () => { const value = $(id).value.trim(); if (/^\d{3,4}$/.test(value)) $(id).value = `${value.padStart(4, '0').slice(0, 2)}:${value.slice(-2)}`; else if (/^\d:\d{2}$/.test(value)) $(id).value = `0${value}`; updateDuration(); };
$('entryName').oninput=function inputEntryName() {
  const item=data.events.find(item=>item.name===normalizeName($('entryName').value));
  if(item&&item.name!==modalMatchedName){modalColor=item.color;modalColorManual=false;modalMatchedName=item.name;modalCategoryId=item.categoryId||null;renderColors();}
  else if(!item&&modalMatchedName){modalMatchedName=null;modalCategoryId=null;if(!modalColorManual){modalColor=freshColor();renderColors();}}
  renderEntryEventChoices();
  renderEntryCategoryChoices();
};
for (const id of ['startTime', 'endTime']) $(id).addEventListener('keydown', event => { if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); stepTime(id, event.key === 'ArrowUp' ? 5 : -5); } });
$('entryForm').onsubmit = event => {
  event.preventDefault();
  try {
    const start = parseTime($('startTime').value.trim()), end = parseTime($('endTime').value.trim());
    if (start === null || end === null) throw new Error('请输入 5 分钟刻度的时间，例如 09:05，全天结束为 24:00');
    const next=saveEntry(data,{id:editing,date:selected,start,end,name:$('entryName').value,color:modalColor,categoryId:modalCategoryId});
    if (commit(next)) { $('entryDialog').close(); toast(editing ? '记录已更新' : '时间已记下'); }
  } catch (error) { $('entryError').textContent = error.message; $('entryError').hidden = false; }
};
$('deleteEntry').onclick = () => {
  const removed = data.entries.find(e => e.id === editing); if (!removed) return;
  const savedEvent = structuredClone(getEvent(data,removed.eventId));
  const next = { ...data, entries: data.entries.filter(e => e.id !== editing) };
  if (commit(next)) { $('entryDialog').close(); toast('记录已删除', '撤销', () => { if (commit(restoreEntry(data, removed, savedEvent))) toast('记录已恢复'); }); }
};
$('confirmCancel').onclick = () => { confirmAction = null; $('confirmDialog').close(); };
$('confirmAccept').onclick = () => { const action = confirmAction; confirmAction = null; $('confirmDialog').close(); action?.(); };

document.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!event.target.closest('.menu-wrap')) closeBackup();
  if (!target) return;
  if (target.id === 'focusCategoryButton') { renderFocusChoices(); openDropdown('focusDropdown',target); return; }
  if (target.hasAttribute('data-focus-category')) {
    focusCategory = target.dataset.focusCategory || null; closeDropdown('focusDropdown',false);
    try { localStorage.setItem(FOCUS_KEY,JSON.stringify(focusCategory)); } catch { toast('关注分类未能保存，当前页面仍可使用'); }
    renderOverview();
    ($('timelineExportDialog').open?exportForm.querySelector('[data-export-category="focus"]'):$('focusCategoryButton'))?.focus({preventScroll:true});return;
  }
  if (target.dataset.close) { $(target.dataset.close).close(); return; }
  if (target.dataset.dismissPopover) { closeDropdown(target.dataset.dismissPopover); return; }
  if (target.dataset.randomColor) {
    if (target.dataset.randomColor === 'entry') { modalColor = freshColor([modalColor]); modalColorManual = true; entryPalette = freshPalette(modalColor); renderColors(); }
    else { categoryFormColor = freshColor([categoryFormColor]); categoryPalette = freshPalette(categoryFormColor); renderCategoryFormColors(); }
    return;
  }
  if (target.dataset.refreshColors) {
    if (target.dataset.refreshColors === 'entry') { entryPalette = freshPalette(modalColor); renderColors(); }
    else { categoryPalette = freshPalette(categoryFormColor); renderCategoryFormColors(); }
    return;
  }
  if (target.dataset.stepTime) { stepTime(target.dataset.stepTime, Number(target.dataset.step)); return; }
  if (target.dataset.managerTab) { setManagerTab(target.dataset.managerTab); return; }

  if (target.hasAttribute('data-continue')) { const start = Number(target.dataset.continue); openEntry(null, start, Math.min(start + 30, 1440)); return; }
  if (target.dataset.assignCategory) { openCategoryPicker(target.dataset.assignCategory, target); return; }
  if (target.dataset.categoryEvents) { openCategoryEvents(target.dataset.categoryEvents,target); return; }
  if(target.hasAttribute('data-pick-category')){
    const id=categoryTarget?.id;closeDropdown('categoryDropdown',false);const next=structuredClone(data),item=getEvent(next,id);if(!item)return;item.categoryId=target.dataset.pickCategory||null;
    if(commit(next)){renderEventManager();[...document.querySelectorAll('[data-assign-category]')].find(button=>button.dataset.assignCategory===id)?.focus({preventScroll:true});}return;
  }
  if (target.id === 'managerNewCategory') { openCategoryForm({ kind: 'manager' }); return; }
  if (target.dataset.categoryColor) { categoryFormColor = target.dataset.categoryColor; renderCategoryFormColors(); return; }
  if (target.id === 'customColorButton') { openColor({ kind: 'entry' }, modalColor, target); return; }
  if (target.id === 'categoryCustomColor') { openColor({ kind: 'categoryForm' }, categoryFormColor, target); return; }
  if (target.dataset.eventColor) { openColor({ kind: 'event', id: target.dataset.eventColor }, getEvent(data, target.dataset.eventColor).color, target); return; }
  if (target.dataset.categoryEditColor) { openColor({ kind: 'category', id: target.dataset.categoryEditColor }, getCategory(data, target.dataset.categoryEditColor).color, target); return; }
  if (target.dataset.hexColor) { $('hexColor').value=target.dataset.hexColor;colorHsv=hexToHsv(target.dataset.hexColor);paintColorPicker();return; }
  if (target.dataset.deleteCategory) { const id = target.dataset.deleteCategory, category = getCategory(data, id); askConfirm(`删除分类「${category.name}」？所属事件将改为未分类。`, () => { if (commit(deleteCategory(data, id))) { renderEventManager();toast('分类已删除'); } }); return; }
  if (target.dataset.pickerDate) { selectDate(target.dataset.pickerDate); closeDropdown('dateDropdown'); return; }
  if (target.hasAttribute('data-picker-month')) { const d = fromKey(pickerCursor); d.setDate(1); d.setMonth(Number(target.dataset.pickerMonth)); pickerCursor = dateKey(d); pickerMonthMode = false; renderDatePicker(); positionDropdown('dateDropdown', 'start'); return; }
  if (target.dataset.view) { view = target.dataset.view; cursor = selected; renderOverview(); return; }
  if (target.dataset.aggregation) { aggregation = target.dataset.aggregation; filter = null; renderOverview(); return; }
  if (target.dataset.date) { selectDate(target.dataset.date); return; }
  if (target.dataset.entry) { openEntry(target.dataset.entry); return; }
  if (target.hasAttribute('data-new')) { openNew(); return; }
  if (target.dataset.newDate) { selectDate(target.dataset.newDate); openNew(); return; }
  if (target.hasAttribute('data-filter')) { const id = target.dataset.filter || null, kind = target.dataset.filterKind; filter = filter?.kind === kind && filter.id === id ? null : { kind, id }; renderOverview(); return; }
  if (target.dataset.filterAll) { filter=null;closeDropdown('filterDropdown');renderOverview(); return; }
  if (target.hasAttribute('data-filter-choice')) { filter={kind:target.dataset.filterKind,id:target.dataset.filterChoice||null};closeDropdown('filterDropdown');renderOverview(); return; }
  if (target.hasAttribute('data-year-category')) { yearCategory=target.dataset.yearCategory||null;closeDropdown('filterDropdown',false);renderOverview();if($('timelineExportDialog').open)exportForm.querySelector('[data-export-category="year"]')?.focus({preventScroll:true});return; }

  if (target.dataset.color) { modalColor = target.dataset.color; modalColorManual = true; renderColors(); return; }
  if (target.dataset.deleteEvent) {
    const id = target.dataset.deleteEvent, t = getEvent(data, id), count = data.entries.filter(entry=>entry.eventId===id).length;
    askConfirm(`删除「${t.name}」${count ? `及 ${count} 条记录` : ''}？`, () => { const next = { ...data, events: data.events.filter(t => t.id !== id), entries:data.entries.filter(entry=>entry.eventId!==id) }; if (commit(next)) { renderEventManager(); toast('事件已删除'); } });
  }
});
function saveManagerName(input) {
  if (!input.matches('.manager-name')) return;
  const row=input.closest('.manager-row'),isCategory=input.matches('.category-name'),id=isCategory?row.dataset.category:row.dataset.event;
  const current=isCategory?getCategory(data,id):getEvent(data,id);if(!current)return;
  const name=normalizeName(input.value);
  if(name===current.name){input.value=current.name;return;}
  try {
    const next=isCategory?saveCategory(data,{...current,name}):renameEvent(data,id,name);
    if(!commit(next)){input.value=current.name;return;}
    const saved=isCategory?getCategory(data,id):getEvent(data,id);
    if(!saved){renderEventManager();return;}
    // Keep the row mounted so a click on the adjacent control still reaches it.
    input.value=saved.name;input.defaultValue=saved.name;
    const colorButton=row.querySelector('.manager-color-button'),deleteButton=row.querySelector('[data-delete-event],[data-delete-category]');
    colorButton.setAttribute('aria-label',`修改${isCategory?'分类':''}${saved.name}的颜色`);
    deleteButton.setAttribute('aria-label',`删除${isCategory?'分类':'事件'}${saved.name}`);
    if(isCategory){input.setAttribute('aria-label',`修改分类${saved.name}的名称`);row.querySelector('[data-category-events]').setAttribute('aria-label',`查看${saved.name}分类中的事件`);}
  }catch(error){toast(error.message);input.value=current.name;}
}
for(const id of ['eventManager','categoryManager']) {
  $(id).addEventListener('focusout',event=>saveManagerName(event.target));
  $(id).addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('.manager-name')){event.preventDefault();event.target.blur();}});
}
document.querySelectorAll('dialog').forEach(dialog => {
  let gesture = null;
  const outside = event => {
    if (event.target !== dialog && dialog.contains(event.target)) return false;
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  dialog.addEventListener('pointerdown', event => {
    if (event.target.closest('dialog') !== dialog || event.button !== 0 || !event.isPrimary) return;
    gesture = { id: event.pointerId, startOutside: outside(event), endOutside: false };
  }, true);
  dialog.addEventListener('pointerup', event => {
    if (gesture?.id === event.pointerId) gesture.endOutside = outside(event);
  }, true);
  dialog.addEventListener('pointercancel', () => { gesture = null; });
  dialog.addEventListener('click', event => {
    const close = gesture?.startOutside && gesture.endOutside && event.target === dialog && outside(event) && event.detail > 0;
    gesture = null;
    if (close) dialog.close();
  });
  dialog.addEventListener('close', () => { gesture = null; });
});
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => { for (const id of dropdownAnchors.keys()) if (dialog.contains($(id))) closeDropdown(id, false); }));
document.querySelectorAll('[popover]').forEach(panel => {
  panel.addEventListener('toggle', event => { if (event.newState === 'closed' && !panel.matches(':popover-open')) { dropdownAnchors.get(panel.id)?.setAttribute('aria-expanded', 'false'); } });
  panel.addEventListener('keydown', event => {
    if (event.target.closest('[popover]') !== panel) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeDropdown(panel.id); return; }
    if (event.defaultPrevented || event.target.closest('input,textarea,[role="slider"]')) return;
    const list = event.target.closest('[role="listbox"]') || panel;
    const options = [...list.querySelectorAll('[role="option"]')]; if (!options.length) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const i = options.indexOf(document.activeElement), index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (i + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length;
      options[index].focus({ preventScroll: true }); options[index].scrollIntoView({ block: 'nearest' });
    }
  });
});
window.addEventListener('resize', () => { updateYearLayout(); for (const id of dropdownAnchors.keys()) positionDropdown(id, $(id).dataset.align); });
window.addEventListener('scroll', event => { if (event.target instanceof Element && event.target.closest('[popover]')) return; for (const id of dropdownAnchors.keys()) positionDropdown(id, $(id).dataset.align); }, { capture: true, passive: true });
new ResizeObserver(updateYearLayout).observe($('overview'));
document.querySelector('.view-switch').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); const buttons = [...document.querySelectorAll('[data-view]')], index = buttons.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowRight' ? 1 : 3)) % 4; buttons[next].click(); buttons[next].focus();
});

function trackMinute(track, clientX) {
  const r = track.getBoundingClientRect(), base = Number(track.dataset.base), raw = base + Math.max(0, Math.min(360, (clientX - r.left) / r.width * 360));
  const boundaries = entriesOn(data, selected).flatMap(e => [e.start, e.end]).filter(m => m >= base && m <= base + 360);
  return Math.max(base, Math.min(base + 360, snapMinute(raw, boundaries, Math.max(2.5, 7 / r.width * 360))));
}
function clearHover() { if (hoverTrack) { hoverTrack.querySelector('.hover-cursor')?.remove(); hoverTrack = null; } }
function showHover(track, minute) {
  if (hoverTrack !== track) clearHover(); hoverTrack = track;
  let marker = track.querySelector('.hover-cursor'); if (!marker) { marker = document.createElement('span'); marker.className = 'hover-cursor'; track.append(marker); }
  const base = Number(track.dataset.base), continuation = continuationRange(entriesOn(data, selected));
  marker.style.left = `${(minute - base) / 360 * 100}%`; marker.classList.toggle('hover-edge-left', minute - base < 30); marker.classList.toggle('hover-edge-right', minute - base > 330);
  marker.innerHTML = `<span class="hover-time">${timeText(minute)}${continuation?.[0] === minute ? '<strong>接续</strong>' : ''}</span>`;
}
function timelinePoint(clientX,clientY) {
  const tracks=[...$('timeBands').querySelectorAll('.time-track')];
  for(let i=0;i<tracks.length;i++){const r=tracks[i].getBoundingClientRect();if(clientY<=r.bottom){if(clientY<r.top&&i>0)return Number(tracks[i].dataset.base);return trackMinute(tracks[i],clientX);}}
  return 1440;
}
function dragRange(clientX,clientY) {
  const value = timelinePoint(clientX,clientY), anchor = drag.anchor;
  const start = Math.min(anchor, value), end = Math.max(anchor, value);
  return end===start?[Math.min(1435,start),Math.min(1440,start+5)]:[start,end];
}
function showSelection(start, end) {
  drag.start = start; drag.end = end;
  for(const track of $('timeBands').querySelectorAll('.time-track')){
    const base=Number(track.dataset.base),from=Math.max(start,base),to=Math.min(end,base+360);let segment=track.querySelector('.selection');
    if(to<=from){segment?.remove();continue;}if(!segment){segment=document.createElement('div');segment.className='selection';track.append(segment);}
    segment.style.left=`${(from-base)/360*100}%`;segment.style.width=`${(to-from)/360*100}%`;segment.textContent='';
  }
  let readout=$('timeBands').querySelector('.drag-readout');if(!readout){readout=document.createElement('span');readout.className='drag-readout';$('timeBands').append(readout);}
  readout.textContent=`${timeText(start)} — ${timeText(end)}　${durationText(end-start)}`;
}
$('timeBands').addEventListener('pointerdown', event => {
  const track = event.target.closest('.time-track'); if (!track || event.target.closest('button') || event.button !== 0) return;
  const anchor = Math.min(1435, trackMinute(track, event.clientX));
  clearHover();
  drag = {track,anchor,originX:event.clientX,originY:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false,pointerId:event.pointerId}; track.setPointerCapture(event.pointerId); showSelection(anchor, anchor + 5); dragScroll();
});
$('timeBands').addEventListener('pointermove', event => {
  if (!drag) { const track = event.target.closest('.time-track'); if (track && !event.target.closest('button') && event.pointerType !== 'touch') showHover(track, trackMinute(track, event.clientX)); else clearHover(); return; }
  if (event.pointerId !== drag.pointerId) return;drag.lastX=event.clientX;drag.lastY=event.clientY; if (Math.hypot(event.clientX-drag.originX,event.clientY-drag.originY)>3) drag.moved = true; const [start, end] = dragRange(event.clientX,event.clientY); showSelection(start, end);
});
$('timeBands').addEventListener('pointerout', event => { if (!drag && hoverTrack && !hoverTrack.contains(event.relatedTarget)) clearHover(); });
$('timeBands').addEventListener('pointerup', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const start = drag.start, end = drag.moved ? drag.end : Math.min(1440, start + 30);
  cancelDrag(); openEntry(null, start, end);
});
function dragScroll(){if(!drag)return;const speed=drag.lastY>innerHeight-48?8:drag.lastY<48?-8:0;if(speed){(timelineFullscreen.open?timelineFullscreen:window).scrollBy(0,speed);showSelection(...dragRange(drag.lastX,drag.lastY));}drag.frame=requestAnimationFrame(dragScroll);}
function cancelDrag() { if (drag) {const previous=drag;drag=null;cancelAnimationFrame(previous.frame);$('timeBands').querySelectorAll('.selection,.drag-readout').forEach(el=>el.remove());if(previous.track.hasPointerCapture(previous.pointerId))previous.track.releasePointerCapture(previous.pointerId);} }
$('timeBands').addEventListener('pointercancel', cancelDrag);
$('timeBands').addEventListener('lostpointercapture', cancelDrag);
window.addEventListener('blur',cancelDrag);
$('timeBands').addEventListener('keydown', event => { if (event.target.matches('.time-track') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); const base = Number(event.target.dataset.base); openNew(base, base + 360); } });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeBackup(); cancelDrag(); } });
window.addEventListener('storage', event => {
  if (event.key === FOCUS_KEY) {
    try { const id=event.newValue===null?'study':JSON.parse(event.newValue); if(id===null||typeof id==='string'){focusCategory=id;renderOverview();} } catch {}
    return;
  }
  if (event.key !== STORAGE_KEY) return;
  try { data = event.newValue ? validateData(JSON.parse(event.newValue)) : emptyData(); persistenceLocked = false;$('storageNotice').hidden=true; if (!validFilter()) filter = null; render(); if ($('eventsDialog').open) renderEventManager(); toast('已同步另一个页面的记录'); } catch { rawStorage=event.newValue;persistenceLocked=true;showStorageFailure('另一个页面保存了当前版本无法读取的数据，请刷新或导出原件'); }
});
function refreshCalendarDay() {
  const today = dateKey(new Date());
  if (today !== calendarDay) { calendarDay=today; render(); }
  clearTimeout(midnightTimer);
  const now = new Date(), next = new Date(now); next.setHours(24,0,0,50);
  midnightTimer = setTimeout(refreshCalendarDay,Math.max(100,next-now));
}
window.addEventListener('focus',refreshCalendarDay);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshCalendarDay();});
render();
refreshCalendarDay();
new ResizeObserver(entries=>{document.querySelector('.record-layout').style.setProperty('--timeline-height',`${Math.ceil(entries[0].borderBoxSize?.[0]?.blockSize||document.querySelector('.timeline-card').getBoundingClientRect().height)}px`);}).observe(document.querySelector('.timeline-card'));
if(persistenceLocked)showStorageFailure(startup.error);
else if(startup.migrated)toast('数据已升级并验证，升级前原件可在备份中恢复');
