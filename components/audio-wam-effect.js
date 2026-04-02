/**
 * <audio-wam-effect> Web Component
 *
 * Generic host for Web Audio Modules (WAM) loaded from a remote ESM URL.
 *
 * Attributes:
 * - src: WAM module URL (required)
 * - mix: wet mix in [0..1] (default 1)
 * - bypass: when present, effect is bypassed
 *
 * Notes:
 * - The component tries multiple factory patterns to support different WAM exports.
 * - If the loaded module does not expose a usable audio node, the component stays idle.
 */

class AudioWamEffect extends HTMLElement {
  static DEFAULT_WAM_SRC = './assets/wam/basic-drive-wam.js';

  static get observedAttributes() {
    return ['src', 'mix', 'bypass'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this._ready = false;
    this._loading = false;

    this._context = null;
    this._instance = null;
    this._nodeIn = null;
    this._nodeOut = null;

    this._insertIn = null;
    this._insertOut = null;
    this._dryGain = null;
    this._wetGain = null;

    this._mix = this._parseMix(this.getAttribute('mix'));
  }

  connectedCallback() {
    this._render();
    this._bindUIEvents();

    this._onBusReady = () => this._tryConnect();
    document.addEventListener('audiobus:ready', this._onBusReady);

    this._tryConnect();
  }

  disconnectedCallback() {
    document.removeEventListener('audiobus:ready', this._onBusReady);
    this._teardown();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;

    if (name === 'mix') {
      this._mix = this._parseMix(newVal);
      this._applyMix();
      this._syncMixUI();
    }

    if (name === 'bypass') {
      this._applyBypass();
      this._syncBypassUI();
    }

    if (name === 'src') {
      this._syncSrcUI();
      this._reload();
    }
  }

  async _reload() {
    this._teardown();
    await this._tryConnect();
  }

  async _tryConnect() {
    if (this._ready || this._loading) return;

    const bus = window.AudioBus;
    const src = this.getAttribute('src') || AudioWamEffect.DEFAULT_WAM_SRC;

    if (!bus?.context || !bus?.connectEffect || !bus?.disconnectEffect) {
      this._setStatus('Waiting for AudioBus...');
      return;
    }

    this._loading = true;
    this._setStatus('Loading WAM...');

    try {
      this._context = bus.context;
      this._instance = await this._createWamInstance(src, this._context);

      const io = this._resolveIO(this._instance);
      if (!io) throw new Error('Unsupported WAM export format.');

      this._nodeIn = io.input;
      this._nodeOut = io.output;

      this._insertIn = this._context.createGain();
      this._insertOut = this._context.createGain();
      this._dryGain = this._context.createGain();
      this._wetGain = this._context.createGain();

      // Dry/wet host around external WAM node
      this._insertIn.connect(this._dryGain);
      this._dryGain.connect(this._insertOut);

      this._insertIn.connect(this._nodeIn);
      this._nodeOut.connect(this._wetGain);
      this._wetGain.connect(this._insertOut);

      bus.connectEffect(this._insertIn, this._insertOut);

      this._ready = true;
      this._applyMix();
      this._applyBypass();
      this._setStatus('WAM loaded.');
    } catch (err) {
      console.warn('[audio-wam-effect] load failed:', err);
      this._setStatus('WAM load failed. Check URL/API.');
      this._teardown();
    } finally {
      this._loading = false;
    }
  }

  async _createWamInstance(src, context) {
    const resolvedSrc = new URL(src, document.baseURI).href;
    const mod = await import(resolvedSrc);
    const baseURL = resolvedSrc.slice(0, resolvedSrc.lastIndexOf('/') + 1);

    const factories = [
      mod?.createInstance,
      mod?.default?.createInstance,
      mod?.WebAudioModule?.createInstance,
    ].filter(fn => typeof fn === 'function');

    for (const create of factories) {
      try {
        // Try common signatures used by community WAM packages
        return await create({ audioContext: context, baseURL });
      } catch (_) {}
      try {
        return await create(context, baseURL);
      } catch (_) {}
      try {
        return await create(context);
      } catch (_) {}
    }

    const Ctor = typeof mod?.default === 'function' ? mod.default : null;
    if (Ctor) {
      let instance = null;

      try {
        instance = new Ctor(context, baseURL);
      } catch (_) {
        try {
          instance = new Ctor(context);
        } catch (_) {
          instance = new Ctor();
        }
      }

      if (instance && typeof instance.initialize === 'function') {
        await instance.initialize({ audioContext: context, baseURL });
      }

      return instance;
    }

    throw new Error('No supported factory found in module export.');
  }

  _resolveIO(instance) {
    if (!instance) return null;

    const nodeLike = instance.audioNode || instance.node || instance;

    const input = instance.input || nodeLike.input || nodeLike;
    const output = instance.output || nodeLike.output || nodeLike;

    if (typeof input?.connect !== 'function') return null;
    if (typeof output?.connect !== 'function') return null;

    return { input, output };
  }

  _parseMix(v) {
    const n = parseFloat(v ?? '1');
    if (!isFinite(n)) return 1;
    return Math.max(0, Math.min(1, n));
  }

  _applyMix() {
    if (!this._dryGain || !this._wetGain || !this._context) return;

    const t = this._context.currentTime;
    const bypass = this.hasAttribute('bypass');

    if (bypass) {
      this._dryGain.gain.setTargetAtTime(1, t, 0.02);
      this._wetGain.gain.setTargetAtTime(0, t, 0.02);
      return;
    }

    this._dryGain.gain.setTargetAtTime(1 - this._mix, t, 0.02);
    this._wetGain.gain.setTargetAtTime(this._mix, t, 0.02);
  }

  _applyBypass() {
    this._applyMix();
  }

  _teardown() {
    const bus = window.AudioBus;

    if (bus?.disconnectEffect && this._insertIn && this._insertOut) {
      try { bus.disconnectEffect(this._insertIn, this._insertOut); } catch (_) {}
    }

    try { this._insertIn?.disconnect(); } catch (_) {}
    try { this._insertOut?.disconnect(); } catch (_) {}
    try { this._dryGain?.disconnect(); } catch (_) {}
    try { this._wetGain?.disconnect(); } catch (_) {}
    try { this._nodeOut?.disconnect(); } catch (_) {}

    if (this._instance && typeof this._instance.destroy === 'function') {
      try { this._instance.destroy(); } catch (_) {}
    }

    this._instance = null;
    this._nodeIn = null;
    this._nodeOut = null;
    this._insertIn = null;
    this._insertOut = null;
    this._dryGain = null;
    this._wetGain = null;
    this._ready = false;
  }

  _setStatus(msg) {
    const el = this.shadowRoot.getElementById('status');
    if (el) el.textContent = msg;
  }

  _syncSrcUI() {
    const input = this.shadowRoot.getElementById('srcInput');
    if (input) input.value = this.getAttribute('src') || AudioWamEffect.DEFAULT_WAM_SRC;
  }

  _syncMixUI() {
    const slider = this.shadowRoot.getElementById('mixSlider');
    const label = this.shadowRoot.getElementById('mixLabel');
    if (slider) slider.value = String(this._mix);
    if (label) label.textContent = Math.round(this._mix * 100) + '%';
  }

  _syncBypassUI() {
    const btn = this.shadowRoot.getElementById('btnBypass');
    if (!btn) return;
    const bypass = this.hasAttribute('bypass');
    btn.classList.toggle('active', !bypass);
    btn.textContent = bypass ? 'Bypassed' : 'Active';
  }

  _bindUIEvents() {
    this.shadowRoot.getElementById('btnLoad')?.addEventListener('click', async () => {
      const input = this.shadowRoot.getElementById('srcInput');
      const src = input?.value?.trim();
      if (!src) return;
      this.setAttribute('src', src);
    });

    this.shadowRoot.getElementById('btnBypass')?.addEventListener('click', () => {
      if (this.hasAttribute('bypass')) this.removeAttribute('bypass');
      else this.setAttribute('bypass', '');
    });

    this.shadowRoot.getElementById('mixSlider')?.addEventListener('input', (e) => {
      this.setAttribute('mix', e.target.value);
    });

    this._syncSrcUI();
    this._syncMixUI();
    this._syncBypassUI();
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --ap-bg: #0d0d12;
          --ap-surface2: #1e1e2a;
          --ap-accent: #8b5cf6;
          --ap-text: #f0eaff;
          --ap-text-muted: #9d8fc4;
          --ap-radius: 12px;
          --ap-font: 'DM Sans', 'Segoe UI', system-ui, sans-serif;
          --ap-width: 360px;
          display: block;
          width: 100%;
          height: 100%;
          font-family: var(--ap-font);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .wam {
          background: var(--ap-bg);
          border: 1px solid rgba(139,92,246,0.30);
          border-radius: var(--ap-radius);
          width: 100%;
          height: 100%;
          padding: 16px;
          color: var(--ap-text);
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .title {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ap-text-muted);
        }

        .btn {
          background: none;
          border: 1px solid rgba(139,92,246,0.20);
          border-radius: 4px;
          color: var(--ap-text-muted);
          font-size: 10px;
          font-family: var(--ap-font);
          padding: 3px 8px;
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: 0.05em;
        }
        .btn:hover { color: var(--ap-text); border-color: rgba(139,92,246,0.50); }
        .btn.active {
          background: rgba(139,92,246,0.15);
          color: var(--ap-accent);
          border-color: var(--ap-accent);
        }

        .row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }

        input[type=text] {
          flex: 1;
          min-width: 0;
          background: var(--ap-surface2);
          border: 1px solid rgba(139,92,246,0.20);
          border-radius: 8px;
          color: var(--ap-text);
          padding: 8px 10px;
          font-size: 12px;
          outline: none;
        }

        .mix-line {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .mix-label {
          color: var(--ap-text-muted);
          font-size: 11px;
          width: 34px;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        input[type=range] {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 4px;
          background: var(--ap-surface2);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--ap-text);
        }

        .status {
          margin-top: 10px;
          font-size: 11px;
          color: var(--ap-text-muted);
          font-style: italic;
          min-height: 14px;
        }
      </style>

      <div class="wam">
        <div class="header">
          <span class="title">WAM Effect</span>
          <button class="btn" id="btnBypass">Active</button>
        </div>

        <div class="row">
          <input id="srcInput" type="text" placeholder="https://.../wam-module.js" />
          <button class="btn" id="btnLoad">Load</button>
        </div>

        <div class="mix-line">
          <input id="mixSlider" type="range" min="0" max="1" step="0.01" value="1" />
          <span class="mix-label" id="mixLabel">100%</span>
        </div>

        <div class="status" id="status">Set a WAM module URL in src.</div>
      </div>
    `;
  }
}

customElements.define('audio-wam-effect', AudioWamEffect);
