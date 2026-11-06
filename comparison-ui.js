import { readBackup } from './core.js';
import { COMPARISON_FONT, MAX_COMPARISON_RECORDS, comparisonDates, layoutComparison, renderComparisonSvg } from './comparison.js';

export function setupComparison({getData, getSelectedDate, toast, icon, beforeOpen, openDatePicker, closeDatePicker, openDropdown, closeDropdown, afterDialogExit, finishDialogCleanup}) {
  const $ = id => document.getElementById(id), dialog = $('comparisonDialog');
  // These backups never enter the application's import, commit or storage paths.
  const sides = [];
  let nextId = 0, preview = null, busy = false, generation = 0, sourceTarget = null, previewFrame = 0, previewTimer = 0;
  const sources = [{value:'own', name:'自己的记录'}, {value:'backup', name:'导入他人的备份'}];
  const exportButtons = ['comparisonCopy', 'comparisonPng', 'comparisonSvg', 'comparisonFullscreen'];
  $('compareRecords').innerHTML = icon('compare') + '对比记录';
  $('comparisonFullscreen').innerHTML = icon('expand') + '全屏';
  $('comparisonAdd').innerHTML = icon('plus');
  const isLive = side => sides.includes(side);
  const sourceData = side => side.controls.source.value === 'own' ? getData() : side.controls.source.value === 'backup' ? side.backup : null;
  const readyRecords = () => sides.filter(side => !side.loading && sourceData(side) && side.controls.date.value);
  const canExport = () => !!preview && !busy && readyRecords().length === sides.length;

  function updateButtons() {
    exportButtons.forEach(id => $(id).disabled = !canExport());
  }
  const ready = () => readyRecords().length >= 2;
  function invalidate({delay = 0, clearError = true} = {}) {
    const version = ++generation; preview = null;
    cancelAnimationFrame(previewFrame); clearTimeout(previewTimer);
    const canRender = dialog.open && ready();
    if (!canRender) {
      $('comparisonPreview').replaceChildren(); $('comparisonPreview').hidden = true;
      $('comparisonEmpty').hidden = false;
    }
    if (clearError) $('comparisonError').hidden = true;
    updateButtons();
    if (!canRender) return;
    const schedule = () => { previewFrame = requestAnimationFrame(() => renderPreview(version)); };
    if (delay) previewTimer = setTimeout(schedule, delay); else schedule();
  }
  function refreshSide(side) {
    const c = side.controls, source = c.source.value, imported = source === 'backup';
    c.import.hidden = !imported; c.filename.hidden = !imported;
    c.filename.textContent = side.loading ? '正在读取备份…' : side.filename || '尚未选择备份';
    c.sourceValue.textContent = sources.find(item => item.value === source)?.name || '选择数据来源';
    c.sourceValue.classList.toggle('comparison-source-placeholder', !source);
    const dates = comparisonDates(sourceData(side)), previous = c.date.value;
    c.date.value = dates.includes(previous) ? previous : side.autoDate ? dates.includes(getSelectedDate()) ? getSelectedDate() : dates[0] || '' : '';
    c.dateValue.textContent = c.date.value ? c.date.value.replaceAll('-', '/') : !source ? '请选择数据来源' : imported && !side.backup ? '请先导入备份' : !dates.length ? '此来源没有记录' : '选择日期';
    c.dateValue.classList.toggle('comparison-source-placeholder', !c.date.value);
    c.dateButton.disabled = !dates.length || side.loading;
    updateButtons();
  }
  function error(message, side) { $('comparisonError').textContent = side && isLive(side) ? `${side.controls.title.textContent}：${message}` : message; $('comparisonError').hidden = false; }
  function refreshLabels() {
    sides.forEach((side, index) => {
      side.controls.title.textContent = `记录 ${String.fromCharCode(65 + index)}`;
      side.controls.name.placeholder = `记录${index + 1}`;
      side.controls.remove.hidden = sides.length <= 2;
      side.controls.remove.setAttribute('aria-label', `移除记录 ${String.fromCharCode(65 + index)}`);
    });
    $('comparisonAdd').disabled = sides.length >= MAX_COMPARISON_RECORDS;
    $('comparisonAdd').setAttribute('aria-label', sides.length >= MAX_COMPARISON_RECORDS ? '已达到 6 份记录上限' : '添加对比记录');
  }
  function removeRecord(side) {
    if (sides.length <= 2 || !isLive(side)) return;
    closeDatePicker(); closeDropdown('comparisonSourceDropdown', false); sourceTarget = null;
    const index = sides.indexOf(side); ++side.version;
    sides.splice(index, 1); side.card.remove(); refreshLabels(); invalidate();
    sides[Math.min(index, sides.length - 1)].controls.sourceButton.focus({preventScroll:true});
  }

  $('compareRecords').onclick = () => {
    beforeOpen(); sides.forEach(refreshSide); dialog.showModal(); invalidate();
  };
  $('comparisonSourceChoices').onclick = event => {
    const choice = event.target.closest('[data-comparison-source]');
    if (!choice || !isLive(sourceTarget)) return;
    const value = choice.dataset.comparisonSource, source = sources.find(source => source.value === value), side = sourceTarget, c = side.controls;
    if (!source) return;
    closeDropdown('comparisonSourceDropdown');
    if (c.source.value === value) return;
    closeDatePicker();
    if (!c.source.value && side.names[''] && !side.names[value]) side.names[value] = side.names[''];
    c.source.value = value; c.name.value = side.names[value];
    refreshSide(side); invalidate();
  };
  function addRecord(initial = false) {
    if (sides.length >= MAX_COMPARISON_RECORDS) return;
    const card = $('comparisonRecordTemplate').content.firstElementChild.cloneNode(true), id = nextId++;
    const ids = {title:'comparisonRecordTitle',remove:'comparisonRemove',sourceLabel:'comparisonSourceLabel',source:'comparisonSource',sourceButton:'comparisonSourceButton',sourceValue:'comparisonSourceValue',import:'comparisonImport',filename:'comparisonFilename',file:'comparisonFile',dateLabel:'comparisonDateLabel',date:'comparisonDate',dateButton:'comparisonDateButton',dateValue:'comparisonDateValue',name:'comparisonName'};
    const c = Object.fromEntries(Object.entries(ids).map(([field,prefix]) => { const control = card.querySelector(`[data-field="${field}"]`); control.id = prefix + id; return [field,control]; }));
    const side = {id,card,controls:c,autoDate:initial,backup:null,filename:'',loading:false,version:0,names:{'':'',own:'',backup:''}};
    card.dataset.recordId = id; card.setAttribute('aria-labelledby', c.title.id);
    c.sourceButton.setAttribute('aria-labelledby', `${c.sourceLabel.id} ${c.sourceValue.id}`);
    c.dateButton.setAttribute('aria-labelledby', `${c.dateLabel.id} ${c.dateValue.id}`);
    card.querySelectorAll('.select-chevron').forEach(element => element.innerHTML = icon('down'));
    card.querySelector('.date-icon').innerHTML = icon('calendar'); c.remove.innerHTML = icon('close');
    c.source.value = initial ? 'own' : '';
    sides.push(side); $('comparisonCards').append(card);
    c.remove.onclick = () => removeRecord(side);
    c.sourceButton.onclick = () => {
      sourceTarget = side;
      $('comparisonSourceChoices').innerHTML = sources.map(source => {
        const selected = source.value === c.source.value;
        return `<button type="button" class="filter-choice" data-comparison-source="${source.value}" aria-selected="${selected}"><span>${source.name}</span><span class="checkmark">${selected ? icon('check') : ''}</span></button>`;
      }).join('');
      openDropdown('comparisonSourceDropdown', c.sourceButton, 'start');
    };
    c.dateButton.onclick = () => {
      const dates = comparisonDates(sourceData(side));
      openDatePicker(c.date.id, c.dateButton, {
        dates:new Set(dates), initialDate:dates.includes(getSelectedDate()) ? getSelectedDate() : dates[0],
        onSelect:key => { if (!isLive(side)) return; c.date.value = key; refreshSide(side); invalidate(); }
      });
    };
    c.name.oninput = () => { side.names[c.source.value] = c.name.value; invalidate({delay:120}); };
    c.import.onclick = () => { c.file.value = ''; c.file.click(); };
    c.file.onchange = async event => {
      const file = event.target.files[0]; if (!file) return;
      closeDatePicker();
      const version = ++side.version;
      side.loading = false;
      if (file.size > 25 * 1024 * 1024) { invalidate(); refreshSide(side); error('备份文件不能超过 25 MB', side); return; }
      side.loading = true; invalidate(); refreshSide(side);
      try {
        const text = await file.text();
        if (version !== side.version || !isLive(side)) return;
        side.backup = readBackup(JSON.parse(text)); side.filename = file.name;
      } catch (cause) {
        if (version === side.version && isLive(side)) error(cause instanceof SyntaxError ? '无法读取 JSON 备份文件' : cause.message, side);
      } finally {
        if (version === side.version && isLive(side)) { side.loading = false; refreshSide(side); invalidate({clearError:false}); }
      }
    };
    refreshSide(side); refreshLabels(); invalidate();
    if (!initial) requestAnimationFrame(() => {
      if (!isLive(side) || !dialog.open) return;
      c.sourceButton.focus({preventScroll:true});
      const scrollTarget = matchMedia('(max-width:700px)').matches ? $('comparisonAdd') : card;
      scrollTarget.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
    });
  }
  $('comparisonAdd').onclick = () => addRecord();
  async function renderPreview(version) {
    if (version !== generation || !dialog.open || !ready()) return;
    const records = readyRecords().map(side => ({data:sourceData(side), date:side.controls.date.value, name:side.controls.name.value.trim() || `记录${sides.indexOf(side) + 1}`}));
    try {
      if (document.fonts) await document.fonts.ready;
      if (version !== generation || !dialog.open || !ready()) return;
      const context = document.createElement('canvas').getContext('2d');
      if (!context) throw new Error('浏览器无法生成对照图');
      const measure = (value, size) => { context.font = `${size}px ${COMPARISON_FONT}`; return context.measureText(value).width; };
      const layout = layoutComparison(records, {measure}), svg = renderComparisonSvg(layout);
      preview = {svg, width:layout.width, height:layout.height, filename:`对比记录-${[...new Set(records.map(record => record.date))].join('_')}`};
      $('comparisonPreview').innerHTML = svg; $('comparisonPreview').hidden = false; $('comparisonEmpty').hidden = true;
    } catch (cause) {
      $('comparisonPreview').replaceChildren(); $('comparisonPreview').hidden = true; $('comparisonEmpty').hidden = false;
      error(cause.message);
    }
    updateButtons();
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function png(image) {
    if (image.png) return image.png;
    image.png = (async () => {
      const url = URL.createObjectURL(new Blob([image.svg], {type:'image/svg+xml;charset=utf-8'}));
      try {
        const bitmap = new Image(); bitmap.src = url; await bitmap.decode();
        const scale = Math.min(2, 16384 / Math.max(image.width, image.height), Math.sqrt(32000000 / (image.width * image.height)));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d'); if (!context) throw new Error('浏览器无法创建图片');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('图片生成失败'); return blob;
      } finally { URL.revokeObjectURL(url); }
    })().catch(cause => { image.png = null; throw cause; });
    return image.png;
  }
  async function exportImage(copy) {
    if (!canExport()) return;
    if (copy && (!navigator.clipboard?.write || !globalThis.ClipboardItem)) { toast('当前浏览器不支持复制图片，请导出 PNG'); return; }
    busy = true; updateButtons();
    const image = preview, button = $(copy ? 'comparisonCopy' : 'comparisonPng'); button.setAttribute('aria-busy', 'true');
    try {
      if (copy) { await navigator.clipboard.write([new ClipboardItem({'image/png':png(image)})]); toast('对照图已复制'); }
      else { download(await png(image), `${image.filename}.png`); toast('对照图已导出'); }
    } catch (cause) { toast(`未能${copy ? '复制' : '导出'}图片：${cause.message}`); }
    finally { busy = false; button.removeAttribute('aria-busy'); updateButtons(); }
  }
  $('comparisonCopy').onclick = () => exportImage(true);
  $('comparisonPng').onclick = () => exportImage(false);
  $('comparisonSvg').onclick = () => { if (canExport()) download(new Blob([preview.svg], {type:'image/svg+xml;charset=utf-8'}), `${preview.filename}.svg`); };
  $('comparisonFullscreen').onclick = () => {
    if (!canExport()) return;
    finishDialogCleanup($('comparisonFullscreenDialog'));
    $('comparisonFullscreenPreview').innerHTML = preview.svg; $('comparisonFullscreenDialog').showModal();
  };
  $('comparisonFullscreenClose').innerHTML = icon('collapse');
  $('comparisonFullscreenClose').onclick = () => $('comparisonFullscreenDialog').close();
  $('comparisonFullscreenDialog').addEventListener('close', () => afterDialogExit($('comparisonFullscreenDialog'), () => $('comparisonFullscreenPreview').replaceChildren()));
  dialog.addEventListener('close', () => { if (dialog.open) return; ++generation; cancelAnimationFrame(previewFrame); clearTimeout(previewTimer); closeDatePicker(); closeDropdown('comparisonSourceDropdown',false); });
  addRecord(true); addRecord();
}
