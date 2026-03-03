
class AudioReverb extends HTMLElement {

  static get observedAttributes() {
    return ['preset', 'bypass', 'wet'];
  }

  static get PRESETS() {
    return {
      room:   { label: 'Room',   duration: 0.8,  decay: 2.0, preDelay: 0.01, diffusion: 0.5,  color: '#4a9eff' },
      hall:   { label: 'Hall',   duration: 2.5,  decay: 1.5, preDelay: 0.03, diffusion: 0.8,  color: '#a78bfa' },
      cave:   { label: 'Cave',   duration: 4.0,  decay: 1.2, preDelay: 0.05, diffusion: 0.9,  color: '#34d399' },
      spring: { label: 'Spring', duration: 1.2,  decay: 3.0, preDelay: 0.008,diffusion: 0.3,  color: '#f59e0b' },
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._preset    = 'room';
    this._wet       = 0.5;
    this._ready     = false;
    this._context   = null;
    this._convolver = null;
    this._dryGain   = null;
    this._wetGain   = null;
    this._inputNode  = null;
    this._outputNode = null;
  }

  connectedCallback() {
    this._preset = this.getAttribute('preset') || 'room';
    this._wet    = parseFloat(this.getAttribute('wet') ?? 0.5);
    this._render();
    this._bindUIEvents();
    this._tryConnect();
    this._onBusReady = () => this._tryConnect();
    document.addEventListener('audiobus:ready', this._onBusReady);
  }

  disconnectedCallback() {
    document.removeEventListener('audiobus:ready', this._onBusReady);
    if (this._ready && window.AudioBus && window.AudioBus.disconnectEffect) {
      window.AudioBus.disconnectEffect(this._filters[0], this._filters[this._filters.length - 1]);
    }
    this._filters = [];
    this._ready = false;
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'preset') {
      this._preset = newVal || 'room';
      if (this._ready) this._loadPreset(this._preset);
      this._updatePresetUI();
    }
    if (name === 'wet') {
      this._wet = parseFloat(newVal ?? 0.5);
      this._applyWet();
    }
    if (name === 'bypass') {
      this._applyBypass();
    }
  }

  // ─── Connexion WebAudio ──────────────────────────────────────────────────

  _tryConnect() {
    const bus = window.AudioBus;
    if (!bus || !bus.context || !bus.connectEffect || this._ready) return;

    this._context = bus.context;

    // Noeuds
    this._inputNode  = this._context.createGain();
    this._outputNode = this._context.createGain();
    this._dryGain    = this._context.createGain();
    this._wetGain    = this._context.createGain();
    this._convolver  = this._context.createConvolver();

    // Graphe parallele dry/wet :
    // inputNode -> dryGain  ────────────────────────> outputNode
    // inputNode -> convolver -> wetGain -> outputNode
    this._inputNode.connect(this._dryGain);
    this._inputNode.connect(this._convolver);
    this._convolver.connect(this._wetGain);
    this._dryGain.connect(this._outputNode);
    this._wetGain.connect(this._outputNode);

    // Valeurs initiales
    this._dryGain.gain.value = 1 - this._wet;
    this._wetGain.gain.value = this._wet;

    // Branche dans la chaine
    bus.connectEffect(this._inputNode, this._outputNode);

    this._ready = true;

    // Charge le preset initial
    this._loadPreset(this._preset);
    this._applyBypass();

    const msg = this.shadowRoot.getElementById('notConnected');
    if (msg) msg.style.display = 'none';
  }

  // ─── Synthese IR ─────────────────────────────────────────────────────────

