/**
 * <audio-playlist> Web Component
 *
 * DESIGN DECISIONS:
 * -----------------
 * 1. AUTONOMIE TOTALE : fonctionne sans audio-player.
 *    Émet des CustomEvents, ne connaît pas le player.
 *
 * 2. COMMUNICATION :
 *    Émet  → audio:external-play  { src, title, artist, index }
 *    Émet  → audio:next, audio:prev (boutons skip du player)
 *    Écoute → audio:ended   (passe automatiquement à la suivante)
 *    Écoute → audio:play    (met à jour le track actif affiché)
 *    Écoute → audio:next    (piste suivante)
 *    Écoute → audio:prev    (piste précédente)
 *
 * 3. CONFIGURATION via attributs HTML :
 *    tracks      → JSON array  [{ src, title, artist }]
 *    autoadvance → booléen, passe à la suivante en fin de piste (défaut: true)
 *    loop        → booléen, boucle sur la playlist entière
 *    shuffle     → booléen, ordre aléatoire
 *
 * 4. PAS IMBRIQUÉ dans audio-player : ils sont frères dans la page.
 *    Raison : couplage zéro, chacun peut vivre seul.
 *
 * USAGE :
 *   <audio-playlist
 *     tracks='[{"src":"a.mp3","title":"Track 1","artist":"Artist"}]'
 *     autoadvance loop>
 *   </audio-playlist>
 */

class AudioPlaylist extends HTMLElement {

  static get observedAttributes() {
    return ['tracks', 'autoadvance', 'loop', 'shuffle'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this._tracks       = [];
    this._currentIndex = -1;
    this._shuffleOrder = [];
  }

  // ─── Cycle de vie ────────────────────────────────────────────────────────

  connectedCallback() {
    this._render();
    this._bindExternalEvents();

    if (this.hasAttribute('tracks')) {
      this._loadTracks(this.getAttribute('tracks'));
    }
  }

  disconnectedCallback() {
    this._unbindExternalEvents();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'tracks') this._loadTracks(newVal);
  }

  // ─── Tracks ──────────────────────────────────────────────────────────────

  _loadTracks(json) {
    try {
      this._tracks = JSON.parse(json);
    } catch(e) {
      console.warn('[audio-playlist] tracks JSON invalide:', e);
      this._tracks = [];
    }
    this._shuffleOrder = this._tracks.map((_, i) => i);
    this._renderList();
  }

  _getOrder() {
    if (this.hasAttribute('shuffle')) {
      return [...this._shuffleOrder];
    }
    return this._tracks.map((_, i) => i);
  }

  _playAt(index) {
    if (index < 0 || index >= this._tracks.length) return;
    this._currentIndex = index;
    const track = this._tracks[index];

    document.dispatchEvent(new CustomEvent('audio:external-play', {
      detail: { ...track, index },
      bubbles: true
    }));

    this._updateActiveItem(index);
  }

  _playNext() {
    const order = this._getOrder();
    const pos   = order.indexOf(this._currentIndex);
    const next  = order[pos + 1];

    if (next !== undefined) {
      this._playAt(next);
    } else if (this.hasAttribute('loop')) {
      this._playAt(order[0]);
    }
  }

  _playPrev() {
    const order = this._getOrder();
    const pos   = order.indexOf(this._currentIndex);
    const prev  = order[pos - 1];

    if (prev !== undefined) {
      this._playAt(prev);
    } else if (this.hasAttribute('loop')) {
      this._playAt(order[order.length - 1]);
    }
  }

  _toggleShuffle() {
    if (this.hasAttribute('shuffle')) {
      this.removeAttribute('shuffle');
    } else {
      // Fisher-Yates shuffle
      const arr = this._tracks.map((_, i) => i);
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      this._shuffleOrder = arr;
      this.setAttribute('shuffle', '');
    }
    this._updateControls();
  }

  _toggleLoop() {
    if (this.hasAttribute('loop')) {
      this.removeAttribute('loop');
    } else {
      this.setAttribute('loop', '');
    }
    this._updateControls();
  }

  // ─── Événements externes ─────────────────────────────────────────────────

  _bindExternalEvents() {
    this._onEnded = () => {
      if (!this.hasAttribute('autoadvance') && this.getAttribute('autoadvance') !== 'false') {
        this._playNext();
      } else if (this.hasAttribute('autoadvance')) {
        this._playNext();
      }
    };

    // autoadvance est true par défaut
    this._onEnded = () => this._playNext();

    this._onPlay = (e) => {
      // Sync si le player a changé de src sans passer par la playlist
      if (e.detail?.index !== undefined) {
        this._currentIndex = e.detail.index;
        this._updateActiveItem(e.detail.index);
      }
    };

    this._onNext = () => this._playNext();
    this._onPrev = () => this._playPrev();

    document.addEventListener('audio:ended', this._onEnded);
    document.addEventListener('audio:play',  this._onPlay);
    document.addEventListener('audio:next',  this._onNext);
    document.addEventListener('audio:prev',  this._onPrev);
  }

