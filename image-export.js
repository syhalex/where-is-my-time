// Draw HTML directly to Canvas. Do not use SVG foreignObject on this path:
// iPhone Safari can decode it successfully yet draw no HTML content at all.
let renderer;
function rasterGraphic(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width)); canvas.height = Math.max(1, Math.ceil(height));
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法绘制图形');
    draw(context); return canvas.toDataURL('image/png');
  } finally { canvas.width = canvas.height = 0; }
}

function gradientStops(value) {
  const stops = []; let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (value[i] === ',' && !depth) { stops.push(value.slice(start, i).trim()); start = i + 1; }
  }
  stops.push(value.slice(start).trim()); return stops;
}

function prepareGraphics(surface) {
  // html2canvas does not paint conic/repeating gradients. Keep their exact
  // geometry using native Canvas primitives and PNG backgrounds (no SVG images).
  for (const donut of surface.querySelectorAll('.donut')) {
    const background = getComputedStyle(donut).backgroundImage;
    if (!background.startsWith('conic-gradient(')) continue;
    const {width, height} = donut.getBoundingClientRect(), cx = width / 2, cy = height / 2;
    const points = [];
    for (const stop of gradientStops(background.slice(15, -1))) {
      // WebKit expands two-position stops into two single-position stops.
      const match = stop.match(/^(.+?)\s+([\d.]+)%(?:\s+([\d.]+)%)?$/);
      if (!match) throw new Error('无法读取圆环图的颜色');
      points.push({color:match[1], position:Number(match[2])});
      if (match[3] !== undefined) points.push({color:match[1], position:Number(match[3])});
    }
    const image = rasterGraphic(width, height, context => {
      context.translate(cx, cy); context.scale(cx, cy);
      for (let index = 0; index < points.length - 1; index++) {
        const {color, position:from} = points[index], to = points[index + 1].position;
        if (to <= from) continue;
        context.beginPath(); context.moveTo(0, 0);
        context.arc(0, 0, 1, from * Math.PI / 50 - Math.PI / 2, to * Math.PI / 50 - Math.PI / 2);
        context.closePath(); context.fillStyle = color; context.fill();
      }
    });
    donut.style.backgroundImage = `url("${image}")`;
  }
  for (const track of surface.querySelectorAll('.time-track')) {
    const {width, height} = track.getBoundingClientRect();
    const image = rasterGraphic(width, height, context => {
      for (let index = 0; index <= 12; index++) {
        context.beginPath(); context.moveTo(index * width / 12, 0); context.lineTo(index * width / 12, height);
        context.strokeStyle = index % 2 ? '#eef0e7' : '#e6eadd'; context.stroke();
      }
    });
    track.style.backgroundImage = `url("${image}")`;
    track.style.backgroundSize = '100% 100%';
  }
  for (const svg of surface.querySelectorAll('.time-band-connectors')) {
    const {width, height} = svg.getBoundingClientRect();
    const image = document.createElement('img'); image.className = svg.getAttribute('class'); image.alt = '';
    image.src = rasterGraphic(width, height, context => {
      for (const path of svg.querySelectorAll('path')) {
        context.strokeStyle = path.getAttribute('stroke');
        context.stroke(new Path2D(path.getAttribute('d')));
      }
    });
    svg.replaceWith(image);
  }
}

export function rasterScale(width, height, ios) {
  const maxPixels = ios ? 3000000 : 32000000, maxSide = ios ? 8192 : 16384;
  return Math.min(2, Math.sqrt(maxPixels / (width * height)), maxSide / width, maxSide / height);
}

export async function canvasToExportBlob(canvas) {
  // Never enable Copy/Download with a silently blank raster.
  const sample = document.createElement('canvas'); sample.width = sample.height = 64;
  try {
    const context = sample.getContext('2d');
    if (!context) throw new Error('浏览器无法检查图片');
    context.drawImage(canvas, 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    let hasContent = false;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] && Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) < 250) { hasContent = true; break; }
    }
    if (!hasContent) throw new Error('图片内容未能绘制，请重新生成预览');
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('图片生成失败'); return blob;
  } finally { sample.width = sample.height = 0; }
}

export async function renderExportPng(surface, {width, height}) {
  renderer ??= import('./vendor/html2canvas.esm.js').then(module => module.default).catch(error => { renderer = null; throw error; });
  const render = await renderer;
  prepareGraphics(surface);
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const canvas = await render(surface, {
    width, height, scale:rasterScale(width, height, ios),
    backgroundColor:'#fff', foreignObjectRendering:false, logging:false,
    windowWidth:width, windowHeight:Math.max(900, height), scrollX:0, scrollY:0,
    onclone:(document, element) => {
      // Render at the origin of the isolated clone, independent of page scroll,
      // modal top layers and the offscreen measurement position in the real UI.
      Object.assign(element.style, {position:'absolute', left:'0', top:'0', margin:'0'});
      document.querySelectorAll('dialog[open]').forEach(dialog => dialog.removeAttribute('open'));
      document.documentElement.style.overflow = document.body.style.overflow = 'visible';
    }
  });
  try { return await canvasToExportBlob(canvas); }
  finally { canvas.width = canvas.height = 0; }
}