  /**
   * Genere un buffer Impulse Response algorithmique.
   *
   * Algorithme : bruit blanc exponentiel decroissant.
   * Le canal gauche et droit sont legerement differents (diffusion).
   *
   * @param {string} presetName
   */
  _loadPreset(presetName) {
    const p = AudioReverb.PRESETS[presetName];
    if (!p || !this._context) return;

    const sampleRate = this._context.sampleRate;
    const length     = Math.floor(sampleRate * p.duration);
    const buffer     = this._context.createBuffer(2, length, sampleRate);
    const preDelayFrames = Math.floor(sampleRate * p.preDelay);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        if (i < preDelayFrames) {
          data[i] = 0;
          continue;
        }
        const t = (i - preDelayFrames) / sampleRate;

        // Bruit blanc avec enveloppe exponentielle
        const envelope = Math.pow(10, -p.decay * t);

        // Diffusion : leger decalage de phase entre L et R
        const diffusionOffset = channel === 1
          ? Math.sin(i * p.diffusion * 0.01) * 0.15
          : 0;

        // Spring : ajoute une modulation metallique
        const springMod = presetName === 'spring'
          ? Math.sin(i * 0.03) * 0.3 * envelope
          : 0;

        data[i] = (Math.random() * 2 - 1) * envelope + diffusionOffset + springMod;
      }
    }

    this._convolver.buffer = buffer;
  }

  // ─── Controles ───────────────────────────────────────────────────────────

  _applyWet() {
    if (!this._ready) return;
    const t = this._context.currentTime;
    this._dryGain.gain.setTargetAtTime(1 - this._wet, t, 0.02);
    this._wetGain.gain.setTargetAtTime(this._wet,     t, 0.02);
  }

  _applyBypass() {
    if (!this._ready) return;
    const bypass = this.hasAttribute('bypass');
    const t = this._context.currentTime;
    if (bypass) {
      this._dryGain.gain.setTargetAtTime(1, t, 0.02);
      this._wetGain.gain.setTargetAtTime(0, t, 0.02);
    } else {
      this._dryGain.gain.setTargetAtTime(1 - this._wet, t, 0.02);
      this._wetGain.gain.setTargetAtTime(this._wet,     t, 0.02);
    }
    this._updateBypassBtn();
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  _render() {
    const presets = AudioReverb.PRESETS;
    const presetsHTML = Object.entries(presets).map(([key, p]) => {
      const active = key === this._preset ? ' active' : '';
      return `<button class="preset-btn${active}" data-preset="${key}"
        style="--preset-color: ${p.color}">${p.label}</button>`;
    }).join("");

    const css = [
      ":host {",
      "  --ap-bg: #111113; --ap-surface2: #242429;",
      "  --ap-accent: #1db954; --ap-text: #ffffff;",
      "  --ap-text-muted: #6b6b7a; --ap-radius: 12px;",
      "  --ap-font: 'DM Sans','Segoe UI',system-ui,sans-serif;",
      "  --ap-width: 360px;",
      "  display: inline-block; font-family: var(--ap-font);",
      "}",
      "* { box-sizing: border-box; margin: 0; padding: 0; }",
      ".reverb { background: var(--ap-bg); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--ap-radius); width: var(--ap-width); padding: 16px; color: var(--ap-text); user-select: none; overflow: hidden; }",
      ".header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }",
      ".header__title { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ap-text-muted); }",
      ".presets { display: flex; gap: 8px; justify-content: space-between; }",
      ".preset-btn { flex: 1; background: var(--ap-surface2); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; color: var(--ap-text-muted); font-size: 12px; font-weight: 500; font-family: var(--ap-font); padding: 10px 0; cursor: pointer; transition: all 0.15s; outline: none; }",
      ".preset-btn:hover { color: var(--ap-text); border-color: rgba(255,255,255,0.15); background: #2a2a30; }",
      ".preset-btn.active { background: color-mix(in srgb, var(--preset-color) 15%, transparent); color: var(--preset-color); border-color: var(--preset-color); }",
      ".btn-bypass { background: none; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; color: var(--ap-text-muted); font-size: 10px; font-family: var(--ap-font); padding: 3px 8px; cursor: pointer; transition: all 0.15s; letter-spacing: 0.05em; outline: none; }",
      ".btn-bypass.active { background: rgba(29,185,84,0.12); color: var(--ap-accent); border-color: var(--ap-accent); }",
      ".not-connected { font-size: 11px; color: var(--ap-text-muted); text-align: center; padding: 8px 0 0; font-style: italic; }"
    ].join("")

    const html = `
      <div class="reverb">
        <div class="header">
          <span class="header__title">Reverb</span>
          <button class="btn-bypass" id="btnBypass">Active</button>
        </div>
        <div class="presets" id="presets">${presetsHTML}</div>
        <div class="not-connected" id="notConnected">Lance la lecture pour activer la reverb</div>
      </div>`;

    this.shadowRoot.innerHTML = `<style>${css}</style>${html}`;
    this._updateBypassBtn();
  }

  // ─── Binding UI ──────────────────────────────────────────────────────────

  _bindUIEvents() {
    this.shadowRoot.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setAttribute('preset', btn.dataset.preset);
      });
    });

    this.shadowRoot.getElementById('btnBypass')
      .addEventListener('click', () => {
        this.hasAttribute('bypass')
          ? this.removeAttribute('bypass')
          : this.setAttribute('bypass', '');
      });
  }

  // ─── Update UI ───────────────────────────────────────────────────────────

  _updatePresetUI() {
    this.shadowRoot.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === this._preset);
    });
  }

  _updateBypassBtn() {
    const btn = this.shadowRoot.getElementById('btnBypass');
    if (!btn) return;
    const bypassed = this.hasAttribute('bypass');
    btn.classList.toggle('active', !bypassed);
    btn.textContent = bypassed ? 'Bypassed' : 'Active';
  }
}

customElements.define('audio-reverb', AudioReverb);