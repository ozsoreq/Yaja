/* YAJA art — procedural SVG: rank emblems, champion sigils, avatars. No image assets. */
(function (root) {
  'use strict';
  var Y = root.YAJA;
  var uid = 0;
  function id(p) { return p + (++uid); }

  function hexPts(cx, cy, r, rot) {
    var pts = [];
    for (var k = 0; k < 6; k++) {
      var a = Math.PI / 180 * (60 * k + (rot || 0));
      pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }

  // ---- Rank emblems: more ornate with each tier -------------------------------------
  function emblem(rank, size, opts) {
    opts = opts || {};
    size = size || 96;
    var T = Y.Rank.TIERS;
    var tier = rank ? rank.tier : -1;
    var c = tier >= 0 ? T[tier].color : '#5b6275', g = tier >= 0 ? T[tier].glow : '#9aa3b8';
    var gid = id('eg'), sid = id('es'), fid = id('ef');
    var s = '<svg class="emblem" viewBox="0 0 120 120" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<defs>' +
      '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + g + '"/><stop offset=".45" stop-color="' + c + '"/><stop offset="1" stop-color="#0b0f1c"/></linearGradient>' +
      '<radialGradient id="' + sid + '" cx=".5" cy=".38" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".25" stop-color="' + g + '"/><stop offset="1" stop-color="' + c + '" stop-opacity=".2"/></radialGradient>' +
      '<filter id="' + fid + '" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '</defs>';
    var parts = '';
    if (tier >= 9) { // Challenger: rays
      for (var k = 0; k < 12; k++) parts += '<path d="M60 60 L' + (60 + 58 * Math.cos(k * Math.PI / 6 - 0.08)).toFixed(1) + ' ' + (60 + 58 * Math.sin(k * Math.PI / 6 - 0.08)).toFixed(1) + ' L' + (60 + 58 * Math.cos(k * Math.PI / 6 + 0.08)).toFixed(1) + ' ' + (60 + 58 * Math.sin(k * Math.PI / 6 + 0.08)).toFixed(1) + 'Z" fill="' + g + '" opacity=".35" class="em-rays"/>';
    }
    if (tier >= 7) parts += '<circle cx="60" cy="60" r="52" fill="none" stroke="' + g + '" stroke-width="1.5" stroke-dasharray="4 5" opacity=".7" class="em-halo"/>';
    if (tier >= 1) { // wings
      var wl = 18 + Math.min(tier, 6) * 3.2;
      parts += '<path d="M34 52 C ' + (34 - wl) + ' 44, ' + (30 - wl) + ' 70, ' + (22 - wl * 0.4) + ' 86 C 30 78, 34 72, 38 70 Z" fill="url(#' + gid + ')" stroke="' + g + '" stroke-width="1" opacity=".95"/>';
      parts += '<path d="M86 52 C ' + (86 + wl) + ' 44, ' + (90 + wl) + ' 70, ' + (98 + wl * 0.4) + ' 86 C 90 78, 86 72, 82 70 Z" fill="url(#' + gid + ')" stroke="' + g + '" stroke-width="1" opacity=".95"/>';
    }
    if (tier >= 5) { // laurels
      for (var j = 0; j < 4; j++) {
        var y = 88 - j * 9;
        parts += '<ellipse cx="' + (36 - j * 2) + '" cy="' + y + '" rx="7" ry="3" transform="rotate(-35 ' + (36 - j * 2) + ' ' + y + ')" fill="' + g + '" opacity=".8"/>';
        parts += '<ellipse cx="' + (84 + j * 2) + '" cy="' + y + '" rx="7" ry="3" transform="rotate(35 ' + (84 + j * 2) + ' ' + y + ')" fill="' + g + '" opacity=".8"/>';
      }
    }
    if (tier >= 3) { // crown spikes
      var n = tier >= 8 ? 5 : tier >= 6 ? 4 : 3;
      for (var q = 0; q < n; q++) {
        var x = 60 + (q - (n - 1) / 2) * 11, h = 14 + (q === (n - 1) / 2 ? 8 : 0) + (tier >= 7 ? 4 : 0);
        parts += '<path d="M' + (x - 5) + ' 30 L' + x + ' ' + (30 - h) + ' L' + (x + 5) + ' 30 Z" fill="url(#' + gid + ')" stroke="' + g + '" stroke-width=".8"/>';
      }
    }
    // Core hex shield
    parts += '<polygon points="' + hexPts(60, 60, 34, 30) + '" fill="url(#' + gid + ')" stroke="' + g + '" stroke-width="2"/>';
    parts += '<polygon points="' + hexPts(60, 60, 26, 30) + '" fill="#0a0e1a" opacity=".55" stroke="' + c + '" stroke-width="1"/>';
    // Gem
    var gemR = 10 + Math.min(tier + 1, 10) * 0.9;
    parts += '<polygon points="' + hexPts(60, 60, gemR, 0) + '" fill="url(#' + sid + ')" filter="url(#' + fid + ')" class="em-gem"/>';
    parts += '<path d="M' + (60 - gemR * 0.5) + ' ' + (60 - gemR * 0.4) + ' L60 ' + (60 - gemR * 0.85) + ' L' + (60 + gemR * 0.5) + ' ' + (60 - gemR * 0.4) + 'Z" fill="#fff" opacity=".45"/>';
    if (tier < 0) parts += '<text x="60" y="66" text-anchor="middle" font-size="18" fill="#9aa3b8" font-family="Cinzel, serif">?</text>';
    // Division ribbon
    if (rank && rank.tier < Y.Rank.APEX && opts.div !== false) {
      parts += '<path d="M40 94 L80 94 L76 106 L44 106 Z" fill="#0a0e1a" stroke="' + g + '" stroke-width="1.2"/>';
      parts += '<text x="60" y="104" text-anchor="middle" font-size="10" font-weight="700" fill="' + g + '" font-family="Cinzel, serif" letter-spacing="1">' + ['', 'I', 'II', 'III', 'IV'][rank.div] + '</text>';
    }
    return s + parts + '</svg>';
  }

  // ---- Champion sigils ----------------------------------------------------------------
  var SIGILS = {
    vex: '<circle cx="50" cy="56" r="22" fill="currentColor" opacity=".9"/><path d="M62 36 L70 26 M70 26 L78 22 M70 26 L74 18" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/><circle cx="80" cy="18" r="5" fill="#fff" opacity=".9"/><path d="M40 50 a12 12 0 0 1 12 -8" stroke="#fff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>',
    aegis: '<path d="M50 12 L82 24 L80 52 C78 70, 64 82, 50 90 C36 82, 22 70, 20 52 L18 24 Z" fill="currentColor" opacity=".9"/><path d="M50 22 L72 30 L70 52 C68 64, 60 72, 50 78 Z" fill="#fff" opacity=".25"/><path d="M50 30 L50 76 M34 46 L66 46" stroke="#0a0e1a" stroke-width="4" opacity=".55"/>',
    nyx: '<path d="M62 14 C38 18, 24 38, 28 60 C32 80, 54 92, 74 84 C56 80, 44 64, 46 46 C48 30, 56 20, 62 14 Z" fill="currentColor" opacity=".9"/><path d="M58 62 L86 20 L80 44 Z" fill="#fff" opacity=".75"/><circle cx="70" cy="70" r="3" fill="#fff"/>',
    kael: '<path d="M30 88 L30 14 L76 24 L62 36 L76 48 L30 50" fill="currentColor" opacity=".9" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M36 22 L64 28 L54 36 L64 44 L36 44 Z" fill="#fff" opacity=".3"/><rect x="26" y="10" width="8" height="82" rx="3" fill="#fff" opacity=".8"/>',
    mira: '<path d="M28 14 L72 14 L72 20 C72 34, 56 42, 56 50 C56 58, 72 66, 72 80 L72 86 L28 86 L28 80 C28 66, 44 58, 44 50 C44 42, 28 34, 28 20 Z" fill="currentColor" opacity=".9"/><path d="M36 78 L64 78 L50 62 Z" fill="#fff" opacity=".7"/><path d="M38 24 L62 24 L50 38 Z" fill="#fff" opacity=".35"/><rect x="22" y="10" width="56" height="6" rx="3" fill="#fff" opacity=".7"/><rect x="22" y="84" width="56" height="6" rx="3" fill="#fff" opacity=".7"/>'
  };
  function sigil(champ, size, color) {
    var ch = Y.Engine.CHAMPIONS[champ];
    return '<svg class="sigil" viewBox="0 0 100 100" width="' + (size || 48) + '" height="' + (size || 48) + '" style="color:' + (color || ch.color) + '" aria-hidden="true">' + SIGILS[champ] + '</svg>';
  }

  // ---- Avatars -------------------------------------------------------------------------
  var AVATAR_GLYPHS = [
    '<path d="M30 70 L50 26 L70 70 L50 58 Z" fill="#fff" opacity=".9"/>',                                       // arrowhead
    '<circle cx="50" cy="50" r="16" fill="none" stroke="#fff" stroke-width="6"/><circle cx="50" cy="50" r="5" fill="#fff"/>', // eye
    '<path d="M50 24 L56 44 L76 44 L60 56 L66 76 L50 64 L34 76 L40 56 L24 44 L44 44 Z" fill="#fff" opacity=".9"/>',      // star
    '<path d="M28 60 Q50 20 72 60 Q50 48 28 60 Z" fill="#fff" opacity=".9"/><circle cx="50" cy="66" r="6" fill="#fff"/>',   // flame
    '<path d="M50 24 L74 50 L50 76 L26 50 Z" fill="none" stroke="#fff" stroke-width="6"/><path d="M50 38 L62 50 L50 62 L38 50Z" fill="#fff"/>', // diamond
    '<path d="M30 34 L50 70 L70 34" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="50" cy="30" r="5" fill="#fff"/>' // chevron
  ];
  var AVATAR_COLORS = ['#3ab0ff', '#ff3b5c', '#b77dff', '#ffb547', '#5dffb0', '#f5d77a'];
  function avatar(n, size, color) {
    n = ((n || 0) % AVATAR_GLYPHS.length + AVATAR_GLYPHS.length) % AVATAR_GLYPHS.length;
    var col = color || AVATAR_COLORS[n], gid = id('av');
    return '<svg class="avatar" viewBox="0 0 100 100" width="' + (size || 40) + '" height="' + (size || 40) + '" aria-hidden="true">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + col + '"/><stop offset="1" stop-color="#0b0f1c"/></linearGradient></defs>' +
      '<polygon points="' + hexPts(50, 50, 46, 30) + '" fill="url(#' + gid + ')" stroke="' + col + '" stroke-width="3"/>' + AVATAR_GLYPHS[n] + '</svg>';
  }
  function botAvatar(bot, size) {
    var gid = id('bv'), initials = bot.name.replace(/[^A-Z0-9]/g, '').slice(0, 2) || bot.name.slice(0, 2).toUpperCase();
    return '<svg class="avatar" viewBox="0 0 100 100" width="' + (size || 40) + '" height="' + (size || 40) + '" aria-hidden="true">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + bot.color + '"/><stop offset="1" stop-color="#0b0f1c"/></linearGradient></defs>' +
      '<polygon points="' + hexPts(50, 50, 46, 30) + '" fill="url(#' + gid + ')" stroke="' + bot.color + '" stroke-width="3"/>' +
      '<text x="50" y="61" text-anchor="middle" font-size="30" font-weight="700" fill="#fff" font-family="Chakra Petch, sans-serif">' + initials + '</text></svg>';
  }

  function runeGlyph() {
    return '<g class="rune-glyph"><polygon points="' + hexPts(0, 0, 11, 0) + '" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M0 -7 L5 4 L-5 4 Z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle r="1.8" fill="currentColor"/></g>';
  }

  root.YAJA.Art = { emblem: emblem, sigil: sigil, avatar: avatar, botAvatar: botAvatar, hexPts: hexPts, runeGlyph: runeGlyph, AVATAR_COLORS: AVATAR_COLORS, AVATAR_COUNT: AVATAR_GLYPHS.length };
})(window);
