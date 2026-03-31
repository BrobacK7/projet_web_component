# SPECIFICATION - Audio Web Components

Ce document decrit l'API de chaque composant et la facon dont les composants communiquent.

## 1. Principes d'architecture

### 1.1 Couplage faible

Les composants communiquent principalement via:
- window.AudioBus pour le graphe audio partage
- CustomEvent dispatches/ecoutes sur document pour la coordination fonctionnelle

Cela permet de:
- retirer un composant sans casser les autres
- utiliser chaque composant seul si besoin
- brancher d'autres composants a l'avenir

### 1.2 Contexte audio partage

Le composant audio-bus expose window.AudioBus:
- context: AudioContext partage
- masterGain: GainNode de sortie globale
- insertInput: GainNode d'entree de la chaine d'effets
- insertOutput: GainNode de sortie de la chaine d'effets
- connectEffect(inputNode, outputNode): insertion d'un effet dans la chaine
- disconnectEffect(inputNode, outputNode): retrait d'un effet
- bypassEffects(): retire tous les effets

### 1.3 Composants imbriques ou non

Choix retenu: composants non imbriques (freres dans la page), sauf encapsulation interne de leur propre UI en Shadow DOM.

Pourquoi:
- meilleure reutilisabilite (un composant peut etre utilise seul)
- couplage plus faible
- API plus claire (attributs + events)
- composition libre dans n'importe quel layout

---

## 2. API par composant

## 2.1 audio-bus

Tag:
- audio-bus

Role:
- initialiser le contexte Web Audio partage
- maintenir une chaine multi-effets
- notifier la disponibilite du bus

Attributs HTML:
- aucun

Methodes utilisables de l'exterieur:
- via window.AudioBus.connectEffect(inputNode, outputNode)
- via window.AudioBus.disconnectEffect(inputNode, outputNode)
- via window.AudioBus.bypassEffects()

Proprietes exposees:
- window.AudioBus.context
- window.AudioBus.masterGain
- window.AudioBus.insertInput
- window.AudioBus.insertOutput

Evenements emis:
- audiobus:ready
  - detail: { bus: window.AudioBus }

Evenements ecoutes:
- audio:play (pour relancer context.resume() si necessaire)

---

## 2.2 audio-player

Tag:
- audio-player

Role:
- charger et lire une source audio
- exposer controles play/pause/seek/volume
- emettre les evenements de transport

Attributs HTML:
- src: URL de la piste
- title: titre affiche
- artist: artiste affiche
- autoplay: demarre automatiquement apres chargement metadata
- loop: boucle de la piste

Methodes externes:
- play()
- pause()
- seek(time)
- setVolume(v)
- toggle()

Proprietes exposees:
- pas de proprietes publiques garanties (API principale via methodes/attributs/events)

Evenements emis:
- audio:play
  - detail: { src, title, artist }
- audio:pause
- audio:seek
  - detail: { time }
- audio:loaded
  - detail: { duration, src }
- audio:timeupdate
  - detail: { currentTime, duration }
- audio:ended
- audio:prev
- audio:next

Evenements ecoutes:
- audio:external-play
  - detail attendu: { src, title, artist, index? }
- audio:external-pause
- audio:external-seek
  - detail attendu: { time }

---

## 2.3 audio-playlist

Tag:
- audio-playlist

Role:
- gerer une liste de pistes
- piloter le player via events
- gerer next/prev, shuffle, loop, autoadvance

Attributs HTML:
- tracks: JSON array de pistes
  - format: [{ "src": "...", "title": "...", "artist": "..." }]
- autoadvance: active/desactive le passage auto a la piste suivante
  - comportement: actif par defaut
  - valeur "false" desactive
- loop: boucle sur la playlist
- shuffle: lecture aleatoire

Methodes externes:
- pas d'API imperative publique stable (pilotage conseille par attributs + events)

Proprietes exposees:
- aucune propriete publique contractuelle

Evenements emis:
- audio:external-play
  - detail: { src, title, artist, index }

Evenements ecoutes:
- audio:ended
- audio:play
- audio:next
- audio:prev

---

## 2.4 audio-equalizer

Tag:
- audio-equalizer

Role:
- appliquer une egalisation 5 bandes via BiquadFilterNode

Attributs HTML:
- gains: JSON array de 5 gains en dB
  - format: [g0, g1, g2, g3, g4]
  - plage recommandee: -12 a +12
- bypass: bypass de l'eq (gains forces a 0 dB)

Methodes externes:
- pas de methodes publiques documentees comme contrat stable

