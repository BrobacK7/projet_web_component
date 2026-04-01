/**
 * <audio-bus-diagram> Web Component
 *
 * Displays a visual representation of the audio graph:
 * insertInput -> [effects chain] -> insertOutput -> masterGain -> destination
 *
 * Read-only component showing current audio routing.
 */

class AudioBusDiagram extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._ready = false;
  }

  connectedCallback() {
    this._render();
    this._onBusReady = () => {
      this._ready = true;
      this._draw();
    };
    document.addEventListener('audiobus:ready', this._onBusReady);
    if (window.AudioBus?.context) {
      this._ready = true;
      this._draw();
    }
  }

  disconnectedCallback() {
    document.removeEventListener('audiobus:ready', this._onBusReady);
  }

  _draw() {
    const svg = this.shadowRoot.getElementById('diagram');
    if (!svg || !this._ready) return;

    const W = 340;
    const H = 160;

    // Clear
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', W);
    bg.setAttribute('height', H);
    bg.setAttribute('fill', 'rgba(139,92,246,0.04)');
    svg.appendChild(bg);

    const nodes = [
      { x: 20, y: 80, label: 'insertInput', color: '#a78bfa' },
      { x: 100, y: 40, label: 'effects', color: '#e879f9' },
      { x: 180, y: 80, label: 'insertOutput', color: '#a78bfa' },
      { x: 260, y: 80, label: 'masterGain', color: '#c084fc' },
      { x: 340, y: 80, label: 'dest', color: '#f0abfc' },
    ];

    // Draw connections (paths with arrows)
    const connections = [
      [0, 1],  // insertInput -> effects
      [1, 2],  // effects -> insertOutput
      [2, 3],  // insertOutput -> masterGain
      [3, 4],  // masterGain -> destination
    ];

    connections.forEach(([from, to]) => {
      const nf = nodes[from];
      const nt = nodes[to];

      // Path
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const d = `M ${nf.x + 45} ${nf.y} Q ${(nf.x + nt.x) / 2} ${(nf.y + nt.y) / 2 - 20} ${nt.x} ${nt.y}`;
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'rgba(139,92,246,0.7)');
      path.setAttribute('stroke-width', '2');
      svg.appendChild(path);

      // Arrowhead
      const arrowX = nt.x - 8;
      const arrowY = nt.y;
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      arrow.setAttribute('points', `${arrowX},${arrowY - 5} ${arrowX + 10},${arrowY} ${arrowX},${arrowY + 5}`);
      arrow.setAttribute('fill', 'rgba(167,139,250,0.9)');
      svg.appendChild(arrow);
    });

    // Draw nodes (boxes)
    nodes.forEach((n) => {
      const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      box.setAttribute('x', n.x - 20);
      box.setAttribute('y', n.y - 18);
      box.setAttribute('width', '40');
      box.setAttribute('height', '36');
      box.setAttribute('rx', '6');
      box.setAttribute('fill', 'rgba(0,0,0,0.3)');
      box.setAttribute('stroke', n.color);
      box.setAttribute('stroke-width', '1.5');
      svg.appendChild(box);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', n.x);
      text.setAttribute('y', n.y + 1);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '9');
      text.setAttribute('fill', n.color);
      text.setAttribute('font-weight', '600');
      text.textContent = n.label;
      text.setAttribute('pointer-events', 'none');
      svg.appendChild(text);
    });

    // Title
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', 10);
    title.setAttribute('y', 20);
    title.setAttribute('font-size', '11');
    title.setAttribute('fill', 'rgba(200,185,255,0.8)');
    title.setAttribute('font-weight', '600');
    title.textContent = 'Audio Graph';
    svg.appendChild(title);

    // Legend
    const legend = [
      { label: 'Input', color: '#a78bfa' },
      { label: 'Effects', color: '#e879f9' },
      { label: 'Master', color: '#c084fc' },
    ];
    legend.forEach((item, i) => {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', 280 + i * 50);
      dot.setAttribute('cy', 20);
      dot.setAttribute('r', '3');
      dot.setAttribute('fill', item.color);
      svg.appendChild(dot);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', 286 + i * 50);
      text.setAttribute('y', 24);
      text.setAttribute('font-size', '8');
      text.setAttribute('fill', 'rgba(180,160,240,0.7)');
      text.textContent = item.label;
      svg.appendChild(text);
    });
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --ap-bg: #0d0d12;
          --ap-surface: #16161f;
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
        .diagram {
          background: var(--ap-bg);
          border: 1px solid rgba(139,92,246,0.30);
          border-radius: var(--ap-radius);
          width: 100%;
          height: 100%;
          padding: 16px;
          display: flex;
          flex-direction: column;
        }
        .title {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ap-text-muted);
          margin-bottom: 12px;
        }
        svg {
          display: block;
          width: 100%;
          height: 100%;
          min-height: 140px;
          flex: 1 1 auto;
          background: var(--ap-surface);
          border-radius: 8px;
        }
      </style>

      <div class="diagram">
        <div class="title">Audio Graph Routing</div>
        <svg id="diagram" viewBox="0 0 340 160" width="340" height="160"></svg>
      </div>
    `;

    requestAnimationFrame(() => this._draw());
  }
}

customElements.define('audio-bus-diagram', AudioBusDiagram);
