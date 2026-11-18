// Audio — every sound is synthesized with the Web Audio API. No audio files:
// engine hum (sawtooth + lowpass), gunshots (noise burst), sirens (alternating
// sines), UI clicks, cash chimes, and a soft ambient pad.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      started = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function noiseBuffer(seconds) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function shot() {
    if (!ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.18);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }

  function click() {
    if (!ensure()) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 880;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    o.connect(g).connect(master);
    o.start();
    o.stop(ctx.currentTime + 0.09);
  }

  function chime() {
    if (!ensure()) return;
    [660, 880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      const t = ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.4);
    });
  }

  function thud() {
    if (!ensure()) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    o.connect(g).connect(master);
    o.start();
    o.stop(ctx.currentTime + 0.15);
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    engineOsc.connect(filter).connect(engineGain).connect(master);
    engineOsc.start();
  }

  function setEngine(speedNorm, driving) {
    if (!engineOsc) return;
    const target = driving ? 0.05 + speedNorm * 0.1 : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(50 + speedNorm * 130, ctx.currentTime, 0.08);
  }

  function setSiren(on) {
    if (!ensure()) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.05;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 1.1;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain).connect(sirenOsc.frequency);
      sirenOsc.frequency.value = 800;
      lfo.start();
      sirenOsc.userData = { lfo };
    } else if (!on && sirenOsc) {
      try { sirenOsc.userData.lfo.stop(); sirenOsc.stop(); } catch (e) { /* already stopped */ }
      sirenOsc = null;
    }
  }

  return { unlock, shot, click, chime, thud, startEngine, setEngine, setSiren, get started() { return started; } };
}
