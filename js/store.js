// Stockage local. Les photos vivent dans IndexedDB, octets d'origine intacts
// (zéro perte à l'import) ; le projet et les tailles mémorisées par script
// dans localStorage. Rien ne quitte le navigateur.

import { validateStyle } from './render.js';

const DB_NAME = 'carrousel-studio-web';
const STORE = 'assets';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let databasePromise = null;
const database = () => (databasePromise ??= openDatabase());

async function withStore(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
  });
}

// ---------------------------------------------------------------------------
// Visuels embarqués : identifiants fixes, fichier recopié du bundle au besoin.

const CTA_IDS = ['c7a00000-0000-4000-8000-000000000001', 'c7a00000-0000-4000-8000-000000000002',
  'c7a00000-0000-4000-8000-000000000003', 'c7a00000-0000-4000-8000-000000000004'];
const CTA_FILES = ['cta-1.jpeg', 'cta-2.png', 'cta-3.png', 'cta-4.png'];
const HOOK_IDS = ['b00c0000-0000-4000-8000-000000000001', 'b00c0000-0000-4000-8000-000000000002',
  'b00c0000-0000-4000-8000-000000000003'];
const HOOK_FILES = ['hook-1.png', 'hook-2.jpeg', 'hook-3.jpeg'];

/// Le magasin de photos. `image(id)` rend l'image décodée si elle est prête,
/// sinon `null` tout de suite : le décodage part en tâche de fond et
/// l'événement `ready` prévient les vues.
export const assets = new class extends EventTarget {
  #cache = new Map();
  #inFlight = new Set();

  image(id) {
    if (!id) return null;
    const cached = this.#cache.get(id);
    if (cached) return cached;
    if (!this.#inFlight.has(id)) {
      this.#inFlight.add(id);
      this.#decode(id).finally(() => this.#inFlight.delete(id));
    }
    return null;
  }

  /// Appelle `callback` quand CETTE photo est prête (un `once` filtré serait
  /// consommé par la première photo venue, pas forcément la bonne).
  whenReady(id, callback) {
    const listener = event => {
      if (event.detail !== id) return;
      this.removeEventListener('ready', listener);
      callback();
    };
    this.addEventListener('ready', listener);
  }

  /// Décodage bloquant, pour l'export : là, on préfère attendre l'image.
  async decoded(id) {
    return this.#cache.get(id) ?? this.#decode(id);
  }

  async #decode(id) {
    const blob = await this.blob(id);
    if (!blob) return null;
    try {
      // Orientation EXIF appliquée ; le fichier reste intact.
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      this.#cache.set(id, bitmap);
      this.dispatchEvent(new CustomEvent('ready', { detail: id }));
      return bitmap;
    } catch {
      return null;
    }
  }

  blob(id) {
    return withStore('readonly', store => store.get(id));
  }

  /// Ajoute une photo : on vérifie que c'est une image, puis on garde les
  /// octets d'origine tels quels.
  async add(file) {
    const blob = file instanceof Blob ? file : new Blob([file]);
    try {
      const probe = await createImageBitmap(blob);
      probe.close?.();
    } catch {
      throw new Error('Cette photo est illisible.');
    }
    const id = crypto.randomUUID();
    await withStore('readwrite', store => store.put(blob, id));
    return id;
  }

  async ctaId(index) { return this.#bundled(index, CTA_IDS, CTA_FILES); }
  async hookId(index) { return this.#bundled(index, HOOK_IDS, HOOK_FILES); }
  ctaIndex(id) { const i = CTA_IDS.indexOf(id); return i < 0 ? null : i; }
  hookIndex(id) { const i = HOOK_IDS.indexOf(id); return i < 0 ? null : i; }

  async #bundled(index, ids, files) {
    const i = ((index % ids.length) + ids.length) % ids.length;
    const id = ids[i];
    const existing = await this.blob(id);
    if (!existing) {
      const response = await fetch('assets/' + files[i]);
      if (!response.ok) return null;
      const blob = await response.blob();
      await withStore('readwrite', store => store.put(blob, id));
    }
    return id;
  }

  /// Les photos qu'aucune slide n'utilise disparaissent (pas les visuels embarqués).
  async prune(used) {
    const keys = await withStore('readonly', store => store.getAllKeys());
    const bundled = new Set([...CTA_IDS, ...HOOK_IDS]);
    for (const key of keys) {
      if (!used.has(key) && !bundled.has(key)) {
        await withStore('readwrite', store => store.delete(key));
        this.#cache.get(key)?.close?.();
        this.#cache.delete(key);
      }
    }
  }
}();

// ---------------------------------------------------------------------------
// Tailles mémorisées par script, slide par slide.

const STYLES_KEY = 'carrousel-studio-web.script-styles';

export const styleStore = new class {
  #styles = {};
  #timer = null;

  constructor() {
    try { this.#styles = JSON.parse(localStorage.getItem(STYLES_KEY) || '{}') || {}; } catch { this.#styles = {}; }
  }

  style(script, slide) {
    const s = this.#styles[String(script)]?.[String(slide)];
    return s ? validateStyle(s) : null;
  }

  save(style, script, slide) {
    (this.#styles[String(script)] ??= {})[String(slide)] = { ...style };
    this.#persist();
  }

  saveAll(styles, script) {
    styles.forEach((style, index) => { (this.#styles[String(script)] ??= {})[String(index)] = { ...style }; });
    this.#persist();
  }

  has(script) {
    return Object.keys(this.#styles[String(script)] ?? {}).length > 0;
  }

  reset(script) {
    delete this.#styles[String(script)];
    this.#persist();
  }

  /// Différée : pendant un glissement, save() arrive à chaque frame.
  #persist() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      try { localStorage.setItem(STYLES_KEY, JSON.stringify(this.#styles)); } catch { /* quota */ }
    }, 500);
  }
}();

// ---------------------------------------------------------------------------
// Projet

const PROJECT_KEY = 'carrousel-studio-web.project';

export function loadProject() {
  try {
    const project = JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null');
    return project && Array.isArray(project.carousels) ? project : null;
  } catch {
    return null;
  }
}

export function saveProject(project) {
  try { localStorage.setItem(PROJECT_KEY, JSON.stringify(project)); } catch { /* quota */ }
}
