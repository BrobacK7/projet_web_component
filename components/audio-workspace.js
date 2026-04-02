/**
 * <audio-workspace> Web Component
 * Layout : sidebar + fenêtres flottantes draggables/resizables
 * - Sidebar avec tous les modules
 * - Player spawné automatiquement au démarrage
 * - Corde jaune animée reliant les fenêtres ouvertes
 */
class AudioWorkspace extends HTMLElement {

  static get DEFAULT_MODULES() {
    return [
      { tag: 'audio-player',     label: 'Player',     icon: 'PLY', attrs: { src: './assets/demo/sonic.mp3', title: 'Sonic', artist: 'Demo' } },
      { tag: 'audio-equalizer',  label: 'Equalizer',  icon: 'EQ'  },
      { tag: 'audio-visualizer', label: 'Visualizer', icon: 'VIZ', attrs: { mode: 'fft', fftsize: '256' } },
      { tag: 'audio-reverb',     label: 'Reverb',     icon: 'REV' },
      { tag: 'audio-wam-effect', label: 'WAM Effect', icon: 'WAM', attrs: { src: './assets/wam/basic-drive-wam.js', mix: '1' } },
    ];
  }

  constructor() {
    super();
    this._windows  = [];
    this._zCounter = 100;
    this._nextId   = 0;
    this._modules  = AudioWorkspace.DEFAULT_MODULES;
    this._canvas   = null;
    this._svg      = null;
    this._rafId    = null;
  }

  connectedCallback() {
    if (this.hasAttribute('modules')) {
      try { this._modules = JSON.parse(this.getAttribute('modules')); } catch(e) {}
    }
    this._injectStyles();
    this._render();
    this._startRope();

    // Spawn le player automatiquement dès qu'il est défini
    customElements.whenDefined('audio-player').then(() => {
      const mod = this._modules.find(m => m.tag === 'audio-player');
      if (mod) this._spawnWindow(mod);
    });
  }

