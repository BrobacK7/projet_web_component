class AudioPlayer extends HTMLElement {

  get isPlaying() {
    return this._isPlaying;
  }

  static get observedAttributes() {
    return ['src', 'tracks', 'title', 'artist', 'autoplay', 'autoadvance', 'loop', 'shuffle'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this._tracks = [];
    this._shuffleOrder = [];
    this._currentIndex = -1;
    this._isPlaying = false;
    this._isSeeking = false;
    this._audioReady = false;
    this._duration = 0;
    this._currentTime = 0;
    this._volume = 0.8;

    this._context = null;
    this._sourceNode = null;
    this._insertInput = null;
    this._insertOutput = null;
    this._masterGain = null;

    this._audio = new Audio();
    this._audio.crossOrigin = 'anonymous';
    this._audio.preload = 'metadata';

    this._bindAudioEvents();
  }

  connectedCallback() {
    this._render();
    this._bindUIEvents();
    this._bindExternalEvents();
    this._syncTracksFromAttributes();
  }

  disconnectedCallback() {
    this._unbindExternalEvents();
    this.removeAttribute('playing');
    if (this._context && this._context.state !== 'closed') {
      this._context.close();
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;

    if (name === 'src' || name === 'tracks' || name === 'title' || name === 'artist') {
      this._syncTracksFromAttributes();
      return;
    }

    if (name === 'shuffle') {
      this._buildShuffleOrder();
      this._updateControls();
      return;
    }

    if (name === 'loop') {
      this._updateLoopMode();
      this._updateControls();
      return;
    }

    if (name === 'autoplay' || name === 'autoadvance') {
      this._updateControls();
    }
  }

  _syncTracksFromAttributes() {
    this._tracks = this._readTracks();
    this._buildShuffleOrder();

    if (this._tracks.length === 0) {
      this._currentIndex = -1;
      this._audio.removeAttribute('src');
      this._audio.load();
      this._duration = 0;
      this._currentTime = 0;
      this._isPlaying = false;
      this._audioReady = false;
      this._renderList();
      this._updateMeta();
      this._updateDuration();
      this._updateProgress(0, 0);
      this._updatePlayButton();
      this._updateLoopMode();
      return;
    }

    if (this._currentIndex < 0 || this._currentIndex >= this._tracks.length) {
      this._currentIndex = 0;
    }

    this._loadTrack(this._currentIndex, false);
    this._renderList();
    this._updateControls();

    if (this.hasAttribute('autoplay')) {
      this.play();
    }
  }

  _readTracks() {
    const rawTracks = this.getAttribute('tracks');
    const singleSrc = this.getAttribute('src');
    const singleTitle = this.getAttribute('title');
    const singleArtist = this.getAttribute('artist');

    if (rawTracks) {
      try {
        const parsed = JSON.parse(rawTracks);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((item, index) => this._normalizeTrack(item, index)).filter(Boolean);
      } catch (error) {
        console.warn('[audio-player] tracks JSON invalide:', error);
        return [];
      }
    }

    if (singleSrc) {
      const track = this._normalizeTrack({ src: singleSrc, title: singleTitle, artist: singleArtist }, 0);
      return track ? [track] : [];
    }

    return [];
  }

  _normalizeTrack(item, index) {
    if (typeof item === 'string') {
      return {
        src: item,
        title: this._titleFromSrc(item, index + 1),
        artist: '',
      };
    }

    if (!item || typeof item !== 'object' || !item.src) {
      return null;
    }

    return {
      src: item.src,
      title: item.title || this._titleFromSrc(item.src, index + 1),
      artist: item.artist || '',
    };
  }

  _titleFromSrc(src, fallbackIndex) {
    try {
      const clean = String(src).split('?')[0].split('#')[0];
      const name = clean.split('/').filter(Boolean).pop() || '';
      const withoutExt = name.replace(/\.[^.]+$/, '');
      return decodeURIComponent(withoutExt || `Track ${fallbackIndex}`);
    } catch (error) {
      return `Track ${fallbackIndex}`;
    }
  }

  _buildShuffleOrder() {
    this._shuffleOrder = this._tracks.map((_, index) => index);
    if (!this.hasAttribute('shuffle')) return;

    for (let i = this._shuffleOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this._shuffleOrder[i], this._shuffleOrder[j]] = [this._shuffleOrder[j], this._shuffleOrder[i]];
    }
  }

  _currentOrder() {
    return this.hasAttribute('shuffle') ? [...this._shuffleOrder] : this._tracks.map((_, index) => index);
  }

  _updateLoopMode() {
    const shouldLoopAudio = this.hasAttribute('loop') && this._tracks.length <= 1;
    this._audio.loop = shouldLoopAudio;
  }

  _loadTrack(index, autoplay) {
    if (index < 0 || index >= this._tracks.length) return;

    const track = this._tracks[index];
    this._currentIndex = index;
    this._audio.src = track.src;
    this._audio.load();
    this._currentTime = 0;
    this._duration = 0;
    this._audioReady = false;
    this._updateLoopMode();
    this._updateActiveItem(index);
    this._updateMeta();
    this._updateProgress(0, 0);
    this._updateDuration();
    if (autoplay) this.play();
  }

  _playAt(index) {
    this._loadTrack(index, true);
  }

  _playNext() {
    const order = this._currentOrder();
    if (order.length === 0) return;

    document.dispatchEvent(new CustomEvent('audio:next', { bubbles: true }));

    const position = order.indexOf(this._currentIndex);
    const nextIndex = position >= 0 ? order[position + 1] : order[0];

    if (nextIndex !== undefined) {
      this._loadTrack(nextIndex, true);
      return;
    }

    if (this.hasAttribute('loop')) {
      this._loadTrack(order[0], true);
    }
  }

  _playPrev() {
    const order = this._currentOrder();
    if (order.length === 0) return;

    document.dispatchEvent(new CustomEvent('audio:prev', { bubbles: true }));

    const position = order.indexOf(this._currentIndex);
    const prevIndex = position > 0 ? order[position - 1] : undefined;

    if (prevIndex !== undefined) {
      this._loadTrack(prevIndex, true);
      return;
    }

    if (this.hasAttribute('loop')) {
      this._loadTrack(order[order.length - 1], true);
    }
  }

  _initAudio() {
    if (this._context) return;

    const bus = window.AudioBus;

    if (bus && bus.context && bus.insertInput && bus.masterGain) {
      this._context = bus.context;
      this._masterGain = bus.masterGain;
      this._sourceNode = this._context.createMediaElementSource(this._audio);
      this._sourceNode.connect(bus.insertInput);
    } else {
      this._context = new (window.AudioContext || window.webkitAudioContext)();
      this._insertInput = this._context.createGain();
      this._insertOutput = this._context.createGain();
      this._masterGain = this._context.createGain();
      this._masterGain.gain.value = this._volume;
      this._sourceNode = this._context.createMediaElementSource(this._audio);
      this._sourceNode.connect(this._insertInput);
      this._insertInput.connect(this._insertOutput);
      this._insertOutput.connect(this._masterGain);
      this._masterGain.connect(this._context.destination);

      if (window.AudioBus) {
        window.AudioBus.context = this._context;
        window.AudioBus.masterGain = this._masterGain;
        window.AudioBus.insertInput = this._insertInput;
        window.AudioBus.insertOutput = this._insertOutput;
        window.AudioBus.connectEffect = (inNode, outNode) => {
          this._insertInput.disconnect(this._insertOutput);
          this._insertInput.connect(inNode);
          outNode.connect(this._insertOutput);
        };
        window.AudioBus.bypassEffects = () => {
          this._insertInput.disconnect();
          this._insertInput.connect(this._insertOutput);
        };
        document.dispatchEvent(new CustomEvent('audiobus:ready', {
          detail: { bus: window.AudioBus },
          bubbles: true,
        }));
      }
    }

    if (this._context.state === 'suspended') this._context.resume();
  }

  play() {
    if (this._tracks.length === 0) return;
    if (this._currentIndex < 0) this._loadTrack(0, false);

    this._initAudio();
    if (this._context && this._context.state === 'suspended') this._context.resume();

    const playPromise = this._audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((error) => console.warn('[audio-player] play() blocked:', error));
    }
  }

  pause() {
    this._audio.pause();
  }

  toggle() {
    this._isPlaying ? this.pause() : this.play();
  }

  seek(time) {
    if (!isFinite(time)) return;
    this._audio.currentTime = Math.max(0, Math.min(time, this._duration || time));
    document.dispatchEvent(new CustomEvent('audio:seek', {
      detail: { time: this._audio.currentTime },
      bubbles: true,
    }));
  }

  setVolume(value) {
    this._volume = Math.max(0, Math.min(1, value));
    if (this._masterGain) this._masterGain.gain.value = this._volume;
    else this._audio.volume = this._volume;
    this._updateVolumeUI();
  }

  _bindAudioEvents() {
    this._audio.addEventListener('loadedmetadata', () => {
      this._duration = this._audio.duration || 0;
      this._audioReady = true;
      this._updateDuration();
      this._updateProgress(this._currentTime, this._duration);
      this._updateMeta();
      document.dispatchEvent(new CustomEvent('audio:loaded', {
        detail: { duration: this._duration, src: this._audio.src },
        bubbles: true,
      }));
      if (this.hasAttribute('autoplay')) this.play();
    });

    this._audio.addEventListener('timeupdate', () => {
      if (this._isSeeking) return;
      this._currentTime = this._audio.currentTime || 0;
      this._updateProgress(this._currentTime, this._duration);
      document.dispatchEvent(new CustomEvent('audio:timeupdate', {
        detail: { currentTime: this._currentTime, duration: this._duration },
        bubbles: true,
      }));
    });

    this._audio.addEventListener('play', () => {
      this._isPlaying = true;
      this.setAttribute('playing', '');
      this._updatePlayButton();
      document.dispatchEvent(new CustomEvent('audio:play', {
        detail: {
          src: this._audio.src,
          title: this._currentTrack()?.title || this.getAttribute('title'),
          artist: this._currentTrack()?.artist || this.getAttribute('artist'),
          index: this._currentIndex,
        },
        bubbles: true,
      }));
    });

    this._audio.addEventListener('pause', () => {
      this._isPlaying = false;
      this.removeAttribute('playing');
      this._updatePlayButton();
      document.dispatchEvent(new CustomEvent('audio:pause', { bubbles: true }));
    });

    this._audio.addEventListener('ended', () => {
      this._isPlaying = false;
      this.removeAttribute('playing');
      this._updatePlayButton();
      document.dispatchEvent(new CustomEvent('audio:ended', { bubbles: true }));

      const canAdvance = this._isAutoAdvanceEnabled();
      if (canAdvance) {
        const order = this._currentOrder();
        const position = order.indexOf(this._currentIndex);
        const nextIndex = position >= 0 ? order[position + 1] : order[0];
        if (nextIndex !== undefined) {
          this._playAt(nextIndex);
          return;
        }
      }

      if (this.hasAttribute('loop') && this._tracks.length === 1) {
        this._playAt(0);
      } else if (this.hasAttribute('loop') && this._tracks.length > 1) {
        this._playAt(0);
      }
    });

    this._audio.addEventListener('error', () => {
      console.warn('[audio-player] Erreur de chargement:', this._audio.src);
    });
  }

  _isAutoAdvanceEnabled() {
    const attr = this.getAttribute('autoadvance');
    return attr === null ? true : attr !== 'false';
  }

  _bindExternalEvents() {
    this._onExternalPlay = (e) => {
      if (e.detail?.index !== undefined && this._tracks[e.detail.index]) {
        this._loadTrack(e.detail.index, false);
      } else if (e.detail?.src) {
        this._setExternalTrack(e.detail);
      }
      this.play();
    };

    this._onExternalPause = () => this.pause();
    this._onExternalSeek = (e) => this.seek(e.detail?.time);
    this._onExternalNext = () => this._playNext();
    this._onExternalPrev = () => this._playPrev();

    document.addEventListener('audio:external-play', this._onExternalPlay);
    document.addEventListener('audio:external-pause', this._onExternalPause);
    document.addEventListener('audio:external-seek', this._onExternalSeek);
    document.addEventListener('audio:next', this._onExternalNext);
    document.addEventListener('audio:prev', this._onExternalPrev);
  }

  _unbindExternalEvents() {
    document.removeEventListener('audio:external-play', this._onExternalPlay);
    document.removeEventListener('audio:external-pause', this._onExternalPause);
    document.removeEventListener('audio:external-seek', this._onExternalSeek);
    document.removeEventListener('audio:next', this._onExternalNext);
    document.removeEventListener('audio:prev', this._onExternalPrev);
  }

  _setExternalTrack(detail) {
    const track = {
      src: detail.src,
      title: detail.title || this._titleFromSrc(detail.src, 1),
      artist: detail.artist || '',
    };
    this._tracks = [track];
    this._shuffleOrder = [0];
    this._currentIndex = 0;
    this._audio.src = track.src;
    this._audio.load();
    this._renderList();
    this._updateMeta();
    this._updateLoopMode();
  }

  _currentTrack() {
    return this._tracks[this._currentIndex] || null;
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --ap-bg: #0d0d12;
          --ap-surface: #16161f;
          --ap-surface2: #1e1e2a;
          --ap-accent: #8b5cf6;
          --ap-accent-dim: #6d3fcf;
          --ap-text: #f0eaff;
          --ap-text-muted: #9d8fc4;
          --ap-radius: 12px;
          --ap-font: 'DM Sans', 'Segoe UI', system-ui, sans-serif;

          display: block;
          width: 100%;
          height: 100%;
          font-family: var(--ap-font);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .player {
          background: var(--ap-bg);
          border: 1px solid rgba(139,92,246,0.30);
          border-radius: var(--ap-radius);
          width: 100%;
          height: 100%;
          padding: 20px;
          color: var(--ap-text);
          user-select: none;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .player::before {
          content: '';
          position: absolute;
          top: -60px;
          left: 50%;
          transform: translateX(-50%);
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%);
          pointer-events: none;
        }

        .meta {
          text-align: center;
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

        .progress-wrap {
          position: relative;
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

        .progress-track:hover {
          height: 6px;
          margin-top: -1px;
        }

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

        .controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
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

        .btn:hover {
          color: var(--ap-text);
          transform: scale(1.1);
        }

        .btn:active {
          transform: scale(0.95);
        }

        .btn--play {
          width: 48px;
          height: 48px;
          background: var(--ap-accent);
          color: #000;
          border-radius: 50%;
          transition: background 0.15s, transform 0.1s;
        }

        .btn--play:hover {
          background: #a78bfa;
          color: #000;
          transform: scale(1.06);
        }

        .transport-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }

        .volume-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .volume-icon {
          color: var(--ap-text-muted);
          flex-shrink: 0;
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
          background: var(--ap-text);
          border-radius: 50%;
          transition: background 0.15s, transform 0.1s;
        }

        input[type=range]:hover::-webkit-slider-thumb {
          background: var(--ap-accent);
          transform: scale(1.2);
        }

        input[type=range]::-moz-range-thumb {
          width: 12px;
          height: 12px;
          background: var(--ap-text);
          border-radius: 50%;
          border: none;
        }

        .playlist-shell {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          border-top: 1px solid rgba(139,92,246,0.12);
          padding-top: 12px;
          gap: 8px;
        }

        .playlist-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .playlist-title {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ap-text-muted);
        }

        .playlist-meta {
          font-size: 11px;
          color: var(--ap-text-muted);
        }

        .playlist-controls {
          display: flex;
          gap: 4px;
        }

        .ctrl-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--ap-text-muted);
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          transition: color 0.15s, background 0.15s;
          outline: none;
        }

        .ctrl-btn:hover {
          color: var(--ap-text);
          background: rgba(255,255,255,0.04);
        }

        .ctrl-btn.active {
          color: var(--ap-accent);
        }

        .playlist-now {
          font-size: 12px;
          line-height: 1.35;
          color: var(--ap-text);
          min-height: 32px;
        }

        .playlist-now span {
          display: block;
          color: var(--ap-text-muted);
          margin-top: 2px;
          font-size: 11px;
        }

        .list {
          list-style: none;
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(139,92,246,0.3) transparent;
          border: 1px solid rgba(139,92,246,0.12);
          border-radius: 10px;
        }

        .list::-webkit-scrollbar {
          width: 4px;
        }

        .list::-webkit-scrollbar-thumb {
          background: rgba(139,92,246,0.25);
          border-radius: 2px;
        }

        .track {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          cursor: pointer;
          transition: background 0.1s;
          border-bottom: 1px solid rgba(139,92,246,0.08);
        }

        .track:hover {
          background: var(--ap-surface);
        }

        .track:last-child {
          border-bottom: none;
        }

        .track.active {
          background: rgba(139,92,246,0.12);
        }

        .track.active .track__title {
          color: var(--ap-accent);
        }

        .track__num {
          font-size: 11px;
          color: var(--ap-text-muted);
          width: 18px;
          text-align: center;
          flex-shrink: 0;
          font-variant-numeric: tabular-nums;
        }

        .track.active .track__num {
          display: none;
        }

        .track__playing {
          display: none;
          width: 18px;
          flex-shrink: 0;
        }

        .track.active .track__playing {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .bars {
          display: flex;
          align-items: flex-end;
          gap: 2px;
          height: 12px;
        }

        .bar {
          width: 3px;
          background: var(--ap-accent);
          border-radius: 1px;
          animation: bar-bounce 0.8s ease-in-out infinite alternate;
        }

        .bar:nth-child(2) { animation-delay: 0.2s; }
        .bar:nth-child(3) { animation-delay: 0.4s; }

        @keyframes bar-bounce {
          from { height: 3px; }
          to { height: 12px; }
        }

        .track__info {
          flex: 1;
          min-width: 0;
        }

        .track__title {
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--ap-text);
        }

        .track__artist {
          font-size: 11px;
          color: var(--ap-text-muted);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .empty {
          padding: 20px 14px;
          text-align: center;
          font-size: 12px;
          color: var(--ap-text-muted);
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

        <div class="controls transport-row">
          <button class="btn btn--skip" id="btnPrev" title="Précédent">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
            </svg>
          </button>

          <button class="btn btn--play" id="btnPlay" title="Lecture / Pause">
            <svg id="iconPlay" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
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

        <div class="playlist-shell">
          <div class="playlist-header">
            <div>
              <div class="playlist-title">Playlist</div>
              <div class="playlist-meta" id="count"></div>
            </div>
            <div class="playlist-controls">
              <button class="ctrl-btn" id="btnShuffle" title="Aléatoire">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17zm4.76-.82 3.65 3.65-3.65 3.65V13h-1.17l-2.59-2.59 1.41-1.41 1.76 1.76V8.35h1zM4 18.59 5.41 20l5.17-5.17-1.41-1.41zm10.35-3.24V13h1v2.41l3.65-3.65-3.65-3.65v2.24h-1V9l-1.76 1.76-1.41-1.41 2.59-2.59H15V4.59h-1z"/>
                </svg>
              </button>
              <button class="ctrl-btn" id="btnLoop" title="Boucle">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="playlist-now" id="nowPlaying">Aucune piste chargée</div>
          <ul class="list" id="trackList">
            <li class="empty">Aucune piste</li>
          </ul>
        </div>
      </div>
    `;

    this._updateMeta();
    this._renderList();
    this._updateDuration();
    this._updateProgress(0, 0);
    this._updateVolumeUI();
    this._updateControls();
    this._updatePlayButton();
    this._updateLoopMode();
  }

  _bindUIEvents() {
    const $ = (id) => this.shadowRoot.getElementById(id);

    $('btnPlay').addEventListener('click', () => this.toggle());
    $('btnPrev').addEventListener('click', () => this._playPrev());
    $('btnNext').addEventListener('click', () => this._playNext());

    $('progressTrack').addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      this.seek(ratio * this._duration);
    });

    $('progressTrack').addEventListener('mousedown', (e) => {
      this._isSeeking = true;
      const track = e.currentTarget;
      const move = (event) => {
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        this._updateProgress(ratio * this._duration, this._duration);
      };
      const up = (event) => {
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        this.seek(ratio * this._duration);
        this._isSeeking = false;
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });

    $('volumeSlider').addEventListener('input', (e) => {
      this.setVolume(parseFloat(e.target.value));
    });

    $('btnShuffle').addEventListener('click', () => this._toggleShuffle());
    $('btnLoop').addEventListener('click', () => this._toggleLoop());
  }

  _renderList() {
    const list = this.shadowRoot.getElementById('trackList');
    const count = this.shadowRoot.getElementById('count');
    if (!list) return;

    if (count) count.textContent = `${this._tracks.length} titre${this._tracks.length > 1 ? 's' : ''}`;

    if (this._tracks.length === 0) {
      list.innerHTML = '<li class="empty">Aucune piste</li>';
      this._updateNowPlaying();
      return;
    }

    list.innerHTML = this._tracks.map((track, index) => `
      <li class="track ${index === this._currentIndex ? 'active' : ''}" data-index="${index}">
        <span class="track__num">${index + 1}</span>
        <span class="track__playing">
          <span class="bars">
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
          </span>
        </span>
        <div class="track__info">
          <div class="track__title">${this._escape(track.title || 'Sans titre')}</div>
          <div class="track__artist">${this._escape(track.artist || '—')}</div>
        </div>
      </li>
    `).join('');

    list.querySelectorAll('.track').forEach((element) => {
      element.addEventListener('click', () => this._playAt(parseInt(element.dataset.index, 10)));
    });

    this._updateActiveItem(this._currentIndex);
    this._updateNowPlaying();
  }

  _updateMeta() {
    const title = this.shadowRoot.getElementById('title');
    const artist = this.shadowRoot.getElementById('artist');
    if (!title || !artist) return;

    const track = this._currentTrack();
    title.textContent = track?.title || this.getAttribute('title') || '—';
    artist.textContent = track?.artist || this.getAttribute('artist') || '—';
  }

  _updateNowPlaying(message) {
    const nowPlaying = this.shadowRoot.getElementById('nowPlaying');
    if (!nowPlaying) return;

    if (message) {
      nowPlaying.textContent = message;
      return;
    }

    const track = this._currentTrack();
    if (!track) {
      nowPlaying.textContent = 'Aucune piste chargée';
      return;
    }

    nowPlaying.innerHTML = `${this._escape(track.title || 'Sans titre')}<span>${this._escape(track.artist || '—')} · ${this._formatTime(this._currentTime)} / ${this._formatTime(this._duration)}</span>`;
  }

  _updateActiveItem(index) {
    const items = this.shadowRoot.querySelectorAll('.track');
    items.forEach((element, itemIndex) => element.classList.toggle('active', itemIndex === index));
    const active = this.shadowRoot.querySelector('.track.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  _updateControls() {
    const btnShuffle = this.shadowRoot.getElementById('btnShuffle');
    const btnLoop = this.shadowRoot.getElementById('btnLoop');
    if (btnShuffle) btnShuffle.classList.toggle('active', this.hasAttribute('shuffle'));
    if (btnLoop) btnLoop.classList.toggle('active', this.hasAttribute('loop'));
  }

  _updatePlayButton() {
    const play = this.shadowRoot.getElementById('iconPlay');
    const pause = this.shadowRoot.getElementById('iconPause');
    if (!play || !pause) return;
    play.style.display = this._isPlaying ? 'none' : 'block';
    pause.style.display = this._isPlaying ? 'block' : 'none';
  }

  _updateProgress(current, duration) {
    const fill = this.shadowRoot.getElementById('progressFill');
    const ct = this.shadowRoot.getElementById('currentTime');
    if (!fill || !ct) return;
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
    if (slider) slider.value = String(this._volume);
  }

  _toggleShuffle() {
    if (this.hasAttribute('shuffle')) {
      this.removeAttribute('shuffle');
    } else {
      this.setAttribute('shuffle', '');
      this._buildShuffleOrder();
    }
    this._updateControls();
  }

  _toggleLoop() {
    if (this.hasAttribute('loop')) {
      this.removeAttribute('loop');
    } else {
      this.setAttribute('loop', '');
    }
    this._updateLoopMode();
    this._updateControls();
  }

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _formatTime(sec) {
    if (!isFinite(sec)) return '0:00';
    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }
}

customElements.define('audio-player', AudioPlayer);
