// Moteur de rendu : tout est dessiné dans le repère 1080 x 1920 puis mis à
// l'échelle. L'aperçu et l'export passent par ce même code, donc ce que tu
// vois est exactement ce qui sort. Miroir fidèle de Renderer.swift.

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const ASPECT = WIDTH / HEIGHT;

export const LIMITS = Object.freeze({ carousels: 50, slides: 35, characters: 1200, nameLength: 100, captionLength: 4000 });

// Graisse fixe, non réglable : le semibold de TikTok (mesuré sur une capture
// du vrai éditeur). Contour proportionnel au corps : 4,6 px pour 64 px.
export const DEFAULT_STYLE = Object.freeze({ size: 64, weight: 600, outline: 5, lineHeight: 1.18, align: 'center', x: 0.5, y: 0.32 });
export const DEFAULT_CROP = Object.freeze({ format: 'fill', zoom: 1, offsetX: 0, offsetY: 0 });

export const FORMATS = [
  { id: 'fill', label: 'Remplir' },
  { id: 'original', label: 'Originale' },
  { id: 'r3x4', label: '3:4', aspect: 3 / 4 },
  { id: 'r1x1', label: '1:1', aspect: 1 },
  { id: 'r4x5', label: '4:5', aspect: 4 / 5 },
];

export const scaledOutline = size => size * 4.6 / 64;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function validateStyle(style = {}) {
  const s = { ...DEFAULT_STYLE, ...style };
  s.size = clamp(Number(s.size) || 64, 28, 130);
  s.weight = 600;
  s.outline = clamp(Number(s.outline) || 5, 1, 14);
  s.lineHeight = [1.08, 1.18, 1.35].includes(Number(s.lineHeight)) ? Number(s.lineHeight) : 1.18;
  s.align = ['left', 'center', 'right'].includes(s.align) ? s.align : 'center';
  s.x = clamp(Number(s.x) || 0, 0, 1);
  s.y = clamp(Number(s.y) || 0, 0, 1);
  return s;
}

export function validateCrop(crop = {}) {
  const c = { ...DEFAULT_CROP, ...crop };
  c.format = FORMATS.some(f => f.id === c.format) ? c.format : 'fill';
  c.zoom = clamp(Number(c.zoom) || 1, 1, 4);
  c.offsetX = clamp(Number(c.offsetX) || 0, -1, 1);
  c.offsetY = clamp(Number(c.offsetY) || 0, -1, 1);
  return c;
}

// ---------------------------------------------------------------------------
// Texte

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('fr', { granularity: 'grapheme' }) : null;
const graphemes = text => segmenter ? Array.from(segmenter.segment(text), x => x.segment) : Array.from(text);

export function fontString(style) {
  return `${style.weight} ${style.size}px TikTokSans`;
}

/// Coupe aux espaces, puis caractère par caractère si un mot seul dépasse.
export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? line + ' ' + word : word;
      if (ctx.measureText(candidate).width <= maxWidth) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      if (ctx.measureText(word).width <= maxWidth) { line = word; continue; }
      for (const char of graphemes(word)) {
        if (line && ctx.measureText(line + char).width > maxWidth) { lines.push(line); line = ''; }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}

let measureContext = null;
function measurer() {
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
  return measureContext;
}

/// Mise en page du bloc de texte, en unités canevas.
export function textLayout(slide, ctx = measurer()) {
  const style = validateStyle(slide.style);
  const text = slide.text || '';
  if (!text.trim()) return null;
  ctx.font = fontString(style);
  ctx.fontKerning = 'normal';
  ctx.textRendering = 'geometricPrecision';
  const lines = wrapText(ctx, text, WIDTH * 0.82);
  const measures = lines.map(line => ctx.measureText(line || ' '));
  const sample = ctx.measureText('ÀÉgj');
  const ascent = Math.max(style.size * 0.74, sample.actualBoundingBoxAscent || 0, ...measures.map(m => m.actualBoundingBoxAscent || 0));
  const descent = Math.max(style.size * 0.15, sample.actualBoundingBoxDescent || 0, ...measures.map(m => m.actualBoundingBoxDescent || 0));
  const widths = measures.map(m => m.width);
  const width = Math.max(...widths);
  const step = style.size * style.lineHeight;
  const height = (lines.length - 1) * step + ascent + descent;
  const x = WIDTH * style.x - width / 2;
  const y = HEIGHT * style.y - height / 2;
  const margin = scaledOutline(style.size);
  const overflow = x - margin < 0 || y - margin < 0 || x + width + margin > WIDTH || y + height + margin > HEIGHT;
  const offset = index => style.align === 'left' ? 0 : style.align === 'right' ? width - widths[index] : (width - widths[index]) / 2;
  return { style, lines, widths, ascent, descent, step, width, height, x, y, overflow, offset };
}

