/**
 * <audio-visualizer> Web Component
 *
 * DESIGN DECISIONS:
 * 1. AUTONOMIE : Se branche sur AudioBus si present, sinon attend audiobus:ready.
 * 2. GRAPHE AUDIO : Tap lecture seule sur masterGain -> AnalyserNode.
 *    N'altere pas le son, pas dans la chaine de traitement.
 * 3. MODES : fft (barres frequences) | waveform (oscilloscope)
 *    Switching via onglets. Attribut mode='fft'|'waveform'
 * 4. COMMUNICATION :
 *    Ecoute -> audiobus:ready, audio:play, audio:pause, audio:ended
 * 5. ATTRIBUTS : mode='fft'|'waveform', fftsize=256
 * USAGE : <audio-visualizer mode="fft" fftsize="256"></audio-visualizer>
 */

class AudioVisualizer extends HTMLElement {
  static get observedAttributes() { return ['mode', 'fftsize']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._analyser  = null;
    this._dataArray = null;
    this._rafId     = null;
    this._isPlaying = false;
    this._mode      = 'fft';
    this._fftSize   = 256;
    this._ready     = false;
    this._drawLoop  = this._drawLoop.bind(this);
  }

  connectedCallback() {
    this._mode    = this.getAttribute('mode') || 'fft';
    this._fftSize = parseInt(this.getAttribute('fftsize')) || 256;
    this._render();
    this._bindUIEvents();
    this._tryConnect();
    this._onBusReady = () => this._tryConnect();
    this._onPlay = () => { this._isPlaying = true; this._startLoop(); this._hideIdle(); };
    this._onStop = () => { this._isPlaying = false; this._stopLoop(); };
    document.addEventListener('audiobus:ready', this._onBusReady);
    document.addEventListener('audio:play',     this._onPlay);
    document.addEventListener('audio:pause',    this._onStop);
    document.addEventListener('audio:ended',    this._onStop);
  }

