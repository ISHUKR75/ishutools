/**
 * IshuTools.fun — Compress PDF Sounds v3.0 ULTIMATE
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 * GitHub: https://github.com/ISHUKR41 | https://github.com/ISHUKR75
 *
 * Sound map:
 *   fahhhhh              → download / success big moment (ALWAYS play on download)
 *   waah_kya_scene_hai   → preset selected / compression complete
 *   are_bhai_bhai_bhai   → file added
 *   cameraman_focus_karo → compression starting
 *   eh_eh_eh_ehhhhhh     → error
 *   jaldi_waha_sa_hato   → warning / cancel / reset
 *   click                → synthetic soft click for toggles
 *   ping                 → synthetic progress ping
 *   success              → alias for waah_kya_scene_hai
 *   download             → alias for fahhhhh (ALWAYS on download)
 *   error                → alias for eh_eh_eh_ehhhhhh
 *   warning              → alias for jaldi_waha_sa_hato
 *   fileAdd              → alias for are_bhai_bhai_bhai
 *   start                → alias for cameraman_focus_karo
 */
(function () {
  'use strict';

  const KEY  = 'ishu-sounds-v3';
  const BASE = 'sounds/';
  let _on    = true;
  try { _on = localStorage.getItem(KEY) !== 'false'; } catch (_) {}

  /* ── AudioContext (lazy, singleton) ─────────────────────────────────────── */
  let _ctx = null;
  function ctx() {
    if (!_ctx) {
      try {
        _ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      } catch (_) { return null; }
    }
    if (_ctx && _ctx.state === 'suspended') {
      _ctx.resume().catch(() => {});
    }
    return _ctx;
  }

  /* ── MP3 pool (cache Audio elements) ─────────────────────────────────────── */
  const _pool = {};

  function _playMp3(file, vol = 0.8, rate = 1.0) {
    if (!_on) return;
    try {
      const key = BASE + file;
      if (!_pool[key]) {
        const a = new Audio(key);
        a.preload = 'auto';
        _pool[key] = a;
      }
      const clone = _pool[key].cloneNode();
      clone.volume      = Math.min(1, Math.max(0, vol));
      clone.playbackRate = Math.min(4, Math.max(0.25, rate));
      const p = clone.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }

  /* ── Web Audio API helpers ────────────────────────────────────────────────── */
  function osc(c, dest, freq, type, t, dur, peak, attack = 0.005, release = 0.12, detune = 0) {
    try {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (detune) o.detune.setValueAtTime(detune, t);
      o.connect(g);
      g.connect(dest);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur - 0.01);
      o.start(t);
      o.stop(t + dur + release + 0.05);
    } catch (_) {}
  }

  function noise(c, dest, t, dur, peak, fType = 'bandpass', freq = 2000, Q = 1.5) {
    try {
      const sr  = c.sampleRate;
      const len = Math.ceil(sr * (dur + 0.1));
      const buf = c.createBuffer(1, len, sr);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
      const src = c.createBufferSource();
      src.buffer = buf;
      const flt = c.createBiquadFilter();
      flt.type = fType;
      flt.frequency.setValueAtTime(freq, t);
      flt.Q.setValueAtTime(Q, t);
      const g = c.createGain();
      src.connect(flt);
      flt.connect(g);
      g.connect(dest);
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.start(t);
      src.stop(t + dur + 0.1);
    } catch (_) {}
  }

  /* ── Public SOUNDS API ────────────────────────────────────────────────────── */
  const SOUNDS = {

    /* ─── MP3-backed sounds ───────────────────────────────────────────────── */

    /** File added to queue */
    are_bhai_bhai_bhai() {
      _playMp3('are_bhai_bhai_bhai.mp3', 0.75, 1.0);
    },

    /** Compression starting */
    cameraman_focus_karo() {
      _playMp3('cameraman_focus_karo.mp3', 0.82, 1.0);
    },

    /** Download / success — ALWAYS play on every download */
    fahhhhh() {
      _playMp3('fahhhhh.mp3', 0.92, 1.0);
    },

    /** Preset selected / compression success */
    waah_kya_scene_hai() {
      _playMp3('waah_kya_scene_hai.mp3', 0.72, 1.0);
    },

    /** Error occurred */
    eh_eh_eh_ehhhhhh() {
      _playMp3('eh_eh_eh_ehhhhhh.mp3', 0.78, 1.0);
    },

    /** Warning / cancel / reset */
    jaldi_waha_sa_hato() {
      _playMp3('jaldi_waha_sa_hato.mp3', 0.68, 1.0);
    },

    /* ─── Aliases ─────────────────────────────────────────────────────────── */
    download()  { SOUNDS.fahhhhh();              }, // ALWAYS fahhhhh on download
    success()   { SOUNDS.waah_kya_scene_hai();   },
    fileAdd()   { SOUNDS.are_bhai_bhai_bhai();   },
    start()     { SOUNDS.cameraman_focus_karo(); },
    error()     { SOUNDS.eh_eh_eh_ehhhhhh();     },
    warning()   { SOUNDS.jaldi_waha_sa_hato();   },
    cancel()    { SOUNDS.jaldi_waha_sa_hato();   },
    reset()     { SOUNDS.jaldi_waha_sa_hato();   },

    /* ─── Synthetic Web Audio sounds ─────────────────────────────────────── */

    /** Soft click for toggles and buttons */
    click() {
      const c = ctx();
      if (!c || !_on) return;
      const g = c.createGain();
      const t = c.currentTime;
      g.connect(c.destination);
      osc(c, g, 880, 'sine', t,        0.06, 0.06, 0.003, 0.04);
      osc(c, g, 1320,'sine', t + 0.01, 0.04, 0.03, 0.003, 0.03);
    },

    /** Two-note progress ping */
    ping() {
      const c = ctx();
      if (!c || !_on) return;
      const g = c.createGain();
      const t = c.currentTime;
      g.connect(c.destination);
      osc(c, g, 1320, 'sine', t,       0.14, 0.05, 0.005, 0.10);
      osc(c, g, 1760, 'sine', t + 0.06,0.10, 0.03, 0.005, 0.08);
    },

    /** Soft rising chime for info toasts */
    chime() {
      const c = ctx();
      if (!c || !_on) return;
      const g = c.createGain();
      const t = c.currentTime;
      g.connect(c.destination);
      osc(c, g, 523,  'sine', t,        0.18, 0.04, 0.008, 0.18);
      osc(c, g, 659,  'sine', t + 0.08, 0.14, 0.03, 0.008, 0.16);
      osc(c, g, 784,  'sine', t + 0.16, 0.10, 0.02, 0.008, 0.14);
    },

    /** Short tick for analysis steps */
    tick() {
      const c = ctx();
      if (!c || !_on) return;
      const g = c.createGain();
      const t = c.currentTime;
      g.connect(c.destination);
      osc(c, g, 2400, 'square', t, 0.03, 0.03, 0.001, 0.02);
    },

    /** Deep low thud for file removal */
    thud() {
      const c = ctx();
      if (!c || !_on) return;
      const g = c.createGain();
      const t = c.currentTime;
      g.connect(c.destination);
      osc(c, g, 80,  'sine',   t,        0.25, 0.12, 0.005, 0.10);
      osc(c, g, 120, 'sine',   t + 0.01, 0.15, 0.10, 0.005, 0.08);
      noise(c, g, t, 0.08, 0.08, 'lowpass', 200, 0.5);
    },

    /** Energetic whoosh for big success */
    whoosh() {
      const c = ctx();
      if (!c || !_on) return;
      const g = c.createGain();
      const t = c.currentTime;
      g.connect(c.destination);
      noise(c, g, t, 0.35, 0.12, 'bandpass', 1800, 3);
      osc(c, g, 1047, 'sine', t + 0.05, 0.20, 0.08, 0.01, 0.15);
      osc(c, g, 1319, 'sine', t + 0.10, 0.15, 0.06, 0.01, 0.12);
      osc(c, g, 1568, 'sine', t + 0.15, 0.10, 0.04, 0.01, 0.10);
    },

    /* ─── State management ────────────────────────────────────────────────── */
    setEnabled(v) {
      _on = !!v;
      try { localStorage.setItem(KEY, _on ? 'true' : 'false'); } catch (_) {}
    },
    isEnabled() { return _on; },
    toggle() {
      SOUNDS.setEnabled(!_on);
      return _on;
    },
  };

  /* ── Expose globally ─────────────────────────────────────────────────────── */
  window.SOUNDS = SOUNDS;

  /* ── Preload all MP3s on first user interaction ───────────────────────────── */
  let _preloaded = false;
  function _preload() {
    if (_preloaded) return;
    _preloaded = true;
    const files = [
      'fahhhhh.mp3',
      'waah_kya_scene_hai.mp3',
      'are_bhai_bhai_bhai.mp3',
      'cameraman_focus_karo.mp3',
      'eh_eh_eh_ehhhhhh.mp3',
      'jaldi_waha_sa_hato.mp3',
    ];
    files.forEach(f => {
      try {
        const key = BASE + f;
        if (!_pool[key]) {
          const a = new Audio(key);
          a.preload = 'auto';
          _pool[key] = a;
        }
      } catch (_) {}
    });
  }

  /* Register preload on any user gesture */
  ['click', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => {
    document.addEventListener(ev, _preload, { once: true, passive: true });
  });

})();
