# Carrousel Studio — web

Version web de l'app iPhone Carrousel Studio : des carrousels photo + texte
blanc à liseré noir, exportés en 1080 × 1920 pour TikTok. Même moteur de
rendu, même police (TikTok Sans semibold), mêmes scripts Notion embarqués,
mêmes visuels hook et CTA.

## Lancer

Sans installation, depuis GitHub Pages (Settings → Pages → branche `main`,
dossier `/`).

En local :

```bash
npm start
```

(ou `node start.mjs --open`) puis http://localhost:3000. Node 20 ou plus.

## Ce que ça fait

- Accueil : les carrousels commencés et les 18 scripts (couleur dédiée par script).
- Ouvrir un script crée un carrousel de 7 slides : hook (visuel salle de sport
  auto), phrase de crédibilité (icône ↻ pour changer de variante), conseils,
  visuel CTA Loslo auto sur les slides qui citent l'app (icône ↻ pour cycler).
- Éditeur façon TikTok : image plein cadre, colonne d'icônes à droite (Aa,
  taille, cadrage, variantes), glissière de taille verticale à gauche, saisie
  directement dans l'image, texte déplaçable au doigt avec aimantation au
  centre, bande des slides en bas (appui long pour réordonner, numéros « 1. »
  réécrits automatiquement), boutons Photos et Exporter.
- Les tailles de texte sont mémorisées par script.
- Export PNG sans perte : une image, le carrousel en ZIP, ou tout.

Tout reste dans le navigateur (localStorage + IndexedDB) : rien n'est envoyé
nulle part.
