/**
 * <audio-equalizer> Web Component
 *
 * DESIGN DECISIONS:
 * -----------------
 * 1. AUTONOMIE : fonctionne seul, mais n'a d'effet audio que si window.AudioBus
 *    est présent et que audio-player a déjà initialisé le graphe (insertInput/insertOutput).
 *    Si AudioBus n'est pas prêt, il attend l'event 'audiobus:ready'.
 *
 * 2. GRAPHE AUDIO :
 *    S'insère dans la chaîne via AudioBus.connectEffect(firstFilter, lastFilter) :
 *    insertInput → [band0 → band1 → band2 → band3 → band4] → insertOutput
 *    Chaque bande = BiquadFilterNode (peaking, sauf sub=lowshelf et treble=highshelf)
 *
 * 3. COMMUNICATION :
 *    Écoute → audiobus:ready  (pour se brancher au bon moment)
 *    Pas d'events émis : l'EQ agit directement sur le graphe WebAudio, pas besoin d'events.
 *
 * 4. ATTRIBUTS HTML :
 *    bypass    → booléen, court-circuite l'EQ (toutes les bandes à 0 dB)
 *    gains     → JSON array [0,0,0,0,0] — valeurs initiales en dB (-12 à +12)
 *
 * 5. PAS IMBRIQUÉ dans audio-player : frère dans la page.
 *    Raison : l'EQ est optionnel, doit pouvoir être absent sans casser le player.
 *
 * USAGE :
 *   <audio-equalizer gains='[0,2,-1,0,3]'></audio-equalizer>
 *   <audio-equalizer bypass></audio-equalizer>
 */

class AudioEqualizer extends HTMLElement {

  static get observedAttributes() {
    return ['bypass', 'gains'];
  }

  // 5 bandes : fréquence, type, label
  static get BANDS() {
    return [
      { freq:  60,   type: 'lowshelf',  label: 'Sub',      short: '60' },
      { freq:  250,  type: 'peaking',   label: 'Bass',     short: '250' },
      { freq:  1000, type: 'peaking',   label: 'Mid',      short: '1k' },
      { freq:  4000, type: 'peaking',   label: 'High-Mid', short: '4k' },
      { freq:  12000,type: 'highshelf', label: 'Treble',   short: '12k' },
    ];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this._filters  = [];   // BiquadFilterNode[]
    this._gains    = [0, 0, 0, 0, 0];  // dB par bande
    this._ready    = false;
  }

  // ─── Cycle de vie ────────────────────────────────────────────────────────

  connectedCallback() {
    if (this.hasAttribute('gains')) {
      try { this._gains = JSON.parse(this.getAttribute('gains')); } catch(e) {}
    }

    this._render();
    this._bindUIEvents();
    this._tryConnect();

    // Si AudioBus pas encore prêt (player pas encore joué), on attend
    this._onBusReady = () => this._tryConnect();
    document.addEventListener('audiobus:ready', this._onBusReady);
  }

