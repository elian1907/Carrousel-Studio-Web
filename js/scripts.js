// Les scripts recopiés depuis la page Notion « Script TikTok » (Loslo App),
// embarqués dans `assets/scripts.json` : l'outil marche hors connexion.

export let scripts = [];

export async function loadScripts() {
  const response = await fetch('assets/scripts.json');
  const file = await response.json();
  scripts = file.scripts.slice().sort((a, b) => a.number - b.number);
  return scripts;
}

export const scriptByNumber = number => scripts.find(s => s.number === number) ?? null;

// Ordre volontairement mélangé : deux scripts voisins n'ont jamais des
// teintes qui se suivent. Même palette que l'app iPhone.
const PALETTE = [
  0x3DBE7A, 0xA64CD8, 0xE8B93C, 0x4C7DE8, 0xE8557A, 0x2FB8A6,
  0xC9564C, 0x7A5FE8, 0x9BC53D, 0xD84CB0, 0x35A6D8, 0xE87A3C,
  0x9A6AE8, 0x8A9A3C, 0xE86AA0, 0x3C9A8A, 0xB0873C, 0x5C8AE8,
];

export function scriptColor(number) {
  const hex = PALETTE[(number - 1) % PALETTE.length];
  return '#' + hex.toString(16).padStart(6, '0');
}

export const scriptLabel = number => String(number).padStart(2, '0');

// Les phrases de crédibilité, en slide 2 juste après le hook. Un clic sur
// l'icône de variantes passe à la suivante.
export const TRANSITION_PHRASES = [
  "(J'ai perdu 20 kg en 6 mois)",
  "(J'ai perdu 18 kg en 4 mois)",
  "(J'ai perdu 23 kg en 5 mois)",
  "(J'ai perdu 30 kg en 1 an)",
  'Crois-moi, je sais de quoi je parle',
  'Sachant que je pars de loin, donc je sais de quoi je parle…',
];

export const isTransitionPhrase = text => TRANSITION_PHRASES.includes((text || '').trim());

export function nextTransitionPhrase(text) {
  const index = TRANSITION_PHRASES.indexOf((text || '').trim());
  return index < 0 ? TRANSITION_PHRASES[0] : TRANSITION_PHRASES[(index + 1) % TRANSITION_PHRASES.length];
}
