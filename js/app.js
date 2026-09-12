// L'interface : accueil (scripts + carrousels commencés) et éditeur façon
// TikTok. Miroir de ContentView.swift / EditorView.swift / FilmstripView.swift
// / CropSheet.swift, en DOM + canvas.

import { WIDTH, HEIGHT, ASPECT, LIMITS, textLayout, drawComposition, renderToCanvas, validateCrop, windowFor, maxOffset, FORMATS } from './render.js';
import { loadScripts, scripts, scriptColor, scriptLabel, isTransitionPhrase, nextTransitionPhrase } from './scripts.js';
import { assets } from './store.js';
import { AppState } from './state.js';
import { makeZip } from './zip.js';

const $ = id => document.getElementById(id);
const el = (tag, className, html) => { const node = document.createElement(tag); if (className) node.className = className; if (html !== undefined) node.innerHTML = html; return node; };
const dpr = () => Math.max(1, window.devicePixelRatio || 1);
/// Ordinateur : barre latérale + éditeur côte à côte. Téléphone : deux vues.
const isDesktop = () => window.matchMedia('(min-width: 900px)').matches;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/// setPointerCapture jette si le pointeur n'est plus actif : jamais bloquant.
const capture = (node, event) => { try { node.setPointerCapture(event.pointerId); } catch { /* ignoré */ } };
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = s => (s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'carrousel').slice(0, 60);

const ICONS = {
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  chevronRight: '<svg viewBox="0 0 8 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 1.5l5 5-5 5"/></svg>',
  ellipsis: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 3v18M12 3v18M18 3v18"/><circle cx="6" cy="15" r="2.4" fill="currentColor" stroke="none"/><circle cx="12" cy="8" r="2.4" fill="currentColor" stroke="none"/><circle cx="18" cy="13" r="2.4" fill="currentColor" stroke="none"/></svg>',
  crop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2v15h15"/><path d="M2 7h15v15"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 0 1-14.5 4.6"/><path d="M4 12a8 8 0 0 1 14.5-4.6"/><path d="M18 3v4.5h-4.5"/><path d="M6 21v-4.5h4.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 11-11-3-3L5 16z"/></svg>',
  photos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="15" height="13" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v11"/><path d="M3 15l4-4 4 4 3-3 4 4"/><circle cx="8" cy="10" r="1.3" fill="currentColor"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6h12M6 12h12M6 18h7"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};

const state = new AppState();
let editing = false;
let sizeSliderShown = false;
let caretVisible = true;
let caretTimer = null;
let cropOpen = false;
const backgrounds = new Map();   // id de slide → { key, canvas } : le fond figé, pour redessiner le texte seul

// ---------------------------------------------------------------------------
// Toasts

let toastTimer = null;
function toast(text, error = false) {
  const node = $('toast');
  node.textContent = text;
  node.classList.toggle('error', error);
  node.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add('hidden'), 2600);
}
state.addEventListener('toast', event => toast(event.detail.text, event.detail.error));

// ---------------------------------------------------------------------------
// Accent : la couleur dédiée du script ouvert.

function applyAccent() {
  const script = state.scriptOfCurrent;
  const root = document.documentElement;
  root.style.setProperty('--accent', script ? scriptColor(script.number) : '#ffffff');
  root.style.setProperty('--accent-ink', script ? '#ffffff' : '#000000');
}
const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#fff';

// ---------------------------------------------------------------------------
// Accueil

function renderHome() {
  const home = $('home');
  home.innerHTML = '';
  home.append(el('h1', null, 'Carrousel Studio'));

  const started = state.carousels.map((carousel, index) => ({ carousel, index })).filter(e => e.carousel.slides.length);
  if (started.length) {
    home.append(el('div', 'section-label', 'Mes carrousels'));
    const list = el('div', 'list');
    for (const { carousel, index } of started) {
      const waiting = carousel.slides.filter(s => !s.assetId).length;
      const row = el('button', 'row' + (isDesktop() && index === state.active ? ' current' : ''));
      const thumb = el('div', 'thumb');
      const canvas = document.createElement('canvas');
      thumb.append(canvas);
      const first = carousel.slides[0];
      const paintThumb = () => {
        canvas.width = 34 * dpr(); canvas.height = 60 * dpr();
        drawComposition(canvas.getContext('2d'), first, assets.image(first.assetId));
      };
      paintThumb();
      if (first.assetId && !assets.image(first.assetId)) assets.whenReady(first.assetId, paintThumb);
      row.append(thumb, el('div', 'text', `<b>${escapeHtml(carousel.name)}</b><small>${carousel.slides.length} slides · ${waiting > 0 ? `${waiting} photo(s) à ajouter` : 'prêt'}</small>`), el('span', 'chevron', ICONS.chevronRight));
      row.addEventListener('click', () => { state.select(index); openEditor(); });
      list.append(row);
    }
    home.append(list);
  }

  home.append(el('div', 'section-label', `Scripts <span>${scripts.length} depuis Notion</span>`));
  const list = el('div', 'list');
  for (const script of scripts) {
    const row = el('button', 'row');
    const badge = el('span', 'badge', scriptLabel(script.number));
    badge.style.background = scriptColor(script.number);
    const hook = (script.slides[0] || '').split('\n')[0];
    row.append(badge, el('div', 'text', `<b>${escapeHtml(script.title)}</b><small>${escapeHtml(hook)}</small>`), el('span', 'count', String(script.slides.length)), el('span', 'chevron', ICONS.chevronRight));
    row.addEventListener('click', async () => { if (await state.openScript(script)) openEditor(); });
    list.append(row);
  }
  home.append(list);
}

