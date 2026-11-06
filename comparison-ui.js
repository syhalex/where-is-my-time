import { readBackup } from './core.js';
import { COMPARISON_FONT, comparisonDates, layoutComparison, renderComparisonSvg } from './comparison.js';

export function setupComparison({getData, getSelectedDate, toast, icon, beforeOpen, openDatePicker, closeDatePicker, openDropdown, closeDropdown, afterDialogExit, finishDialogCleanup}) {
  const $ = id => document.getElementById(id), dialog = $('comparisonDialog');
  // These backups never enter the application's import, commit or storage paths.
  const sides = Array.from({length:2}, () => ({backup:null, filename:'', loading:false, version:0, names:{own:'',backup:''}}));
  let preview = null, busy = false, generation = 0, sourceTarget = null;
  const sources = [{value:'own', name:'自己的记录'}, {value:'backup', name:'导入他人的备份'}];
  const exportButtons = ['comparisonCopy', 'comparisonPng', 'comparisonSvg', 'comparisonFullscreen'];
  $('compareRecords').innerHTML = icon('compare') + '对比记录';
  $('comparisonFullscreen').innerHTML = icon('expand') + '全屏';
  const sourceData = index => $(`comparisonSource${index}`).value === 'own' ? getData() : sides[index].backup;

  function updateButtons() {
    exportButtons.forEach(id => $(id).disabled = !preview || busy);
    $('comparisonGenerate').disabled = busy || sides.some((side, index) => side.loading || !$(`comparisonDate${index}`).value);
  }
  function invalidate() {
    ++generation; preview = null;
    $('comparisonPreview').replaceChildren(); $('comparisonPreview').hidden = true;
    $('comparisonEmpty').hidden = false; $('comparisonError').hidden = true;
    updateButtons();
  }
  function refreshSide(index) {
    const imported = $(`comparisonSource${index}`).value === 'backup';
    $(`comparisonImport${index}`).hidden = !imported;
    $(`comparisonFilename${index}`).hidden = !imported;
    $(`comparisonFilename${index}`).textContent = sides[index].loading ? '正在读取备份…' : sides[index].filename || '尚未选择备份';
    const input = $(`comparisonDate${index}`), previous = input.value, dates = comparisonDates(sourceData(index));
    input.value = dates.includes(previous) ? previous : dates.includes(getSelectedDate()) ? getSelectedDate() : dates[0] || '';
    $(`comparisonDateValue${index}`).textContent = input.value ? input.value.replaceAll('-', '/') : imported && !sides[index].backup ? '请先导入备份' : '此来源没有记录';
    $(`comparisonDateButton${index}`).disabled = !dates.length || sides[index].loading;
    updateButtons();
  }
  function error(message) { $('comparisonError').textContent = message; $('comparisonError').hidden = false; }

  $('compareRecords').onclick = () => {
    beforeOpen(); invalidate(); sides.forEach((_, index) => refreshSide(index)); dialog.showModal();
  };
  $('comparisonSourceChoices').onclick = event => {
    const choice = event.target.closest('[data-comparison-source]');
    if (!choice || sourceTarget === null) return;
    const value = choice.dataset.comparisonSource, source = sources.find(source => source.value === value), index = sourceTarget;
    if (!source) return;
    closeDropdown('comparisonSourceDropdown');
    if ($(`comparisonSource${index}`).value === value) return;
    closeDatePicker();
    $(`comparisonSource${index}`).value = value;
    $(`comparisonSourceValue${index}`).textContent = source.name;
    $(`comparisonName${index}`).value = sides[index].names[value];
    refreshSide(index); invalidate();
  };
  sides.forEach((side, index) => {
    $(`comparisonSourceButton${index}`).onclick = () => {
      sourceTarget = index;
      $('comparisonSourceChoices').innerHTML = sources.map(source => {
        const selected = source.value === $(`comparisonSource${index}`).value;
        return `<button type="button" class="filter-choice" data-comparison-source="${source.value}" aria-selected="${selected}"><span>${source.name}</span><span class="checkmark">${selected ? icon('check') : ''}</span></button>`;
      }).join('');
      openDropdown('comparisonSourceDropdown', $(`comparisonSourceButton${index}`), 'start');
    };
    $(`comparisonDateButton${index}`).onclick = () => openDatePicker(`comparisonDate${index}`, $(`comparisonDateButton${index}`), {
      dates:new Set(comparisonDates(sourceData(index))),
      onSelect:key => { $(`comparisonDate${index}`).value = key; refreshSide(index); invalidate(); }
    });
    $(`comparisonName${index}`).oninput = () => { side.names[$(`comparisonSource${index}`).value] = $(`comparisonName${index}`).value; invalidate(); };
    $(`comparisonImport${index}`).onclick = () => { $(`comparisonFile${index}`).value = ''; $(`comparisonFile${index}`).click(); };
    $(`comparisonFile${index}`).onchange = async event => {
      const file = event.target.files[0]; if (!file) return;
      closeDatePicker();
      const version = ++side.version;
      side.loading = false;
      invalidate();
      if (file.size > 25 * 1024 * 1024) { refreshSide(index); error('备份文件不能超过 25 MB'); return; }
      side.loading = true; refreshSide(index);
      try {
        const backup = readBackup(JSON.parse(await file.text()));
        if (version !== side.version) return;
        side.backup = backup; side.filename = file.name;
      } catch (cause) {
        if (version === side.version) error(cause instanceof SyntaxError ? '无法读取 JSON 备份文件' : cause.message);
      } finally {
        if (version === side.version) { side.loading = false; refreshSide(index); }
      }
    };
  });
  $('comparisonForm').onsubmit = async event => {
    event.preventDefault();
    if (busy || sides.some(side => side.loading)) return;
    invalidate(); const version = generation;
    const records = sides.map((_, index) => ({data:sourceData(index), date:$(`comparisonDate${index}`).value, name:$(`comparisonName${index}`).value}));
    try {
      if (document.fonts) await document.fonts.ready;
      if (version !== generation || !dialog.open) return;
      const context = document.createElement('canvas').getContext('2d');
      if (!context) throw new Error('浏览器无法生成对照图');
      const measure = (value, size) => { context.font = `${size}px ${COMPARISON_FONT}`; return context.measureText(value).width; };
      const layout = layoutComparison(records, {measure}), svg = renderComparisonSvg(layout);
      preview = {svg, width:layout.width, height:layout.height, filename:`对比记录-${[...new Set(records.map(record => record.date))].join('_')}`};
      $('comparisonPreview').innerHTML = svg; $('comparisonPreview').hidden = false; $('comparisonEmpty').hidden = true;
    } catch (cause) { error(cause.message); }
    updateButtons();
  };
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
    if (!preview || busy) return;
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
  $('comparisonSvg').onclick = () => { if (preview && !busy) download(new Blob([preview.svg], {type:'image/svg+xml;charset=utf-8'}), `${preview.filename}.svg`); };
  $('comparisonFullscreen').onclick = () => {
    if (!preview) return;
    finishDialogCleanup($('comparisonFullscreenDialog'));
    $('comparisonFullscreenPreview').innerHTML = preview.svg; $('comparisonFullscreenDialog').showModal();
  };
  $('comparisonFullscreenClose').innerHTML = icon('collapse');
  $('comparisonFullscreenClose').onclick = () => $('comparisonFullscreenDialog').close();
  $('comparisonFullscreenDialog').addEventListener('close', () => afterDialogExit($('comparisonFullscreenDialog'), () => $('comparisonFullscreenPreview').replaceChildren()));
  dialog.addEventListener('close', () => { ++generation; closeDatePicker(); closeDropdown('comparisonSourceDropdown',false); });
}
