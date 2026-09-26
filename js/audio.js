/* YAJA audio — tiny WebAudio synth. No assets. */
(function (root) {
  'use strict';
  var ctx = null, master = null, muted = false;
  try { muted = localStorage.getItem('yaja.muted') === '1'; } catch (e) { /* storage blocked */ }

  function ac() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, opts) {
    if (muted) return;
    var c = ac(); if (!c) return;
    opts = opts || {};
    var t = c.currentTime + (opts.delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
    var vol = opts.vol == null ? 0.5 : opts.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, opts) {
    if (muted) return;
    var c = ac(); if (!c) return;
    opts = opts || {};
    var t = c.currentTime + (opts.delay || 0);
    var len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf;
    f.type = 'lowpass'; f.frequency.value = opts.freq || 1200;
    g.gain.value = opts.vol || 0.6;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  // Pentatonic ladder so flip cascades always sound musical.
  var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
  function note(n) { return 440 * Math.pow(2, (n - 9) / 12); }

  var SFX = {
    place: function () { tone(220, 0.12, { type: 'triangle', vol: 0.5, slide: 0.6 }); noise(0.05, { freq: 3000, vol: 0.25 }); },
    flip: function (k) { tone(note(12 + PENTA[Math.min(k, PENTA.length - 1)]), 0.16, { type: 'triangle', vol: 0.32 }); },
    hover: function () { tone(1200, 0.03, { type: 'sine', vol: 0.05 }); },
    click: function () { tone(660, 0.05, { type: 'square', vol: 0.08 }); },
    rune: function () { [0, 4, 7, 12].forEach(function (n, i) { tone(note(24 + n), 0.3, { type: 'sine', vol: 0.3, delay: i * 0.06 }); }); },
    ultReady: function () { tone(note(19), 0.15, { type: 'sawtooth', vol: 0.12 }); tone(note(26), 0.35, { type: 'sine', vol: 0.3, delay: 0.1 }); },
    ult: function () { tone(80, 0.7, { type: 'sawtooth', vol: 0.4, slide: 0.3 }); noise(0.6, { freq: 700, vol: 0.8 }); tone(note(31), 0.5, { type: 'sine', vol: 0.2, delay: 0.05, slide: 0.5 }); },
    boom: function () { noise(0.9, { freq: 400, vol: 1 }); tone(55, 0.8, { type: 'sine', vol: 0.6, slide: 0.4 }); },
    tick: function () { tone(1800, 0.03, { type: 'square', vol: 0.06 }); },
    warn: function () { tone(330, 0.1, { type: 'square', vol: 0.12 }); },
    turn: function () { tone(note(21), 0.08, { type: 'sine', vol: 0.18 }); tone(note(28), 0.12, { type: 'sine', vol: 0.18, delay: 0.07 }); },
    victory: function () { [0, 4, 7, 12, 16, 19, 24].forEach(function (n, i) { tone(note(12 + n), 0.5, { type: 'triangle', vol: 0.3, delay: i * 0.08 }); }); },
    defeat: function () { [12, 7, 3, 0].forEach(function (n, i) { tone(note(n), 0.5, { type: 'triangle', vol: 0.3, delay: i * 0.16 }); }); },
    lp: function () { tone(note(24), 0.05, { type: 'sine', vol: 0.12 }); },
    rankUp: function () {
      tone(55, 1.4, { type: 'sawtooth', vol: 0.25, slide: 2 });
      [0, 7, 12, 16, 19, 24, 28, 31].forEach(function (n, i) { tone(note(12 + n), 0.9, { type: 'triangle', vol: 0.25, delay: 0.5 + i * 0.07 }); });
      noise(1.2, { freq: 5000, vol: 0.2, delay: 0.5 });
    },
    queuePop: function () { [0, 12, 7, 19].forEach(function (n, i) { tone(note(19 + n), 0.25, { type: 'sine', vol: 0.3, delay: i * 0.09 }); }); }
  };

  root.YAJA = root.YAJA || {};
  root.YAJA.Audio = {
    sfx: function (name, arg) { try { if (SFX[name]) SFX[name](arg); } catch (e) { /* audio is best-effort */ } },
    unlock: ac,
    isMuted: function () { return muted; },
    setMuted: function (m) { muted = !!m; try { localStorage.setItem('yaja.muted', m ? '1' : '0'); } catch (e) { /* ignore */ } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
