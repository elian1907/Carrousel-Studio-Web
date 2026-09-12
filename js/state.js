// L'état de l'app : carrousels, slide courante, mutations. Miroir de
// AppState.swift. Les vues écoutent `change` et se redessinent.

import { LIMITS, DEFAULT_STYLE, DEFAULT_CROP, validateStyle, validateCrop } from './render.js';
import { assets, styleStore, loadProject, saveProject } from './store.js';
import { scriptByNumber } from './scripts.js';

const uid = () => crypto.randomUUID();

export const newSlide = (props = {}) => ({
  id: uid(), assetId: null, text: '', style: { ...DEFAULT_STYLE }, crop: { ...DEFAULT_CROP }, ...props,
});

export const newCarousel = (name = 'Nouveau carrousel') => ({
  id: uid(), name: name || 'Nouveau carrousel', caption: '', slides: [], scriptNumber: null,
});

/// « 4. Texte » ou « 2 - Texte » : le numéro, son séparateur exact, le reste.
/// « 12 500 pas… » ne compte pas : il faut un point ou un tiret après le nombre.
export function numberedPrefix(text) {
  const match = /^(\d{1,2})( *[.-] *)([\s\S]*)$/.exec(text);
  if (!match) return null;
  return { value: Number(match[1]), separator: match[2], rest: match[3] };
}

export class AppState extends EventTarget {
  carousels = [];
  active = 0;
  slide = 0;
  #saveTimer = null;

  constructor() {
    super();
    const project = loadProject();
    if (project && project.carousels.length) {
      this.carousels = project.carousels.map(carousel => ({
        ...newCarousel(carousel.name),
        ...carousel,
        slides: (carousel.slides || []).map(slide => ({
          ...newSlide(),
          ...slide,
          style: validateStyle(slide.style),
          crop: validateCrop(slide.crop),
        })),
      }));
    } else {
      this.carousels = [newCarousel('Mon premier carrousel')];
    }
  }

  // --- Accès courant --------------------------------------------------------

  get current() { return this.carousels[Math.min(this.active, this.carousels.length - 1)]; }
  get currentSlide() { return this.current.slides[this.slide] ?? null; }