Proprietes exposees:
- aucune propriete publique contractuelle

Evenements emis:
- aucun

Evenements ecoutes:
- audiobus:ready

Notes techniques:
- insertion dans la chaine via AudioBus.connectEffect(firstFilter, lastFilter)
- retrait via AudioBus.disconnectEffect(...)

---

## 2.5 audio-visualizer

Tag:
- audio-visualizer

Role:
- visualiser le signal audio en lecture seule
- mode FFT (frequences), waveform (temps) ou volume (VU)

Attributs HTML:
- mode: fft | waveform | volume
- fftsize: taille FFT (entier, ex 256)

Methodes externes:
- aucune methode imperative publique stable

Proprietes exposees:
- aucune propriete publique contractuelle

Evenements emis:
- aucun

Evenements ecoutes:
- audiobus:ready
- audio:play
- audio:pause
- audio:ended

Notes techniques:
- branchement en tap sur masterGain -> AnalyserNode
- ne modifie pas la chaine sonore

---

## 2.6 audio-reverb

Tag:
- audio-reverb

Role:
- appliquer une reverb algorithmique (IR synthetique + ConvolverNode)

Attributs HTML:
- preset: room | hall | cave | spring
- wet: mix wet (0..1)
- bypass: active/desactive l'effet

Methodes externes:
- aucune methode imperative publique stable

Proprietes exposees:
- aucune propriete publique contractuelle

Evenements emis:
- aucun

Evenements ecoutes:
- audiobus:ready

Notes techniques:
- graphe dry/wet parallele interne
- insertion dans la chaine via AudioBus.connectEffect(inputNode, outputNode)

---

## 2.7 audio-workspace

Tag:
- audio-workspace

Role:
- fournir un espace de travail UI (sidebar + fenetres flottantes)
- instancier dynamiquement les composants audio

Attributs HTML:
- modules: JSON optionnel pour redefinir la liste de modules spawnables

Methodes externes:
- pas de methodes publiques documentees comme contrat stable

Proprietes exposees:
- aucune propriete publique contractuelle

Evenements emis:
- aucun evenement audio metier

Evenements ecoutes:
- aucun evenement audio metier

---

## 2.8 audio-bus-diagram

Tag:
- audio-bus-diagram

Role:
- afficher un diagramme visuel du routage audio
- montrer graphiquement les connexions: insertInput -> effets -> insertOutput -> masterGain -> destination
- lecture seule, mise a jour au demarrage

Attributs HTML:
- aucun

Methodes externes:
- aucune

Proprietes exposees:
- aucune

Evenements emis:
- aucun

Evenements ecoutes:
- audiobus:ready (pour synchroniser le diagramme)

Notes techniques:
- composant SVG avec noeuds et fleches
- representation schematique, pas en temps reel de la chaine d'effets dynamique

---

## 2.9 audio-wam-effect

Tag:
- audio-wam-effect

Role:
- charger dynamiquement un effet WAM depuis une URL ESM
- l'inserer dans la chaine AudioBus avec controle dry/wet

Attributs HTML:
- src: URL du module WAM a charger
- mix: mix wet [0..1]
- bypass: bypass de l'effet

Methodes externes:
- pas de methode publique imperative stabilisee (pilotage recommande via attributs)

Proprietes exposees:
- aucune propriete publique contractuelle

Evenements emis:
- aucun

Evenements ecoutes:
- audiobus:ready

Notes techniques:
- le composant supporte plusieurs formats d'export WAM communautaires
- en cas d'API non reconnue, il reste en mode inactif (status message)

---

## 3. Protocole de communication par events

Events de transport:
- audio:play
- audio:pause
- audio:seek
- audio:ended
- audio:next
- audio:prev

Events de controle externe:
- audio:external-play
- audio:external-pause
- audio:external-seek

Event d'infrastructure audio:
- audiobus:ready

Recommandation:
- toujours verifier e.detail et la presence des champs avant usage

---

## 4. Compatibilite et contraintes

- Web Audio API requise
- MediaElementSourceNode cree depuis element audio HTML
- autoplay navigateur: un geste utilisateur peut etre requis avant resume() de AudioContext
- CORS: les pistes distantes doivent etre accessibles (crossOrigin=anonymous cote player)

---

## 5. Extension future (WAM)

Le support WAM peut etre ajoute comme composant frere supplementaire:
- audio-wam-effect
- charge un module WAM distant
- expose les parametres WAM en attributs/proprietes
- se branche via AudioBus.connectEffect

Ce point est optionnel dans l'etat actuel du code, mais recommande pour coller au sujet initial.