  disconnectedCallback() {
    document.removeEventListener('audiobus:ready', this._onBusReady);
    this._disconnect();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'bypass') this._applyBypass();
    if (name === 'gains') {
      try { this._gains = JSON.parse(newVal); this._applyGains(); } catch(e) {}
    }
  }

  // ─── Connexion au graphe WebAudio ────────────────────────────────────────

  _tryConnect() {
    const bus = window.AudioBus;
    if (!bus?.context || !bus?.insertInput || !bus?.connectEffect) return;
    if (this._ready) return;

    const ctx = bus.context;

    // Crée les 5 filtres en série
    this._filters = AudioEqualizer.BANDS.map((band, i) => {
      const f = ctx.createBiquadFilter();
      f.type            = band.type;
      f.frequency.value = band.freq;
      f.gain.value      = this._gains[i] ?? 0;
      f.Q.value         = 1.4;
      return f;
    });

    // Chaîne les filtres entre eux
    for (let i = 0; i < this._filters.length - 1; i++) {
      this._filters[i].connect(this._filters[i + 1]);
    }

    // Branche dans le graphe : insertInput → filtre[0] ... filtre[4] → insertOutput
    bus.connectEffect(this._filters[0], this._filters[this._filters.length - 1]);

    this._ready = true;
    this._applyBypass();
  }

  _disconnect() {
    if (!this._ready) return;
    const bus = window.AudioBus;
    if (bus?.bypassEffects) bus.bypassEffects();
    this._filters = [];
    this._ready   = false;
  }

  // ─── Gains ────────────────────────────────────────────────────────────────

  _applyGains() {
    if (!this._ready) return;
    this._filters.forEach((f, i) => {
      const v = this._gains[i] ?? 0;
      f.gain.setTargetAtTime(v, window.AudioBus.context.currentTime, 0.01);
    });
  }

  _applyBypass() {
    if (!this._ready) return;
    const bypass = this.hasAttribute('bypass');
    this._filters.forEach(f => {
      f.gain.setTargetAtTime(bypass ? 0 : this._gains[AudioEqualizer.BANDS.indexOf(
        AudioEqualizer.BANDS.find(b => b.freq === f.frequency.value)
      )] ?? 0, window.AudioBus.context.currentTime, 0.01);
    });
    this._updateBypassBtn();
  }

  _setBand(index, db) {
    this._gains[index] = db;
    if (this._ready && !this.hasAttribute('bypass')) {
      this._filters[index].gain.setTargetAtTime(db, window.AudioBus.context.currentTime, 0.01);
    }
    this._updateDbLabel(index, db);
  }

  _resetAll() {
    this._gains = [0, 0, 0, 0, 0];
    this._applyGains();
    // Reset sliders UI
    this.shadowRoot.querySelectorAll('.slider').forEach((sl, i) => {
      sl.value = 0;
      this._updateDbLabel(i, 0);
      this._updateSliderFill(sl, 0);
    });
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --ap-bg:         #111113;
          --ap-surface:    #1a1a1f;
          --ap-surface2:   #242429;
          --ap-accent:     #1db954;
          --ap-text:       #ffffff;
          --ap-text-muted: #6b6b7a;
          --ap-radius:     12px;
          --ap-font:       'DM Sans', 'Segoe UI', system-ui, sans-serif;
          --ap-width:      360px;

          display: inline-block;
          font-family: var(--ap-font);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .eq {
          background: var(--ap-bg);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: var(--ap-radius);
          width: var(--ap-width);
          padding: 16px;
          color: var(--ap-text);
          user-select: none;
        }

        /* ── Header ── */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .header__title {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ap-text-muted);
        }
        .header__actions {
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .btn-reset {
          background: none;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 4px;
          color: var(--ap-text-muted);
          font-size: 10px;
          font-family: var(--ap-font);
          padding: 3px 8px;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
          letter-spacing: 0.05em;
        }
        .btn-reset:hover { color: var(--ap-text); border-color: rgba(255,255,255,0.2); }

        .btn-bypass {
          background: none;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 4px;
          color: var(--ap-text-muted);
          font-size: 10px;
          font-family: var(--ap-font);
          padding: 3px 8px;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
          letter-spacing: 0.05em;
        }
        .btn-bypass.active {
          background: rgba(29,185,84,0.12);
          color: var(--ap-accent);
          border-color: var(--ap-accent);
        }

        /* ── Bandes ── */
        .bands {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          height: 160px;
          align-items: flex-end;
        }

        .band {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
          height: 100%;
          gap: 6px;
        }

        /* valeur dB en haut */
        .band__db {
          font-size: 10px;
          color: var(--ap-accent);
          font-variant-numeric: tabular-nums;
          height: 14px;
          line-height: 14px;
          transition: color 0.15s;
        }
        .band__db.zero { color: var(--ap-text-muted); }

        /* slider vertical */
        .slider-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          width: 100%;
        }

        input[type=range].slider {
          -webkit-appearance: none;
          appearance: none;
          writing-mode: vertical-lr;
          direction: rtl;
          width: 4px;
          height: 100%;
          background: transparent;
          cursor: pointer;
          outline: none;
          position: relative;
          z-index: 1;
        }

        /* Track background */
        input[type=range].slider::-webkit-slider-runnable-track {
          width: 4px;
          border-radius: 2px;
          background: var(--ap-surface2);
        }
        input[type=range].slider::-moz-range-track {
          width: 4px;
          border-radius: 2px;
          background: var(--ap-surface2);
        }

        /* Thumb */
        input[type=range].slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: var(--ap-text);
          border: 2px solid var(--ap-bg);
          transition: background 0.15s, transform 0.1s;
          margin-left: -5px;
        }
        input[type=range].slider:hover::-webkit-slider-thumb {
          background: var(--ap-accent);
          transform: scale(1.15);
        }
        input[type=range].slider::-moz-range-thumb {
          width: 14px; height: 14px;
          border-radius: 50%;
          background: var(--ap-text);
          border: 2px solid var(--ap-bg);
        }

        /* Ligne du 0 dB */
        .slider-wrap::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 24px;
          height: 1px;
          background: rgba(255,255,255,0.08);
          pointer-events: none;
        }

        /* Label fréquence en bas */
        .band__label {
          font-size: 10px;
          color: var(--ap-text-muted);
          letter-spacing: 0.03em;
        }

        /* État bypass */
        :host([bypass]) .slider { opacity: 0.3; pointer-events: none; }
        :host([bypass]) .band__db { color: var(--ap-text-muted) !important; }

        /* État non connecté */
        .not-connected {
          font-size: 11px;
          color: var(--ap-text-muted);
          text-align: center;
          padding: 8px 0 4px;
          font-style: italic;
        }
      </style>

      <div class="eq">
        <div class="header">
          <span class="header__title">Equalizer</span>
          <div class="header__actions">
            <button class="btn-reset" id="btnReset">Reset</button>
            <button class="btn-bypass" id="btnBypass">Bypass</button>
          </div>
        </div>

        <div class="bands" id="bands">
          ${AudioEqualizer.BANDS.map((band, i) => `
            <div class="band" data-index="${i}">
              <span class="band__db zero" id="db${i}">0 dB</span>
              <div class="slider-wrap">
                <input
                  type="range"
                  class="slider"
                  id="slider${i}"
                  min="-12"
                  max="12"
                  step="0.5"
                  value="${this._gains[i] ?? 0}"
                  aria-label="${band.label}"
                >
              </div>
              <span class="band__label">${band.short}</span>
            </div>
          `).join('')}
        </div>

        <div class="not-connected" id="notConnected" style="display:none">
          ⚡ Lance la lecture pour activer l'EQ
        </div>
      </div>
    `;

    // Affiche le message si pas connecté
    if (!this._ready) {
      this.shadowRoot.getElementById('notConnected').style.display = 'block';
    }

    // Initialise les labels
    this._gains.forEach((g, i) => this._updateDbLabel(i, g));
    this._updateBypassBtn();
  }

  // ─── Binding UI ──────────────────────────────────────────────────────────

  _bindUIEvents() {
    // Sliders
    AudioEqualizer.BANDS.forEach((_, i) => {
      const sl = this.shadowRoot.getElementById(`slider${i}`);
      if (!sl) return;

      sl.addEventListener('input', () => {
        const db = parseFloat(sl.value);
        this._setBand(i, db);
        this._updateSliderFill(sl, db);
      });

      // Init fill
      this._updateSliderFill(sl, this._gains[i] ?? 0);
    });

    // Reset
    this.shadowRoot.getElementById('btnReset')?.addEventListener('click', () => this._resetAll());

    // Bypass
    this.shadowRoot.getElementById('btnBypass')?.addEventListener('click', () => {
      if (this.hasAttribute('bypass')) {
        this.removeAttribute('bypass');
      } else {
        this.setAttribute('bypass', '');
      }
    });
  }

  // ─── Update UI ───────────────────────────────────────────────────────────

  _updateDbLabel(index, db) {
    const el = this.shadowRoot.getElementById(`db${index}`);
    if (!el) return;
    const rounded = Math.round(db * 10) / 10;
    el.textContent = `${rounded > 0 ? '+' : ''}${rounded} dB`;
    el.classList.toggle('zero', db === 0);
  }

  _updateSliderFill(slider, db) {
    // Colore le track entre 0 et la valeur actuelle via CSS gradient
    const pct = ((db - (-12)) / 24) * 100;
    const midPct = ((0 - (-12)) / 24) * 100; // position du 0 dB

    const accent = getComputedStyle(this).getPropertyValue('--ap-accent').trim() || '#1db954';
    const surface2 = '#242429';

    // Pour slider vertical (writing-mode vertical-lr + direction rtl)
    // 100% = bas, 0% = haut. La valeur monte vers le haut.
    if (db >= 0) {
      slider.style.setProperty('--fill',
        `linear-gradient(to top, ${surface2} ${100 - pct}%, ${accent} ${100 - pct}%, ${accent} ${100 - midPct}%, ${surface2} ${100 - midPct}%)`
      );
    } else {
      slider.style.setProperty('--fill',
        `linear-gradient(to top, ${surface2} ${100 - midPct}%, rgba(29,185,84,0.4) ${100 - midPct}%, rgba(29,185,84,0.4) ${100 - pct}%, ${surface2} ${100 - pct}%)`
      );
    }
  }

  _updateBypassBtn() {
    const btn = this.shadowRoot.getElementById('btnBypass');
    if (!btn) return;
    btn.classList.toggle('active', !this.hasAttribute('bypass'));
    btn.textContent = this.hasAttribute('bypass') ? 'Bypassed' : 'Active';
  }
}

customElements.define('audio-equalizer', AudioEqualizer);
