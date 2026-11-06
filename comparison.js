import { entriesOn, normalizeName, timeText, durationText, validDate } from './core.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
export const COMPARISON_FONT = 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
export const MAX_COMPARISON_RECORDS = 6;
export const comparisonDates = data => [...new Set((data?.entries || []).map(entry => entry.date))].sort().reverse();
const approximateMeasure = (text, size) => [...text].reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? size : size * .65), 0);
const displayName = value => normalizeName(String(value ?? '').replaceAll('·', ' '));

function wrap(text, maxWidth, size, measure) {
  const lines = [];
  let line = '';
  for (const char of text) {
    if (line && measure(line + char, size) > maxWidth) { lines.push(line); line = ''; }
    line += char;
  }
  if (line) lines.push(line);
  return lines;
}

function layoutRow(side, start, colors, geometry, measure) {
  const events = new Map(side.data.events.map(event => [event.id, event]));
  const blocks = entriesOn(side.data, side.date).filter(entry => entry.start < start + 360 && entry.end > start).map(entry => {
    const event = events.get(entry.eventId), name = displayName(event.name);
    const from = Math.max(start, entry.start), to = Math.min(start + 360, entry.end);
    const x = geometry.left + (from - start) / 360 * geometry.trackWidth, width = (to - from) / 360 * geometry.trackWidth;
    const available = width - 24, lines = wrap(name, Math.max(0, available), 18, measure);
    const external = available < 14 || lines.some(line => measure(line, 18) > available) || lines.length * 24 > geometry.barHeight - 8;
    return {entry, name, lines, color:colors.get(normalizeName(event.name)), x, width, external, center:x + width / 2};
  });
  const lanes = [], callouts = [];
  for (const block of blocks.filter(block => block.external)) {
    const lines = wrap(block.name, 340, 18, measure);
    const width = Math.ceil(Math.max(...lines.map(line => measure(line, 18)))) + 36;
    const height = lines.length * 25 + 8;
    const x = Math.max(geometry.left, Math.min(geometry.left + geometry.trackWidth - width, block.center - width / 2));
    let lane = lanes.findIndex(row => row.items.every(item => x + width + 16 <= item.x || x >= item.x + item.width + 16));
    if (lane < 0) { lane = lanes.length; lanes.push({height:0, items:[]}); }
    lanes[lane].items.push({x, width}); lanes[lane].height = Math.max(lanes[lane].height, height);
    callouts.push({...block, lines, labelX:x, labelWidth:width, labelHeight:height, lane});
  }
  let depth = 12;
  const offsets = lanes.map(lane => { const offset = depth; depth += lane.height + 10; return offset; });
  callouts.forEach(item => item.offset = offsets[item.lane]);
  return {blocks, callouts, externalHeight:lanes.length ? depth : 0};
}

// Layout is independent of the viewport. Preview, SVG and PNG use these same coordinates.
export function layoutComparison(sides, {measure = approximateMeasure} = {}) {
  if (sides.length < 2 || sides.length > MAX_COMPARISON_RECORDS || sides.some(side => !side.data || !validDate(side.date) || !side.data.entries.some(entry => entry.date === side.date))) throw new Error('请选择 2 至 6 份有记录的日期');
  const records = sides.map((side, index) => ({...side, name:displayName(side.name) || `记录${index + 1}`}));
  const geometry = {width:1920, left:248, trackWidth:1600, barHeight:58};
  const labelHeight = Math.max(...records.map(record => wrap(record.name, 174, 18, measure).length * 23 + 21));
  const labelExtra = Math.ceil(Math.max(0, (labelHeight - geometry.barHeight) / 2));
  const colors = new Map();
  // Event IDs and original colors may differ between backups; names identify matching events.
  for (const side of records) {
    const used = new Set(entriesOn(side.data, side.date).map(entry => entry.eventId));
    for (const event of side.data.events) if (used.has(event.id) && !colors.has(normalizeName(event.name))) colors.set(normalizeName(event.name), event.color);
  }
  const names = ['凌晨', '上午', '下午', '晚间'];
  let top = 116;
  const groups = names.map((name, index) => {
    const start = index * 360, rows = records.map(record => layoutRow(record, start, colors, geometry, measure));
    rows.forEach((row, rowIndex) => {
      row.direction = rowIndex ? 1 : -1;
      row.y = rowIndex ? rows[rowIndex - 1].y + geometry.barHeight + 38 + labelExtra * 2 + (rowIndex > 1 ? rows[rowIndex - 1].externalHeight : 0) : top + 60 + labelExtra + row.externalHeight;
      row.axisY = rowIndex ? row.y - 14 : top + 44;
    });
    const last = rows.at(-1), height = last.y + geometry.barHeight + last.externalHeight + labelExtra + 28 - top;
    const group = {name, start, top, height, yA:rows[0].y, yB:rows[1].y, axisA:rows[0].axisY, rows}; top += height;
    return group;
  });
  const dateTitle = [...new Set(records.map(record => record.date))].join(' / ');
  return {...geometry, height:Math.max(1080, top + 36), groups, records, dateTitle, measure};
}