  disconnectedCallback() {
    this._stopLoop();
    document.removeEventListener('audiobus:ready', this._onBusReady);
    document.removeEventListener('audio:play',     this._onPlay);
    document.removeEventListener('audio:pause',    this._onStop);
    document.removeEventListener('audio:ended',    this._onStop);
    if (this._analyser) { this._analyser.disconnect(); this._analyser = null; }
    this._ready = false;
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'mode') {
      this._mode = newVal || 'fft';
      this._updateTabs();
      this._resetCanvas();
    }
    if (name === 'fftsize') {
      this._fftSize = parseInt(newVal) || 256;
      if (this._analyser) {
        this._analyser.fftSize = this._fftSize;
        this._dataArray = new Uint8Array(
          this._mode === 'fft' ? this._analyser.frequencyBinCount : this._analyser.fftSize
        );
      }
    }
  }

  // Tap en lecture seule sur masterGain -> analyser (ne modifie pas le son)
  _tryConnect() {
    const bus = window.AudioBus;
    if (!bus || !bus.context || !bus.masterGain || this._ready) return;
    const ctx = bus.context;
    this._analyser = ctx.createAnalyser();
    this._analyser.fftSize = this._fftSize;
    this._analyser.smoothingTimeConstant = 0.8;
    bus.masterGain.connect(this._analyser);
    this._dataArray = new Uint8Array(
      this._mode === 'fft' ? this._analyser.frequencyBinCount : this._analyser.fftSize
    );
    this._ready = true;
    if (this._isPlaying) this._startLoop();
  }

  _startLoop() {
    if (this._rafId || !this._ready) return;
    this._rafId = requestAnimationFrame(this._drawLoop);
  }

  _stopLoop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._resetCanvas();
  }

  _drawLoop() {
    if (!this._isPlaying || !this._analyser) return;
    this._rafId = requestAnimationFrame(this._drawLoop);
    this._mode === 'fft' ? this._drawFFT() : this._drawWaveform();
  }

  _drawFFT() {
    const canvas = this.shadowRoot.getElementById('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    this._analyser.getByteFrequencyData(this._dataArray);
    ctx.clearRect(0, 0, W, H);
    const bufLen   = this._analyser.frequencyBinCount;
    const barCount = Math.min(bufLen, 64);
    const barW     = (W / barCount) - 1;
    for (let i = 0; i < barCount; i++) {
      const binIndex = Math.floor(i * bufLen / barCount);
      const value    = this._dataArray[binIndex];
      const barH     = (value / 255) * H;
      const ratio    = value / 255;
      const r = Math.round(ratio > 0.6 ? 255 : ratio * 2 * 120);
      const g = Math.round(ratio < 0.5 ? 185 : (1 - ratio) * 2 * 185);
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',80)';
      const x = i * (barW + 1);
      const y = H - barH;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, barW, barH, [2, 2, 0, 0]);
      else ctx.rect(x, y, barW, barH);
      ctx.fill();
      if (barH > 4) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(x, y, barW, 2);
      }
    }
  }

  _drawWaveform() {
    const canvas = this.shadowRoot.getElementById('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    this._analyser.getByteTimeDomainData(this._dataArray);
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0,   'rgba(29,185,84,0.3)');
    grad.addColorStop(0.5, 'rgba(29,185,84,1)');
    grad.addColorStop(1,   'rgba(29,185,84,0.3)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.lineJoin  = 'round';
    ctx.beginPath();
    const sliceW = W / this._dataArray.length;
    let x = 0;
    for (let i = 0; i < this._dataArray.length; i++) {
      const v = this._dataArray[i] / 128.0;
      const y = (v * H) / 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      x += sliceW;
    }
    ctx.lineTo(W, H / 2);
    ctx.stroke();
  }

  _resetCanvas() {
    const canvas = this.shadowRoot.getElementById('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this._mode === 'waveform') {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
      grad.addColorStop(0,   'rgba(29,185,84,0.1)');
      grad.addColorStop(0.5, 'rgba(29,185,84,0.25)');
      grad.addColorStop(1,   'rgba(29,185,84,0.1)');
      ctx.strokeStyle = grad; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    }
  }

  _hideIdle() {
    const msg = this.shadowRoot.getElementById('idleMsg');
    if (msg) msg.classList.add('hidden');
  }

  _updateTabs() {
    this.shadowRoot.querySelectorAll('.tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === this._mode);
    });
    if (this._analyser) {
      this._dataArray = new Uint8Array(
        this._mode === 'fft' ? this._analyser.frequencyBinCount : this._analyser.fftSize
      );
    }
  }

  _bindUIEvents() {
    this.shadowRoot.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._mode = btn.dataset.mode;
        this.setAttribute('mode', this._mode);
      });
    });
  }

  _render() {
    const fftActive  = this._mode === 'fft'      ? ' active' : '';
    const waveActive = this._mode === 'waveform' ? ' active' : '';
    const css = [
      ':host {',
      '  --ap-bg: #111113; --ap-surface2: #242429;',
      '  --ap-accent: #1db954; --ap-text: #ffffff;',
      '  --ap-text-muted: #6b6b7a; --ap-radius: 12px;',
      "  --ap-font: 'DM Sans','Segoe UI',system-ui,sans-serif;",
      '  --ap-width: 360px; display: inline-block; font-family: var(--ap-font);',
      '}',
      '* { box-sizing: border-box; margin: 0; padding: 0; }',
      '.viz { background: var(--ap-bg); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--ap-radius); width: var(--ap-width); padding: 16px; color: var(--ap-text); overflow: hidden; }',
      '.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }',
      '.header__title { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ap-text-muted); }',
      '.tabs { display: flex; gap: 4px; }',
      '.tab { background: none; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; color: var(--ap-text-muted); font-size: 10px; padding: 3px 10px; cursor: pointer; outline: none; transition: color 0.15s, border-color 0.15s, background 0.15s; letter-spacing: 0.05em; }',
      '.tab:hover { color: var(--ap-text); }',
      '.tab.active { background: rgba(29,185,84,0.12); color: var(--ap-accent); border-color: var(--ap-accent); }',
      '.canvas-wrap { position: relative; width: 100%; height: 100px; border-radius: 8px; overflow: hidden; background: var(--ap-surface2); }',
      'canvas { display: block; width: 100%; height: 100%; }',
      '.idle-msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--ap-text-muted); font-style: italic; pointer-events: none; transition: opacity 0.3s; }',
      '.idle-msg.hidden { opacity: 0; }'
    ].join('');
    const html = '<div class="viz">'
      + '<div class="header">'
      + '<span class="header__title">Visualizer</span>'
      + '<div class="tabs">'
      + '<button class="tab' + fftActive  + '" data-mode="fft">FFT</button>'
      + '<button class="tab' + waveActive + '" data-mode="waveform">Wave</button>'
      + '</div></div>'
      + '<div class="canvas-wrap">'
      + '<canvas id="canvas"></canvas>'
      + '<div class="idle-msg" id="idleMsg">Lance la lecture pour visualiser</div>'
      + '</div></div>';
    this.shadowRoot.innerHTML = '<style>' + css + '</style>' + html;
    requestAnimationFrame(() => {
      const canvas = this.shadowRoot.getElementById('canvas');
      if (!canvas) return;
      const wrap = canvas.parentElement;
      canvas.width  = wrap.clientWidth  || 328;
      canvas.height = wrap.clientHeight || 100;
      this._resetCanvas();
    });
  }
}

customElements.define('audio-visualizer', AudioVisualizer);