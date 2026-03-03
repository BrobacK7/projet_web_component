class AudioPlayer extends HTMLElement {

  // Attributs HTML observés pour réactivité
  static get observedAttributes() {
    return ['src', 'title', 'artist', 'autoplay', 'loop'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    // État interne
    this._isPlaying = false;
    this._duration = 0;
    this._currentTime = 0;
    this._volume = 0.8;
    this._isSeeking = false;
    this._audioReady = false;

    // Noeuds WebAudio (initialisés dans _initAudio)
    this._context = null;
    this._sourceNode = null;       // MediaElementSourceNode
    this._insertInput = null;      // GainNode — entrée de la chaîne d'insertion
    this._insertOutput = null;     // GainNode — sortie de la chaîne d'insertion
    this._masterGain = null;       // GainNode — volume master

    // Élément audio HTML natif (caché, géré programmatiquement)
    this._audio = new Audio();
    this._audio.crossOrigin = 'anonymous';
    this._audio.preload = 'metadata';

    this._bindAudioEvents();
  }

  // ─── Cycle de vie ────────────────────────────────────────────────────────────

  connectedCallback() {
    this._render();
    this._bindUIEvents();
    this._bindExternalEvents();

    // Applique les attributs initiaux
    if (this.hasAttribute('src')) this._loadSrc(this.getAttribute('src'));
    if (this.hasAttribute('loop')) this._audio.loop = true;
  }

  disconnectedCallback() {
    this._unbindExternalEvents();
    if (this._context && this._context.state !== 'closed') {
      this._context.close();
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    switch (name) {
      case 'src':    this._loadSrc(newVal); break;
      case 'title':  this._updateMeta(); break;
      case 'artist': this._updateMeta(); break;
      case 'loop':   if (this._audio) this._audio.loop = this.hasAttribute('loop'); break;
    }
  }

  _initAudio() {
    if (this._context) return; // déjà initialisé

    // Utilise le contexte du bus si present, sinon crée le sien (fallback)
    if (window.AudioBus?.context) {
        this._context = window.AudioBus.context;
    } else {
        this._context = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Source depuis l'élément audio HTML
    this._sourceNode = this._context.createMediaElementSource(this._audio);

    this._insertInput = this._context.createGain();
    this._insertOutput = this._context.createGain();

    this._masterGain = this._context.createGain();
    this._masterGain.gain.value = this._volume;

    this._sourceNode.connect(this._insertInput);
    this._insertInput.connect(this._insertOutput);  // bypass par défaut
    this._insertOutput.connect(this._masterGain);
    this._masterGain.connect(this._context.destination);

    // Expose sur AudioBus si présent
    if (window.AudioBus) {
      window.AudioBus.context       = this._context;
      window.AudioBus.masterGain    = this._masterGain;
      window.AudioBus.insertInput   = this._insertInput;
      window.AudioBus.insertOutput  = this._insertOutput;
      window.AudioBus.playerSource  = this._sourceNode;

      window.AudioBus.connectEffect = (inputNode, outputNode) => {
        this._insertInput.disconnect(this._insertOutput);
        this._insertInput.connect(inputNode);
        outputNode.connect(this._insertOutput);
      };

      /**
       * AudioBus.bypassEffects() — retire tous les effets, rebranche le bypass
       */
      window.AudioBus.bypassEffects = () => {
        this._insertInput.disconnect();
        this._insertInput.connect(this._insertOutput);
      };

      // Signal que le bus audio est prêt
      document.dispatchEvent(new CustomEvent('audiobus:ready', {
        detail: { bus: window.AudioBus },
        bubbles: true
      }));
    }
  }

  // ─── Chargement ───────────────────────────────────────────────────────────

  _loadSrc(src) {
    if (!src) return;
    this._audioReady = false;
    this._isPlaying = false;
    this._currentTime = 0;
    this._audio.src = src;
    this._audio.load();
    this._updatePlayButton();
    this._updateProgress(0, 0);
  }

  // ─── Contrôles ────────────────────────────────────────────────────────────

  play() {
    this._initAudio();
    if (this._context.state === 'suspended') this._context.resume();
    this._audio.play().then(() => {
      this._isPlaying = true;
      this._updatePlayButton();
      document.dispatchEvent(new CustomEvent('audio:play', {
        detail: { src: this._audio.src, title: this.getAttribute('title'), artist: this.getAttribute('artist') },
        bubbles: true
      }));
    }).catch(e => console.warn('[audio-player] play() blocked:', e));
  }

  pause() {
    this._audio.pause();
    this._isPlaying = false;
    this._updatePlayButton();
    document.dispatchEvent(new CustomEvent('audio:pause', { bubbles: true }));
  }

  seek(time) {
    if (!isFinite(time)) return;
    this._audio.currentTime = Math.max(0, Math.min(time, this._duration));
    document.dispatchEvent(new CustomEvent('audio:seek', {
      detail: { time: this._audio.currentTime },
      bubbles: true
    }));
  }

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._masterGain) this._masterGain.gain.value = this._volume;
    else this._audio.volume = this._volume;
    this._updateVolumeUI();
  }

  toggle() {
    this._isPlaying ? this.pause() : this.play();
  }

  // ─── Événements audio natifs ──────────────────────────────────────────────

  _bindAudioEvents() {
    this._audio.addEventListener('loadedmetadata', () => {
      this._duration = this._audio.duration;
      this._audioReady = true;
      this._updateDuration();
      document.dispatchEvent(new CustomEvent('audio:loaded', {
        detail: { duration: this._duration, src: this._audio.src },
        bubbles: true
      }));
      if (this.hasAttribute('autoplay')) this.play();
    });

    this._audio.addEventListener('timeupdate', () => {
      if (this._isSeeking) return;
      this._currentTime = this._audio.currentTime;
      this._updateProgress(this._currentTime, this._duration);
      document.dispatchEvent(new CustomEvent('audio:timeupdate', {
        detail: { currentTime: this._currentTime, duration: this._duration },
        bubbles: true
      }));
    });

    this._audio.addEventListener('ended', () => {
      this._isPlaying = false;
      this._updatePlayButton();
      document.dispatchEvent(new CustomEvent('audio:ended', { bubbles: true }));
    });

    this._audio.addEventListener('error', () => {
      console.warn('[audio-player] Erreur de chargement:', this._audio.src);
    });
  }

  // ─── Événements externes (écoute des autres composants) ──────────────────

  _bindExternalEvents() {
    this._onExternalPlay  = (e) => { if (e.detail?.src) this._loadSrc(e.detail.src); this.play(); };
    this._onExternalPause = () => this.pause();
    this._onExternalSeek  = (e) => this.seek(e.detail?.time);

    document.addEventListener('audio:external-play',  this._onExternalPlay);
    document.addEventListener('audio:external-pause', this._onExternalPause);
    document.addEventListener('audio:external-seek',  this._onExternalSeek);
  }

  _unbindExternalEvents() {
    document.removeEventListener('audio:external-play',  this._onExternalPlay);
    document.removeEventListener('audio:external-pause', this._onExternalPause);
    document.removeEventListener('audio:external-seek',  this._onExternalSeek);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        /* ── CSS Variables (customisables depuis l'extérieur) ── */
        :host {
          --ap-bg:           #111113;
          --ap-surface:      #1a1a1f;
          --ap-surface2:     #242429;
          --ap-accent:       #1db954;
          --ap-accent-dim:   #158a3e;
          --ap-text:         #ffffff;
          --ap-text-muted:   #6b6b7a;
          --ap-radius:       12px;
          --ap-font:         'DM Sans', 'Segoe UI', system-ui, sans-serif;
          --ap-width:        360px;

          display: inline-block;
          font-family: var(--ap-font);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .player {
          background: var(--ap-bg);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: var(--ap-radius);
          width: var(--ap-width);
          padding: 24px;
          color: var(--ap-text);
          user-select: none;
          position: relative;
          overflow: hidden;
        }

        /* Subtle glow en fond */
        .player::before {
          content: '';
          position: absolute;
          top: -60px; left: 50%;
          transform: translateX(-50%);
          width: 200px; height: 200px;
          background: radial-gradient(circle, rgba(29,185,84,0.08) 0%, transparent 70%);
          pointer-events: none;
        }

        /* ── Meta (titre / artiste) ── */
        .meta {
          text-align: center;
          margin-bottom: 20px;
        }
        .meta__title {
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--ap-text);
        }
        .meta__artist {
          font-size: 12px;
          color: var(--ap-text-muted);
          margin-top: 3px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ── Progress bar ── */
        .progress-wrap {
          position: relative;
          margin-bottom: 6px;
        }
        .progress-track {
          width: 100%;
          height: 4px;
          background: var(--ap-surface2);
          border-radius: 2px;
          cursor: pointer;
          position: relative;
          overflow: hidden;
        }
        .progress-track:hover { height: 6px; margin-top: -1px; }
        .progress-fill {
          height: 100%;
          width: 0%;
          background: var(--ap-accent);
          border-radius: 2px;
          transition: width 0.1s linear;
          pointer-events: none;
        }
        .progress-times {
          display: flex;
          justify-content: space-between;
          margin-top: 6px;
          font-size: 11px;
          color: var(--ap-text-muted);
          font-variant-numeric: tabular-nums;
        }

        /* ── Contrôles ── */
        .controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin: 20px 0 16px;
        }

        .btn {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--ap-text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          transition: color 0.15s, transform 0.1s;
          border-radius: 50%;
          outline: none;
        }
        .btn:hover { color: var(--ap-text); transform: scale(1.1); }
        .btn:active { transform: scale(0.95); }

        .btn--play {
          width: 48px; height: 48px;
          background: var(--ap-accent);
          color: #000;
          border-radius: 50%;
          transition: background 0.15s, transform 0.1s;
        }
        .btn--play:hover {
          background: #1ed760;
          color: #000;
          transform: scale(1.06);
        }

        /* ── Volume ── */
        .volume-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .volume-icon { color: var(--ap-text-muted); flex-shrink: 0; }

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
          width: 12px; height: 12px;
          background: var(--ap-text);
          border-radius: 50%;
          transition: background 0.15s, transform 0.1s;
        }
        input[type=range]:hover::-webkit-slider-thumb {
          background: var(--ap-accent);
          transform: scale(1.2);
        }
        input[type=range]::-moz-range-thumb {
          width: 12px; height: 12px;
          background: var(--ap-text);
          border-radius: 50%;
          border: none;
        }
      </style>

      <div class="player">

        <div class="meta">
          <div class="meta__title" id="title">—</div>
          <div class="meta__artist" id="artist">—</div>
        </div>

        <div class="progress-wrap">
          <div class="progress-track" id="progressTrack">
            <div class="progress-fill" id="progressFill"></div>
          </div>
          <div class="progress-times">
            <span id="currentTime">0:00</span>
            <span id="duration">0:00</span>
          </div>
        </div>

        <div class="controls">
          <button class="btn btn--skip" id="btnPrev" title="Précédent">
            <!-- skip back -->
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
            </svg>
          </button>

          <button class="btn btn--play" id="btnPlay" title="Lecture / Pause">
            <!-- play icon -->
            <svg id="iconPlay" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            <!-- pause icon (caché par défaut) -->
            <svg id="iconPause" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="display:none">
              <path d="M6 19h4V5H6zm8-14v14h4V5z"/>
            </svg>
          </button>

          <button class="btn btn--skip" id="btnNext" title="Suivant">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.9V8.1L8.5 12zM16 6h2v12h-2z"/>
            </svg>
          </button>
        </div>

        <div class="volume-wrap">
          <svg class="volume-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path id="volumeIcon" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
          </svg>
          <input type="range" id="volumeSlider" min="0" max="1" step="0.01" value="0.8">
        </div>

      </div>
    `;

    this._updateMeta();
  }

  // ─── Binding UI ───────────────────────────────────────────────────────────

  _bindUIEvents() {
    const $ = (id) => this.shadowRoot.getElementById(id);

    $('btnPlay').addEventListener('click', () => this.toggle());
    $('btnPrev').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('audio:prev', { bubbles: true }));
    });
    $('btnNext').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('audio:next', { bubbles: true }));
    });

    // Progress — seek au clic
    const track = $('progressTrack');
    track.addEventListener('click', (e) => {
      const rect = track.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      this.seek(ratio * this._duration);
    });

    // Seek drag
    track.addEventListener('mousedown', (e) => {
      this._isSeeking = true;
      const move = (ev) => {
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        this._updateProgress(ratio * this._duration, this._duration);
      };
      const up = (ev) => {
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        this.seek(ratio * this._duration);
        this._isSeeking = false;
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });

    // Volume
    $('volumeSlider').addEventListener('input', (e) => {
      this.setVolume(parseFloat(e.target.value));
    });
  }

  // ─── Mise à jour UI ───────────────────────────────────────────────────────

  _updateMeta() {
    const t = this.shadowRoot.getElementById('title');
    const a = this.shadowRoot.getElementById('artist');
    if (!t) return;
    t.textContent = this.getAttribute('title')  || '—';
    a.textContent = this.getAttribute('artist') || '—';
  }

  _updatePlayButton() {
    const play  = this.shadowRoot.getElementById('iconPlay');
    const pause = this.shadowRoot.getElementById('iconPause');
    if (!play) return;
    play.style.display  = this._isPlaying ? 'none'  : 'block';
    pause.style.display = this._isPlaying ? 'block' : 'none';
  }

  _updateProgress(current, duration) {
    const fill = this.shadowRoot.getElementById('progressFill');
    const ct   = this.shadowRoot.getElementById('currentTime');
    if (!fill) return;
    const pct = duration > 0 ? (current / duration) * 100 : 0;
    fill.style.width = `${pct}%`;
    ct.textContent = this._formatTime(current);
  }

  _updateDuration() {
    const el = this.shadowRoot.getElementById('duration');
    if (el) el.textContent = this._formatTime(this._duration);
  }

  _updateVolumeUI() {
    const slider = this.shadowRoot.getElementById('volumeSlider');
    if (slider) slider.value = this._volume;
  }

  _formatTime(sec) {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
}

customElements.define('audio-player', AudioPlayer);