function text(x, y, content, size = 18, attributes = '') {
  return `<text x="${x}" y="${y}" font-size="${size}" ${attributes}>${escape(content)}</text>`;
}

// Both the recording fullscreen view and comparison chart connect to the label's left edge.
export function calloutConnectorPath(center, edge, labelX, near, direction = 1) {
  return `M${center} ${edge}V${near - direction * 5}H${labelX + 12}V${near}`;
}

export function renderComparisonSvg(layout) {
  const {width, height, left, trackWidth, barHeight, groups, records, measure} = layout;
  let content = `<rect width="${width}" height="${height}" fill="#fff"/>` + text(48, 65, layout.dateTitle, 30, 'font-weight="600"');
  for (const group of groups) {
    const {top, yA, yB, start} = group;
    content += text(48, top + 18, group.name, 17, 'fill="#78866e"');
    group.rows.forEach((row, sideIndex) => {
      const y = row.y, direction = row.direction, edge = direction > 0 ? y + barHeight : y;
      const record = records[sideIndex], labelLines = wrap(record.name, 174, 18, measure);
      const labelTop = y + barHeight / 2 - (labelLines.length * 23 + 21) / 2;
      labelLines.forEach((line, lineIndex) => { content += text(48, labelTop + lineIndex * 23 + 18, line, 18, 'font-weight="600"'); });
      content += text(48, labelTop + labelLines.length * 23 + 17, record.date, 15, 'fill="#7b877e"');
      const axisY = row.axisY;
      for (let hour = 0; hour <= 6; hour++) {
        const x = left + hour / 6 * trackWidth;
        content += text(x, axisY, timeText(start + hour * 60), 15, `fill="#7b8873" text-anchor="${hour === 0 ? 'start' : hour === 6 ? 'end' : 'middle'}"`);
      }
      content += `<rect class="comparison-track" x="${left}" y="${y}" width="${trackWidth}" height="${barHeight}" rx="7" fill="#f7f8f4" stroke="#edf0e7"/>`;
      for (let tick = 1; tick < 12; tick++) {
        const x = left + tick / 12 * trackWidth;
        content += `<path d="M${x} ${y + 1}V${y + barHeight - 1}" stroke="${tick % 2 ? '#eef0e7' : '#e6eadd'}"/>`;
      }
      for (const block of row.blocks) {
        content += `<g class="comparison-event"><title>${escape(`${block.name} ${timeText(block.entry.start)}–${timeText(block.entry.end)} ${durationText(block.entry.end - block.entry.start)}`)}</title><rect x="${block.x}" y="${y + 4}" width="${block.width}" height="${barHeight - 8}" rx="4" fill="${block.color}" fill-opacity="${112 / 255}" stroke="#fff" stroke-opacity=".333"/>`;
        if (!block.external) {
          const textTop = y + barHeight / 2 - block.lines.length * 24 / 2;
          block.lines.forEach((line, index) => { content += text(block.x + 12, textTop + 19 + index * 24, line); });
        }
        content += '</g>';
      }
      // Paint connectors first and opaque label backgrounds second so no line crosses text.
      for (const item of row.callouts) {
        const near = edge + direction * item.offset;
        content += `<path class="comparison-connector" d="${calloutConnectorPath(item.center, edge, item.labelX, near, direction)}" stroke="${item.color}" fill="none" stroke-width="1" opacity=".65"/>`;
      }
      for (const item of row.callouts) {
        const yLabel = direction < 0 ? edge - item.offset - item.labelHeight : edge + item.offset;
        content += `<g class="comparison-callout" data-side="${String.fromCharCode(65 + sideIndex)}"><rect x="${item.labelX}" y="${yLabel}" width="${item.labelWidth}" height="${item.labelHeight}" rx="4" fill="#fff"/><rect x="${item.labelX + 7}" y="${yLabel + 12}" width="8" height="8" rx="2" fill="${item.color}"/>`;
        item.lines.forEach((line, lineIndex) => { content += text(item.labelX + 23, yLabel + 21 + lineIndex * 25, line); });
        content += '</g>';
      }
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(layout.dateTitle)}" font-family="${escape(COMPARISON_FONT)}" fill="#303b35"><title>${escape(layout.dateTitle)}</title>${content}</svg>`;
}