// ---------------------------------------------------------------------------
// Éditeur — structure

const editor = $('editor');
let ui = null;

function buildEditor() {
  editor.innerHTML = `
    <div class="pages" id="pages"></div>
    <div class="topbar" id="topbar">
      <button class="iconbtn" id="back">${ICONS.chevronLeft}</button>
      <div class="name" id="name"></div>
      <button class="iconbtn" id="menu">${ICONS.ellipsis}</button>
    </div>
    <div class="tools" id="tools"></div>
    <div class="sizeslider hidden" id="sizeslider">
      <div class="value" id="sizeValue">64</div>
      <div class="track" id="sizeTrack"><div class="rail"></div><div class="fill" id="sizeFill"></div><div class="thumb" id="sizeThumb"></div></div>
    </div>
    <div class="bottombar" id="bottombar">
      <div class="strip" id="strip"></div>
      <div class="actions">
        <button class="photos" id="photos">${ICONS.photos}<span>Photos</span></button>
        <button class="export" id="export">Exporter</button>
      </div>
    </div>
    <div class="crop" id="crop"></div>`;
  ui = {
    pages: $('pages'), topbar: $('topbar'), name: $('name'), tools: $('tools'), sizeslider: $('sizeslider'),
    sizeValue: $('sizeValue'), sizeTrack: $('sizeTrack'), sizeFill: $('sizeFill'), sizeThumb: $('sizeThumb'),
    bottombar: $('bottombar'), strip: $('strip'), photos: $('photos'), export: $('export'), crop: $('crop'),
  };
  $('back').addEventListener('click', closeEditor);
  $('menu').addEventListener('click', openMenu);
  ui.photos.addEventListener('click', pickPhotos);
  ui.export.addEventListener('click', openExport);
  ui.pages.addEventListener('scroll', onPagesScroll, { passive: true });
  setupSizeSlider();
}

function openEditor() {
  if (editing) stopEditing();
  applyAccent();
  if (!isDesktop()) $('home').classList.add('hidden');
  else renderHome();
  editor.classList.remove('hidden');
  editing = false; sizeSliderShown = false;
  renderEditor();
  scrollToSlide(state.slide, false);
}

function closeEditor() {
  if (editing) stopEditing();
  state.saveNow();
  if (!isDesktop()) {
    editor.classList.add('hidden');
    $('home').classList.remove('hidden');
  }
  renderHome();
}

const editorOpen = () => isDesktop() || !editor.classList.contains('hidden');

function renderEditor() {
  ui.name.textContent = state.current.name;
  renderPages();
  renderTools();
  renderStrip();
  renderSizeSlider();
  ui.export.disabled = !state.carousels.some(c => c.slides.length);
  ui.bottombar.classList.toggle('off', editing);
}

// ---------------------------------------------------------------------------
// Pages : une par slide, feuilletables horizontalement.

const pageNodes = new Map();   // id de slide → { page, canvas, handle, guideV, guideH, typing }

/// L'image 9:16 aussi grande que la zone le permet, aux pixels exacts de
/// l'écran. L'habillage (barres, icônes, glissière) se cale sur ses bords.
function canvasSize() {
  const box = ui.pages.getBoundingClientRect();
  const scale = dpr();
  const fitted = Math.min(box.width, box.height * ASPECT);
  const pixelWidth = Math.max(1, Math.round(fitted * scale));
  const pixelHeight = Math.round(pixelWidth / ASPECT);
  const width = pixelWidth / scale;
  const margin = Math.max(0, (box.width - width) / 2);
  editor.style.setProperty('--canvas-left', margin + 'px');
  editor.style.setProperty('--canvas-right', margin + 'px');
  return { width, height: pixelHeight / scale, pixelWidth, pixelHeight };
}

function renderPages() {
  const slides = state.current.slides.length ? state.current.slides : [{ id: 'placeholder', text: 'Ton texte,\nton style.', style: {}, crop: {}, placeholder: true }];
  const ids = new Set(slides.map(s => s.id));
  for (const [id, node] of pageNodes) if (!ids.has(id)) { node.page.remove(); pageNodes.delete(id); backgrounds.delete(id); }
  slides.forEach((slide, index) => {
    let node = pageNodes.get(slide.id);
    if (!node) {
      node = createPage(slide.id);
      pageNodes.set(slide.id, node);
    }
    if (ui.pages.children[index] !== node.page) ui.pages.insertBefore(node.page, ui.pages.children[index] ?? null);
    paintPage(slide, node);
  });
}

