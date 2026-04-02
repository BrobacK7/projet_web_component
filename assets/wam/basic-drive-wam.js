/**
 * Built-in demo WAM-like module used as a reliable fallback.
 *
 * Export shape is intentionally simple and compatible with audio-wam-effect:
 * - async createInstance({ audioContext })
 * - instance.input / instance.output are AudioNodes
 */

class BasicDriveWam {
  constructor(audioContext) {
    this.audioContext = audioContext;

    this.input = audioContext.createGain();
    this.output = audioContext.createGain();

    this._preGain = audioContext.createGain();
    this._postGain = audioContext.createGain();
    this._shaper = audioContext.createWaveShaper();
    this._tone = audioContext.createBiquadFilter();

    this._preGain.gain.value = 1.8;
    this._postGain.gain.value = 0.75;
    this._tone.type = 'lowpass';
    this._tone.frequency.value = 5200;
    this._tone.Q.value = 0.7;
    this._shaper.curve = this._makeCurve(180);
    this._shaper.oversample = '2x';

    this.input.connect(this._preGain);
    this._preGain.connect(this._shaper);
    this._shaper.connect(this._tone);
    this._tone.connect(this._postGain);
    this._postGain.connect(this.output);
  }

  _makeCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n = 44100;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;

    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }

    return curve;
  }

  destroy() {
    try { this.input.disconnect(); } catch (_) {}
    try { this._preGain.disconnect(); } catch (_) {}
    try { this._shaper.disconnect(); } catch (_) {}
    try { this._tone.disconnect(); } catch (_) {}
    try { this._postGain.disconnect(); } catch (_) {}
    try { this.output.disconnect(); } catch (_) {}
  }
}

export async function createInstance(arg1) {
  const audioContext = arg1?.audioContext || arg1;
  if (!audioContext) {
    throw new Error('createInstance requires an AudioContext');
  }
  return new BasicDriveWam(audioContext);
}
