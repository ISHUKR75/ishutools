/**
 * IshuTools.fun — Compress PDF Sounds v2.0
 * Loads MP3s from the shared merge-pdf sounds folder via absolute paths.
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 *
 * Sound map:
 *   fahhhhh              → download / success big moment
 *   waah_kya_scene_hai   → preset selected / compression complete
 *   are_bhai_bhai_bhai   → file added
 *   cameraman_focus_karo → compression starting
 *   eh_eh_eh_ehhhhhh     → error
 *   jaldi_waha_sa_hato   → warning / cancel
 */
(function () {
  'use strict';

  const KEY   = 'ishu-sounds-v3';
  const BASE  = 'sounds/';
  let   _on   = true;
  try { _on = localStorage.getItem(KEY) !== 'false'; } catch (_) {}

  /* ── AudioContext (lazy) ─────────────────────────────────────────────── */
  let _ctx = null;
  function ctx() {
    if (!_ctx) {
      try {
        _ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      } catch (_) { return null; }
    }
    if (_ctx && _ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  }

  /* ── MP3 pool ────────────────────────────────────────────────────────── */
  const _pool = {};
  function _playMp3(file, vol = 0.8, rate = 1.0) {
    if (!_on) return;
    try {
      const key = BASE + file;
      if (!_pool[key]) {
        _pool[key] = new Audio(key);
        _pool[key].preload = 'auto';
      }
      const a = _pool[key].cloneNode();
      a.volume = Math.min(1, Math.max(0, vol));
      a.playbackRate = rate;
      a.play().catch(() => {});
    } catch (_) {}
  }

  /* ── Web Audio helpers ───────────────────────────────────────────────── */
  function osc(c, dest, freq, type, t, dur, peak, a = 0.005, r = 0.12, detune = 0) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur - 0.01);
    o.start(t); o.stop(t + dur + r);
  }

  function noise(c, dest, t, dur, peak, type = 'bandpass', freq = 2000, Q = 1) {
    const sr = c.sampleRate, len = Math.ceil(sr * (dur + 0.05));
    const buf = c.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const flt = c.createBiquadFilter();
    flt.type = type; flt.frequency.value = freq; flt.Q.value = Q;
    const g = c.createGain();
    src.connect(flt); flt.connect(g); g.connect(dest);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t); src.stop(t + dur + 0.05);
  }

  /* ── SOUNDS public API ───────────────────────────────────────────────── */
  const SOUNDS = {

    /* File added sound */
    are_bhai_bhai_bhai() {
      _playMp3('are_bhai_bhai_bhai.mp3', 0.75);
    },

    /* Compression start */
    cameraman_focus_karo() {
      _playMp3('cameraman_focus_karo.mp3', 0.80);
    },

    /* Download / success whoosh */
    fahhhhh() {
      _playMp3('fahhhhh.mp3', 0.90);
    },

    /* Preset selected / success */
    waah_kya_scene_hai() {
      _playMp3('waah_kya_scene_hai.mp3', 0.70);
    },

    /* Error */
    eh_eh_eh_ehhhhhh() {
      _playMp3('eh_eh_eh_ehhhhhh.mp3', 0.75);
    },

    /* Warning / cancel */
    jaldi_waha_sa_hato() {
      _playMp3('jaldi_waha_sa_hato.mp3', 0.65);
    },

    /* Synthetic: soft click for toggles */
    click() {
      const c = ctx(); if (!c) return;
      const g = c.createGain(), t = c.currentTime;
      g.connect(c.destination);
      osc(c, g, 880, 'sine', t, 0.06, 0.07, 0.003, 0.04);
    },

    /* Synthetic: progress ping */
    ping() {
      const c = ctx(); if (!c) return;
      const g = c.createGain(), t = c.currentTime;
      g.connect(c.destination);
      osc(c, g, 1320, 'sine', t, 0.12, 0.06, 0.005, 0.10);
      osc(c, g, 1760, 'sine', t + 0.04, 0.10, 0.03, 0.005, 0.08);
    },

    /* Toggle sound on/off */
    setEnabled(v) {
      _on = !!v;
      try { localStorage.setItem(KEY, _on ? 'true' : 'false'); } catch (_) {}
    },

    isEnabled() { return _on; },
  };

  window.SOUNDS = SOUNDS;

  /* Preload all MP3s silently after first user interaction */
  let _preloaded = false;
  function _preload() {
    if (_preloaded) return;
    _preloaded = true;
    [
      'fahhhhh.mp3',
      'waah_kya_scene_hai.mp3',
      'are_bhai_bhai_bhai.mp3',
      'cameraman_focus_karo.mp3',
      'eh_eh_eh_ehhhhhh.mp3',
      'jaldi_waha_sa_hato.mp3',
    ].forEach(f => {
      try {
        const a = new Audio(BASE + f);
        a.preload = 'auto';
        _pool[BASE + f] = a;
      } catch (_) {}
    });
  }

  document.addEventListener('click',     _preload, { once: true, passive: true });
  document.addEventListener('touchstart', _preload, { once: true, passive: true });
  document.addEventListener('keydown',   _preload, { once: true, passive: true });

})();