function createPage(id) {
  const page = el('div', 'page');
  page.dataset.id = id;
  const box = el('div', 'canvasbox');
  const canvas = document.createElement('canvas');
  const handle = el('div', 'handle');
  const guideV = el('div', 'guide v');
  const guideH = el('div', 'guide h');
  const typing = el('textarea', 'typing');
  typing.setAttribute('autocapitalize', 'sentences');
  typing.setAttribute('autocomplete', 'off');
  typing.setAttribute('spellcheck', 'false');
  typing.maxLength = LIMITS.characters;
  box.append(canvas, guideV, guideH, handle, typing);
  page.append(box);
  const node = { page, box, canvas, handle, guideV, guideH, typing };
  setupTextDrag(node);
  typing.addEventListener('input', () => {
    state.updateSlide(slide => { slide.text = typing.value.slice(0, LIMITS.characters); }, { commit: false });
    caretVisible = true;
    paintCurrent();
    state.scheduleSave();
  });
  typing.addEventListener('blur', () => { if (editing) stopEditing(); });
  return node;
}

/// Dessine la slide sur son canevas, aux pixels exacts de l'écran. Le fond
/// (photo + cadrage) est gardé en cache : pendant un réglage, seul le texte
/// se redessine — fluide, et le contour noir ne bouge jamais.
function paintPage(slide, node, { textOnly = false } = {}) {
  const { width, height, pixelWidth, pixelHeight } = canvasSize();
  const { canvas } = node;
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth; canvas.height = pixelHeight;
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    node.box.style.width = width + 'px'; node.box.style.height = height + 'px';
  }
  const ctx = canvas.getContext('2d');
  const image = slide.placeholder ? null : assets.image(slide.assetId);
  const key = `${slide.assetId}|${image ? 'img' : 'none'}|${JSON.stringify(slide.crop)}|${pixelWidth}`;
  let cache = backgrounds.get(slide.id);
  if (!cache || cache.key !== key) {
    cache = { key, canvas: renderToCanvas({ ...slide, text: '' }, image, pixelWidth, { layer: 'background' }) };
    backgrounds.set(slide.id, cache);
    if (slide.assetId && !image) assets.whenReady(slide.assetId, () => requestPaint(slide.id));
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(cache.canvas, 0, 0);
  const isCurrent = state.currentSlide?.id === slide.id;
  const caret = editing && isCurrent && caretVisible ? accent() : null;
  const layout = drawComposition(ctx, slide, image, { layer: 'text', caret, clear: false });
  positionHandle(node, layout, width);
  return layout;
}

function positionHandle(node, layout, width) {
  const scale = width / WIDTH;
  const show = layout && !editing && !cropOpen;
  node.handle.style.display = show ? 'block' : 'none';
  if (!show) return;
  const pad = 60;
  const w = Math.max(70, (layout.width + pad) * scale), h = Math.max(70, (layout.height + pad) * scale);
  node.handle.style.width = w + 'px';
  node.handle.style.height = h + 'px';
  node.handle.style.left = ((layout.x + layout.width / 2) * scale - w / 2) + 'px';
  node.handle.style.top = ((layout.y + layout.height / 2) * scale - h / 2) + 'px';
}

let paintQueue = new Set();
let paintFrame = 0;
function requestPaint(id = null) {
  paintQueue.add(id);
  if (paintFrame) return;
  // Un délai nul plutôt que requestAnimationFrame : celui-ci ne tourne pas
  // quand l'onglet est en arrière-plan, et le rendu resterait en attente.
  paintFrame = setTimeout(() => {
    paintFrame = 0;
    const all = paintQueue.has(null);
    const ids = paintQueue; paintQueue = new Set();
    for (const slide of state.current.slides) {
      if (all || ids.has(slide.id)) { const node = pageNodes.get(slide.id); if (node) paintPage(slide, node); }
    }
  });
}

function paintCurrent() {
  const slide = state.currentSlide;
  const node = slide && pageNodes.get(slide.id);
  if (slide && node) paintPage(slide, node);
}

function scrollToSlide(index, smooth = true) {
  const width = ui.pages.clientWidth;
  ui.pages.scrollTo({ left: index * width, behavior: smooth ? 'smooth' : 'instant' });
}

let scrollTimer = null;
function onPagesScroll() {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const width = ui.pages.clientWidth || 1;
    const index = Math.round(ui.pages.scrollLeft / width);
    if (index !== state.slide && state.current.slides[index]) {
      const previous = state.currentSlide;
      state.selectSlide(index, { notify: false });
      if (previous) requestPaint(previous.id);
      renderTools(); renderStrip(); renderSizeSlider();
    }
  }, 80);
}

// ---------------------------------------------------------------------------
// Déplacement du texte au doigt, avec aimantation au centre et repères.

