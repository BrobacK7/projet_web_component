# Projet Web Components 2025-2026

Lecteur audio modulaire en purs Web Components (classes JavaScript qui etendent HTMLElement), avec:
- Player audio
- Playlist
- Equalizer
- Visualiseur audio
- Reverb
- WAM effect (chargement d'un module externe)
- Workspace flottant (fenetres draggable/resizable)

Le projet est concu pour fonctionner sans dependances front-end externes (pas de framework UI).

## Objectif du projet

Construire une suite de composants audio reutilisables, faiblement couples, qui peuvent:
- cohabiter sur une page unique,
- partager un meme contexte audio,
- etre utilises individuellement ou ensemble,
- etre charges depuis des URI publiques sans installation locale.

## Structure

- index.html: page de demonstration / integration
- components/audio-bus.js: contexte Web Audio partage + chaine d'effets
- components/audio-player.js: lecteur principal avec playlist integree
- components/audio-equalizer.js: EQ 5 bandes
- components/audio-visualizer.js: visualisation FFT + waveform + volume (VU)
- components/audio-reverb.js: effet de reverb algorithmique
- assets/wam/basic-drive-wam.js: WAM integre par defaut (remplacable par URL)
- components/audio-workspace.js: panneau lateral + fenetres flottantes

## Architecture (resume)

1. audio-bus cree et expose window.AudioBus (AudioContext, nodes d'insertion et master).
2. audio-player lit la source audio, gere une playlist optionnelle, et injecte le flux dans la chaine du bus.
3. Les effets (EQ, Reverb, WAM) se branchent dynamiquement via AudioBus.connectEffect(...).
4. Le visualiser lit le signal via AnalyserNode en tap lecture seule.
5. La coordination UI se fait principalement via CustomEvent sur document.
6. Player est demarre automatiquement comme fenetre draggable du workspace.

## Utilisation rapide

Exemple minimal dans une page HTML avec URI publiques:

```html
<audio-bus></audio-bus>
<audio-player src="https://example.com/track.mp3" title="Demo" artist="Artist"></audio-player>

<script type="module" src="https://broback7.github.io/projet_web_component/components/audio-bus.js"></script>
<script type="module" src="https://broback7.github.io/projet_web_component/components/audio-player.js"></script>
```

Pour afficher une playlist dans le meme composant, utiliser l'attribut `tracks` avec un JSON de pistes.

Pour WAM, le composant `audio-wam-effect` charge par defaut `./assets/wam/basic-drive-wam.js`.
L'utilisateur peut saisir une autre URL ESM dans son champ `src` et cliquer sur Load.

Exemple complet de demo: voir index.html.

## Documentation technique

- Specification API detaillee: voir SPECIFICATION.md
- Post-mortem IA (outils, prompts, contraintes): voir IA_POSTMORTEM.md

## Guide API (consommation externe)

Si la page de demo est hebergee sur un autre GitHub Pages que celui des composants:
- importer les composants avec des URLs absolues vers VOTRE host de distribution des composants
- fournir vos propres URLs absolues pour les medias (`src`/`tracks`)
- pour `audio-wam-effect`, fournir explicitement un `src` absolu vers votre module WAM

Important:
- le lecteur n'embarque pas de catalogue audio; l'utilisateur final doit declarer ses musiques dans `src` ou `tracks`
- `audio-wam-effect` ne charge rien par defaut si `src` n'est pas renseigne

Reference recommandee:
- voir EXAMPLE_IMPORT.html pour un exemple HTML autonome pret a heberger seul

## Hebergement

Le projet est prevu pour GitHub Pages (workflow present dans .github/workflows/jekyll-gh-pages.yml).

## Auteur

Simon RIGAL MIAGE M2 - Dev Web 2025-2026.