  _unbindExternalEvents() {
    document.removeEventListener('audio:ended', this._onEnded);
    document.removeEventListener('audio:play',  this._onPlay);
    document.removeEventListener('audio:next',  this._onNext);
    document.removeEventListener('audio:prev',  this._onPrev);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --ap-bg:          #111113;
          --ap-surface:     #1a1a1f;
          --ap-surface2:    #242429;
          --ap-accent:      #1db954;
          --ap-text:        #ffffff;
          --ap-text-muted:  #6b6b7a;
          --ap-radius:      12px;
          --ap-font:        'DM Sans', 'Segoe UI', system-ui, sans-serif;
          --ap-width:       360px;

          display: inline-block;
          font-family: var(--ap-font);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .playlist {
          background: var(--ap-bg);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: var(--ap-radius);
          width: var(--ap-width);
          color: var(--ap-text);
          overflow: hidden;
        }

        /* ── Header ── */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .header__title {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ap-text-muted);
        }
        .header__count {
          font-size: 11px;
          color: var(--ap-text-muted);
        }

        /* ── Controls (shuffle / loop) ── */
        .controls {
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
        .ctrl-btn:hover { color: var(--ap-text); }
        .ctrl-btn.active { color: var(--ap-accent); }

        /* ── Liste ── */
        .list {
          list-style: none;
          max-height: 280px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.1) transparent;
        }
        .list::-webkit-scrollbar { width: 4px; }
        .list::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
        }

        .track {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          cursor: pointer;
          transition: background 0.1s;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          position: relative;
        }
        .track:hover { background: var(--ap-surface); }
        .track:last-child { border-bottom: none; }

        .track.active {
          background: rgba(29, 185, 84, 0.08);
        }
        .track.active .track__title {
          color: var(--ap-accent);
        }

        /* Numéro / icône playing */
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

        /* Bars animation */
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
          to   { height: 12px; }
        }

        .track__info { flex: 1; min-width: 0; }
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

        /* ── Empty state ── */
        .empty {
          padding: 32px 16px;
          text-align: center;
          font-size: 12px;
          color: var(--ap-text-muted);
        }
      </style>

      <div class="playlist">
        <div class="header">
          <span class="header__title">Playlist</span>
          <div style="display:flex;align-items:center;gap:12px">
            <span class="header__count" id="count"></span>
            <div class="controls">
              <!-- Shuffle -->
              <button class="ctrl-btn" id="btnShuffle" title="Aléatoire">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17zm4.76-.82 3.65 3.65-3.65 3.65V13h-1.17l-2.59-2.59 1.41-1.41 1.76 1.76V8.35h1zM4 18.59 5.41 20l5.17-5.17-1.41-1.41zm10.35-3.24V13h1v2.41l3.65-3.65-3.65-3.65v2.24h-1V9l-1.76 1.76-1.41-1.41 2.59-2.59H15V4.59h-1z"/>
                </svg>
              </button>
              <!-- Loop -->
              <button class="ctrl-btn" id="btnLoop" title="Boucle">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <ul class="list" id="trackList">
          <li class="empty">Aucune piste</li>
        </ul>
      </div>
    `;

    this._renderList();
    this._bindUIEvents();
  }

  _renderList() {
    const list = this.shadowRoot.getElementById('trackList');
    const count = this.shadowRoot.getElementById('count');
    if (!list) return;

    if (count) count.textContent = `${this._tracks.length} titre${this._tracks.length > 1 ? 's' : ''}`;

    if (this._tracks.length === 0) {
      list.innerHTML = '<li class="empty">Aucune piste</li>';
      return;
    }

    list.innerHTML = this._tracks.map((track, i) => `
      <li class="track ${i === this._currentIndex ? 'active' : ''}" data-index="${i}">
        <span class="track__num">${i + 1}</span>
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

    // Bind clics
    list.querySelectorAll('.track').forEach(el => {
      el.addEventListener('click', () => {
        this._playAt(parseInt(el.dataset.index));
      });
    });
  }

  _updateActiveItem(index) {
    const items = this.shadowRoot.querySelectorAll('.track');
    items.forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });
    // Scroll vers l'élément actif
    const active = this.shadowRoot.querySelector('.track.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  _updateControls() {
    const btnShuffle = this.shadowRoot.getElementById('btnShuffle');
    const btnLoop    = this.shadowRoot.getElementById('btnLoop');
    if (btnShuffle) btnShuffle.classList.toggle('active', this.hasAttribute('shuffle'));
    if (btnLoop)    btnLoop.classList.toggle('active',    this.hasAttribute('loop'));
  }

  _bindUIEvents() {
    this.shadowRoot.getElementById('btnShuffle')?.addEventListener('click', () => this._toggleShuffle());
    this.shadowRoot.getElementById('btnLoop')?.addEventListener('click',    () => this._toggleLoop());
  }

  _escape(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}

customElements.define('audio-playlist', AudioPlaylist);