function setupTextDrag(node) {
  let origin = null;
  const snap = 0.015;
  node.handle.addEventListener('pointerdown', event => {
    const slide = state.currentSlide;
    if (!slide || editing) return;
    event.preventDefault();
    capture(node.handle, event);
    node.handle.classList.add('dragging');
    origin = { x: slide.style.x, y: slide.style.y, px: event.clientX, py: event.clientY, w: node.box.clientWidth, h: node.box.clientHeight };
  });
  node.handle.addEventListener('pointermove', event => {
    if (!origin) return;
    let x = clamp(origin.x + (event.clientX - origin.px) / origin.w, 0, 1);
    let y = clamp(origin.y + (event.clientY - origin.py) / origin.h, 0, 1);
    if (Math.abs(x - 0.5) < snap) x = 0.5;
    if (Math.abs(y - 0.5) < snap) y = 0.5;
    node.guideV.classList.toggle('on', x === 0.5);
    node.guideH.classList.toggle('on', y === 0.5);
    state.setStyle(style => { style.x = x; style.y = y; }, { commit: false });
    paintPageWithoutHandle(node);
  });
  const end = () => {
    if (!origin) return;
    origin = null;
    node.handle.classList.remove('dragging');
    node.guideV.classList.remove('on'); node.guideH.classList.remove('on');
    state.setStyle(() => {});   // valide et enregistre la position posée
    paintCurrent();
  };
  node.handle.addEventListener('pointerup', end);
  node.handle.addEventListener('pointercancel', end);
}

/// Pendant le geste, la zone de prise reste figée sous le doigt : une zone qui
/// suit le texte casse le geste.
function paintPageWithoutHandle(node) {
  const slide = state.currentSlide;
  if (!slide) return;
  const { width } = canvasSize();
  const before = { left: node.handle.style.left, top: node.handle.style.top, w: node.handle.style.width, h: node.handle.style.height };
  paintPage(slide, node);
  Object.assign(node.handle.style, { left: before.left, top: before.top, width: before.w, height: before.h });
  void width;
}

// ---------------------------------------------------------------------------
// Colonne d'icônes

function tool(icon, { active = false, text = false, onClick }) {
  const button = el('button', 'iconbtn' + (active ? ' active' : '') + (text ? ' text' : ''), icon);
  button.addEventListener('click', onClick);
  return button;
}

function renderTools() {
  ui.tools.innerHTML = '';
  const slide = state.currentSlide;
  if (!slide) return;
  if (editing) {
    ui.tools.append(tool(ICONS.check, { active: true, onClick: stopEditing }));
    return;
  }
  ui.tools.append(
    tool('Aa', { text: true, onClick: startEditing }),
    tool(ICONS.sliders, { active: sizeSliderShown, onClick: () => { sizeSliderShown = !sizeSliderShown; renderTools(); renderSizeSlider(); } }),
    tool(ICONS.crop, { onClick: openCrop }),
  );
  if (isTransitionPhrase(slide.text)) {
    ui.tools.append(tool(ICONS.rotate, { onClick: () => { state.updateSlide(s => { s.text = nextTransitionPhrase(s.text); }); } }));
  }
  const cta = assets.ctaIndex(slide.assetId);
  if (cta !== null) {
    ui.tools.append(tool(ICONS.rotate, { onClick: async () => { const next = await assets.ctaId(cta + 1); state.updateSlide(s => { s.assetId = next; }); } }));
  }
  const hook = assets.hookIndex(slide.assetId);
  if (hook !== null) {
    ui.tools.append(tool(ICONS.rotate, { onClick: async () => { const next = await assets.hookId(hook + 1); state.updateSlide(s => { s.assetId = next; }); } }));
  }
}

// ---------------------------------------------------------------------------
// Saisie dans l'image : le texte rendu reste affiché et se redessine à chaque
// frappe ; le champ transparent n'apporte que le clavier.

function startEditing() {
  const slide = state.currentSlide;
  const node = slide && pageNodes.get(slide.id);
  if (!node) return;
  editing = true; sizeSliderShown = false;
  ui.pages.classList.add('editing');
  node.typing.value = slide.text;
  node.typing.style.pointerEvents = 'auto';
  node.typing.focus({ preventScroll: true });
  node.typing.setSelectionRange(node.typing.value.length, node.typing.value.length);
  caretVisible = true;
  clearInterval(caretTimer);
  caretTimer = setInterval(() => { caretVisible = !caretVisible; paintCurrent(); }, 530);
  renderTools(); renderSizeSlider(); paintCurrent();
  ui.bottombar.classList.add('off');
}

function stopEditing() {
  if (!editing) return;
  editing = false;
  clearInterval(caretTimer);
  ui.pages.classList.remove('editing');
  for (const node of pageNodes.values()) { node.typing.style.pointerEvents = 'none'; node.typing.blur(); }
  state.updateSlide(() => {});
  renderTools(); renderStrip(); paintCurrent();
  ui.bottombar.classList.remove('off');
}

// ---------------------------------------------------------------------------
// Glissière de taille

function setupSizeSlider() {
  const track = ui.sizeTrack;
  let dragging = false;
  const valueAt = event => {
    const rect = track.getBoundingClientRect();
    const thumb = 28, travel = Math.max(1, rect.height - thumb);
    const fraction = clamp(1 - (event.clientY - rect.top - thumb / 2) / travel, 0, 1);
    return Math.round(28 + fraction * (130 - 28));
  };
  track.addEventListener('pointerdown', event => {
    event.preventDefault();
    capture(track, event);
    dragging = true;
    applySize(valueAt(event), false);
  });
  track.addEventListener('pointermove', event => { if (dragging) applySize(valueAt(event), false); });
  const end = () => { if (!dragging) return; dragging = false; state.setStyle(() => {}); renderSizeSlider(); };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
}