  disconnectedCallback() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  // ─── Styles ────────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('aw-styles')) return;
    const s = document.createElement('style');
    s.id = 'aw-styles';
    s.textContent = `
      audio-workspace {
        display: flex;
        width: 100%;
        height: 100vh;
        overflow: hidden;
        background: #f2f4f8;
        font-family: 'DM Sans', system-ui, sans-serif;
        position: relative;
      }
      .aw-sidebar {
        width: 200px;
        flex-shrink: 0;
        background: #ffffff;
        border-right: 1px solid #d4d9e2;
        display: flex;
        flex-direction: column;
        z-index: 9999;
        overflow-y: auto;
        user-select: none;
      }
      .aw-sidebar-header {
        padding: 16px;
        border-bottom: 1px solid #e3e7ee;
      }
      .aw-sidebar-title {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #4c5a72;
      }
      .aw-module-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 16px;
        cursor: pointer;
        color: #334155;
        font-size: 13px;
        border: none;
        background: none;
        width: 100%;
        text-align: left;
        transition: color .15s, background .15s;
        font-family: inherit;
      }
      .aw-module-btn:hover { color: #0f172a; background: #eef3fb; }
      .aw-badge {
        font-size: 8px;
        font-weight: 700;
        background: #eef3fb;
        border: 1px solid #c7d5ea;
        border-radius: 4px;
        padding: 2px 5px;
        letter-spacing: 0.04em;
        flex-shrink: 0;
        color: #3f4d66;
        min-width: 30px;
        text-align: center;
      }
      .aw-canvas {
        flex: 1;
        position: relative;
        overflow: hidden;
      }
      .aw-rope-svg {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none;
        z-index: 50;
      }
      .aw-hint {
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        color: #8b96ab;
        pointer-events: none;
        user-select: none;
      }
      .aw-hint-icon { font-size: 40px; margin-bottom: 12px; }
      .aw-hint-text { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
      .aw-window {
        position: absolute;
        min-width: 200px;
        min-height: 100px;
        background: #ffffff;
        border: 1px solid #ccd4e2;
        border-radius: 12px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);
      }
      .aw-window.focused {
        border-color: #7aa4e8;
        box-shadow: 0 14px 38px rgba(37, 99, 235, 0.24);
      }
      .aw-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: #f7f9fc;
        border-bottom: 1px solid #dde4ef;
        cursor: grab;
        user-select: none;
        flex-shrink: 0;
      }
      .aw-titlebar:active { cursor: grabbing; }
      .aw-titlebar-left { display: flex; align-items: center; gap: 8px; }
      .aw-titlebar-icon {
        font-size: 8px; font-weight: 700;
        background: #e7edf8; border-radius: 4px;
        padding: 2px 5px; color: #3f4d66; letter-spacing: 0.04em;
      }
      .aw-titlebar-label { font-size: 11px; font-weight: 600; color: #1f2937; letter-spacing: 0.05em; }
      .aw-close-btn {
        width: 14px; height: 14px;
        border-radius: 50%; background: #bec7d8;
        border: none; cursor: pointer;
        color: #4f5d75; font-size: 8px;
        transition: background .15s, color .15s;
        padding: 0; line-height: 14px;
        text-align: center; display: block;
      }
      .aw-close-btn:hover { background: #ff5f56; color: rgba(0,0,0,0.75); }
      .aw-window-content {
        flex: 1; overflow: auto;
        display: flex; align-items: stretch;
      }
      .aw-window-content > * {
        flex: 1 1 auto;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
      }
      .aw-resize {
        position: absolute; bottom: 0; right: 0;
        width: 18px; height: 18px;
        cursor: nwse-resize;
        display: flex; align-items: flex-end; justify-content: flex-end;
        padding: 4px; color: #7d8ea8; font-size: 12px; line-height: 1;
      }
      .aw-resize:hover { color: #4c6fa3; }
      @keyframes aw-dash {
        from { stroke-dashoffset: 200; }
        to   { stroke-dashoffset: 0; }
      }
    `;
    document.head.appendChild(s);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  _render() {
    this.innerHTML = '';

    // Sidebar
    const sidebar = document.createElement('div');
    sidebar.className = 'aw-sidebar';

    const hdr = document.createElement('div');
    hdr.className = 'aw-sidebar-header';
    hdr.innerHTML = '<div class="aw-sidebar-title">Modules</div>';
    sidebar.appendChild(hdr);

    this._modules.forEach(mod => {
      const btn = document.createElement('button');
      btn.className = 'aw-module-btn';
      btn.innerHTML = `<span class="aw-badge">${mod.icon || '?'}</span><span>${mod.label || mod.tag}</span>`;
      btn.addEventListener('click', () => this._spawnWindow(mod));
      sidebar.appendChild(btn);
    });

    // Canvas
    const canvas = document.createElement('div');
    canvas.className = 'aw-canvas';
    this._canvas = canvas;

    // SVG overlay pour la corde jaune
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('aw-rope-svg');
    // Defs : gradient + glow filter
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <linearGradient id="aw-rope-grad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stop-color="#ffff00" stop-opacity="0.9"/>
        <stop offset="50%"  stop-color="#ffcc00" stop-opacity="1"/>
        <stop offset="100%" stop-color="#ffff00" stop-opacity="0.9"/>
      </linearGradient>
      <filter id="aw-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    `;
    svg.appendChild(defs);
    this._svg = svg;
    canvas.appendChild(svg);

    // Hint
    const hint = document.createElement('div');
    hint.className = 'aw-hint';
    hint.id = 'aw-hint';
    hint.innerHTML = '<div class="aw-hint-icon">&#9672;</div><div class="aw-hint-text">Ajoute un module depuis le panneau</div>';
    canvas.appendChild(hint);

    this.appendChild(sidebar);
    this.appendChild(canvas);
  }

  // ─── Corde jaune animée ────────────────────────────────────────────────────

  _startRope() {
    const draw = () => {
      this._drawRope();
      this._rafId = requestAnimationFrame(draw);
    };
    this._rafId = requestAnimationFrame(draw);
  }

