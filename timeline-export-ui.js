import {renderExportPng} from './image-export.js';

export function setupTimelineExport({$,icon,toast,fullDate,timelineCard,layoutTimelineLabels,afterDialogExit,finishDialogCleanup,
  getView,getSelectedDate,getInitialAverageCategory,hasEntries,exportPeriodTitle,buildExportStat,buildExportDistribution,buildExportYear,
  renderFocusChoices,renderAnnualCategoryChoices,openDropdown,closeDropdown}){
  $('timelineDownloadButton').innerHTML=icon('backup');
  $('timelineDownloadButton').onclick=()=>{
    finishDialogCleanup($('timelineExportDialog'));
    exportForm.reset();
    const view=getView();
    const mode=['year','day'].includes(view)?view:'month';
    exportRanges.categories=mode;exportRanges.focus=mode;
    exportRanges.average=exportRanges.days=view==='year'?'year':'month';
    averageCategoryId=getInitialAverageCategory();
    $('exportViewLabel').textContent=`当前${{year:'年',month:'月',week:'周',day:'日'}[view]}视图`;
    $('exportOverviewModule').closest('.export-widget-option').hidden=view==='year';
    renderExportWidgets();
    $('timelineExportDialog').showModal();
    updateExportSelection();
  };
  const exportForm=$('timelineExportForm');
  let exportPreviewData=null,exportPreviewVersion=0,exportPreviewFrame=0;
  const exportRanges={categories:'month',focus:'month',average:'month',days:'month'};
  let exportRangeTarget=null;
  let averageCategoryId=null;
  const categoryButton=kind=>exportForm.querySelector(`[data-export-category="${kind}"]`);
  const buildSummaryStat=kind=>buildExportStat(kind,exportRanges[kind],averageCategoryId);
  function renderExportWidgets(){
    const sources={timeline:$('timeBands'),entries:$('entryList'),overview:$('overview')};
    for(const button of exportForm.querySelectorAll('[data-export-range]'))button.innerHTML=`${exportPeriodTitle(exportRanges[button.dataset.exportRange])}${icon('down')}`;
    for(const widget of exportForm.querySelectorAll('[data-export-widget]')){
      const kind=widget.dataset.exportWidget;
      const content=kind==='distribution'?buildExportDistribution(getSelectedDate()):kind==='year'?buildExportYear():Object.hasOwn(exportRanges,kind)?buildSummaryStat(kind):sources[kind].cloneNode(true);
      if(widget.dataset.exportWidget==='timeline')content.append($('dayLegend').cloneNode(true));
      content.removeAttribute('id');content.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));
      content.querySelectorAll('.continue-marker,.hover-cursor,.selection,.drag-readout,.time-band-callouts,.timeline-actions').forEach(element=>element.remove());
      if(kind!=='year')content.querySelectorAll('.stat-label').forEach(element=>element.remove());
      content.querySelectorAll('.needs-callout').forEach(element=>element.classList.remove('needs-callout'));
      if(widget.dataset.exportWidget==='entries'){
        [...content.children].slice(3).forEach(element=>element.remove());
        if(!hasEntries())content.textContent='暂无记录';
      }
      if(kind==='year')content.querySelectorAll('.overview-body,.overview-footer').forEach(element=>element.inert=true);
      widget.replaceChildren(content);
    }
  }
  exportForm.addEventListener('click',event=>{
    const control=event.target.closest('button');
    const categoryKind=control?.dataset.exportCategory;
    if(categoryKind){
      event.stopPropagation();
      if(categoryKind==='annual'){renderAnnualCategoryChoices();openDropdown('annualCategoryDropdown',control);}
      else{
        renderFocusChoices(categoryKind==='average'?averageCategoryId:undefined);
        openDropdown('focusDropdown',control);
      }
      return;
    }
    if(control?.dataset.exportRange){
      event.stopPropagation();exportRangeTarget=control.dataset.exportRange;
      const modes=['average','days'].includes(exportRangeTarget)?['year','month']:['year','month','day'];
      $('exportRangeChoices').innerHTML=modes.map(mode=>`<button type="button" class="filter-choice" data-export-period="${mode}" aria-selected="${exportRanges[exportRangeTarget]===mode}"><span>当前${{year:'年',month:'月',day:'日'}[mode]}</span><span class="export-period-value">${exportPeriodTitle(mode)}</span><span class="checkmark">${exportRanges[exportRangeTarget]===mode?icon('check'):''}</span></button>`).join('');
      openDropdown('exportRangeDropdown',control,'start');return;
    }
    if(event.target.closest('input,button,label'))return;
    const checkbox=event.target.closest('.export-widget-option')?.querySelector('input[name="modules"]');
    if(checkbox){checkbox.checked=!checkbox.checked;updateExportSelection();}
  });
  $('focusDropdown').addEventListener('click',event=>{
    const choice=event.target.closest('[data-average-category]');if(!choice)return;
    averageCategoryId=choice.dataset.averageCategory||null;
    closeDropdown('focusDropdown',false);renderExportWidgets();updateExportSelection();
    categoryButton('average')?.focus({preventScroll:true});
  });
  $('exportRangeDropdown').addEventListener('click',event=>{
    const choice=event.target.closest('[data-export-period]');if(!choice)return;
    const target=exportRangeTarget;exportRanges[target]=choice.dataset.exportPeriod;
    closeDropdown('exportRangeDropdown',false);renderExportWidgets();updateExportSelection();
    exportForm.querySelector(`[data-export-range="${target}"]`).focus({preventScroll:true});
  });
  function updateExportSelection(){
    const modules=new Set(new FormData(exportForm).getAll('modules')),version=++exportPreviewVersion;
    if(exportPreviewData?.url)URL.revokeObjectURL(exportPreviewData.url);
    exportPreviewData=null;$('timelineExportConfirm').disabled=true;$('timelineExportCopy').disabled=true;cancelAnimationFrame(exportPreviewFrame);
    const status=$('timelineExportStatus'),image=$('timelineExportPreview'),panel=image.parentElement;
    status.hidden=false;status.textContent=modules.size?'正在生成预览…':'选择要导出的模块';
    panel.setAttribute('aria-busy',String(!!modules.size));
    if(!modules.size){image.hidden=true;image.removeAttribute('src');return;}
    exportPreviewFrame=requestAnimationFrame(async()=>{
      try{
        const preview=await createTimelineExportPreview(modules,getSelectedDate());
        if(version!==exportPreviewVersion||!$('timelineExportDialog').open){URL.revokeObjectURL(preview.url);return;}
        exportPreviewData=preview;image.src=preview.url;image.hidden=false;status.hidden=true;
        $('timelineExportConfirm').disabled=$('timelineExportCopy').disabled=exportForm.getAttribute('aria-busy')==='true';
      }catch(error){
        if(version!==exportPreviewVersion)return;
        image.hidden=true;status.textContent=`无法生成预览：${error.message}`;
      }finally{if(version===exportPreviewVersion)panel.setAttribute('aria-busy','false');}
    });
  }
  exportForm.addEventListener('change',updateExportSelection);
  function buildTimelineExport(modules,exportDate){
    const page=document.createElement('div');page.className=`timeline-export-surface${modules.size===1&&modules.has('timeline')?' export-timeline-only':''}`;
    const summaryChoices=['categories','focus','average','days'].filter(kind=>modules.has(kind));
    const includeOverview=modules.has('overview')&&!(getView()==='year'&&modules.has('year'));
    const hasOverview=includeOverview||summaryChoices.length>0;
    if(modules.has('year')){
      const section=document.createElement('section');section.append(buildExportYear());page.append(section);
    }
    if(hasOverview){
      const section=document.createElement('section'),card=document.createElement('div');card.className='overview-card';
      section.append(card);
      if(summaryChoices.length){
        const stats=document.createElement('div');stats.className='stats';stats.style.gridTemplateColumns=`repeat(${summaryChoices.length},minmax(0,1fr))`;
        summaryChoices.forEach(kind=>stats.append(buildSummaryStat(kind)));card.append(stats);
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
    page.querySelectorAll('[data-category-names]').forEach(button=>{
      const label=document.createElement('span');label.className='export-category-selection';
      label.textContent=button.dataset.categoryNames;button.replaceWith(label);
    });
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
      const height=Math.ceil(surface.offsetHeight);
      const blob=await renderExportPng(surface,{width,height});
      return {width,height,date:exportDate,png:Promise.resolve(blob),url:URL.createObjectURL(blob)};
    }finally{surface.remove();}
  }
  async function exportImage(copy=false) {
    if(exportForm.getAttribute('aria-busy')==='true'||!exportPreviewData)return;
    if(copy&&(!navigator.clipboard?.write||!globalThis.ClipboardItem)){toast('当前浏览器不支持复制图片，请导出 PNG');return;}
    const preview=exportPreviewData,button=$(copy?'timelineExportCopy':'timelineExportConfirm');
    // Keep labels and opacity steady while preventing duplicate export actions.
    for(const id of ['timelineExportConfirm','timelineExportCopy'])$(id).setAttribute('aria-disabled','true');
    button.setAttribute('aria-busy','true');exportForm.setAttribute('aria-busy','true');
    try{
      // Give ClipboardItem the promise during the click so user activation is retained.
      if(copy){await navigator.clipboard.write([new ClipboardItem({'image/png':preview.png})]);toast('图片已复制');}
      else{
        const blob=await preview.png,url=URL.createObjectURL(blob),link=document.createElement('a');
        link.href=url;link.download=`WhereIsMyTime-${preview.date}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        $('timelineExportDialog').close();toast('图片已导出');
      }
    }catch(error){toast(`未能${copy?'复制':'导出'}图片：${error.message}${copy?'。可尝试导出 PNG':''}`);}
    finally{
      button.removeAttribute('aria-busy');exportForm.removeAttribute('aria-busy');
      for(const id of ['timelineExportConfirm','timelineExportCopy'])$(id).removeAttribute('aria-disabled');
      $('timelineExportConfirm').disabled=$('timelineExportCopy').disabled=!exportPreviewData;
    }
  }
  exportForm.onsubmit=event=>{event.preventDefault();exportImage();};
  $('timelineExportCopy').onclick=()=>exportImage(true);
  $('timelineExportDialog').addEventListener('close',()=>{
    if($('timelineExportDialog').open)return;
    ++exportPreviewVersion;cancelAnimationFrame(exportPreviewFrame);
    const preview=exportPreviewData;exportPreviewData=null;
    afterDialogExit($('timelineExportDialog'),()=>{
      $('timelineExportPreview').removeAttribute('src');$('timelineExportPreview').hidden=true;
      if(preview?.url)URL.revokeObjectURL(preview.url);
    });
  });
  return {
    refresh(){if($('timelineExportDialog').open){renderExportWidgets();updateExportSelection();}},
    categoryButton
  };
}