function applySize(size, commit) {
  const slide = state.currentSlide;
  if (!slide || slide.style.size === size) return;
  state.setStyle(style => { style.size = size; }, { commit });
  renderSizeSlider();
  paintCurrent();
}

function renderSizeSlider() {
  const slide = state.currentSlide;
  const show = sizeSliderShown && !editing && slide;
  ui.sizeslider.classList.toggle('hidden', !show);
  if (!show) return;
  const length = Math.round(ui.pages.clientHeight * 0.42);
  ui.sizeTrack.style.height = length + 'px';
  const fraction = (slide.style.size - 28) / (130 - 28);
  const travel = length - 28;
  ui.sizeValue.textContent = Math.round(slide.style.size);
  ui.sizeFill.style.height = (14 + travel * fraction) + 'px';
  ui.sizeThumb.style.top = (travel * (1 - fraction)) + 'px';
}

// ---------------------------------------------------------------------------
// Bande des slides : un carré par slide, appui long puis glisser pour réordonner.

let bubbleFor = null;
let bubbleTimer = null;

function renderStrip() {
  ui.strip.innerHTML = '';
  state.current.slides.forEach((slide, index) => {
    const square = el('div', 'square' + (index === state.slide ? ' selected' : ''));
    square.dataset.index = index;
    if (slide.assetId) {
      const canvas = document.createElement('canvas');
      square.append(canvas);
      const paint = () => {
        const image = assets.image(slide.assetId);
        if (!image) return;
        const size = 36 * dpr();
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / image.width, size / image.height);
        ctx.drawImage(image, (size - image.width * scale) / 2, (size - image.height * scale) / 2, image.width * scale, image.height * scale);
      };
      paint();
      if (!assets.image(slide.assetId)) assets.whenReady(slide.assetId, paint);
    }
    if (bubbleFor === slide.id && index === state.slide) {
      const bubble = el('button', 'bubble', `${ICONS.pencil}<span>Modifier</span>`);
      bubble.addEventListener('click', event => { event.stopPropagation(); bubbleFor = null; renderStrip(); pickSingle(index); });
      square.append(bubble);
    }
    setupSquare(square, slide, index);
    ui.strip.append(square);
  });
}

function setupSquare(square, slide, index) {
  let pressTimer = null, lifted = false, startX = 0, currentIndex = index, moved = false;
  square.addEventListener('pointerdown', event => {
    if (event.button !== undefined && event.button !== 0) return;
    startX = event.clientX; moved = false; lifted = false; currentIndex = index;
    capture(square, event);
    pressTimer = setTimeout(() => {
      lifted = true; bubbleFor = null;
      square.classList.add('lifted');
      ui.strip.querySelector('.bubble')?.remove();
    }, 260);
  });
  square.addEventListener('pointermove', event => {
    if (!lifted) { if (Math.abs(event.clientX - startX) > 8) { clearTimeout(pressTimer); moved = true; } return; }
    event.preventDefault();
    const dx = event.clientX - startX;
    square.style.transform = `translateX(${dx}px)`;
    // Le carré tenu prend la place de celui qu'il survole, en direct.
    const squares = [...ui.strip.children];
    const center = event.clientX;
    let target = currentIndex;
    squares.forEach((other, i) => {
      if (other === square) return;
      const rect = other.getBoundingClientRect();
      if (i < currentIndex && center < rect.left + rect.width / 2) target = Math.min(target, i);
      if (i > currentIndex && center > rect.left + rect.width / 2) target = Math.max(target, i);
    });
    if (target !== currentIndex) {
      const before = square.getBoundingClientRect().left - dx;
      ui.strip.insertBefore(square, target > currentIndex ? squares[target].nextSibling : squares[target]);
      currentIndex = target;
      // Le carré a changé de case : on recale la translation pour qu'il reste sous le doigt.
      const after = square.getBoundingClientRect().left - (parseFloat(square.style.transform.replace(/[^-\d.]/g, '')) || 0);
      startX += after - before;
      square.style.transform = `translateX(${event.clientX - startX}px)`;
    }
  });
  const end = event => {
    clearTimeout(pressTimer);
    if (lifted) {
      square.classList.remove('lifted');
      square.style.transform = '';
      lifted = false;
      if (currentIndex !== index) state.moveSlide(index, currentIndex);
      else renderStrip();
      return;
    }
    if (moved || event.type === 'pointercancel') return;
    // Tap : sélectionne, et fait apparaître la bulle « Modifier ».
    state.selectSlide(index, { notify: false });
    scrollToSlide(index);
    bubbleFor = slide.id;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubbleFor = null; renderStrip(); }, 4000);
    renderTools(); renderStrip(); renderSizeSlider();
  };
  square.addEventListener('pointerup', end);
  square.addEventListener('pointercancel', end);
}

// ---------------------------------------------------------------------------
// Photos

function pickPhotos() {
  const input = $('fileMulti');
  input.value = '';
  input.onchange = async () => {
    const files = [...input.files].slice(0, state.photoPickerCapacity);
    if (files.length) await state.addImages(files);
  };
  input.click();
}

function pickSingle(index) {
  const input = $('fileSingle');
  input.value = '';
  input.onchange = async () => { if (input.files[0]) await state.replaceImage(index, input.files[0]); };
  input.click();
}