  emit(type = 'change', detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  toast(text, error = false) { this.emit('toast', { text, error }); }

  // --- Sauvegarde automatique, 0,6 s après la dernière modification ----------

  scheduleSave() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => this.saveNow(), 600);
  }

  saveNow() {
    saveProject({ app: 'carrousel-studio', version: 1, carousels: this.carousels });
  }

  /// Modifie la slide courante. `commit: false` pendant un geste : on
  /// redessine sans écrire sur disque ni notifier toute l'interface.
  updateSlide(change, { commit = true } = {}) {
    const slide = this.currentSlide;
    if (!slide) return;
    change(slide);
    if (commit) { this.scheduleSave(); this.emit('change', { scope: 'slide' }); }
    else this.emit('paint');
  }

  setStyle(change, options) {
    this.updateSlide(slide => change(slide.style), options);
    if (options?.commit !== false) this.#rememberStyleForScript();
  }

  setCrop(crop) {
    this.updateSlide(slide => { slide.crop = validateCrop(crop); });
  }

  // --- Carrousels -----------------------------------------------------------

  addCarousel() {
    if (this.carousels.length >= LIMITS.carousels) { this.toast(`Un projet peut contenir jusqu'à ${LIMITS.carousels} carrousels.`, true); return false; }
    this.carousels.push(newCarousel());
    this.active = this.carousels.length - 1;
    this.slide = 0;
    this.scheduleSave(); this.emit('change');
    return true;
  }

  duplicateCarousel() {
    if (this.carousels.length >= LIMITS.carousels) { this.toast(`Un projet peut contenir jusqu'à ${LIMITS.carousels} carrousels.`, true); return; }
    const copy = structuredClone(this.current);
    copy.id = uid();
    copy.name = (copy.name + ' — copie').slice(0, LIMITS.nameLength);
    copy.slides.forEach(slide => { slide.id = uid(); });
    this.carousels.splice(this.active + 1, 0, copy);
    this.active += 1;
    this.slide = 0;
    this.scheduleSave(); this.emit('change');
  }

  deleteCurrentCarousel() {
    this.carousels.splice(this.active, 1);
    if (!this.carousels.length) this.carousels = [newCarousel()];
    this.active = Math.max(0, this.active - 1);
    this.slide = 0;
    this.#pruneAssets();
    this.scheduleSave(); this.emit('change');
  }

  rename(name) {
    this.current.name = (name.trim() || 'Sans titre').slice(0, LIMITS.nameLength);
    this.scheduleSave(); this.emit('change');
  }

  setCaption(caption) {
    this.current.caption = caption.slice(0, LIMITS.captionLength);
    this.scheduleSave();
  }

  select(index) {
    if (index < 0 || index >= this.carousels.length) return;
    this.active = index;
    this.slide = 0;
    this.emit('change');
  }

  selectSlide(index, { notify = true } = {}) {
    if (!this.current.slides.length) { this.slide = 0; return; }
    const clamped = Math.max(0, Math.min(index, this.current.slides.length - 1));
    if (clamped === this.slide) return;
    this.slide = clamped;
    if (notify) this.emit('change', { scope: 'selection' });
  }

  // --- Images ---------------------------------------------------------------

  /// Nombre de photos qu'on peut choisir d'un coup : les slides qui attendent
  /// la leur, sinon toutes les slides (pour les refaire dans l'ordre). Un
  /// carrousel vide accepte jusqu'à la limite.
  get photoPickerCapacity() {
    if (!this.current.slides.length) return LIMITS.slides;
    const waiting = this.current.slides.filter(s => !s.assetId).length;
    return Math.max(1, waiting > 0 ? waiting : this.current.slides.length);
  }

  /// Les photos se placent dans l'ordre des carrés : d'abord ceux qui
  /// attendent la leur, sinon depuis le premier. Jamais plus de slides que de
  /// carrés — sauf pour un carrousel vide, où chaque photo crée sa slide.
  async addImages(files) {
    const ids = [];
    for (const file of files) {
      try { ids.push(await assets.add(file)); }
      catch (error) { this.toast(error.message, true); }
    }
    if (!ids.length) return;
    const carousel = this.current;
    if (!carousel.slides.length) {
      for (const assetId of ids.slice(0, LIMITS.slides)) carousel.slides.push(newSlide({ assetId }));
      this.slide = 0;
    } else {
      const waiting = carousel.slides.map((s, i) => (s.assetId ? -1 : i)).filter(i => i >= 0);
      const targets = waiting.length ? waiting : carousel.slides.map((_, i) => i);
      let first = null;
      targets.slice(0, ids.length).forEach((index, k) => {
        carousel.slides[index].assetId = ids[k];
        if (first === null) first = index;
      });
      if (first !== null) this.slide = first;
    }
    await this.#pruneAssets();
    this.scheduleSave(); this.emit('change');
  }

  async replaceImage(index, file) {
    const slide = this.current.slides[index];
    if (!slide) return;
    try {
      slide.assetId = await assets.add(file);
      await this.#pruneAssets();
      this.scheduleSave(); this.emit('change');
    } catch (error) {
      this.toast(error.message, true);
    }
  }

  deleteCurrentSlide() {
    if (!this.currentSlide) return;
    this.current.slides.splice(this.slide, 1);
    this.slide = Math.max(0, Math.min(this.slide, this.current.slides.length - 1));
    this.#pruneAssets();
    this.scheduleSave(); this.emit('change');
  }

  /// Déplace une slide à une autre position (réordonnancement par glisser).
  /// Les numéros en tête de texte (« 4. », « 2 - ») restent collés aux
  /// positions : après le déplacement, la séquence de chiffres est réécrite
  /// telle qu'elle était, seuls les textes changent de place.
  moveSlide(from, to) {
    const slides = this.current.slides;
    if (from === to || !slides[from] || !slides[to]) return;
    const sequence = slides.map(s => numberedPrefix(s.text)?.value).filter(v => v !== undefined);
    const [moved] = slides.splice(from, 1);
    slides.splice(to, 0, moved);
    this.slide = to;
    if (sequence.length >= 2) {
      const queue = [...sequence];
      for (const slide of slides) {
        const parsed = numberedPrefix(slide.text);
        if (!parsed || !queue.length) continue;
        const value = queue.shift();
        if (value !== parsed.value) slide.text = `${value}${parsed.separator}${parsed.rest}`;
      }
    }
    this.scheduleSave(); this.emit('change');
  }

  async #pruneAssets() {
    const used = new Set(this.carousels.flatMap(c => c.slides.map(s => s.assetId).filter(Boolean)));
    await assets.prune(used);
  }

  // --- Scripts --------------------------------------------------------------

  /// Crée un carrousel à partir d'un script Notion : une slide par bloc de
  /// texte. La première reçoit un visuel hook, celles qui citent Loslo un
  /// visuel CTA — décalés selon le script pour varier d'un compte à l'autre.
  async openScript(script) {
    if (this.carousels.length >= LIMITS.carousels) { this.toast(`Un projet peut contenir jusqu'à ${LIMITS.carousels} carrousels.`, true); return false; }
    const carousel = newCarousel(script.title.slice(0, LIMITS.nameLength));
    carousel.scriptNumber = script.number;
    const texts = script.slides.slice(0, LIMITS.slides);
    for (let index = 0; index < texts.length; index++) {
      const text = texts[index].slice(0, LIMITS.characters);
      const slide = newSlide({ text, style: styleStore.style(script.number, index) ?? { ...DEFAULT_STYLE } });
      if (index === 0) slide.assetId = await assets.hookId(script.number - 1);
      else if (text.toLowerCase().includes('loslo')) slide.assetId = await assets.ctaId(script.number - 1);
      carousel.slides.push(slide);
    }
    this.carousels.push(carousel);
    this.active = this.carousels.length - 1;
    this.slide = 0;
    this.scheduleSave(); this.emit('change');
    return true;
  }

  get scriptOfCurrent() {
    return this.current.scriptNumber ? scriptByNumber(this.current.scriptNumber) : null;
  }

  get hasRememberedStyles() {
    return this.current.scriptNumber ? styleStore.has(this.current.scriptNumber) : false;
  }

  /// Le réglage courant est retenu pour le script d'origine, à cette position.
  #rememberStyleForScript() {
    const number = this.current.scriptNumber;
    const slide = this.currentSlide;
    if (number && slide) styleStore.save(slide.style, number, this.slide);
  }

  /// Repart des tailles par défaut pour ce script, ici et les prochaines fois.
  forgetScriptStyles() {
    const number = this.current.scriptNumber;
    if (!number) return;
    styleStore.reset(number);
    this.current.slides.forEach(slide => { slide.style = { ...DEFAULT_STYLE }; });
    this.scheduleSave(); this.emit('change');
    this.toast('Tailles réinitialisées pour ce script.');
  }

  // --- Textes en lot ----------------------------------------------------------

  get batchText() { return this.current.slides.map(s => s.text).join('\n---\n'); }

  static batchParts(raw) {
    const parts = [];
    let block = [];
    for (const line of raw.replace(/\r/g, '').split('\n')) {
      if (line.trim() === '---') { parts.push(block.join('\n').trim()); block = []; }
      else block.push(line);
    }
    parts.push(block.join('\n').trim());
    return parts;
  }

  applyBatch(raw) {
    const parts = AppState.batchParts(raw);
    if (parts.length > this.current.slides.length) { this.toast("Il y a plus de blocs de texte que d'images.", true); return false; }
    if (parts.some(p => p.length > LIMITS.characters)) { this.toast(`Un bloc dépasse ${LIMITS.characters} caractères. Raccourcis-le.`, true); return false; }
    this.current.slides.forEach((slide, index) => { slide.text = parts[index] ?? ''; });
    this.scheduleSave(); this.emit('change');
    this.toast('Textes répartis sur les images.');
    return true;
  }
}