/// Le liséré TikTok : un tracé noir large de 2x l'épaisseur, puis le blanc
/// par-dessus. Le trait déborde de moitié dans la lettre, d'où le contour net.
/// `caret` : position (canevas) d'un curseur à dessiner, pendant la saisie.
export function drawText(ctx, layout, caret = null) {
  ctx.save();
  ctx.font = fontString(layout.style);
  ctx.fontKerning = 'normal';
  // Géométrie pure, comme CoreText sur iPhone : sans ça, le navigateur
  // épaissit le blanc (lissage) et le cale au pixel alors que le tracé noir
  // reste exact — le liseré paraissait plus fin et décalé d'un côté (« 3D »).
  // Mesuré : liseré 2,5 px asymétrique → 3,3 px des deux côtés.
  ctx.textRendering = 'geometricPrecision';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = scaledOutline(layout.style.size) * 2;
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#ffffff';
  layout.lines.forEach((line, i) => {
    if (!line) return;
    const x = layout.x + layout.offset(i);
    const y = layout.y + layout.ascent + i * layout.step;
    ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
  });
  if (caret) {
    ctx.fillStyle = caret.color;
    ctx.fillRect(caret.x, caret.y, Math.max(3, layout.style.size * 0.05), caret.height);
  }
  ctx.restore();
}

/// Position du curseur de saisie : à la fin du texte.
export function caretAtEnd(layout) {
  const i = layout.lines.length - 1;
  const x = layout.x + layout.offset(i) + layout.widths[i] + layout.style.size * 0.04;
  const baseline = layout.y + layout.ascent + i * layout.step;
  return { x, y: baseline - layout.style.size * 0.78, height: layout.style.size * 0.98 };
}

// ---------------------------------------------------------------------------
// Photo : fenêtre, zoom, décalage (PhotoFraming.swift)

export function windowFor(format, photoW, photoH) {
  if (format === 'fill') return { x: 0, y: 0, width: WIDTH, height: HEIGHT };
  if (format === 'original') {
    const ratio = Math.min(WIDTH / photoW, HEIGHT / photoH);
    const w = photoW * ratio, h = photoH * ratio;
    return { x: (WIDTH - w) / 2, y: (HEIGHT - h) / 2, width: w, height: h };
  }
  const aspect = FORMATS.find(f => f.id === format)?.aspect ?? 1;
  let w = WIDTH, h = WIDTH / aspect;
  if (h > HEIGHT) { h = HEIGHT; w = HEIGHT * aspect; }
  return { x: (WIDTH - w) / 2, y: (HEIGHT - h) / 2, width: w, height: h };
}

/// Le rectangle de la photo : elle couvre la fenêtre, agrandie par le zoom,
/// déplacée par le décalage — borné pour ne jamais découvrir le fond.
export function photoRect(crop, photoW, photoH, win) {
  const base = Math.max(win.width / photoW, win.height / photoH);
  const scale = base * crop.zoom;
  const w = photoW * scale, h = photoH * scale;
  const slackX = Math.max(0, (w - win.width) / 2);
  const slackY = Math.max(0, (h - win.height) / 2);
  const dx = clamp(crop.offsetX * win.width, -slackX, slackX);
  const dy = clamp(crop.offsetY * win.height, -slackY, slackY);
  return { x: win.x + win.width / 2 - w / 2 + dx, y: win.y + win.height / 2 - h / 2 + dy, width: w, height: h };
}

/// Décalage maximal (en fractions de fenêtre) pour un zoom donné.
export function maxOffset(crop, photoW, photoH) {
  const win = windowFor(crop.format, photoW, photoH);
  const base = Math.max(win.width / photoW, win.height / photoH);
  const w = photoW * base * crop.zoom, h = photoH * base * crop.zoom;
  return { x: Math.max(0, (w - win.width) / 2) / win.width, y: Math.max(0, (h - win.height) / 2) / win.height };
}

export function drawBackground(ctx, img, crop) {
  ctx.fillStyle = '#16191f';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (!img) {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, '#3d4755');
    gradient.addColorStop(1, '#252d38');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    return;
  }
  const pw = img.width, ph = img.height;
  const c = validateCrop(crop);
  const win = windowFor(c.format, pw, ph);
  const rect = photoRect(c, pw, ph, win);
  ctx.save();
  ctx.beginPath();
  ctx.rect(win.x, win.y, win.width, win.height);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

/// Dessine la slide dans `ctx`, dont le canevas fait `pixelWidth` de large.
/// `layer` : 'full', 'background' (sans texte) ou 'text' (texte seul, fond
/// transparent). `caret` ajoute le curseur de saisie.
export function drawComposition(ctx, slide, img, { layer = 'full', caret = null, clear = true } = {}) {
  const scale = ctx.canvas.width / WIDTH;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (layer === 'text') { if (clear) ctx.clearRect(0, 0, WIDTH, HEIGHT); }
  else drawBackground(ctx, img, slide.crop);
  let layout = null;
  if (layer !== 'background') {
    layout = textLayout(slide, ctx);
    if (layout) drawText(ctx, layout, caret ? { ...caretAtEnd(layout), color: caret } : null);
  }
  ctx.restore();
  return layout;
}

/// Un canevas hors écran aux pixels demandés (export : 1080 x 1920).
export function renderToCanvas(slide, img, pixelWidth = WIDTH, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(pixelWidth));
  canvas.height = Math.max(1, Math.round(pixelWidth / ASPECT));
  drawComposition(canvas.getContext('2d'), slide, img, options);
  return canvas;
}
