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
- components/audio-player.js: lecteur principal
- components/audio-playlist.js: playlist et navigation titres
- components/audio-equalizer.js: EQ 5 bandes
- components/audio-visualizer.js: visualisation FFT + waveform + volume (VU)
- components/audio-reverb.js: effet de reverb algorithmique
- components/audio-workspace.js: panneau lateral + fenetres flottantes

## Architecture (resume)

1. audio-bus cree et expose window.AudioBus (AudioContext, nodes d'insertion et master).
2. audio-player lit la source audio et injecte le flux dans la chaine du bus.
3. Les effets (EQ, Reverb, WAM) se branchent dynamiquement via AudioBus.connectEffect(...).
4. Le visualiser lit le signal via AnalyserNode en tap lecture seule.
5. Le bus-diagram affiche un schema graphique du routage audio.
6. La coordination UI se fait principalement via CustomEvent sur document.
7. Player et bus-diagram sont demarres automatiquement comme fenetres draggables du workspace.

## Utilisation rapide

Exemple minimal dans une page HTML avec URI publiques:

```html
<audio-bus></audio-bus>
<audio-player src="https://example.com/track.mp3" title="Demo" artist="Artist"></audio-player>

<script type="module" src="https://broback7.github.io/projet_web_component/components/audio-bus.js"></script>
<script type="module" src="https://broback7.github.io/projet_web_component/components/audio-player.js"></script>
```

Exemple complet de demo: voir index.html.

## Etat d'avancement

Fonctionnel:
- Audio bus partage
- Player, playlist, EQ, visualiseur (fft/wave/volume), reverb, workspace
- Communication inter-composants par events

A completer pour le rendu final:
- Support d'au moins un effet WAM optionnel
- Eventuel projet consommateur separe (repo ou dossier dedie)
- Video de demonstration YouTube

## Documentation technique

- Specification API detaillee: voir SPECIFICATION.md
- Post-mortem IA (outils, prompts, contraintes): voir IA_POSTMORTEM.md

## Hebergement

Le projet est prevu pour GitHub Pages (workflow present dans .github/workflows/jekyll-gh-pages.yml).

Verifier avant rendu:
1. URL publique des composants (charges via balises script module)
2. URL publique du projet de demo
3. Accessibilite des assets audio distants

## Auteurs

Binome MIAGE M2 - Dev Web 2025-2026.