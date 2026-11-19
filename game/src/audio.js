// Synthesized sound for VERANO HEAT: WebAudio only, no audio files.
// Effects are short oscillator/noise bursts; the 4 radio stations are tiny
// step sequencers playing original loops (bass + lead + hats) per station.

export const RADIO_STATIONS = [
  { name: 'SOL FM', style: 'Latin Pop', bpm: 104, root: 55, scale: [0, 3, 5, 7, 10], wave: 'triangle' },
  { name: 'NEON 88', style: 'Synthwave', bpm: 96, root: 49, scale: [0, 2, 3, 7, 10], wave: 'sawtooth' },
  { name: 'BAJO BEAT', style: 'Hip Hop', bpm: 88, root: 41, scale: [0, 3, 5, 7, 10], wave: 'square' },
  { name: 'PALMA JAZZ', style: 'Jazz', bpm: 120, root: 57, scale: [0, 2, 4, 7, 9], wave: 'sine' },
];

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.station = 0;
    this.musicOn = true;
    this.step = 0;
    this.nextStepTime = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  /** Must be called from a user gesture at least once. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.startEngineLoop();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  setStation(i) {
    this.station = ((i % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length;
    this.step = 0;
  }

  stationName() {
    return RADIO_STATIONS[this.station].name;
  }

  startEngineLoop() {
    const c = this.ctx;
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 320;
    this.engineOsc.connect(filt);
    filt.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.sirenOsc = c.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = c.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  /** Per-frame: engine pitch by speed, siren wail by wanted level, radio steps. */
  update(dt, speed01, wanted) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.engineOsc) {
      this.engineOsc.frequency.setTargetAtTime(48 + speed01 * 130, t, 0.08);
      this.engineGain.gain.setTargetAtTime(speed01 > 0.02 ? 0.05 + speed01 * 0.05 : 0.0, t, 0.1);
    }
    if (this.sirenOsc) {
      const wail = wanted > 0 ? 0.028 : 0;
      this.sirenGain.gain.setTargetAtTime(wail, t, 0.3);
      if (wanted > 0) this.sirenOsc.frequency.setTargetAtTime(650 + Math.sin(t * 2.2) * 220, t, 0.1);
    }
    if (!this.musicOn || this.muted) return;
    const st = RADIO_STATIONS[this.station];
    const stepDur = 60 / st.bpm / 2;
    while (this.nextStepTime < t + 0.12) {
      this.playStep(st, this.step, this.nextStepTime, stepDur);
      this.step = (this.step + 1) % 32;
      this.nextStepTime += stepDur;
    }
  }

  playStep(st, step, when, dur) {
    const c = this.ctx;
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // Bass on beats 0, 8, 16, 24 and a pickup.
    if (step % 8 === 0 || step === 14 || step === 30) {
      const deg = st.scale[(step / 8 | 0) % st.scale.length];
      this.note(midi(st.root + deg), when, dur * 2.2, st.wave, 0.5, this.musicGain);
    }
    // Lead pluck on a sparse pattern.
    if (step % 4 === 2) {
      const deg = st.scale[(step * 7 + 3) % st.scale.length];
      this.note(midi(st.root + 24 + deg), when, dur * 0.9, 'sine', 0.22, this.musicGain);
    }
    // Hat tick every other step.
    if (step % 2 === 0) this.noise(when, 0.03, 0.05, this.musicGain, 5200);
  }

  note(freq, when, dur, wave, vol, dest) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = wave;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g);
    g.connect(dest);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  noise(when, dur, vol, dest, freq) {
    const c = this.ctx;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let k = 0; k < len; k++) data[k] = (Math.random() * 2 - 1) * (1 - k / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(when);
  }

  blip(freq, dur, wave, vol) {
    if (!this.ctx || this.muted) return;
    this.note(freq, this.ctx.currentTime, dur, wave, vol, this.sfxGain);
  }

  shot(kind) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    if (kind === 'shotgun') {
      this.noise(t, 0.22, 0.9, this.sfxGain, 300);
      this.note(90, t, 0.18, 'square', 0.5, this.sfxGain);
    } else if (kind === 'rifle') {
      this.noise(t, 0.16, 0.8, this.sfxGain, 500);
      this.note(140, t, 0.1, 'square', 0.4, this.sfxGain);
    } else if (kind === 'smg') {
      this.noise(t, 0.08, 0.55, this.sfxGain, 900);
    } else {
      this.noise(t, 0.12, 0.7, this.sfxGain, 700);
    }
  }

  hit() { this.blip(180, 0.08, 'square', 0.3); }
  pickup() { this.blip(660, 0.09, 'sine', 0.35); this.blip(990, 0.12, 'sine', 0.3); }
  cash() { this.blip(880, 0.08, 'sine', 0.35); setTimeout(() => this.blip(1320, 0.14, 'sine', 0.35), 70); }
  fail() { this.blip(220, 0.25, 'sawtooth', 0.3); }
  mission() {
    this.blip(523, 0.12, 'triangle', 0.4);
    setTimeout(() => this.blip(659, 0.12, 'triangle', 0.4), 110);
    setTimeout(() => this.blip(784, 0.22, 'triangle', 0.4), 220);
  }
  crash() {
    if (!this.ctx || this.muted) return;
    this.noise(this.ctx.currentTime, 0.3, 0.7, this.sfxGain, 180);
  }
  door() { this.blip(300, 0.07, 'square', 0.25); }
}
