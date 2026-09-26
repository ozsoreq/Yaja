/* YAJA board view — SVG hex board, previews, animations, particles. */
(function (root) {
  'use strict';
  var Y = root.YAJA, E = Y.Engine, Art = Y.Art;
  var S = 30, SQ3 = Math.sqrt(3);
  var NS = 'http://www.w3.org/2000/svg';

  function pos(i) { var c = E.CELLS[i]; return { x: S * SQ3 * (c.q + c.r / 2), y: S * 1.5 * c.r }; }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---- Particles (canvas overlay) -----------------------------------------------------
  var FX = (function () {
    var cv, cx, parts = [], rings = [], running = false, dpr = 1;
    function ensure() {
      if (cv) return;
      cv = document.createElement('canvas');
      cv.className = 'fx-canvas';
      document.body.appendChild(cv);
      cx = cv.getContext('2d');
      resize();
      root.addEventListener('resize', resize);
    }
    function resize() { dpr = Math.min(2, root.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; }
    function loop() {
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, innerWidth, innerHeight);
      cx.globalCompositeOperation = 'lighter';
      parts = parts.filter(function (p) {
        p.life -= 1 / 60; if (p.life <= 0) return false;
        p.vx *= 0.96; p.vy = p.vy * 0.96 + p.g; p.x += p.vx; p.y += p.vy;
        var a = Math.max(0, p.life / p.max);
        cx.globalAlpha = a;
        cx.fillStyle = p.c;
        cx.beginPath(); cx.arc(p.x, p.y, p.r * (0.4 + a * 0.6), 0, 6.283); cx.fill();
        return true;
      });
      rings = rings.filter(function (r) {
        r.t += 1 / 60; var k = r.t / r.dur; if (k >= 1) return false;
        cx.globalAlpha = (1 - k) * 0.9;
        cx.strokeStyle = r.c; cx.lineWidth = r.w * (1 - k) + 1;
        cx.beginPath(); cx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 3)), 0, 6.283); cx.stroke();
        return true;
      });
      cx.globalAlpha = 1;
      if (parts.length || rings.length) requestAnimationFrame(loop); else running = false;
    }
    function kick() { if (!running) { running = true; requestAnimationFrame(loop); } }
    return {
      burst: function (x, y, color, n, speed, opts) {
        ensure(); opts = opts || {};
        for (var i = 0; i < (n || 16); i++) {
          var a = Math.random() * 6.283, v = (speed || 4) * (0.3 + Math.random());
          parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: opts.g == null ? 0.05 : opts.g, r: (opts.size || 2.4) * (0.6 + Math.random()), c: color, life: (opts.life || 0.8) * (0.6 + Math.random() * 0.6), max: opts.life || 0.8 });
        }
        kick();
      },
      ring: function (x, y, color, r1, dur, w) { ensure(); rings.push({ x: x, y: y, c: color, r0: 4, r1: r1 || 60, t: 0, dur: dur || 0.6, w: w || 6 }); kick(); },
      confetti: function (color1, color2) {
        ensure();
        for (var i = 0; i < 140; i++) {
          parts.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, g: 0.06, r: 2 + Math.random() * 3, c: Math.random() < 0.5 ? color1 : color2, life: 3 + Math.random() * 2, max: 5 });
        }
        kick();
      }
    };
  })();

  // ---- Board view ------------------------------------------------------------------------
  function BoardView(host, handlers) {
    this.host = host;
    this.h = handlers || {};
    this.state = null;
    this.mode = null;       // null | 'place' | 'ult'
    this.side = 1;
    this.interactive = false;
    this.busy = false;
    this.build();
  }

  BoardView.prototype.build = function () {
    var self = this;
    this.host.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'board-tilt';
    this.host.appendChild(wrap);
    this.wrap = wrap;
    var pad = 14, w = S * SQ3 * 9 + pad * 2, h = S * 1.5 * 8 + S * 2 + pad * 2;
    var svg = el('svg', { viewBox: (-w / 2) + ' ' + (-h / 2) + ' ' + w + ' ' + h, class: 'board-svg', role: 'img', 'aria-label': 'YAJA hex board' });
    wrap.appendChild(svg);
    this.svg = svg;
    var defs = el('defs', {}, svg);
    defs.innerHTML = [
      // Gem skin
      '<radialGradient id="gem-1" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#d9f2ff"/><stop offset=".35" stop-color="#3ab0ff"/><stop offset="1" stop-color="#0b3a73"/></radialGradient>',
      '<radialGradient id="gem-2" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffe0e6"/><stop offset=".35" stop-color="#ff3b5c"/><stop offset="1" stop-color="#6b0a1d"/></radialGradient>',
      // Neon
      '<radialGradient id="neon-1" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#021a2e"/><stop offset=".8" stop-color="#3ab0ff"/><stop offset="1" stop-color="#b6e6ff"/></radialGradient>',
      '<radialGradient id="neon-2" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#2e0210"/><stop offset=".8" stop-color="#ff3b5c"/><stop offset="1" stop-color="#ffc2cd"/></radialGradient>',
      // Glass
      '<linearGradient id="glass-1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9bd8ff" stop-opacity=".95"/><stop offset=".5" stop-color="#1b5d9c" stop-opacity=".85"/><stop offset="1" stop-color="#031a33"/></linearGradient>',
      '<linearGradient id="glass-2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3c0" stop-opacity=".95"/><stop offset=".5" stop-color="#9c1b34" stop-opacity=".85"/><stop offset="1" stop-color="#33030d"/></linearGradient>',
      // Gold
      '<radialGradient id="gold-1" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#fff6d8"/><stop offset=".3" stop-color="#64c3ff"/><stop offset=".85" stop-color="#0d3f78"/><stop offset="1" stop-color="#c8aa6e"/></radialGradient>',
      '<radialGradient id="gold-2" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#fff6d8"/><stop offset=".3" stop-color="#ff6680"/><stop offset=".85" stop-color="#78102a"/><stop offset="1" stop-color="#c8aa6e"/></radialGradient>',
      // Plasma
      '<radialGradient id="plasma-1" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff"/><stop offset=".25" stop-color="#8fe3ff"/><stop offset=".7" stop-color="#1a6fff"/><stop offset="1" stop-color="#1a6fff" stop-opacity=".2"/></radialGradient>',
      '<radialGradient id="plasma-2" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff"/><stop offset=".25" stop-color="#ffb0c0"/><stop offset=".7" stop-color="#ff1f4b"/><stop offset="1" stop-color="#ff1f4b" stop-opacity=".2"/></radialGradient>',
      '<radialGradient id="tile-g" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="var(--tile-hi)"/><stop offset="1" stop-color="var(--tile-lo)"/></radialGradient>',
      '<filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
    ].join('');

    // Rim glow under the board
    el('polygon', { points: Art.hexPts(0, 0, S * SQ3 * 4.9, 0), class: 'board-rim' }, svg);
    this.gTiles = el('g', { class: 'tiles' }, svg);
    this.gMarks = el('g', { class: 'marks' }, svg);
    this.gStones = el('g', { class: 'stones' }, svg);
    this.gFx = el('g', { class: 'fxlayer' }, svg);
    this.tiles = []; this.stones = []; this.hints = [];
    for (var i = 0; i < E.N; i++) {
      var p = pos(i);
      var t = el('g', { class: 'cell', transform: 'translate(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')', 'data-i': i }, this.gTiles);
      el('polygon', { points: Art.hexPts(0, 0, S - 1.6, 30), class: 'tile' }, t);
      if (E.CORNERS.indexOf(i) !== -1) t.classList.add('corner');
      var hint = el('circle', { r: 4.2, class: 'hint' }, t);
      this.tiles.push(t); this.hints.push(hint);
      var sg = el('g', { class: 'stone', transform: 'translate(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')' }, this.gStones);
      var fl = el('g', { class: 'flipper' }, sg);
      el('path', { class: 'disc', d: this.discPath() }, fl);
      el('ellipse', { class: 'spec', cx: -6, cy: -8, rx: 8, ry: 4.5, transform: 'rotate(-25)' }, fl);
      el('polygon', { class: 'lockring', points: Art.hexPts(0, 0, S * 0.86, 30) }, sg);
      this.stones.push(sg);
    }
    this.lastMark = el('circle', { r: 5, class: 'last-mark' }, this.gMarks);
    this.ghost = el('g', { class: 'ghost-stone' }, this.gFx);
    el('path', { class: 'disc', d: this.discPath() }, this.ghost);
    this.gain = el('text', { class: 'gain-label', 'text-anchor': 'middle' }, this.gFx);

    svg.addEventListener('pointermove', function (e) { self.onHover(self.cellFromEvent(e)); });
    svg.addEventListener('pointerleave', function () { self.onHover(-1); });
    svg.addEventListener('click', function (e) { var i = self.cellFromEvent(e); if (i >= 0) self.onClick(i); });
    // Subtle 3D tilt toward the pointer.
    this.host.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = self.host.getBoundingClientRect();
      var dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
      wrap.style.setProperty('--ry', (dx * 6).toFixed(2) + 'deg');
      wrap.style.setProperty('--rx', (-dy * 6).toFixed(2) + 'deg');
    });
    this.host.addEventListener('pointerleave', function () { wrap.style.setProperty('--ry', '0deg'); wrap.style.setProperty('--rx', '0deg'); });
  };

  BoardView.prototype.discPath = function () {
    var r = S * 0.74, k = [], a;
    if (this.shape === 'circle') return 'M' + (-r) + ',0 a' + r + ',' + r + ' 0 1,0 ' + 2 * r + ',0 a' + r + ',' + r + ' 0 1,0 ' + (-2 * r) + ',0';
    for (var j = 0; j < 6; j++) { a = Math.PI / 3 * j + Math.PI / 6; k.push((r * Math.cos(a)).toFixed(2) + ',' + (r * Math.sin(a)).toFixed(2)); }
    return 'M' + k.join('L') + 'Z';
  };

  BoardView.prototype.setSkin = function (skin) {
    var name = (skin || 'skin-gem').replace('skin-', '');
    this.svg.setAttribute('data-skin', name);
    this.shape = (name === 'gem' || name === 'gold') ? 'hex' : 'circle';
    var d = this.discPath();
    this.svg.querySelectorAll('.disc').forEach(function (p) { p.setAttribute('d', d); });
  };

  BoardView.prototype.cellFromEvent = function (e) {
    var t = e.target.closest ? e.target.closest('.cell') : null;
    if (t) return +t.getAttribute('data-i');
    // Stones sit above tiles; map pointer to nearest cell centre.
    var pt = this.svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    var m = this.svg.getScreenCTM(); if (!m) return -1;
    var p = pt.matrixTransform(m.inverse()), best = -1, bd = S * S;
    for (var i = 0; i < E.N; i++) { var c = pos(i), d = (c.x - p.x) * (c.x - p.x) + (c.y - p.y) * (c.y - p.y); if (d < bd) { bd = d; best = i; } }
    return best;
  };

  BoardView.prototype.screenPos = function (i) {
    var r = this.tiles[i].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
  };

  // Full sync with a state (no animation).
  BoardView.prototype.render = function (s, opts) {
    opts = opts || {};
    this.state = s;
    for (var i = 0; i < E.N; i++) this.paintCell(i, s);
    var runes = s.runes;
    var self = this;
    this.tiles.forEach(function (t, i) {
      var isRune = runes.indexOf(i) !== -1;
      t.classList.toggle('rune', isRune);
      var g = t.querySelector('.rune-glyph');
      if (isRune && !g) { var gg = el('g', {}, t); gg.innerHTML = Art.runeGlyph(); t.insertBefore(gg, self.hints[i]); }
      if (!isRune && g) g.parentNode.remove();
      var sc = s.scorch[i] > s.ply;
      t.classList.toggle('scorched', sc);
    });
    if (opts.last != null && opts.last >= 0) {
      var p = pos(opts.last);
      this.lastMark.setAttribute('cx', p.x); this.lastMark.setAttribute('cy', p.y);
      this.lastMark.style.opacity = 1;
    } else if (opts.last === -1) this.lastMark.style.opacity = 0;
    this.refreshHints();
  };

  BoardView.prototype.paintCell = function (i, s) {
    var st = this.stones[i], v = s.board[i];
    st.classList.toggle('p1', v === 1);
    st.classList.toggle('p2', v === 2);
    st.classList.toggle('empty', v === 0);
    st.classList.toggle('locked', !!s.locked[i] && v !== 0);
  };

  // Interaction
  BoardView.prototype.setInteractive = function (on, side, mode) {
    this.interactive = on; this.side = side || this.side; this.mode = on ? (mode || 'place') : null;
    this.svg.classList.toggle('interactive', on);
    this.svg.classList.toggle('ult-mode', on && this.mode === 'ult');
    this.refreshHints();
    this.onHover(-1);
  };
  BoardView.prototype.refreshHints = function () {
    var s = this.state, legal = [];
    if (s && this.interactive) {
      legal = this.mode === 'ult' ? E.ultTargets(s, this.side) : E.legalPlacements(s, this.side);
    }
    this.legal = legal;
    for (var i = 0; i < E.N; i++) this.tiles[i].classList.toggle('legal', legal.indexOf(i) !== -1);
  };

  BoardView.prototype.clearPreview = function () {
    this.svg.querySelectorAll('.will-flip,.ult-hit,.ult-lock,.ult-src').forEach(function (n) { n.classList.remove('will-flip', 'ult-hit', 'ult-lock', 'ult-src'); });
    this.ghost.style.opacity = 0;
    this.gain.style.opacity = 0;
  };

  BoardView.prototype.onHover = function (i) {
    if (this.hoverCell === i) return;
    this.hoverCell = i;
    this.clearPreview();
    if (!this.interactive || this.busy || i < 0 || this.legal.indexOf(i) === -1) { if (this.h.hover) this.h.hover(-1); return; }
    var s = this.state, p = this.side, self = this, n = 0, pp = pos(i);
    if (this.mode === 'place' || (this.mode === 'ult' && s.champ[p] === 'nyx')) {
      var lines = E.captureLines(s.board, s.locked, i, p);
      lines.forEach(function (l) { l.forEach(function (c) { self.stones[c].classList.add('will-flip'); n++; }); });
      this.ghost.setAttribute('transform', 'translate(' + pp.x + ',' + pp.y + ')');
      this.ghost.setAttribute('class', 'ghost-stone p' + p);
      this.ghost.style.opacity = 1;
      this.showGain(pp, n > 0 ? '+' + n : '', lines.length);
    } else if (this.mode === 'ult') {
      var ch = s.champ[p], cells = [];
      if (ch === 'vex') { cells = E.detonateArea(i); cells.forEach(function (c) { self.tiles[c].classList.add('ult-hit'); if (s.board[c] === E.opp(p) && !s.locked[c]) { self.stones[c].classList.add('will-flip'); n++; } }); this.showGain(pp, '✖' + n, 0); }
      if (ch === 'kael') { E.rallyTargets(s, p, i).forEach(function (c) { self.stones[c].classList.add('will-flip'); n++; }); this.tiles[i].classList.add('ult-src'); this.showGain(pp, '+' + n, 0); }
      if (ch === 'aegis') { E.bastionTargets(s, p, i).forEach(function (c) { self.stones[c].classList.add('ult-lock'); n++; }); this.tiles[i].classList.add('ult-src'); this.showGain(pp, '🔒' + n, 0); }
    }
    if (this.h.hover) this.h.hover(i, n);
  };
  BoardView.prototype.showGain = function (pp, text, lines) {
    if (!text) return;
    this.gain.textContent = text + (lines >= 2 ? ' ×' + lines : '');
    this.gain.setAttribute('x', pp.x); this.gain.setAttribute('y', pp.y - S * 0.95);
    this.gain.style.opacity = 1;
  };

  BoardView.prototype.onClick = function (i) {
    if (!this.interactive || this.busy) return;
    if (this.legal.indexOf(i) === -1) { if (this.h.illegal) this.h.illegal(i); this.nudge(i); return; }
    if (this.h.click) this.h.click(i, this.mode);
  };
  BoardView.prototype.nudge = function (i) {
    var t = this.tiles[i];
    t.classList.remove('nope'); void t.getBBox(); t.classList.add('nope');
    setTimeout(function () { t.classList.remove('nope'); }, 400);
  };

  // ---- Animation of one applied action --------------------------------------------------
  // prev: state before, ev: events from engine, next: state after. Returns a promise.
  BoardView.prototype.animate = function (prev, ev, next, opts) {
    opts = opts || {};
    var self = this, speed = opts.fast ? 0.55 : 1, p = ev.player, color = p === 1 ? '#3ab0ff' : '#ff3b5c';
    var sfx = Y.Audio.sfx;
    this.busy = true;
    this.clearPreview();
    this.render(prev, { last: null });
    var a = ev.action, chain = Promise.resolve();

    function flipCell(c, delay, k) {
      return wait(delay).then(function () {
        var st = self.stones[c], fl = st.firstChild;
        sfx('flip', k);
        var anim = fl.animate ? fl.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 110 * speed, easing: 'ease-in' }) : null;
        return (anim ? anim.finished : wait(110 * speed)).then(function () {
          self.paintCell(c, { board: next.board, locked: next.locked });
          if (fl.animate) fl.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1.15)' }, { transform: 'scaleX(1)' }], { duration: 170 * speed, easing: 'ease-out' });
          var sp = self.screenPos(c);
          FX.burst(sp.x, sp.y, color, 6, 2.4, { life: 0.5, size: 1.8 });
        });
      });
    }

    if (a.type === 'place' || (a.type === 'ult' && (ev.ult === 'nyx'))) {
      chain = chain.then(function () {
        var c = a.cell, st = self.stones[c];
        self.paintCell(c, { board: next.board, locked: next.locked });
        st.classList.add('drop');
        setTimeout(function () { st.classList.remove('drop'); }, 400);
        sfx('place');
        var sp = self.screenPos(c);
        FX.ring(sp.x, sp.y, color, sp.w * 1.1, 0.45, 5);
        return wait(140 * speed);
      }).then(function () {
        var ps = [], k = 0;
        ev.lines.forEach(function (line) {
          line.forEach(function (c, j) { ps.push(flipCell(c, j * 75 * speed, k++)); });
        });
        return Promise.all(ps);
      });
    }
    if (a.type === 'ult') {
      if (ev.ult === 'vex') {
        chain = chain.then(function () {
          var sp = self.screenPos(a.cell);
          sfx('boom');
          FX.ring(sp.x, sp.y, '#ff8a3d', sp.w * 3.2, 0.7, 12);
          FX.burst(sp.x, sp.y, '#ffb547', 60, 7, { life: 1, size: 3 });
          FX.burst(sp.x, sp.y, '#ff3b5c', 40, 5, { life: 1.2, size: 2.5 });
          self.host.classList.add('shake'); setTimeout(function () { self.host.classList.remove('shake'); }, 500);
          ev.removed.forEach(function (c) { self.stones[c].classList.add('vanish'); });
          return wait(380 * speed);
        }).then(function () {
          ev.removed.forEach(function (c) { self.stones[c].classList.remove('vanish'); self.paintCell(c, { board: next.board, locked: next.locked }); });
        });
      } else if (ev.ult === 'kael') {
        chain = chain.then(function () {
          var sp = self.screenPos(a.cell);
          FX.ring(sp.x, sp.y, '#ffb547', sp.w * 2.4, 0.6, 8);
          sfx('ult');
          return Promise.all(ev.converted.map(function (c, j) { return flipCell(c, j * 90 * speed, j + 2); }));
        });
      } else if (ev.ult === 'aegis') {
        chain = chain.then(function () {
          sfx('ult');
          ev.locked.forEach(function (c, j) {
            setTimeout(function () {
              self.paintCell(c, { board: next.board, locked: next.locked });
              var sp = self.screenPos(c);
              FX.ring(sp.x, sp.y, '#f5d77a', sp.w * 0.9, 0.5, 4);
              sfx('flip', j + 4);
            }, j * 90 * speed);
          });
          return wait((ev.locked.length * 90 + 200) * speed);
        });
      } else if (ev.ult === 'mira') {
        chain = chain.then(function () {
          sfx('ult');
          self.host.classList.add('rewind'); setTimeout(function () { self.host.classList.remove('rewind'); }, 700);
          return wait(520 * speed);
        });
      }
    }
    return chain.then(function () {
      if (ev.rune) {
        var sp = self.screenPos(a.cell);
        sfx('rune');
        FX.ring(sp.x, sp.y, '#f5d77a', sp.w * 2, 0.8, 6);
        FX.burst(sp.x, sp.y, '#f5d77a', 30, 4, { life: 1, g: -0.02 });
      }
      self.render(next, { last: a.type === 'place' || a.type === 'ult' && ev.ult === 'nyx' ? a.cell : (ev.ult === 'mira' ? -1 : null) });
      self.busy = false;
    });
  };

  BoardView.prototype.pulseCells = function (cells, cls) {
    var self = this;
    cells.forEach(function (c) { self.tiles[c].classList.add(cls); });
    setTimeout(function () { cells.forEach(function (c) { self.tiles[c].classList.remove(cls); }); }, 1200);
  };

  Y.BoardView = BoardView;
  Y.FX = FX;
  Y.boardPos = pos;
})(window);
