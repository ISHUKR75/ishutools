/**
 * IshuTools.fun — Merge PDF Sound Library v5.0
 * Rich Web Audio API synthesized sounds — no external files needed
 * FM synthesis + envelope shaping + reverb simulation
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'ishu-sounds-v2';
  let _ctx = null;
  let _enabled = true;
  try { _enabled = localStorage.getItem(STORAGE_KEY) !== 'false'; } catch (_) {}

  function getCtx() {
    if (!_ctx) {
      try { _ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); } catch (_) { return null; }
    }
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  }

  function play(fn) {
    if (!_enabled) return;
    try { const c = getCtx(); if (c) fn(c); } catch (_) {}
  }

  /* ── Master gain helper ── */
  function masterGain(ctx, val = 0.5) {
    const g = ctx.createGain();
    g.gain.value = val;
    g.connect(ctx.destination);
    return g;
  }

  /* ── Oscillator with ADSR envelope ── */
  function playOsc(ctx, dest, freq, type, startT, dur, peak, detune = 0, q = 0) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    if (detune) osc.detune.value = detune;

    let node = osc;
    if (q) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      osc.connect(f); node = f;
    }
    node.connect(gain); gain.connect(dest);

    const t = ctx.currentTime + startT;
    const attack = 0.012;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(peak * 0.6, t + attack + dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return { osc, gain };
  }

  /* ── White noise burst ── */
  function playNoise(ctx, dest, startT, dur, peak, lp = 800, hp = 0) {
    const sr = ctx.sampleRate;
    const frames = Math.ceil(sr * dur);
    const buf = ctx.createBuffer(1, frames, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = lp;
    const gain = ctx.createGain();
    const t = ctx.currentTime + startT;
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(gain); gain.connect(dest);
    src.start(t); src.stop(t + dur + 0.05);
    if (hp) { const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = hp; }
  }

  /* ── FM synthesis tone ── */
  function playFM(ctx, dest, carrierFreq, modFreq, modDepth, startT, dur, peak) {
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const car = ctx.createOscillator();
    const carGain = ctx.createGain();

    mod.frequency.value = modFreq; mod.type = 'sine';
    modGain.gain.value = modDepth;
    mod.connect(modGain); modGain.connect(car.frequency);
    car.frequency.value = carrierFreq; car.type = 'sine';
    car.connect(carGain); carGain.connect(dest);

    const t = ctx.currentTime + startT;
    carGain.gain.setValueAtTime(0.0001, t);
    carGain.gain.linearRampToValueAtTime(peak, t + 0.02);
    carGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    mod.start(t); car.start(t);
    mod.stop(t + dur + 0.05); car.stop(t + dur + 0.05);
  }

  /* ══════════════ INDIVIDUAL SOUNDS ══════════════ */

  function playFileAddSound() {
    play(c => {
      const g = masterGain(c, 0.4);
      playOsc(c, g, 600, 'sine', 0, 0.12, 0.7);
      playOsc(c, g, 900, 'sine', 0.04, 0.10, 0.5);
      playOsc(c, g, 1200, 'sine', 0.07, 0.07, 0.25);
    });
  }

  function playFileRemoveSound() {
    play(c => {
      const g = masterGain(c, 0.35);
      playOsc(c, g, 450, 'sine', 0, 0.15, 0.7);
      playOsc(c, g, 280, 'sine', 0.05, 0.14, 0.5);
      playNoise(c, g, 0, 0.1, 0.08, 400);
    });
  }

  function playDragStartSound() {
    play(c => {
      const g = masterGain(c, 0.3);
      playOsc(c, g, 440, 'triangle', 0, 0.08, 0.6);
      playNoise(c, g, 0, 0.06, 0.04, 600);
    });
  }

  function playDragDropSound() {
    play(c => {
      const g = masterGain(c, 0.45);
      playNoise(c, g, 0, 0.06, 0.3, 300);
      playOsc(c, g, 300, 'sine', 0.02, 0.1, 0.5);
      playOsc(c, g, 550, 'sine', 0.04, 0.08, 0.35);
    });
  }

  function playMergeStartSound() {
    play(c => {
      const g = masterGain(c, 0.38);
      [330, 440, 550, 660].forEach((f, i) => playOsc(c, g, f, 'sine', i * 0.07, 0.22, 0.6));
      playFM(c, g, 220, 110, 80, 0, 0.4, 0.2);
    });
  }

  function playSuccessChime() {
    play(c => {
      const g = masterGain(c, 0.45);
      // Rising arpeggio + harmony
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((f, i) => {
        playOsc(c, g, f, 'sine', i * 0.085, 0.55, 0.65);
        if (i < 3) playOsc(c, g, f * 1.5, 'sine', i * 0.085 + 0.01, 0.38, 0.18);
      });
      playFM(c, g, 440, 440, 220, 0.3, 0.6, 0.15);
      playNoise(c, g, 0, 0.12, 0.06, 2000, 800);
    });
  }

  function playErrorSound() {
    play(c => {
      const g = masterGain(c, 0.4);
      playOsc(c, g, 300, 'sawtooth', 0, 0.22, 0.6);
      playOsc(c, g, 220, 'sawtooth', 0.08, 0.2, 0.5);
      playOsc(c, g, 160, 'square', 0.14, 0.18, 0.3);
      playNoise(c, g, 0, 0.08, 0.1, 500);
    });
  }

  function playNotifySound(type) {
    play(c => {
      const g = masterGain(c, 0.32);
      if (type === 'success') {
        playOsc(c, g, 700, 'sine', 0, 0.1, 0.6);
        playOsc(c, g, 1050, 'sine', 0.05, 0.09, 0.4);
      } else if (type === 'error') {
        playOsc(c, g, 320, 'sawtooth', 0, 0.18, 0.6);
        playOsc(c, g, 240, 'sawtooth', 0.07, 0.16, 0.4);
      } else if (type === 'warn') {
        playOsc(c, g, 520, 'triangle', 0, 0.15, 0.6);
        playOsc(c, g, 390, 'triangle', 0.08, 0.12, 0.4);
      } else {
        playOsc(c, g, 660, 'sine', 0, 0.12, 0.5);
      }
    });
  }

  function playExpandSound() {
    play(c => {
      const g = masterGain(c, 0.28);
      playOsc(c, g, 500, 'sine', 0, 0.09, 0.6);
      playOsc(c, g, 750, 'sine', 0.04, 0.07, 0.35);
    });
  }

  function playCollapseSound() {
    play(c => {
      const g = masterGain(c, 0.28);
      playOsc(c, g, 750, 'sine', 0, 0.07, 0.5);
      playOsc(c, g, 500, 'sine', 0.04, 0.09, 0.35);
    });
  }

  function playSortSound() {
    play(c => {
      const g = masterGain(c, 0.3);
      [500, 620, 780].forEach((f, i) => playOsc(c, g, f, 'triangle', i * 0.04, 0.09, 0.5));
    });
  }

  function playPresetSound() {
    play(c => {
      const g = masterGain(c, 0.35);
      [440, 550, 660, 880].forEach((f, i) => playOsc(c, g, f, 'sine', i * 0.04, 0.16, 0.55));
    });
  }

  function playDownloadWhoosh() {
    play(c => {
      const g = masterGain(c, 0.45);
      // Rising sweep
      const osc = c.createOscillator();
      const env = c.createGain();
      osc.type = 'sine';
      osc.connect(env); env.connect(g);
      const t = c.currentTime;
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(1800, t + 0.38);
      env.gain.setValueAtTime(0.001, t);
      env.gain.linearRampToValueAtTime(0.8, t + 0.06);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.start(t); osc.stop(t + 0.46);
      // Noise burst
      playNoise(c, g, 0, 0.32, 0.12, 1200);
      // Confirmation ping
      playOsc(c, g, 1200, 'sine', 0.3, 0.18, 0.3);
    });
  }

  function playCopySound() {
    play(c => {
      const g = masterGain(c, 0.3);
      playOsc(c, g, 800, 'sine', 0, 0.07, 0.6);
      playOsc(c, g, 1100, 'sine', 0.04, 0.06, 0.4);
      playNoise(c, g, 0, 0.05, 0.05, 2000);
    });
  }

  function playMergeAgainSound() {
    play(c => {
      const g = masterGain(c, 0.3);
      playOsc(c, g, 660, 'sine', 0, 0.12, 0.5);
      playOsc(c, g, 440, 'triangle', 0.06, 0.14, 0.4);
    });
  }

  function playToggleOnSound() {
    play(c => {
      const g = masterGain(c, 0.28);
      playOsc(c, g, 700, 'sine', 0, 0.08, 0.7);
      playOsc(c, g, 1050, 'sine', 0.04, 0.07, 0.45);
    });
  }

  function playToggleOffSound() {
    play(c => {
      const g = masterGain(c, 0.28);
      playOsc(c, g, 1050, 'sine', 0, 0.07, 0.5);
      playOsc(c, g, 700, 'sine', 0.04, 0.09, 0.35);
    });
  }

  function playValidateOkSound() {
    play(c => {
      const g = masterGain(c, 0.25);
      playOsc(c, g, 880, 'sine', 0, 0.07, 0.5);
      playOsc(c, g, 1320, 'sine', 0.04, 0.06, 0.3);
    });
  }

  function playValidateErrSound() {
    play(c => {
      const g = masterGain(c, 0.3);
      playOsc(c, g, 280, 'sawtooth', 0, 0.18, 0.5);
    });
  }

  /* ── Controls ── */
  function toggle() {
    _enabled = !_enabled;
    try { localStorage.setItem(STORAGE_KEY, String(_enabled)); } catch (_) {}
    if (_enabled) getCtx();
    return _enabled;
  }
  function isEnabled() { return _enabled; }

  /* ── Export global ── */
  window.SOUNDS = {
    playFileAddSound, playFileRemoveSound, playDragStartSound, playDragDropSound,
    playMergeStartSound, playSuccessChime, playErrorSound, playNotifySound,
    playExpandSound, playCollapseSound, playSortSound, playPresetSound,
    playDownloadWhoosh, playCopySound, playMergeAgainSound,
    playToggleOnSound, playToggleOffSound,
    playValidateOkSound, playValidateErrSound,
    toggle, isEnabled,
  };
})();
