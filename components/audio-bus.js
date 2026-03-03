/**
 * <audio-bus> Web Component
 *
 * DESIGN DECISIONS:
 * -----------------
 * 1. ROLE UNIQUE : cree et expose le contexte audio partage. Aucune UI.
 *
 * 2. CHAINE MULTI-EFFETS :
 *    connectEffect() ajoute un effet a la fin de la chaine.
 *    Plusieurs effets peuvent coexister simultanement :
 *    insertInput -> effet1 -> effet2 -> ... -> insertOutput
 *
 * 3. API publique via window.AudioBus :
 *    .context              AudioContext partage
 *    .masterGain           GainNode volume global
 *    .insertInput          GainNode entree effets
 *    .insertOutput         GainNode sortie effets
 *    .connectEffect(in, out)   ajoute un effet dans la chaine
 *    .disconnectEffect(in, out) retire un effet de la chaine
 *    .bypassEffects()      retire tous les effets
 *
 * USAGE :
 *   <audio-bus></audio-bus>
 *   <audio-player src="track.mp3"></audio-player>
 *   <audio-equalizer></audio-equalizer>
 *   <audio-reverb></audio-reverb>
 */

class AudioBus extends HTMLElement {

  constructor() {
    super();
    this._initialized = false;
  }

  connectedCallback() {
    this._init();
    this._onPlay = () => {
      if (window.AudioBus && window.AudioBus.context &&
          window.AudioBus.context.state === 'suspended') {
        window.AudioBus.context.resume();
      }
    };
    document.addEventListener('audio:play', this._onPlay);
  }

  disconnectedCallback() {
    document.removeEventListener('audio:play', this._onPlay);
  }

  _init() {
    if (this._initialized) return;
    if (window.AudioBus && window.AudioBus.context) {
      this._initialized = true;
      this._emit();
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      console.warn('[audio-bus] Web Audio API non supportee.');
      return;
    }

    const ctx = new AudioContext();

    const insertInput  = ctx.createGain();
    const insertOutput = ctx.createGain();
    const masterGain   = ctx.createGain();
    masterGain.gain.value = 1.0;

    // Bypass par defaut : insertInput -> insertOutput -> masterGain -> dest
    insertInput.connect(insertOutput);
    insertOutput.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Registre des effets dans la chaine (ordre d insertion)
    // Chaque entree : { inputNode, outputNode }
    const effectChain = [];

    window.AudioBus = {
      context:      ctx,
      masterGain:   masterGain,
      insertInput:  insertInput,
      insertOutput: insertOutput,

      /**
       * connectEffect(inputNode, outputNode)
       *
       * Ajoute un effet a la fin de la chaine.
       * Reconstruit toute la chaine proprement.
       *
       * Avant : insertInput -> [...] -> insertOutput
       * Apres : insertInput -> [...] -> inputNode -> outputNode -> insertOutput
       */
      connectEffect(inputNode, outputNode) {
        // Enregistre l effet
        effectChain.push({ inputNode, outputNode });
        // Reconstruit la chaine
        this._rebuildChain(effectChain, insertInput, insertOutput);
      },

      /**
       * disconnectEffect(inputNode, outputNode)
       *
       * Retire un effet specifique de la chaine.
       */
      disconnectEffect(inputNode, outputNode) {
        const idx = effectChain.findIndex(
          e => e.inputNode === inputNode && e.outputNode === outputNode
        );
        if (idx !== -1) effectChain.splice(idx, 1);
        this._rebuildChain(effectChain, insertInput, insertOutput);
      },

      /**
       * bypassEffects()
       *
       * Retire tous les effets, rebranche le bypass direct.
       */
      bypassEffects() {
        effectChain.length = 0;
        this._rebuildChain(effectChain, insertInput, insertOutput);
      },

      /**
       * _rebuildChain(chain, insertInput, insertOutput) — interne
       *
       * Deconnecte tout et reconstruit la chaine dans l ordre :
       * insertInput -> effet[0] -> effet[1] -> ... -> insertOutput
       *
       * Si chaine vide : insertInput -> insertOutput (bypass)
       */
      _rebuildChain(chain, insertInput, insertOutput) {
        // Deconnecte tous les noeuds de la chaine
        try { insertInput.disconnect(); } catch(e) {}
        chain.forEach(({ outputNode }) => {
          try { outputNode.disconnect(insertOutput); } catch(e) {}
          try { outputNode.disconnect(); } catch(e) {}
        });

        if (chain.length === 0) {
          // Bypass : connexion directe
          insertInput.connect(insertOutput);
        } else {
          // Branche le premier effet sur insertInput
          insertInput.connect(chain[0].inputNode);
          // Chaine les effets entre eux
          for (let i = 0; i < chain.length - 1; i++) {
            try { chain[i].outputNode.disconnect(); } catch(e) {}
            chain[i].outputNode.connect(chain[i + 1].inputNode);
          }
          // Branche le dernier effet sur insertOutput
          chain[chain.length - 1].outputNode.connect(insertOutput);
        }
      },
    };

    this._initialized = true;
    this._emit();
  }

  _emit() {
    document.dispatchEvent(new CustomEvent('audiobus:ready', {
      detail:  { bus: window.AudioBus },
      bubbles: true,
    }));
  }
}

customElements.define('audio-bus', AudioBus);