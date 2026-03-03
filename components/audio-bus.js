class AudioBus extends HTMLElement {

  constructor() {
    super();
    // Pas de Shadow DOM : ce composant n'a aucune UI
    this._initialized = false;
  }

  connectedCallback() {
    this._init();
    // Resume le contexte au premier audio:play
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

    // Ne pas ecraser un AudioBus deja complet
    if (window.AudioBus && window.AudioBus.context) {
      this._initialized = true;
      this._emit();
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      console.warn('[audio-bus] Web Audio API non supportee par ce navigateur.');
      return;
    }

    const ctx = new AudioContext();

    // Points d'insertion pour effets (EQ, WAM, compresseur...)
    const insertInput  = ctx.createGain();
    const insertOutput = ctx.createGain();
    const masterGain   = ctx.createGain();
    masterGain.gain.value = 1.0;

    // Connexion par defaut : bypass (sans effets)
    // insertInput -> insertOutput -> masterGain -> destination
    insertInput.connect(insertOutput);
    insertOutput.connect(masterGain);
    masterGain.connect(ctx.destination);

    window.AudioBus = {
      context:      ctx,
      masterGain:   masterGain,
      insertInput:  insertInput,
      insertOutput: insertOutput,

      /**
       * connectEffect(inputNode, outputNode)
       *
       * Insere un effet dans la chaine :
       *   insertInput -> inputNode ... outputNode -> insertOutput
       *
       * Deconnecte automatiquement le bypass.
       *
       * @param {AudioNode} inputNode  - entree de l'effet
       * @param {AudioNode} outputNode - sortie de l'effet
       */
      connectEffect(inputNode, outputNode) {
        insertInput.disconnect(insertOutput);
        insertInput.connect(inputNode);
        outputNode.connect(insertOutput);
      },

      /**
       * bypassEffects()
       *
       * Retire tous les effets de la chaine,
       * rebranche le bypass direct insertInput -> insertOutput.
       */
      bypassEffects() {
        insertInput.disconnect();
        insertInput.connect(insertOutput);
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