/**
 * <audio-visualizer> Web Component
 *
 * DESIGN DECISIONS:
 * 1. AUTONOMIE : Se branche sur AudioBus si present, sinon attend audiobus:ready.
 * 2. GRAPHE AUDIO : Tap lecture seule sur masterGain -> AnalyserNode.
 *    N'altere pas le son, pas dans la chaine de traitement.
 * 3. MODES : fft (barres frequences) | waveform (oscilloscope) | volume (VU)
 *    Switching via onglets. Attribut mode='fft'|'waveform'|'volume'
 * 4. COMMUNICATION :
 *    Ecoute -> audiobus:ready, audio:play, audio:pause, audio:ended
 * 5. ATTRIBUTS : mode='fft'|'waveform'|'volume', fftsize=256
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
    this._volumeSmooth = 0;
    this._ready     = false;
    this._drawLoop  = this._drawLoop.bind(this);
    this._resizeObserver = null;
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

    // If the visualizer is mounted after playback already started,
    // recover current playback state from existing players.
    this._syncInitialPlaybackState();
  }

  disconnectedCallback() {
    this._stopLoop();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
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
    if (this._mode === 'fft') this._drawFFT();
    else if (this._mode === 'waveform') this._drawWaveform();
    else this._drawVolume();
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
        ctx.fillStyle = 'rgba(167,139,250,0.7)';
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
    ctx.strokeStyle = 'rgba(139,92,246,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0,   'rgba(139,92,246,0.3)');
    grad.addColorStop(0.5, 'rgba(167,139,250,1)');
    grad.addColorStop(1,   'rgba(139,92,246,0.3)');
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

  _drawVolume() {
    const canvas = this.shadowRoot.getElementById('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    this._analyser.getByteTimeDomainData(this._dataArray);

    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < this._dataArray.length; i++) {
      const centered = (this._dataArray[i] - 128) / 128;
      const abs = Math.abs(centered);
      sumSq += centered * centered;
      if (abs > peak) peak = abs;
    }

    const rms = Math.sqrt(sumSq / this._dataArray.length);
    const level = Math.min(1, rms * 2.2);
    const peakLevel = Math.min(1, peak);

    this._volumeSmooth = this._volumeSmooth * 0.78 + level * 0.22;

    ctx.clearRect(0, 0, W, H);

    // Grille discrete en fond pour rendre la dynamique lisible
    ctx.strokeStyle = 'rgba(139,92,246,0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const x = (W / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    const meterX = 14;
    const meterW = W - 28;
    const rmsY = 22;
    const peakY = 62;
    const barH = 16;

    const bg = 'rgba(139,92,246,0.06)';
    ctx.fillStyle = bg;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(meterX, rmsY, meterW, barH, 8);
      ctx.roundRect(meterX, peakY, meterW, barH, 8);
      ctx.fill();
    } else {
      ctx.fillRect(meterX, rmsY, meterW, barH);
      ctx.fillRect(meterX, peakY, meterW, barH);
    }

    const grad = ctx.createLinearGradient(meterX, 0, meterX + meterW, 0);
    grad.addColorStop(0.0, '#8b5cf6');
    grad.addColorStop(0.5, '#c084fc');
    grad.addColorStop(1.0, '#f472b6');
    ctx.fillStyle = grad;

    const rmsW = Math.max(0, meterW * this._volumeSmooth);
    const peakW = Math.max(0, meterW * peakLevel);
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(meterX, rmsY, rmsW, barH, 8);
      ctx.roundRect(meterX, peakY, peakW, barH, 8);
      ctx.fill();
    } else {
      ctx.fillRect(meterX, rmsY, rmsW, barH);
      ctx.fillRect(meterX, peakY, peakW, barH);
    }

    ctx.fillStyle = 'rgba(200,185,255,0.8)';
    ctx.font = '10px sans-serif';
    ctx.fillText('RMS', meterX, rmsY - 6);
    ctx.fillText('PEAK', meterX, peakY - 6);
  }

  _resetCanvas() {
    const canvas = this.shadowRoot.getElementById('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this._mode === 'waveform') {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
      grad.addColorStop(0,   'rgba(139,92,246,0.1)');
      grad.addColorStop(0.5, 'rgba(139,92,246,0.25)');
      grad.addColorStop(1,   'rgba(139,92,246,0.1)');
      ctx.strokeStyle = grad; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    } else if (this._mode === 'volume') {
      ctx.fillStyle = 'rgba(167,139,250,0.30)';
      ctx.font = '11px sans-serif';
      ctx.fillText('Niveau: 0%', 14, 20);
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

  _syncInitialPlaybackState() {
    const activePlayer = document.querySelector('audio-player[playing]');
    if (activePlayer) {
      this._isPlaying = true;
      this._startLoop();
      this._hideIdle();
    }
  }

  _render() {
    const fftActive  = this._mode === 'fft'      ? ' active' : '';
    const waveActive = this._mode === 'waveform' ? ' active' : '';
    const volActive  = this._mode === 'volume'   ? ' active' : '';
    const css = [
      ':host {',
      '  --ap-bg: #0d0d12; --ap-surface2: #1e1e2a;',
      '  --ap-accent: #8b5cf6; --ap-text: #f0eaff;',
      '  --ap-text-muted: #9d8fc4; --ap-radius: 12px;',
      "  --ap-font: 'DM Sans','Segoe UI',system-ui,sans-serif;",
      '  --ap-width: 360px; display: block; width: 100%; height: 100%; font-family: var(--ap-font);',
      '}',
      '* { box-sizing: border-box; margin: 0; padding: 0; }',
      '.viz { background: var(--ap-bg); border: 1px solid rgba(139,92,246,0.30); border-radius: var(--ap-radius); width: 100%; height: 100%; padding: 16px; color: var(--ap-text); overflow: hidden; display: flex; flex-direction: column; }',
      '.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }',
      '.header__title { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ap-text-muted); }',
      '.tabs { display: flex; gap: 4px; }',
      '.tab { background: none; border: 1px solid rgba(139,92,246,0.20); border-radius: 4px; color: var(--ap-text-muted); font-size: 10px; padding: 3px 10px; cursor: pointer; outline: none; transition: color 0.15s, border-color 0.15s, background 0.15s; letter-spacing: 0.05em; }',
      '.tab:hover { color: var(--ap-text); }',
      '.tab.active { background: rgba(139,92,246,0.15); color: var(--ap-accent); border-color: var(--ap-accent); }',
      '.canvas-wrap { position: relative; width: 100%; flex: 1 1 auto; min-height: 100px; border-radius: 8px; overflow: hidden; background: var(--ap-surface2); }',
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
      + '<button class="tab' + volActive + '" data-mode="volume">Vol</button>'
      + '</div></div>'
      + '<div class="canvas-wrap">'
      + '<canvas id="canvas"></canvas>'
      + '<div class="idle-msg" id="idleMsg"></div>'
      + '</div></div>';
    this.shadowRoot.innerHTML = '<style>' + css + '</style>' + html;
    requestAnimationFrame(() => {
      this._syncCanvasSize();
      this._observeCanvasResize();
      this._resetCanvas();
    });
  }

  _syncCanvasSize() {
    const canvas = this.shadowRoot.getElementById('canvas');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const nextW = wrap.clientWidth || 328;
    const nextH = wrap.clientHeight || 100;
    if (canvas.width !== nextW) canvas.width = nextW;
    if (canvas.height !== nextH) canvas.height = nextH;
  }

  _observeCanvasResize() {
    if (this._resizeObserver) this._resizeObserver.disconnect();
    const wrap = this.shadowRoot.querySelector('.canvas-wrap');
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    this._resizeObserver = new ResizeObserver(() => {
      this._syncCanvasSize();
      if (!this._isPlaying) this._resetCanvas();
    });
    this._resizeObserver.observe(wrap);
  }
}

customElements.define('audio-visualizer', AudioVisualizer);