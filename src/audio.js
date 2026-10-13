// "Midnight Detour": an original 16-bar loop, composed for this game.
// D major, 148 BPM. Two contrasting phrases over D / Bm / G / A.
const MELODY = [
  78,0,81,78,76,74,76,0, 78,81,83,81,78,76,74,0,
  78,0,81,83,86,83,81,78, 76,78,81,78,76,0,73,0,
  74,78,81,0,83,81,78,76, 74,0,71,74,78,76,74,0,
  73,76,81,83,81,76,73,71, 73,0,76,0,81,0,0,0,
  86,0,85,81,83,0,81,78, 81,83,86,83,81,78,76,0,
  78,81,83,0,86,88,86,83, 81,0,78,76,78,81,78,0,
  79,0,83,86,85,83,81,79, 78,0,76,74,71,74,76,0,
  73,76,81,0,83,81,78,76, 74,0,78,0,81,0,74,0,
];
const CHORDS = [[50,57,62,66],[50,57,62,66],[47,54,59,62],[47,54,59,62],[43,50,55,59],[43,50,55,59],[45,52,57,61],[45,52,57,61],
  [50,57,62,66],[50,57,62,66],[47,54,59,62],[47,54,59,62],[43,50,55,59],[43,50,55,59],[45,52,57,61],[50,57,62,66]];
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

export class ArcadeAudio {
  constructor() { this.muted = false; this.playing = false; this.step = 0; this.timer = null; this.available = true; }
  async unlock() {
    try {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) { this.available = false; return; }
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : .45;
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -18; compressor.ratio.value = 4;
        this.master.connect(compressor); compressor.connect(this.ctx.destination);
        this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * .3, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch { this.available = false; }
  }
  tone(midi, when, length, type = 'square', volume = .08, slide = null) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency(midi), when);
    if (slide !== null) osc.frequency.exponentialRampToValueAtTime(frequency(slide), when + length);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + .006);
    gain.gain.exponentialRampToValueAtTime(.001, when + length);
    osc.connect(gain); gain.connect(this.master); osc.start(when); osc.stop(when + length + .015);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  noise(when, length, volume = .035, cutoff = 7000) {
    if (!this.ctx) return;
    const source = this.ctx.createBufferSource(), gain = this.ctx.createGain(), filter = this.ctx.createBiquadFilter();
    source.buffer = this.noiseBuffer; filter.type = 'highpass'; filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, when); gain.gain.exponentialRampToValueAtTime(.001, when + length);
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start(when); source.stop(when + length);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  start() {
    if (!this.ctx || this.playing) return;
    this.playing = true; this.nextNote = this.ctx.currentTime + .06;
    this.timer = setInterval(() => this.schedule(), 30); this.schedule();
  }
  schedule() {
    if (!this.playing || this.ctx.state !== 'running') return;
    const eighth = 60 / 148 / 2;
    if (this.nextNote < this.ctx.currentTime - .2) this.nextNote = this.ctx.currentTime + .02;
    while (this.nextNote < this.ctx.currentTime + .12) {
      const i = this.step % MELODY.length, chord = CHORDS[Math.floor(i / 8)], beat = i % 8, t = this.nextNote;
      if (MELODY[i]) this.tone(MELODY[i], t, eighth * .79, 'square', .055);
      if (beat % 2 === 0) this.tone(chord[beat === 4 ? 1 : 0] - 12, t, eighth * 1.6, 'triangle', .23);
      this.tone(chord[1 + beat % 3], t, eighth * .52, 'triangle', .07);
      if (beat === 0 || beat === 4) this.tone(42, t, .12, 'sine', .25, 20);
      if (beat === 2 || beat === 6) this.noise(t, .075, .08, 1400);
      this.noise(t, .028, beat % 2 ? .025 : .042, 6500);
      this.nextNote += eighth; this.step++;
    }
  }
  pause() { this.playing = false; clearInterval(this.timer); this.timer = null; }
  setMuted(value) {
    this.muted = value;
    if (this.ctx) this.master.gain.setTargetAtTime(value ? 0 : .45, this.ctx.currentTime, .025);
  }
  effect(name) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    if (name === 'flag') [81,86,90].forEach((n,i) => this.tone(n,t+i*.05,.12,'square',.1));
    if (name === 'special') [74,78,81,86,90].forEach((n,i) => this.tone(n,t+i*.06,.18,'square',.1));
    if (name === 'fuel') [62,66,69,74].forEach((n,i) => this.tone(n,t+i*.065,.18,'triangle',.22));
    if (name === 'smoke') { this.noise(t,.27,.2,500); this.tone(50,t,.25,'triangle',.15,30); }
    if (name === 'crash') { this.noise(t,.29,.3,100); this.tone(50,t,.35,'sawtooth',.13,25); }
    if (name === 'start') [50,57,62,66,69,74].forEach((n,i) => this.tone(n,t+i*.065,.17,'square',.08));
    if (name === 'clear') [74,78,81,86,81,86,90,93].forEach((n,i) => this.tone(n,t+i*.1,.24,'square',.09));
  }
}