// ---------------------------------------------------------------------------
// Cadrage : surcouche en place. L'image dézoome légèrement dessous pendant
// que l'habillage de l'éditeur s'efface et que celui du cadrage apparaît.

function openCrop() {
  const slide = state.currentSlide;
  if (!slide || cropOpen) return;
  cropOpen = true; sizeSliderShown = false;
  renderSizeSlider();
  for (const node of pageNodes.values()) node.handle.style.display = 'none';
  const crop = { ...validateCrop(slide.crop) };
  const image = assets.image(slide.assetId);
  const pw = image ? image.width : WIDTH, ph = image ? image.height : HEIGHT;

  ui.crop.innerHTML = `
    <div class="head">Cadrage</div>
    <div class="stage"><div class="cropbox"><canvas></canvas><div class="outline"></div></div></div>
    <div class="formats"></div>
    <div class="foot"><button class="cancel">Annuler</button><button class="save">Enregistrer</button></div>`;
  const box = ui.crop.querySelector('.cropbox');
  const canvas = box.querySelector('canvas');
  const outline = box.querySelector('.outline');
  const formats = ui.crop.querySelector('.formats');

  const stage = ui.crop.querySelector('.stage');
  const { width: fullWidth } = canvasSize();
  const width = Math.round(fullWidth * 330 / 402);
  const height = Math.round(width / ASPECT);
  box.style.width = width + 'px'; box.style.height = height + 'px';
  canvas.width = Math.round(width * dpr()); canvas.height = Math.round(height * dpr());
  canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
  void stage;

  const paint = () => {
    drawComposition(canvas.getContext('2d'), { ...slide, crop, text: '' }, image, { layer: 'background' });
    const win = windowFor(crop.format, pw, ph);
    const scale = width / WIDTH;
    outline.style.left = (win.x * scale) + 'px'; outline.style.top = (win.y * scale) + 'px';
    outline.style.width = (win.width * scale) + 'px'; outline.style.height = (win.height * scale) + 'px';
    formats.querySelectorAll('.format').forEach(f => f.classList.toggle('selected', f.dataset.id === crop.format));
  };
  const clampOffsets = () => {
    const limit = maxOffset(crop, pw, ph);
    crop.offsetX = clamp(crop.offsetX, -limit.x, limit.x);
    crop.offsetY = clamp(crop.offsetY, -limit.y, limit.y);
  };

  for (const format of FORMATS) {
    const button = el('button', 'format');
    button.dataset.id = format.id;
    const icon = el('div', 'icon');
    if (format.id === 'fill') { const s = el('div', 'shape solid'); s.style.width = '17px'; s.style.height = '30px'; icon.append(s); }
    else if (format.id === 'original') icon.innerHTML = ICONS.image.replace('<svg', '<svg width="26" height="26"');
    else { const s = el('div', 'shape'); const a = format.aspect; s.style.width = (a >= 1 ? 30 : 30 * a) + 'px'; s.style.height = (a >= 1 ? 30 / a : 30) + 'px'; icon.append(s); }
    button.append(icon, el('span', null, format.label));
    button.addEventListener('click', () => { crop.format = format.id; crop.zoom = 1; crop.offsetX = 0; crop.offsetY = 0; paint(); });
    formats.append(button);
  }

  // Un doigt : déplace. Deux doigts ou molette : zoome. Double-tap : remise à zéro.
  const pointers = new Map();
  let startOffset = null, startZoom = null, startDistance = 0, lastTap = 0;
  box.addEventListener('pointerdown', event => {
    event.preventDefault();
    capture(box, event);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      startOffset = { x: crop.offsetX, y: crop.offsetY, px: event.clientX, py: event.clientY };
      const now = Date.now();
      if (now - lastTap < 300) { crop.zoom = 1; crop.offsetX = 0; crop.offsetY = 0; paint(); }
      lastTap = now;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      startZoom = crop.zoom; startDistance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    }
  });
  box.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && startZoom) {
      const [a, b] = [...pointers.values()];
      crop.zoom = clamp(startZoom * (Math.hypot(a.x - b.x, a.y - b.y) / startDistance), 1, 4);
      clampOffsets(); paint();
    } else if (pointers.size === 1 && startOffset) {
      const win = windowFor(crop.format, pw, ph);
      const scale = width / WIDTH;
      const limit = maxOffset(crop, pw, ph);
      crop.offsetX = clamp(startOffset.x + (event.clientX - startOffset.px) / (win.width * scale), -limit.x, limit.x);
      crop.offsetY = clamp(startOffset.y + (event.clientY - startOffset.py) / (win.height * scale), -limit.y, limit.y);
      paint();
    }
  });
  const release = event => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) startZoom = null;
    if (pointers.size === 0) startOffset = null;
    else if (pointers.size === 1) { const p = [...pointers.values()][0]; startOffset = { x: crop.offsetX, y: crop.offsetY, px: p.x, py: p.y }; }
  };
  box.addEventListener('pointerup', release);
  box.addEventListener('pointercancel', release);
  box.addEventListener('wheel', event => {
    event.preventDefault();
    crop.zoom = clamp(crop.zoom * (event.deltaY < 0 ? 1.06 : 1 / 1.06), 1, 4);
    clampOffsets(); paint();
  }, { passive: false });

  const close = save => {
    if (save) state.setCrop(crop);
    outline.classList.remove('on');
    ui.crop.classList.remove('on');
    ui.pages.style.transform = ''; ui.pages.style.opacity = '';
    [ui.topbar, ui.tools, ui.bottombar].forEach(n => n.classList.remove('chrome-off'));
    setTimeout(() => { cropOpen = false; ui.crop.innerHTML = ''; requestPaint(); }, 400);
  };
  ui.crop.querySelector('.cancel').addEventListener('click', () => close(false));
  ui.crop.querySelector('.save').addEventListener('click', () => close(true));

  paint();
  ui.crop.classList.add('on');
  ui.pages.style.transform = 'scale(' + (330 / 402) + ')'; ui.pages.style.opacity = '0';
  [ui.topbar, ui.tools, ui.bottombar].forEach(n => n.classList.add('chrome-off'));
  setTimeout(() => outline.classList.add('on'), 340);
}