  _drawRope() {
    if (!this._svg || this._windows.length < 2) {
      // Pas assez de fenêtres : efface les cordes
      const old = this._svg ? this._svg.querySelectorAll('.aw-rope-path') : [];
      old.forEach(el => el.remove());
      return;
    }

    // Supprime les anciennes cordes
    this._svg.querySelectorAll('.aw-rope-path').forEach(el => el.remove());

    // Calcule le centre de chaque fenêtre (relatif au canvas)
    const centers = this._windows.map(w => {
      const r = w.el.getBoundingClientRect();
      const cr = this._canvas.getBoundingClientRect();
      return {
        x: r.left - cr.left + r.width  / 2,
        y: r.top  - cr.top  + r.height / 2,
      };
    });

    // Trace une corde entre chaque paire consécutive
    for (let i = 0; i < centers.length - 1; i++) {
      const a = centers[i];
      const b = centers[i + 1];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 + 40; // courbure vers le bas

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('aw-rope-path');
      path.setAttribute('d', `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'url(#aw-rope-grad)');
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('filter', 'url(#aw-glow)');
      path.setAttribute('stroke-dasharray', '8 4');
      path.style.animation = 'aw-dash 1.5s linear infinite';
      this._svg.appendChild(path);
    }
  }

  // ─── Fenêtres ──────────────────────────────────────────────────────────────

  _spawnWindow(mod) {
    // Single-instance rule: one window per component tag.
    const existing = this._windows.find(w => w.mod?.tag === mod.tag);
    if (existing) {
      this._focusWindow(existing.id);
      return;
    }

    const id = ++this._nextId;

    const hint = document.getElementById('aw-hint');
    if (hint) hint.style.display = 'none';

    const offset = (this._windows.length % 8) * 24;

    const win = document.createElement('div');
    win.className = 'aw-window';
    win.dataset.id = id;
    const initialSize = this._getInitialWindowSize(mod.tag);
    win.style.width = initialSize.width + 'px';
    win.style.height = initialSize.height + 'px';
    win.style.left   = (20 + offset) + 'px';
    win.style.top    = (20 + offset) + 'px';
    win.style.zIndex = ++this._zCounter;

    // Titlebar
    const titlebar = document.createElement('div');
    titlebar.className = 'aw-titlebar';

    const tleft = document.createElement('div');
    tleft.className = 'aw-titlebar-left';
    tleft.innerHTML = `<span class="aw-titlebar-icon">${mod.icon}</span><span class="aw-titlebar-label">${mod.label}</span>`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'aw-close-btn';
    closeBtn.title = 'Fermer';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this._closeWindow(id); });

    titlebar.appendChild(tleft);
    titlebar.appendChild(closeBtn);

    // Contenu
    const content = document.createElement('div');
    content.className = 'aw-window-content';
    const component = document.createElement(mod.tag);
    if (mod.attrs) Object.entries(mod.attrs).forEach(([k, v]) => component.setAttribute(k, v));
    this._fitComponentToWindow(component);
    content.appendChild(component);

    // Resize handle
    const rh = document.createElement('div');
    rh.className = 'aw-resize';
    rh.textContent = '◢';

    win.appendChild(titlebar);
    win.appendChild(content);
    win.appendChild(rh);
    this._canvas.appendChild(win);

    this._windows.push({ id, el: win, mod });

    win.addEventListener('mousedown', () => this._focusWindow(id));
    this._makeDraggable(win, titlebar);
    this._makeResizable(win, rh);
    this._focusWindow(id);
  }

  _closeWindow(id) {
    const idx = this._windows.findIndex(w => w.id === id);
    if (idx === -1) return;
    this._windows[idx].el.remove();
    this._windows.splice(idx, 1);
    if (this._windows.length === 0) {
      const hint = document.getElementById('aw-hint');
      if (hint) hint.style.display = '';
    }
  }

  _focusWindow(id) {
    this._windows.forEach(w => w.el.classList.remove('focused'));
    const win = this._windows.find(w => w.id === id);
    if (!win) return;
    win.el.classList.add('focused');
    win.el.style.zIndex = ++this._zCounter;
  }

  // ─── Drag & Resize ─────────────────────────────────────────────────────────

  _makeDraggable(win, handle) {
    let sX, sY, sL, sT;
    const down = (e) => {
      if (e.target.classList.contains('aw-close-btn')) return;
      e.preventDefault();
      sX = e.clientX; sY = e.clientY;
      sL = parseInt(win.style.left) || 0;
      sT = parseInt(win.style.top)  || 0;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };
    const move = (e) => {
      const cw = this._canvas.clientWidth;
      const ch = this._canvas.clientHeight;
      win.style.left = Math.max(0, Math.min(cw - win.offsetWidth,  sL + e.clientX - sX)) + 'px';
      win.style.top  = Math.max(0, Math.min(ch - win.offsetHeight, sT + e.clientY - sY)) + 'px';
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    handle.addEventListener('mousedown', down);
  }

  _makeResizable(win, handle) {
    let sX, sY, sW, sH;
    const down = (e) => {
      e.preventDefault(); e.stopPropagation();
      sX = e.clientX; sY = e.clientY;
      sW = win.offsetWidth; sH = win.offsetHeight;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };
    const move = (e) => {
      win.style.width  = Math.max(200, sW + e.clientX - sX) + 'px';
      win.style.height = Math.max(80,  sH + e.clientY - sY) + 'px';

      const component = win.querySelector('.aw-window-content > *');
      if (component) this._fitComponentToWindow(component);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    handle.addEventListener('mousedown', down);
  }

  _fitComponentToWindow(component) {
    component.style.display = 'block';
    component.style.width = '100%';
    component.style.height = '100%';
    component.style.minWidth = '0';
    component.style.minHeight = '0';
    component.style.setProperty('--ap-width', '100%');
  }

  _getInitialWindowSize(tag) {
    const sizes = {
      'audio-player': { width: 430, height: 520 },
      'audio-equalizer': { width: 420, height: 360 },
      'audio-visualizer': { width: 420, height: 280 },
      'audio-reverb': { width: 390, height: 240 },
      'audio-wam-effect': { width: 420, height: 260 },
    };
    return sizes[tag] || { width: 390, height: 300 };
  }
}

customElements.define('audio-workspace', AudioWorkspace);
