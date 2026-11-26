/* Kefada Fashion: anonymous visit counter. Sends only a random id, the event, the item id, where the visit came from and phone/computer.
   No names, phones, addresses or cookies. Open the site once with ?owner=1 on your own devices to leave your own visits out. */
(function () {
  'use strict';
  var CC = window.CART_CONFIG || {}, ORDER_URL = CC.orderUrl;
  var me = document.currentScript, pageItem = me && me.getAttribute('data-item');
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) {} return null; }
  var qs = location.search || '';
  if (/[?&]owner=1\b/.test(qs)) ls('kefada_owner', '1');
  if (/[?&]owner=0\b/.test(qs)) ls('kefada_owner', null);
  var off = !ORDER_URL || ls('kefada_owner') === '1' || navigator.webdriver || /bot|crawl|spider|preview|headless/i.test(navigator.userAgent || '');
  function rid() { var a = ''; try { var u = new Uint8Array(9); crypto.getRandomValues(u); for (var i = 0; i < u.length; i++) a += ('0' + u[i].toString(16)).slice(-2); } catch (e) { a = String(Math.random()).slice(2) + String(Date.now()); } return a.slice(0, 18); }
  var vid = ls('kefada_vid'); if (!vid) { vid = rid(); ls('kefada_vid', vid); }
  var sid = ss('kefada_sid'), fresh = false; if (!sid) { sid = rid(); ss('kefada_sid', sid); fresh = true; }
  function source() {
    var m = qs.match(/[?&](?:src|utm_source)=([^&#]+)/i), s = m ? decodeURIComponent(m[1]).toLowerCase() : '';
    if (!s) { var r = ''; try { r = new window.URL(document.referrer).hostname.toLowerCase(); } catch (e) {} if (r && r.indexOf(location.hostname) > -1) return ''; s = r; }
    if (!s) return 'direct';
    if (/insta/.test(s)) return 'instagram';
    if (/facebook|fb\.|^fb$|^m\.me|messenger/.test(s)) return 'facebook';
    if (/whatsapp|wa\.me/.test(s)) return 'whatsapp';
    if (/google|bing|duckduckgo|yahoo/.test(s)) return 'search';
    if (/tiktok/.test(s)) return 'tiktok';
    return 'other';
  }
  var src = ss('kefada_src') || source();
  if (fresh || !ss('kefada_src')) ss('kefada_src', src || 'direct');
  var dev = (window.matchMedia && matchMedia('(max-width: 820px)').matches) ? 'phone' : 'computer';
  var seen = {};
  function send(e, item) {
    if (off) return;
    var key = e + '|' + (item || ''); if ((e === 'view' || e === 'checkout') && seen[key]) return; seen[key] = 1;
    var body = JSON.stringify({ action: 'track', v: vid, s: sid, e: e, i: item || '', src: ss('kefada_src') || 'direct', d: dev });
    try { fetch(ORDER_URL, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body }).catch(function () {}); } catch (er) {}
  }
  window.KefadaTrack = { send: send, view: function (id) { send('view', id); }, add: function (id) { send('add', id); }, checkout: function () { send('checkout'); }, order: function () { send('order'); } };
  if (fresh) send('visit');
  if (pageItem) send('view', pageItem);
})();