// ---------------------------------------------------------------------------
// Feuilles : menu « … », export, dialogues.

function openSheet(build) {
  const sheet = $('sheet');
  sheet.innerHTML = '';
  const panel = el('div', 'panel');
  sheet.append(panel);
  sheet.classList.remove('hidden');
  sheet.onclick = event => { if (event.target === sheet) closeSheet(); };
  build(panel);
}
function closeSheet() { const sheet = $('sheet'); sheet.classList.add('hidden'); sheet.innerHTML = ''; }

function sheetItem(panel, icon, label, onClick, { danger = false, disabled = false } = {}) {
  const item = el('button', 'item' + (danger ? ' danger' : ''), `${icon}<span>${label}</span>`);
  item.disabled = disabled;
  item.addEventListener('click', () => { closeSheet(); onClick(); });
  panel.append(item);
}

function openMenu() {
  openSheet(panel => {
    sheetItem(panel, ICONS.pencil, 'Renommer', () => promptSheet('Renommer le carrousel', state.current.name, value => state.rename(value)));
    sheetItem(panel, ICONS.quote, 'Description', openCaption);
    sheetItem(panel, ICONS.text, 'Textes en lot', openBatch, { disabled: !state.current.slides.length });
    sheetItem(panel, ICONS.image, 'Remplacer la photo', () => pickSingle(state.slide), { disabled: !state.currentSlide });
    sheetItem(panel, ICONS.copy, 'Dupliquer le carrousel', () => state.duplicateCarousel());
    if (state.hasRememberedStyles) sheetItem(panel, ICONS.reset, 'Réinitialiser les tailles du script', () => state.forgetScriptStyles());
    sheetItem(panel, ICONS.trash, 'Supprimer ce carrousel', () => confirmSheet('Supprimer ce carrousel ?', `« ${state.current.name} » et ses textes seront retirés du projet.`, () => { state.deleteCurrentCarousel(); closeEditor(); }), { danger: true });
  });
}

function promptSheet(title, initial, onSave) {
  openSheet(panel => {
    panel.append(el('h2', null, escapeHtml(title)));
    const input = el('input'); input.type = 'text'; input.value = initial; input.maxLength = LIMITS.nameLength;
    const buttons = el('div', 'buttons');
    const cancel = el('button', 'neutral', 'Annuler'); const save = el('button', 'primary', 'Enregistrer');
    cancel.addEventListener('click', closeSheet);
    save.addEventListener('click', () => { onSave(input.value); closeSheet(); });
    buttons.append(cancel, save);
    panel.append(input, buttons);
    input.focus(); input.select();
  });
}

function confirmSheet(title, message, onConfirm) {
  openSheet(panel => {
    panel.append(el('h2', null, escapeHtml(title)), el('p', 'note', escapeHtml(message)));
    const buttons = el('div', 'buttons');
    const cancel = el('button', 'neutral', 'Annuler'); const ok = el('button', 'danger', 'Supprimer');
    cancel.addEventListener('click', closeSheet);
    ok.addEventListener('click', () => { closeSheet(); onConfirm(); });
    buttons.append(cancel, ok);
    panel.append(buttons);
  });
}

function openCaption() {
  openSheet(panel => {
    panel.append(el('h2', null, 'Description'), el('p', 'note', "Elle reste dans l'outil, à copier au moment de publier."));
    const area = el('textarea'); area.value = state.current.caption; area.maxLength = LIMITS.captionLength;
    area.addEventListener('input', () => state.setCaption(area.value));
    const buttons = el('div', 'buttons');
    const copy = el('button', 'neutral', 'Copier'); const close = el('button', 'primary', 'Fermer');
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(area.value); toast('Description copiée.'); } catch { toast('Impossible de copier.', true); } });
    close.addEventListener('click', closeSheet);
    buttons.append(copy, close);
    panel.append(area, buttons);
  });
}

