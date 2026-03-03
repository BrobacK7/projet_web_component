/**
 * <audio-workspace> Web Component
 * Layout uniquement - fenetres flottantes draggables/resizables
 * Panneau lateral pour spawner les modules audio
 */
class AudioWorkspace extends HTMLElement {
  static get DEFAULT_MODULES() {
    return [
      { tag: 'audio-equalizer',  label: 'Equalizer',  icon: 'EQ' },
      { tag: 'audio-visualizer', label: 'Visualizer', icon: 'VIZ', attrs: { mode: 'fft', fftsize: '256' } },
      { tag: 'audio-reverb',     label: 'Reverb',     icon: 'REV' },
      { tag: 'audio-playlist',   label: 'Playlist',   icon: 'PL'  },
    ];
  }
  constructor() {
    super();
    this._windows  = [];
    this._zCounter = 100;
    this._modules  = AudioWorkspace.DEFAULT_MODULES;
    this._nextId   = 0;
    this._canvas   = null;
  }
  connectedCallback() {
    if (this.hasAttribute('modules')) {
      try { this._modules = JSON.parse(this.getAttribute('modules')); } catch(e) {}
    }
    this._injectStyles();
    this._render();
  }
  _injectStyles() {
    if (document.getElementById('audio-workspace-styles')) return;
    const s = document.createElement('style');
    s.id = 'audio-workspace-styles';
    const r = [];
    r.push("audio-workspace{display:flex;width:100%;height:100vh;overflow:hidden;background:#0c0c0e;font-family:sans-serif;position:relative;}");
    r.push(".aw-sidebar{width:200px;flex-shrink:0;background:#111113;border-right:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;z-index:9999;user-select:none;}");
    r.push(".aw-sidebar-header{padding:16px;border-bottom:1px solid rgba(255,255,255,0.06);}");
    r.push(".aw-sidebar-title{font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#4a4a58;}");
    r.push(".aw-module-btn{display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;color:#6b6b7a;font-size:13px;border:none;background:none;width:100%;text-align:left;transition:color .15s,background .15s;font-family:inherit;}");
    r.push(".aw-module-btn:hover{color:#fff;background:rgba(255,255,255,0.04);}");
    r.push(".aw-badge{font-size:9px;font-weight:700;background:#1a1a1f;border:1px solid rgba(255,255,255,0.08);border-radius:4px;padding:2px 5px;letter-spacing:0.04em;flex-shrink:0;color:#9a9aaa;}");
    r.push(".aw-canvas{flex:1;position:relative;overflow:hidden;}");
    r.push(".aw-window{position:absolute;min-width:200px;min-height:100px;background:#111113;border:1px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.4);}");
    r.push(".aw-window.focused{border-color:rgba(255,255,255,0.2);box-shadow:0 16px 56px rgba(0,0,0,0.7);}");
    r.push(".aw-titlebar{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#1a1a1f;border-bottom:1px solid rgba(255,255,255,0.05);cursor:grab;user-select:none;flex-shrink:0;}");
    r.push(".aw-titlebar:active{cursor:grabbing;}");
    r.push(".aw-titlebar-left{display:flex;align-items:center;gap:8px;}");
    r.push(".aw-titlebar-icon{font-size:9px;font-weight:700;background:#242429;border-radius:4px;padding:2px 5px;color:#6b6b7a;letter-spacing:0.04em;}");
    r.push(".aw-titlebar-label{font-size:11px;font-weight:600;color:#9a9aaa;letter-spacing:0.05em;}");
    r.push(".aw-close-btn{width:14px;height:14px;border-radius:50%;background:#3a3a3f;border:none;cursor:pointer;color:transparent;font-size:8px;transition:background .15s,color .15s;padding:0;line-height:14px;text-align:center;display:block;}");
    r.push(".aw-close-btn:hover{background:#ff5f56;color:rgba(0,0,0,0.8);}");
    r.push(".aw-window-content{flex:1;overflow:auto;display:flex;align-items:flex-start;}");
    r.push(".aw-window-content > *{flex-shrink:0;}");
    r.push(".aw-resize-handle{position:absolute;bottom:0;right:0;width:18px;height:18px;cursor:nwse-resize;display:flex;align-items:flex-end;justify-content:flex-end;padding:4px;color:#2a2a3a;font-size:12px;line-height:1;}");
    r.push(".aw-resize-handle:hover{color:#4a4a5a;}");
    r.push(".aw-empty-hint{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#1e1e2a;pointer-events:none;user-select:none;}");
    r.push(".aw-hint-icon{font-size:40px;margin-bottom:12px;}");
    r.push(".aw-hint-text{font-size:12px;letter-spacing:0.08em;text-transform:uppercase;}");
    s.textContent = r.join('');
    document.head.appendChild(s);
  }
  _render() {
    this.innerHTML = '';
    const sidebar = document.createElement('div');
    sidebar.className = 'aw-sidebar';
    const hdr = document.createElement('div');
    hdr.className = 'aw-sidebar-header';
    hdr.innerHTML = "<div class=\"aw-sidebar-title\">Modules</div>";
    sidebar.appendChild(hdr);
    this._modules.forEach(mod => {
      const btn = document.createElement('button');
      btn.className = 'aw-module-btn';
      btn.innerHTML = "<span class=\"aw-badge\">" + mod.icon + "</span><span>" + mod.label + "</span>";
      btn.addEventListener('click', () => this._spawnWindow(mod));
      sidebar.appendChild(btn);
    });
    const canvas = document.createElement('div');
    canvas.className = 'aw-canvas';
    this._canvas = canvas;
    const hint = document.createElement('div');
    hint.className = 'aw-empty-hint';
    hint.id = 'aw-hint';
    hint.innerHTML = "<div class=\"aw-hint-icon\">&#9672;</div><div class=\"aw-hint-text\">Ajoute un module depuis le panneau</div>";
    canvas.appendChild(hint);
    this.appendChild(sidebar);
    this.appendChild(canvas);
  }
  _spawnWindow(mod) {
    const id = ++this._nextId;
    const hint = this._canvas.querySelector('#aw-hint');
    if (hint) hint.style.display = 'none';
    const offset = (this._windows.length % 8) * 20;
    const win = document.createElement('div');
    win.className = 'aw-window';
    win.dataset.id = id;
    win.style.left   = (20 + offset) + "px";
    win.style.top    = (20 + offset) + "px";
    win.style.zIndex = ++this._zCounter;
    const titlebar = document.createElement('div');
    titlebar.className = 'aw-titlebar';
    const tleft = document.createElement('div');
    tleft.className = 'aw-titlebar-left';
    tleft.innerHTML = "<span class=\"aw-titlebar-icon\">" + mod.icon + "</span><span class=\"aw-titlebar-label\">" + mod.label + "</span>";
    const closeBtn = document.createElement('button');
    closeBtn.className = 'aw-close-btn';
    closeBtn.title = 'Fermer';
    closeBtn.textContent = 'x';
    closeBtn.addEventListener("click", (e) => { e.stopPropagation(); this._closeWindow(id); });
    titlebar.appendChild(tleft);
    titlebar.appendChild(closeBtn);
    const content = document.createElement('div');
    content.className = 'aw-window-content';
    const component = document.createElement(mod.tag);
    if (mod.attrs) Object.entries(mod.attrs).forEach(([k,v]) => component.setAttribute(k,v));
    content.appendChild(component);
    const rh = document.createElement('div');
    rh.className = 'aw-resize-handle';
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
      const hint = this._canvas.querySelector('#aw-hint');
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
  _makeDraggable(win, handle) {
    let sX, sY, sL, sT;
    const down = (e) => {
      if (e.target.classList.contains('aw-close-btn')) return;
      e.preventDefault();
      sX=e.clientX; sY=e.clientY;
      sL=parseInt(win.style.left)||0; sT=parseInt(win.style.top)||0;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };
    const move = (e) => {
      const cw=this._canvas.clientWidth, ch=this._canvas.clientHeight;
      win.style.left = Math.max(0, Math.min(cw-win.offsetWidth,  sL+e.clientX-sX)) + "px";
      win.style.top  = Math.max(0, Math.min(ch-win.offsetHeight, sT+e.clientY-sY)) + "px";
    };
    const up = () => { document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); };
    handle.addEventListener('mousedown', down);
  }
  _makeResizable(win, handle) {
    let sX, sY, sW, sH;
    const down = (e) => {
      e.preventDefault(); e.stopPropagation();
      sX=e.clientX; sY=e.clientY; sW=win.offsetWidth; sH=win.offsetHeight;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };
    const move = (e) => {
      win.style.width  = Math.max(200, sW+e.clientX-sX) + "px";
      win.style.height = Math.max(80,  sH+e.clientY-sY) + "px";
    };
    const up = () => { document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); };
    handle.addEventListener('mousedown', down);
  }
}
customElements.define('audio-workspace', AudioWorkspace);