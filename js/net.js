/* YAJA net — peer-to-peer online play over WebRTC (PeerJS). No game server needed.
 *
 * Private rooms: host registers peer id "yaja-r-<CODE>", guest connects to it.
 * Quick Match: players race for a small set of well-known "queue slot" ids. Whoever
 * registers a free slot waits there; whoever finds it taken connects to it as guest.
 *
 * Signaling defaults to the free PeerJS cloud. Override with URL params:
 *   ?peerhost=my.host&peerport=9000&peerpath=/myapp&peersecure=0
 */
(function (root) {
  'use strict';
  var PROTO = 3;
  var PREFIX = 'yaja-v' + PROTO + '-';
  var QM_SLOTS = 4;
  var HEARTBEAT_TIMEOUT = 10000;
  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  // Read once at load: the app later cleans ?room= from the URL.
  var BOOT_QUERY;
  try { BOOT_QUERY = new URLSearchParams(root.location.search); } catch (e) { BOOT_QUERY = null; }
  function peerOptions() {
    var o = { debug: 0 }, q = BOOT_QUERY;
    if (q && q.get('peerhost')) {
      o.host = q.get('peerhost');
      o.port = Number(q.get('peerport') || 443);
      o.path = q.get('peerpath') || '/';
      o.secure = q.get('peersecure') !== '0';
      o.key = q.get('peerkey') || 'peerjs';
    }
    o.config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] };
    return o;
  }

  function randomCode(n) {
    var s = '';
    for (var i = 0; i < (n || 5); i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return s;
  }

  function available() { return typeof root.Peer === 'function'; }

  // Wraps an open DataConnection into a tiny message channel.
  function Channel(peer, conn, isHost, early) {
    var self = this;
    this.isHost = isHost;
    this.peer = peer;
    this.conn = conn;
    this.handlers = {};
    this.closed = false;
    this.lastSeen = Date.now();
    conn.on('data', function (m) { self.lastSeen = Date.now(); if (m && m.t && m.t !== 'ping') self._emit('msg', m); });
    conn.on('close', function () { self._close('closed'); });
    // Heartbeat: WebRTC can take ~30s to notice a vanished peer, so detect it ourselves.
    this.hb = setInterval(function () {
      if (self.closed) return clearInterval(self.hb);
      self.send({ t: 'ping' });
      if (Date.now() - self.lastSeen > HEARTBEAT_TIMEOUT) self._close('timeout');
    }, 2000);
    conn.on('error', function () { self._close('error'); });
    peer.on('error', function (e) { if (e && e.type === 'peer-unavailable') return; });
    // Replay anything that arrived before this channel existed (after the app attaches handlers).
    if (early && early.length) setTimeout(function () { early.forEach(function (m) { if (m && m.t && m.t !== 'busy') self._emit('msg', m); }); }, 0);
    // Free the signaling id (keeps the P2P link alive) so slots/codes can be reused.
    setTimeout(function () { try { peer.disconnect(); } catch (e) { /* ignore */ } }, 1500);
  }
  Channel.prototype.on = function (ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; };
  Channel.prototype._emit = function (ev, arg) { (this.handlers[ev] || []).forEach(function (fn) { fn(arg); }); };
  Channel.prototype.send = function (m) { if (!this.closed) try { this.conn.send(m); } catch (e) { /* ignore */ } };
  Channel.prototype._close = function (why) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.hb);
    this._emit('close', why);
  };
  Channel.prototype.close = function () {
    this.closed = true;
    clearInterval(this.hb);
    try { this.conn.close(); } catch (e) { /* ignore */ }
    try { this.peer.destroy(); } catch (e) { /* ignore */ }
  };

  // Host a private room. cb({code}) once registered, onConn(channel) when a guest arrives.
  function hostRoom(onReady, onConn, onError) {
    var code = randomCode(5), done = false;
    var peer = new root.Peer(PREFIX + 'r-' + code, peerOptions());
    peer.on('open', function () { onReady({ code: code, cancel: function () { done = true; peer.destroy(); } }); });
    peer.on('connection', function (conn) {
      if (done) { conn.on('open', function () { conn.send({ t: 'busy' }); setTimeout(function () { conn.close(); }, 300); }); return; }
      done = true;
      conn.on('open', function () { onConn(new Channel(peer, conn, true)); });
    });
    peer.on('error', function (e) {
      if (done) return;
      if (e.type === 'unavailable-id') { peer.destroy(); hostRoom(onReady, onConn, onError); return; }
      onError(humanError(e));
    });
    return peer;
  }

  function joinRoom(code, onConn, onError) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var peer = new root.Peer(peerOptions()), settled = false;
    var timer = setTimeout(function () { fail({ type: 'timeout' }); }, 12000);
    function fail(e) { if (settled) return; settled = true; clearTimeout(timer); peer.destroy(); onError(humanError(e)); }
    peer.on('open', function () {
      var conn = peer.connect(PREFIX + 'r-' + code, { reliable: true });
      conn.on('open', function () {
        // Give the host a moment to tell us it's busy; buffer anything else it says meanwhile.
        var busy = false, early = [], handed = false;
        conn.on('data', function (m) { if (handed) return; if (m && m.t === 'busy') busy = true; else early.push(m); });
        setTimeout(function () {
          if (settled) return;
          if (busy) return fail({ type: 'busy' });
          settled = true; clearTimeout(timer); handed = true;
          onConn(new Channel(peer, conn, false, early));
        }, 350);
      });
    });
    peer.on('error', fail);
    return { cancel: function () { settled = true; clearTimeout(timer); peer.destroy(); } };
  }

  // Quick match against anyone else currently queueing.
  function quickMatch(onConn, onStatus, onError) {
    var cancelled = false, hostPeer = null, probeTimer = null, mySlot = -1;

    function slotId(n) { return PREFIX + 'qm-' + n; }

    function tryClaim(n) {
      if (cancelled) return;
      if (n >= QM_SLOTS) { onStatus('Queue is busy, retrying…'); setTimeout(function () { tryClaim(0); }, 1500 + Math.random() * 1500); return; }
      var p = new root.Peer(slotId(n), peerOptions()), resolved = false;
      p.on('open', function () {
        if (cancelled) { p.destroy(); return; }
        resolved = true; hostPeer = p; mySlot = n;
        onStatus('Searching for an opponent…');
        p.on('connection', function (conn) {
          conn.on('open', function () {
            if (cancelled || !hostPeer) { conn.send({ t: 'busy' }); setTimeout(function () { conn.close(); }, 300); return; }
            var ch = new Channel(p, conn, true);
            hostPeer = null; stopProbe();
            onConn(ch);
          });
        });
        // Occasionally look below our slot in case someone else is waiting there too.
        if (n > 0) probeTimer = setInterval(probeLower, 6000);
      });
      p.on('error', function (e) {
        if (resolved && e.type !== 'unavailable-id') { if (!cancelled && hostPeer === p) onError(humanError(e)); return; }
        if (e.type === 'unavailable-id') { p.destroy(); tryGuest(n); return; }
        if (!resolved) { resolved = true; p.destroy(); if (!cancelled) onError(humanError(e)); }
      });
    }

    function tryGuest(n, fromProbe) {
      if (cancelled) return;
      var gp = new root.Peer(peerOptions()), finished = false;
      var t = setTimeout(function () { next(); }, 6000);
      function next() {
        if (finished) return; finished = true; clearTimeout(t); gp.destroy();
        if (!fromProbe) tryClaim(n + 1);
      }
      gp.on('open', function () {
        if (cancelled) { gp.destroy(); return; }
        var conn = gp.connect(slotId(n), { reliable: true });
        conn.on('open', function () {
          var busy = false, early = [], handed = false;
          conn.on('data', function (m) { if (handed) return; if (m && m.t === 'busy') busy = true; else early.push(m); });
          setTimeout(function () {
            if (finished || cancelled) return;
            if (busy) return next();
            finished = true; clearTimeout(t); handed = true;
            if (hostPeer) { try { hostPeer.destroy(); } catch (e) { /* ignore */ } hostPeer = null; }
            stopProbe();
            onConn(new Channel(gp, conn, false, early));
          }, 350);
        });
      });
      gp.on('error', function () { next(); });
    }

    function probeLower() {
      if (cancelled || !hostPeer) return stopProbe();
      for (var k = 0; k < mySlot; k++) tryGuest(k, true);
    }
    function stopProbe() { if (probeTimer) clearInterval(probeTimer); probeTimer = null; }

    onStatus('Connecting to matchmaking…');
    tryClaim(0);
    return {
      cancel: function () {
        cancelled = true; stopProbe();
        if (hostPeer) try { hostPeer.destroy(); } catch (e) { /* ignore */ }
        hostPeer = null;
      }
    };
  }

  function humanError(e) {
    var t = e && e.type;
    if (t === 'peer-unavailable') return 'Room not found. Check the code and try again.';
    if (t === 'busy') return 'That room already has two players.';
    if (t === 'timeout') return 'Could not reach that room (timed out).';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed')
      return 'Can’t reach the matchmaking server. Check your connection.';
    if (t === 'browser-incompatible') return 'Your browser doesn’t support WebRTC.';
    return 'Connection problem' + (t ? ' (' + t + ')' : '') + '.';
  }

  root.YAJA = root.YAJA || {};
  // Invite link that keeps any custom signaling params.
  function inviteLink(code) {
    var base = root.location.href.split('#')[0].split('?')[0], q = new URLSearchParams();
    if (BOOT_QUERY) BOOT_QUERY.forEach(function (v, k) { if (/^peer/.test(k)) q.set(k, v); });
    q.set('room', code);
    return base + '?' + q.toString();
  }

  root.YAJA.Net = { PROTO: PROTO, inviteLink: inviteLink, available: available, hostRoom: hostRoom, joinRoom: joinRoom, quickMatch: quickMatch, randomCode: randomCode };
})(typeof window !== 'undefined' ? window : globalThis);
