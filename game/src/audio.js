// Every sound is synthesised with WebAudio: no audio files, no network. The context is created
// on the first user gesture (browsers block audio before one) and stays silent until then.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let alarmNodes = null;
  let ambientNodes = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return true;
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      startAmbient();
      return true;
    } catch {
      return false;
    }
  }

  /** A low, slow drone under the whole game, so silence never feels dead. */
  function startAmbient() {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 55 * 1.5;
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    const gain2 = ctx.createGain();
    gain2.gain.value = 0.018;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc.connect(gain);
    osc2.connect(gain2);
    gain.connect(master);
    gain2.connect(master);
    osc.start();
    osc2.start();
    lfo.start();
    ambientNodes = { osc, osc2, lfo };
  }

  function tone({ freq, freqEnd, type = 'sine', dur = 0.15, vol = 0.2, delay = 0, pan = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (pan !== 0 && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      osc.connect(panner);
      node = panner;
    }
    node.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst({ dur = 0.07, vol = 0.12, freq = 900, delay = 0, pan = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    let node = src;
    src.connect(filter);
    node = filter;
    if (pan !== 0 && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      filter.connect(panner);
      node = panner;
    }
    node.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  return {
    ensure,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    /** Soft shoe scuff. `pan` is -1 (left) to 1 (right) by the source's screen position. */
    footstep(sneak, pan = 0) {
      if (!ensure()) return;
      noiseBurst({ dur: sneak ? 0.05 : 0.08, vol: sneak ? 0.03 : 0.09, freq: sneak ? 500 : 800, pan });
    },
    /** A guard's heavier boot, heard from a distance. */
    guardStep(distance, pan = 0) {
      if (!ensure()) return;
      const vol = Math.max(0, 0.11 * (1 - distance / 420));
      if (vol <= 0.005) return;
      noiseBurst({ dur: 0.09, vol, freq: 420, pan });
    },
    pickup() {
      if (!ensure()) return;
      tone({ freq: 880, dur: 0.12, vol: 0.18 });
      tone({ freq: 1318, dur: 0.22, vol: 0.16, delay: 0.09 });
    },
    spotted() {
      if (!ensure()) return;
      tone({ freq: 196, type: 'square', dur: 0.14, vol: 0.12 });
      tone({ freq: 262, type: 'square', dur: 0.14, vol: 0.12, delay: 0.12 });
    },
    alarmStart() {
      if (!ensure() || alarmNodes) return;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 620;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 1.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const gain = ctx.createGain();
      gain.gain.value = 0.045;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      lfo.start();
      alarmNodes = { osc, lfo, gain };
    },
    alarmStop() {
      if (!alarmNodes) return;
      try {
        alarmNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        const { osc, lfo } = alarmNodes;
        window.setTimeout(() => {
          try {
            osc.stop();
            lfo.stop();
          } catch {
            // Already stopped.
          }
        }, 300);
      } catch {
        // Audio already torn down.
      }
      alarmNodes = null;
    },
    caught() {
      if (!ensure()) return;
      tone({ freq: 220, freqEnd: 55, type: 'sawtooth', dur: 0.6, vol: 0.2 });
      noiseBurst({ dur: 0.25, vol: 0.15, freq: 300 });
    },
    levelDone() {
      if (!ensure()) return;
      [523, 659, 784, 1047].forEach((freq, i) => tone({ freq, dur: 0.22, vol: 0.16, delay: i * 0.11 }));
    },
    gameDone() {
      if (!ensure()) return;
      [523, 659, 784, 1047, 784, 1047, 1319].forEach((freq, i) => tone({ freq, dur: 0.26, vol: 0.16, delay: i * 0.13 }));
    },
    click() {
      if (!ensure()) return;
      tone({ freq: 660, dur: 0.06, vol: 0.12 });
    },
  };
}
