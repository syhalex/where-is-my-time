import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, saveEntry, readBackup } from '../core.js';
import { comparisonDates, layoutComparison, renderComparisonSvg } from '../comparison.js';

const day = '2026-11-01';
const record = (data, changes = {}) => saveEntry(data, {date:day, start:540, end:600, name:'阅读', color:'#89A996', ...changes});
const side = (data, date = day, name = '') => ({data, date, name});

test('each side uses only its own available dates, independently of the other source', () => {
  const own = record(record(emptyData()), {date:'2026-11-02'}), backup = record(emptyData(), {date:'2026-10-30'});
  assert.deepEqual(comparisonDates(own), ['2026-11-02', day]);
  assert.deepEqual(comparisonDates(backup), ['2026-10-30']);
  assert.deepEqual(comparisonDates(null), []);
  const layout = layoutComparison([side(own, day), side(backup, '2026-10-30')]);
  assert.equal(layout.records[0].name, '记录1'); assert.equal(layout.records[1].name, '记录2');
  assert.match(layout.dateTitle, /2026-11-01.*2026-10-30/);
  assert.equal(layoutComparison([side(own), side(own)]).dateTitle, day);
  assert.throws(() => layoutComparison([side(own), side(backup)]), /日期/);
});

test('four pairs have identical minute coordinates, exact widths and clipped six-hour boundaries', () => {
  let a = record(emptyData(), {start:355, end:370}), b = record(emptyData(), {start:355, end:370, color:'#FF0000'});
  a = record(a, {start:1435, end:1440, name:'收尾'});
  const layout = layoutComparison([side(a), side(b)]);
  assert.equal(layout.groups.length, 4); assert.equal(layout.groups.flatMap(group => group.rows).length, 8);
  assert.equal(layout.groups[0].rows[0].blocks[0].width, 5 / 360 * layout.trackWidth);
  assert.equal(layout.groups[1].rows[0].blocks[0].width, 10 / 360 * layout.trackWidth);
  assert.equal(layout.groups[1].rows[0].blocks[0].x, layout.left);
  assert.equal(layout.groups[0].rows[0].blocks[0].x, layout.groups[0].rows[1].blocks[0].x);
  assert.equal(layout.groups[3].rows[0].blocks[0].x + layout.groups[3].rows[0].blocks[0].width, layout.left + layout.trackWidth);
  assert.match(renderComparisonSvg(layout), /24:00/);
});

test('matching event names share a color across independent IDs without mutating either backup', () => {
  const own = record(emptyData()), backup = readBackup(record(emptyData(), {color:'#FF0000'}));
  const before = JSON.stringify([own, backup]);
  const layout = layoutComparison([side(own), side(backup)]), rows = layout.groups[1].rows;
  assert.notEqual(own.events[0].id, backup.events[0].id);
  assert.equal(rows[0].blocks[0].color, rows[1].blocks[0].color);
  assert.equal(rows[1].blocks[0].color, '#89A996');
  assert.equal(JSON.stringify([own, backup]), before);
});

test('dense long labels preserve every character, stay in bounds and never overlap', () => {
  let data = emptyData();
  for (let index = 0; index < 72; index++) data = record(data, {start:index * 5, end:index * 5 + 5, name:`${index} 阅读文献并记录完整思考与下一步的问题`.repeat(2)});
  const layout = layoutComparison([side(data), side(data)]);
  for (const group of layout.groups) {
    group.rows.forEach((row, sideIndex) => {
      const boxes = row.callouts.map(item => ({x:item.labelX, y:sideIndex ? group.yB + layout.barHeight + item.offset : group.yA - item.offset - item.labelHeight, w:item.labelWidth, h:item.labelHeight}));
      row.callouts.forEach(item => assert.equal(item.lines.join(''), item.name));
      boxes.forEach((box, index) => {
        assert.ok(box.x >= layout.left && box.x + box.w <= layout.left + layout.trackWidth);
        assert.ok(box.y >= group.top && box.y + box.h < group.top + group.height);
        for (const next of boxes.slice(index + 1)) assert.ok(box.x + box.w <= next.x || next.x + next.w <= box.x || box.y + box.h <= next.y || next.y + next.h <= box.y);
      });
    });
  }
  assert.ok(layout.height > 1080);
});

test('SVG contains complete escaped text and vector elements without foreignObject or attribution', () => {
  const data = record(emptyData(), {name:'<script> & "长说明"', start:0, end:5});
  const layout = layoutComparison([side(data, day, '<A>'), side(data)]), svg = renderComparisonSvg(layout);
  assert.match(svg, /&lt;script&gt; &amp; &quot;长说明&quot;/);
  assert.match(svg, /&lt;A&gt;/); assert.match(svg, /data-side="A"/); assert.match(svg, /data-side="B"/);
  assert.doesNotMatch(svg, /<script>|foreignObject|WhereIsMyTime|·|A ·|B ·/);
  const row = layout.groups[0].rows[0], item = row.callouts[0];
  assert.ok(layout.groups[0].yA - item.offset - item.labelHeight >= layout.groups[0].top);
});

test('long user names reserve enough space for both left-hand identities and dates', () => {
  const data = record(emptyData());
  const layout = layoutComparison([side(data, day, '名称'.repeat(16)), side(data, day, '另一个名称'.repeat(6))]);
  for (const group of layout.groups) {
    assert.ok(group.yB - group.yA > 130);
    assert.ok(group.yA - group.top > 60);
  }
});

test('fullscreen styling keeps short wrapped names in blocks and uses borderless outward labels', () => {
  const data = record(record(emptyData(), {name:'吃饭', start:0, end:10}), {name:'很长的窄事件名称', start:10, end:15});
  const layout = layoutComparison([side(data, day, '我的·一天'), side(data)]), row = layout.groups[0].rows[0];
  assert.equal(row.blocks[0].external, false);
  assert.deepEqual(row.blocks[0].lines, ['吃','饭']);
  assert.equal(row.blocks[1].external, true);
  const svg = renderComparisonSvg(layout);
  assert.match(svg, /class="comparison-track"[^>]*rx="7"[^>]*fill="#f7f8f4"/);
  assert.match(svg, /class="comparison-callout"[^>]*><rect[^>]*fill="#fff"\/>/);
  assert.match(svg, /我的 一天/);
  assert.doesNotMatch(svg, /·|A ·|B ·|stroke-dasharray/);
  assert.equal((svg.match(/class="comparison-track"/g) || []).length, 8);
});
