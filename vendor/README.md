# Bundled image renderer

`html2canvas.esm.js` is the unmodified browser ESM build from the npm package `html2canvas@1.4.1` (MIT license in `html2canvas.LICENSE`). It is loaded locally only when exporting an image. No CDN requests or record uploads are used at runtime.

Source: https://github.com/niklasvh/html2canvas/tree/v1.4.1
Package: https://registry.npmjs.org/html2canvas/-/html2canvas-1.4.1.tgz

Export uses Canvas rendering with `foreignObjectRendering: false`, not SVG foreignObject rendering. Unsupported conic and repeating gradients are replaced by native Canvas primitives and PNG backgrounds before capture.
