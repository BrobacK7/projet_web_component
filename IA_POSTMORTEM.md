# IA_POSTMORTEM

## 1. Objectif

Documenter l'usage des outils IA pendant la realisation du projet:
- decisions prises
- prompts utilises
- fichiers/regles produits
- apports et limites

## 2. Outils IA utilises

- GitHub Copilot Chat (VS Code)
  - generation de squelettes de Web Components
  - aide sur APIs Web Audio (BiquadFilterNode, ConvolverNode, AnalyserNode)
  - revue de coherence inter-composants

- Assistance IA pour documentation
  - generation initiale de sections README et SPECIFICATION
  - reformulation des descriptions d'API

## 3. Strategie d'utilisation

1. Definir l'architecture cible avant generation:
- audio-bus pour centraliser le contexte
- composants freres faiblement couples
- communication via CustomEvent

2. Generer composant par composant:
- demarrer par audio-bus et audio-player
- ajouter playlist, EQ, visualizer, reverb
- terminer par workspace (UI d'orchestration)

3. Controler manuellement chaque sortie IA:
- coherence des attributs observes
- nettoyage des dependances implicites
- verification des ecoutes/emissions d'evenements

4. Corriger les erreurs detectees:
- logique de teardown reverb
- logique autoadvance playlist
- deconnexion EQ sans impacter tous les effets

## 4. Exemples de prompts utilises

Prompt type architecture:
- Propose une architecture de Web Components audio faiblement couples avec partage de AudioContext, playlist, EQ et visualizer.

Prompt type composant:
- Ecris un Web Component audio-equalizer (5 bandes) qui se branche sur un AudioBus partage et expose bypass + gains en attributs.

Prompt type integration:
- Ajoute un composant playlist qui pilote le player via CustomEvents audio:external-play, audio:next, audio:prev.

Prompt type audit:
- Fais une revue technique et liste les risques de regression dans la gestion des effets audio et des evenements.

Prompt type documentation:
- Genere une specification d'API par composant: tag, attributs, methodes externes, proprietes exposees, evenements emis/ecoutes.

## 5. Fichiers de regles / contraintes crees

- SPECIFICATION.md
  - contrat d'API inter-composants
  - protocole de communication

- README.md
  - guide d'usage, architecture, checklist de rendu

- IA_POSTMORTEM.md
  - present fichier de traçabilite IA

Aucune regle outillee additionnelle (lint custom, style guide externe, prompt file automatise) n'a ete ajoutee dans ce repo pour le moment.

## 6. Ce que l'IA a bien apporte

- acceleration du prototypage des composants
- proposition rapide de patterns Web Audio valides
- assistance sur la documentation API exhaustive
- aide a l'identification de bugs de couplage entre composants

## 7. Limites rencontrees

- certaines generations introduisent du couplage involontaire
- risque de logique redondante ou contradictoire dans les events
- besoin de revue humaine obligatoire sur les teardown/disconnect audio

## 8. Bonnes pratiques retenues

- fixer une architecture manuellement avant d'utiliser l'IA
- demander de petites unites de code, puis iterer
- verifier chaque composant en isolation
- documenter l'API au fur et a mesure, pas en fin de projet