function openBatch() {
  openSheet(panel => {
    panel.append(el('h2', null, 'Textes en lot'), el('p', 'note', 'Un bloc par image, séparés par une ligne « --- ».'));
    const area = el('textarea'); area.value = state.batchText;
    const count = el('p', 'note');
    const update = () => { count.textContent = `${AppState.batchParts(area.value).length} bloc(s) · ${state.current.slides.length} image(s)`; };
    area.addEventListener('input', update); update();
    const buttons = el('div', 'buttons');
    const cancel = el('button', 'neutral', 'Annuler'); const apply = el('button', 'primary', 'Répartir');
    cancel.addEventListener('click', closeSheet);
    apply.addEventListener('click', () => { if (state.applyBatch(area.value)) closeSheet(); });
    buttons.append(cancel, apply);
    panel.append(area, count, buttons);
  });
}

// ---------------------------------------------------------------------------
// Export : PNG 1080 x 1920 sans perte. Une image seule se télécharge telle
// quelle, un carrousel (ou tout) en ZIP.

function openExport() {
  openSheet(panel => {
    panel.append(el('h2', null, 'Exporter'), el('p', 'note', 'PNG 1080 × 1920, sans perte de qualité. Les fichiers sont numérotés dans l’ordre des slides.'));
    sheetItem(panel, ICONS.image, 'Cette image (PNG)', () => runExport('slide'), { disabled: !state.currentSlide });
    sheetItem(panel, ICONS.copy, 'Ce carrousel (ZIP)', () => runExport('carousel'), { disabled: !state.current.slides.length });
    sheetItem(panel, ICONS.text, 'Tous les carrousels (ZIP)', () => runExport('all'));
  });
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const canvasBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Rendu impossible.'))), 'image/png'));

async function runExport(scope) {
  const carousels = scope === 'all' ? state.carousels.filter(c => c.slides.length) : [state.current];
  if (!carousels.length || carousels.every(c => !c.slides.length)) { toast('Ajoute au moins une image.', true); return; }
  toast('Préparation…');
  try {
    const files = [];
    for (const [carouselIndex, carousel] of carousels.entries()) {
      const slides = scope === 'slide' ? [state.currentSlide] : carousel.slides;
      for (const [index, slide] of slides.entries()) {
        const position = scope === 'slide' ? state.slide + 1 : index + 1;
        if (!slide.assetId) throw new Error(`L'image ${position} (${carousel.name}) n'a pas encore de photo. Ajoute-la avant d'exporter.`);
        const image = await assets.decoded(slide.assetId);
        if (!image) throw new Error('Une photo est manquante. Remplace-la avant l\'export.');
        const layout = textLayout(slide);
        if (layout?.overflow) throw new Error(`Le texte de l'image ${position} (${carousel.name}) dépasse du cadre. Réduis sa taille ou déplace-le.`);
        const prefix = scope === 'all' ? String(carouselIndex + 1).padStart(2, '0') + '-' : '';
        const name = `${prefix}${slug(carousel.name)}-${String(position).padStart(2, '0')}.png`;
        const blob = await canvasBlob(renderToCanvas(slide, image, WIDTH));
        files.push({ name, bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
    }
    if (files.length === 1 && scope === 'slide') {
      download(new Blob([files[0].bytes], { type: 'image/png' }), files[0].name);
    } else {
      download(makeZip(files), (scope === 'all' ? 'carrousels' : slug(state.current.name)) + '.zip');
    }
    toast(files.length === 1 ? 'Image téléchargée.' : `${files.length} images téléchargées.`);
  } catch (error) {
    toast(error.message, true);
  }
}

// ---------------------------------------------------------------------------
// Réactions au modèle

state.addEventListener('change', () => {
  if (!editorOpen()) { renderHome(); return; }
  if (isDesktop()) renderHome();
  applyAccent();
  renderEditor();
});
state.addEventListener('paint', () => paintCurrent());
assets.addEventListener('ready', () => { if (editorOpen()) requestPaint(); });

let wasDesktop = isDesktop();
window.addEventListener('resize', () => {
  if (wasDesktop !== isDesktop()) {
    // Changement de mise en page : on repart proprement sur la bonne vue.
    wasDesktop = isDesktop();
    if (isDesktop()) openEditor();
    else { editor.classList.add('hidden'); $('home').classList.remove('hidden'); renderHome(); }
    return;
  }
  if (!editorOpen() || editing) return;
  backgrounds.clear();
  renderPages(); renderSizeSlider();
  scrollToSlide(state.slide, false);
});

document.addEventListener('keydown', event => {
  if (!editorOpen() || editing || !$('sheet').classList.contains('hidden')) return;
  if (event.key === 'ArrowRight') { state.selectSlide(state.slide + 1); scrollToSlide(state.slide); }
  if (event.key === 'ArrowLeft') { state.selectSlide(state.slide - 1); scrollToSlide(state.slide); }
  if (event.key === 'Escape' && cropOpen) ui.crop.querySelector('.cancel')?.click();
});

// ---------------------------------------------------------------------------
// Démarrage

(async function start() {
  try { await document.fonts.load('600 64px TikTokSans'); await document.fonts.load('400 15px TikTokSans'); } catch { /* police système */ }
  await loadScripts();
  buildEditor();
  renderHome();
  // Sur ordinateur, l'éditeur est toujours là : on ouvre le carrousel courant.
  if (isDesktop()) openEditor();
})();
