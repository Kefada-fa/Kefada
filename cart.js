(function () {
  'use strict';

  var C = Object.assign({ storeName: 'Kefada Fashion', whatsappNumber: '', currency: '$' }, window.SITE_CONFIG || {});
  var CC = Object.assign({ orderUrl: '' }, window.CART_CONFIG || {});
  var MAX = 20;
  var KEY = 'kefada_cart_v1', CUST = 'kefada_cust_v1';
  var NO_MORE = 'No more pieces available in this size.';

  var LEBANON = {
    'Akkar': ['Akkar'],
    'Baalbek-Hermel': ['Baalbek', 'Hermel'],
    'Beirut': ['Beirut'],
    'Beqaa': ['Rashaya', 'West Beqaa', 'Zahle'],
    'Keserwan-Jbeil': ['Jbeil', 'Keserwan'],
    'Mount Lebanon': ['Aley', 'Baabda', 'Chouf', 'Matn'],
    'Nabatieh': ['Bint Jbeil', 'Hasbaya', 'Marjayoun', 'Nabatieh'],
    'North': ['Batroun', 'Bsharri', 'Koura', 'Minieh-Danniyeh', 'Tripoli', 'Zgharta'],
    'South': ['Jezzine', 'Sidon', 'Tyre']
  };

  var lines = [];            // [{id, size, qty}]
  var view = 'cart';         // cart | checkout | done
  var notice = '';
  var settings = null;       // delivery settings from the order script
  var settingsState = 'idle'; // idle | loading | ok | fail
  var openedAt = 0;
  var form = null;           // checkout form values
  var doneInfo = null;
  var busy = false;
  var clearArmed = false;
  var returnFocus = null;

  /* ---------- tiny helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { n = Math.round(n * 100) / 100; return C.currency + (n % 1 ? n.toFixed(2) : String(n)); }
  function shop() { return window.KefadaShop; }
  function find(id) { return shop() && shop().ready() ? shop().find(id) : null; }
  function avail(p, size) { return p && p.sizeQty ? (p.sizeQty[size] || 0) : 0; }
  function pieces() { return lines.reduce(function (a, l) { return a + l.qty; }, 0); }
  function subtotal() { return lines.reduce(function (a, l) { var p = find(l.id); return a + (p && p.shown != null ? p.shown * l.qty : 0); }, 0); }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function reduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function load() {
    var a = lsGet(KEY);
    lines = [];
    if (Array.isArray(a)) a.forEach(function (l) {
      var q = parseInt(l && l.qty, 10);
      if (l && l.id && l.size !== undefined && q >= 1) lines.push({ id: String(l.id), size: String(l.size), qty: Math.min(q, MAX) });
    });
  }
  function save() { lsSet(KEY, lines); }

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $('kc-toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3600);
  }

  /* ---------- Lebanese phone ---------- */
  function cleanPhone(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.indexOf('961') === 0 && d.length > 8) d = d.slice(3);
    d = d.replace(/^0+/, '');
    if (d.length === 8 && /^(70|71|76|78|79|81)/.test(d)) return d.slice(0, 2) + ' ' + d.slice(2, 5) + ' ' + d.slice(5);
    if (d.length === 7 && /^[1-9]/.test(d)) return '0' + d.slice(0, 1) + ' ' + d.slice(1, 4) + ' ' + d.slice(4);
    return '';
  }

  /* ---------- delivery fee ---------- */
  function feeFor(gov, sub) {
    if (!settings || !settings.on) return null;
    var fee;
    if (settings.mode === 'fixed') fee = settings.fixed;
    else { fee = settings.fees ? settings.fees[gov] : null; if (fee == null) return null; }
    if (settings.freeOn && settings.freeAbove > 0 && sub >= settings.freeAbove) fee = 0;
    return fee;
  }

  /* ---------- DOM ---------- */
  var btn, badge, overlay, panel, bodyEl, footEl, titleEl;

  function build() {
    btn = $('cart-btn'); badge = $('cart-count');
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="kc-overlay" id="kc-overlay"></div>' +
      '<aside class="kc" id="kc" role="dialog" aria-modal="true" aria-labelledby="kc-title" aria-hidden="true">' +
      '<div class="kc-head"><h2 id="kc-title" class="kc-title">Your cart</h2>' +
      '<button type="button" class="kc-x" id="kc-x" aria-label="Close cart"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></div>' +
      '<div class="kc-body" id="kc-body"></div><div class="kc-foot" id="kc-foot"></div></aside>' +
      '<div class="kc-toast" id="kc-toast" role="status" aria-live="polite" hidden></div>';
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    overlay = $('kc-overlay'); panel = $('kc'); bodyEl = $('kc-body'); footEl = $('kc-foot'); titleEl = $('kc-title');
    $('kc-x').addEventListener('click', closeAll);
    overlay.addEventListener('click', closeAll);
    btn.addEventListener('click', function () { openCart(); });
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
    panel.addEventListener('input', onInput);
    panel.addEventListener('submit', function (e) { e.preventDefault(); });
    // a photo that is missing: remove the broken picture icon
    panel.addEventListener('error', function (e) { if (e.target && e.target.tagName === 'IMG' && e.target.parentNode) e.target.parentNode.removeChild(e.target); }, true);
    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape') { closeAll(); return; }
      if (e.key === 'Tab') {
        var f = Array.prototype.filter.call(panel.querySelectorAll('button, input, select, textarea, a[href]'), function (x) { return !x.disabled && x.offsetParent !== null && x.tabIndex !== -1; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  function isOpen() { return panel && panel.classList.contains('open'); }

  function updateBadge() {
    var n = pieces();
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = n === 0;
    btn.setAttribute('aria-label', n ? 'Open cart, ' + n + (n === 1 ? ' piece' : ' pieces') : 'Open cart, empty');
  }

  /* ---------- history layers (so the phone Back button closes the cart instead of the site) ---------- */
  function depth() { var s = history.state; return s && s.kf && s.o ? (s.d || 0) : 0; }
  function closeAll() {
    var d = depth();
    if (d > 0) { try { history.go(-d); return; } catch (e) {} }
    hidePanel();
  }
  function stepBack() {
    if (depth() > 0) { try { history.back(); return; } catch (e) {} }
    view = 'cart'; render();
  }
  function push(o, d) { if (shop() && shop().push) shop().push(o, d); }

  function showPanel() {
    if (isOpen()) return;
    returnFocus = document.activeElement;
    panel.classList.add('open'); overlay.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kc-open');
    setTimeout(function () { var x = $('kc-x'); if (x && isOpen()) x.focus(); }, 60);
  }
  function hidePanel() {
    if (!isOpen()) return;
    panel.classList.remove('open'); overlay.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('kc-open');
    view = 'cart'; busy = false;
    if (returnFocus && returnFocus.focus) { try { returnFocus.focus(); } catch (e) {} }
  }

  function openCart() {
    if (!isOpen()) push('cart', 1);
    view = 'cart'; sanitize(); render(); showPanel();
  }
  function goCheckout() {
    if (!lines.length) return;
    push('checkout', 2);
    if (window.KefadaTrack) KefadaTrack.checkout();
    view = 'checkout'; openedAt = Date.now(); initForm(); render(); fetchSettings();
    panel.scrollTop = 0;
  }
  // Called by app.js on Back / Forward.
  function syncTo(o) {
    if (o === 'cart') { view = 'cart'; sanitize(); render(); showPanel(); }
    else if (o === 'checkout') {
      if (!lines.length && view !== 'done') { view = 'cart'; render(); showPanel(); return; }
      if (view !== 'done') { view = 'checkout'; if (!form) { initForm(); openedAt = Date.now(); } render(); fetchSettings(); }
      showPanel();
    } else hidePanel();
  }

  /* ---------- keeping the cart honest ---------- */
  function sanitize() {
    if (!shop() || !shop().ready()) return false;
    var removed = [], reduced_ = false, out = [];
    lines.forEach(function (l) {
      var p = shop().find(l.id);
      if (!p || p.soldOut || avail(p, l.size) <= 0) { removed.push(p ? p.name : l.id); return; }
      var a = Math.min(avail(p, l.size), MAX);
      if (l.qty > a) { l.qty = a; reduced_ = true; }
      var hit = out.filter(function (x) { return x.id === l.id && x.size === l.size; })[0];
      if (hit) hit.qty = Math.min(hit.qty + l.qty, a); else out.push(l);
    });
    // never more than MAX pieces in total
    var total = 0;
    out.forEach(function (l) { if (total + l.qty > MAX) { l.qty = Math.max(0, MAX - total); reduced_ = true; } total += l.qty; });
    out = out.filter(function (l) { return l.qty > 0; });
    var changed = removed.length || reduced_ || out.length !== lines.length;
    lines = out;
    if (changed) {
      save();
      var msgs = [];
      if (removed.length) msgs.push('Removed because it is no longer available: ' + removed.join(', ') + '.');
      if (reduced_) msgs.push('Some quantities were reduced. There are no more pieces available in that size.');
      notice = msgs.join(' ');
    }
    updateBadge();
    return changed;
  }

  /* ---------- adding ---------- */
  function add(id, size, from, opts) {
    opts = opts || {};
    var p = find(id);
    if (!p || p.soldOut) { toast('Sorry, this item is not available.'); return false; }
    if (p.sizes.length && !size) { toast('Please choose a size first.'); return false; }
    size = size || '';
    var line = lines.filter(function (l) { return l.id === id && l.size === size; })[0];
    var have = line ? line.qty : 0;
    if (have + 1 > avail(p, size)) { toast(NO_MORE); return false; }
    if (pieces() + 1 > MAX) { toast('You can order up to ' + MAX + ' pieces at once. For a bigger order, message us on WhatsApp.'); return false; }
    if (line) line.qty += 1; else lines.push({ id: id, size: size, qty: 1 });
    save();
    if (window.KefadaTrack) KefadaTrack.add(id);
    var before = pieces() - 1;
    if (opts.silent) { updateBadge(); return true; }
    fly(from, p, function () { updateBadge(); bump(); });
    if (isOpen()) render();
    return true;
  }

  function bump() {
    btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
  }

  function fly(from, p, done) {
    if (!from || reduced() || !from.getBoundingClientRect || !btn.animate) { done(); return; }
    var a = from.getBoundingClientRect(), b = btn.getBoundingClientRect();
    if (!a.width || !b.width) { done(); return; }
    var size = 54;
    var dot = document.createElement('div');
    dot.className = 'kc-fly';
    var img = null;
    var card = from.closest ? from.closest('.card') : null;
    if (card) img = card.querySelector('.photo-open img');
    if (img && img.currentSrc) dot.style.backgroundImage = 'url("' + img.currentSrc.replace(/"/g, '%22') + '")';
    dot.style.width = dot.style.height = size + 'px';
    dot.style.left = (a.left + a.width / 2 - size / 2) + 'px';
    dot.style.top = (a.top + a.height / 2 - size / 2) + 'px';
    document.body.appendChild(dot);
    var dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    var anim = dot.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0 },
      { transform: 'translate(' + (dx * 0.5) + 'px,' + (dy * 0.5 - 70) + 'px) scale(.8)', opacity: 1, offset: .55 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.2)', opacity: .25, offset: 1 }
    ], { duration: 750, easing: 'cubic-bezier(.45,.05,.55,.95)' });
    var finished = false;
    function end() { if (finished) return; finished = true; if (dot.parentNode) dot.parentNode.removeChild(dot); done(); }
    anim.onfinish = end;
    setTimeout(end, 1100);
  }

  /* ---------- cart view ---------- */
  function lineHtml(l, i) {
    var p = find(l.id);
    if (!p) return '<div class="kc-line"><div class="kc-lt">Loading...</div></div>';
    var photo = p.photos && p.photos.length ? '<img src="images/' + encodeURIComponent(p.photos[0]) + '" alt="" loading="lazy">' : '';
    var sizes = '';
    if (p.sizes.length) {
      sizes = '<label class="kc-sz"><span class="kc-lab">Size</span><select data-act="size" data-i="' + i + '" aria-label="Size for ' + esc(p.name) + '">' +
        p.sizes.map(function (s) { return '<option value="' + esc(s) + '"' + (s === l.size ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label>';
    }
    var price = p.shown != null ? money(p.shown * l.qty) : '';
    return '<div class="kc-line" data-line="' + i + '"><div class="kc-ph">' + photo + '</div><div class="kc-li">' +
      '<div class="kc-name">' + esc(p.name) + '</div>' +
      '<div class="kc-ctl">' + sizes +
      '<div class="kc-qty" role="group" aria-label="Quantity for ' + esc(p.name) + '"><button type="button" data-act="minus" data-i="' + i + '" aria-label="One less">&minus;</button><span aria-live="polite">' + l.qty + '</span><button type="button" data-act="plus" data-i="' + i + '" aria-label="One more">+</button></div></div>' +
      '<div class="kc-lp"><b>' + esc(price) + '</b>' + (p.shown != null && l.qty > 1 ? '<span class="kc-each">' + esc(money(p.shown)) + ' each</span>' : '') + '</div></div>' +
      '<button type="button" class="kc-rm" data-act="rm" data-i="' + i + '" aria-label="Remove ' + esc(p.name) + '"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></div>';
  }

  function renderCart() {
    titleEl.textContent = 'Your cart';
    var h = '';
    if (notice) h += '<div class="kc-note" role="status">' + esc(notice) + '</div>';
    if (!lines.length) {
      bodyEl.innerHTML = h + '<div class="kc-empty"><p>Your cart is empty.</p><p class="kc-small">Pick a size on any item and tap Add to cart.</p></div>';
      footEl.innerHTML = '<button type="button" class="kc-btn kc-btn-ink" data-act="continue">Continue shopping</button>';
      return;
    }
    h += '<div class="kc-lines">' + lines.map(lineHtml).join('') + '</div>';
    bodyEl.innerHTML = h;
    var n = pieces();
    footEl.innerHTML =
      '<div class="kc-sub"><span>Subtotal <span class="kc-small">(' + n + (n === 1 ? ' piece' : ' pieces') + ')</span></span><b>' + esc(money(subtotal())) + '</b></div>' +
      '<p class="kc-small kc-nodel">Delivery is added at checkout if you choose delivery.</p>' +
      '<button type="button" class="kc-btn kc-btn-ink" data-act="checkout">Checkout</button>' +
      '<div class="kc-row2"><button type="button" class="kc-btn kc-btn-line" data-act="continue">Continue shopping</button>' +
      '<button type="button" class="kc-link" data-act="clear">' + (clearArmed ? 'Tap again to clear' : 'Clear cart') + '</button></div>';
  }

  /* ---------- checkout ---------- */
  function initForm() {
    var s = lsGet(CUST) || {};
    form = {
      name: s.name || '', phone: s.phone || '', method: s.method === 'pickup' ? 'pickup' : 'delivery',
      gov: s.gov || '', district: s.district || '', city: s.city || '', hood: s.hood || '', street: s.street || '', details: s.details || '',
      notes: '', agree: false, website: '', remembered: !!(s.name || s.phone), err: {}
    };
  }

  function fetchSettings() {
    if (!CC.orderUrl) return;
    if (settingsState === 'loading') return;
    settingsState = 'loading';
    fetch(CC.orderUrl + (CC.orderUrl.indexOf('?') > -1 ? '&' : '?') + 'action=settings&t=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok || !j.delivery) throw new Error('bad');
        settings = j.delivery; settingsState = 'ok';
        if (view === 'checkout') renderCheckout(true);
      })
      .catch(function () { settingsState = 'fail'; if (view === 'checkout') renderCheckout(true); });
  }

  function distOptions(gov, cur) {
    var l = LEBANON[gov] || [];
    return '<option value="">Choose district</option>' + l.map(function (d) { return '<option value="' + esc(d) + '"' + (d === cur ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('');
  }

  function field(id, label, value, attrs, req) {
    var e = form.err[id];
    return '<label class="kc-f' + (e ? ' bad' : '') + '"><span class="kc-lab">' + esc(label) + (req ? '' : ' <i>(optional)</i>') + '</span>' +
      '<input id="kc-' + id + '" data-f="' + id + '" value="' + esc(value) + '" ' + (attrs || '') + '>' + (e ? '<span class="kc-err" role="alert">' + esc(e) + '</span>' : '') + '</label>';
  }

  function summaryHtml() {
    var sub = subtotal(), fee = form.method === 'delivery' ? feeFor(form.gov, sub) : 0;
    var rows = '<div class="kc-sr"><span>Subtotal</span><span>' + esc(money(sub)) + '</span></div>';
    if (form.method === 'delivery') {
      var txt;
      if (!form.gov) txt = 'Choose your governorate';
      else if (fee == null) txt = 'Not available to this area';
      else txt = fee === 0 ? 'Free' : money(fee);
      rows += '<div class="kc-sr"><span>Delivery</span><span>' + esc(txt) + '</span></div>';
    }
    var total = sub + (fee || 0);
    rows += '<div class="kc-sr kc-total"><span>Total <span class="kc-small">(cash on delivery)</span></span><b>' + esc(money(total)) + '</b></div>';
    if (form.method === 'delivery' && settings && settings.freeOn && settings.freeAbove > 0 && fee !== 0) {
      var need = settings.freeAbove - sub;
      if (need > 0 && need <= settings.freeAbove) rows += '<p class="kc-small kc-free">Add ' + esc(money(need)) + ' more to get free delivery.</p>';
    }
    return rows;
  }

  function renderCheckout(keepFocus) {
    var active = keepFocus ? document.activeElement : null, activeId = active && active.id, selStart = active && active.selectionStart;
    var scroll = bodyEl.scrollTop;
    titleEl.textContent = 'Checkout';
    var f = form;
    if (!CC.orderUrl) {
      bodyEl.innerHTML = '<div class="kc-note">Online ordering is not available right now. You can send your cart to us on WhatsApp and we will take care of it.</div>';
      footEl.innerHTML = '<a class="kc-btn kc-btn-wa" target="_blank" rel="noopener noreferrer" href="' + esc(cartWaLink()) + '">Send my cart on WhatsApp</a><button type="button" class="kc-btn kc-btn-line" data-act="back">Back to cart</button>';
      return;
    }
    var delOk = settingsState === 'ok' && settings && settings.on;
    var delMsg = '';
    if (settingsState === 'loading' || settingsState === 'idle') delMsg = '<p class="kc-small">Checking delivery options...</p>';
    else if (settingsState === 'fail') delMsg = '<p class="kc-err-box">We could not load the delivery options. Check your internet, or choose Pick up and contact us on WhatsApp.</p>';
    else if (!settings.on) delMsg = '<p class="kc-err-box">Delivery is not available right now. Choose Pick up and contact us on WhatsApp.</p>';
    if (!delOk && f.method === 'delivery' && settingsState !== 'loading' && settingsState !== 'idle') f.method = 'pickup';

    var govs = '<option value="">Choose governorate</option>' + Object.keys(LEBANON).map(function (g) {
      var fee = settings && settings.mode === 'governorate' && settings.fees ? settings.fees[g] : undefined;
      var dis = settings && settings.mode === 'governorate' && (fee == null) ? ' disabled' : '';
      return '<option value="' + esc(g) + '"' + (g === f.gov ? ' selected' : '') + dis + '>' + esc(g) + (dis ? ' (not available)' : '') + '</option>';
    }).join('');

    var h = '';
    if (notice) h += '<div class="kc-note" role="status">' + esc(notice) + '</div>';
    if (f.formError) h += '<div class="kc-err-box" role="alert">' + esc(f.formError) + '</div>';
    h += '<form id="kc-form" novalidate autocomplete="on">' +
      '<h3 class="kc-h">Your details</h3>' +
      field('name', 'Full name', f.name, 'type="text" autocomplete="name" maxlength="80"', true) +
      field('phone', 'Phone number', f.phone, 'type="tel" inputmode="tel" autocomplete="tel" placeholder="03 123 456" maxlength="20"', true) +
      '<p class="kc-small kc-hint">Lebanese number, no +961 needed.</p>' +
      (f.remembered ? '<p class="kc-small"><button type="button" class="kc-link" data-act="forget">Not you? Clear my details</button></p>' : '') +
      '<h3 class="kc-h">How would you like to receive it?</h3>' +
      '<div class="kc-radios" role="radiogroup" aria-label="Receiving method">' +
      '<label class="kc-radio' + (f.method === 'pickup' ? ' on' : '') + '"><input type="radio" name="kc-method" value="pickup"' + (f.method === 'pickup' ? ' checked' : '') + '><span>Pick up</span></label>' +
      '<label class="kc-radio' + (f.method === 'delivery' ? ' on' : '') + (delOk ? '' : ' off') + '"><input type="radio" name="kc-method" value="delivery"' + (f.method === 'delivery' ? ' checked' : '') + (delOk ? '' : ' disabled') + '><span>Delivery</span></label></div>' +
      delMsg +
      (delOk && settings.note ? '<p class="kc-small">' + esc(settings.note) + '</p>' : '') +
      (f.method === 'delivery' && delOk ?
        '<div class="kc-addr"><h3 class="kc-h">Delivery address</h3>' +
        '<label class="kc-f' + (f.err.gov ? ' bad' : '') + '"><span class="kc-lab">Governorate</span><select id="kc-gov" data-f="gov">' + govs + '</select>' + (f.err.gov ? '<span class="kc-err" role="alert">' + esc(f.err.gov) + '</span>' : '') + '</label>' +
        '<label class="kc-f' + (f.err.district ? ' bad' : '') + '"><span class="kc-lab">District</span><select id="kc-district" data-f="district"' + (f.gov ? '' : ' disabled') + '>' + distOptions(f.gov, f.district) + '</select>' + (f.err.district ? '<span class="kc-err" role="alert">' + esc(f.err.district) + '</span>' : '') + '</label>' +
        field('city', 'City', f.city, 'type="text" autocomplete="address-level2" maxlength="60"', true) +
        field('hood', 'Neighbourhood', f.hood, 'type="text" maxlength="60"', false) +
        field('street', 'Street', f.street, 'type="text" autocomplete="address-line1" maxlength="100"', true) +
        field('details', 'Building, floor, other details', f.details, 'type="text" maxlength="200"', false) + '</div>' : '') +
      '<label class="kc-f"><span class="kc-lab">Order notes <i>(optional)</i></span><textarea id="kc-notes" data-f="notes" rows="3" maxlength="300" placeholder="Anything we should know?">' + esc(f.notes) + '</textarea></label>' +
      '<div class="kc-hp" aria-hidden="true"><label>Website<input type="text" id="kc-website" data-f="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<div class="kc-policy"><b>Return &amp; exchange policy</b><br>All sales are final and returns are not accepted. Exchanges are welcome; the delivery fee for the replacement item is covered by the customer.</div>' +
      '<label class="kc-agree' + (f.err.agree ? ' bad' : '') + '"><input type="checkbox" id="kc-agree" data-f="agree"' + (f.agree ? ' checked' : '') + '><span>I agree with the return and exchange policy</span></label>' +
      (f.err.agree ? '<span class="kc-err" role="alert">' + esc(f.err.agree) + '</span>' : '') +
      '<p class="kc-small">Payment: cash on delivery.</p></form>';
    bodyEl.innerHTML = h;
    bodyEl.scrollTop = scroll;
    footEl.innerHTML = '<div class="kc-sum" id="kc-sum">' + summaryHtml() + '</div>' +
      '<button type="button" class="kc-btn kc-btn-ink" data-act="place"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Checking availability...' : 'Place order') + '</button>' +
      '<button type="button" class="kc-btn kc-btn-line" data-act="back"' + (busy ? ' disabled' : '') + '>Back to cart</button>';
    if (activeId && $(activeId)) { var el = $(activeId); el.focus(); try { if (selStart != null && el.setSelectionRange) el.setSelectionRange(selStart, selStart); } catch (e) {} }
  }

  function cartWaLink() {
    var l = ['Hello ' + C.storeName + ', I would like to order:'];
    lines.forEach(function (x) { var p = find(x.id); if (p) l.push('- ' + p.name + (p.id ? ' (' + p.id + ')' : '') + (x.size ? ', size ' + x.size : '') + ', x' + x.qty + (p.shown != null ? ': ' + money(p.shown * x.qty) : '')); });
    l.push('Subtotal: ' + money(subtotal()));
    return 'https://wa.me/' + C.whatsappNumber + '?text=' + encodeURIComponent(l.join('\n'));
  }

  function validate() {
    var f = form, e = {};
    if (f.name.trim().length < 2) e.name = 'Please type your full name.';
    if (!cleanPhone(f.phone)) e.phone = 'Please type a valid Lebanese number, for example 03 123 456 or 70 123 456.';
    if (f.method === 'delivery') {
      if (!f.gov) e.gov = 'Please choose your governorate.';
      if (!f.district) e.district = 'Please choose your district.';
      if (!f.city.trim()) e.city = 'Please type your city.';
      if (!f.street.trim()) e.street = 'Please type your street.';
      if (f.gov && feeFor(f.gov, subtotal()) == null) e.gov = 'Sorry, delivery is not available to this area.';
    }
    if (!f.agree) e.agree = 'Please tick the box to continue.';
    f.err = e;
    return Object.keys(e).length === 0;
  }

  function place() {
    if (busy) return;
    sanitize();
    if (!lines.length) { view = 'cart'; render(); return; }
    form.formError = '';
    if (!validate()) {
      renderCheckout();
      var bad = bodyEl.querySelector('.bad input, .bad select, .bad textarea');
      if (bad) { bad.focus(); }
      return;
    }
    busy = true; renderCheckout(true);
    var f = form;
    var body = {
      action: 'order', name: f.name.trim(), phone: f.phone.trim(), method: f.method, agree: true, notes: f.notes.trim(),
      website: f.website, fillMs: Date.now() - openedAt,
      lines: lines.map(function (l) { return { id: l.id, size: l.size, qty: l.qty }; })
    };
    if (f.method === 'delivery') { body.governorate = f.gov; body.district = f.district; body.city = f.city.trim(); body.neighbourhood = f.hood.trim(); body.street = f.street.trim(); body.details = f.details.trim(); }
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 40000);
    fetch(CC.orderUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(to); busy = false; onResult(j); })
      .catch(function () {
        clearTimeout(to); busy = false;
        form.formError = 'We could not reach the shop. Please check your internet and try again, or contact us on WhatsApp.';
        renderCheckout();
      });
  }

  function onResult(j) {
    if (j && j.ok && j.order) { success(j.order); return; }
    if (j && j.code === 'stock' && Array.isArray(j.problems)) {
      var names = [];
      j.problems.forEach(function (pr) {
        var l = lines.filter(function (x) { return x.id === pr.id && x.size === pr.size; })[0];
        if (!l) return;
        var p = find(pr.id);
        if (pr.max > 0 && !pr.gone) l.qty = Math.min(l.qty, pr.max); else lines.splice(lines.indexOf(l), 1);
        names.push(p ? p.name : pr.id);
      });
      save(); updateBadge();
      notice = 'Some pieces are no longer available, so we updated your cart (' + names.join(', ') + '). Please check it and try again.';
      stepBack();
      setTimeout(function () { if (view !== 'cart') { view = 'cart'; } render(); }, 30);
      return;
    }
    if (j && j.code === 'delivery') { settingsState = 'idle'; fetchSettings(); }
    form.formError = (j && j.error) || 'Sorry, we could not place the order. Please try again or contact us on WhatsApp.';
    renderCheckout();
    bodyEl.scrollTop = 0;
  }

  function success(o) {
    var f = form;
    lsSet(CUST, { name: f.name.trim(), phone: f.phone.trim(), method: f.method, gov: f.gov, district: f.district, city: f.city.trim(), hood: f.hood.trim(), street: f.street.trim(), details: f.details.trim() });
    doneInfo = { order: o };
    if (window.KefadaTrack) KefadaTrack.order();
    lines = []; save(); updateBadge(); notice = ''; view = 'done';
    if (window.KefadaShop && shop().refresh) shop().refresh();
    render();
    panel.scrollTop = 0; bodyEl.scrollTop = 0;
  }

  function orderWaLink(o) {
    var l = ['Hello ' + C.storeName + ', I just placed order ' + o.number + '.', 'Name: ' + o.name, ''];
    o.items.forEach(function (it) { l.push('- ' + it.name + (it.id ? ' (' + it.id + ')' : '') + (it.size ? ', size ' + it.size : '') + ', x' + it.qty + ': ' + money(it.price * it.qty)); });
    l.push('');
    l.push('Subtotal: ' + money(o.subtotal));
    if (o.method === 'delivery') {
      l.push('Delivery: ' + (o.delivery ? money(o.delivery) : 'Free'));
      var a = o.addr || {};
      l.push('Address: ' + [a.street, a.hood, a.city, a.district, a.gov].filter(Boolean).join(', ') + (a.details ? ' (' + a.details + ')' : ''));
    } else l.push('Pick up');
    l.push('Total (cash on delivery): ' + money(o.total));
    return 'https://wa.me/' + C.whatsappNumber + '?text=' + encodeURIComponent(l.join('\n'));
  }

  function renderDone() {
    var o = doneInfo.order, first = String(o.name || '').trim().split(/\s+/)[0];
    titleEl.textContent = 'Order received';
    bodyEl.innerHTML = '<div class="kc-done"><div class="kc-check" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg></div>' +
      '<h3 class="kc-thanks">Thank you' + (first ? ', ' + esc(first) : '') + '!</h3>' +
      '<p>Your order number is</p><div class="kc-ordno">' + esc(o.number) + '</div>' +
      '<p>To make sure we see it right away, please send it to us on WhatsApp.</p>' +
      '<p class="kc-small">We will confirm your order shortly. Payment is cash on delivery: <b>' + esc(money(o.total)) + '</b>' + (o.method === 'delivery' ? ' (delivery included)' : '') + '.</p></div>';
    footEl.innerHTML = '<a class="kc-btn kc-btn-wa" target="_blank" rel="noopener noreferrer" href="' + esc(orderWaLink(o)) + '">Send on WhatsApp</a><button type="button" class="kc-btn kc-btn-line" data-act="close">Close</button>';
  }

  function render() {
    if (view === 'checkout') renderCheckout();
    else if (view === 'done' && doneInfo) renderDone();
    else renderCart();
  }

  /* ---------- events ---------- */
  function onClick(e) {
    var t = e.target.closest('[data-act]');
    if (!t) {
      var r = e.target.closest('input[name="kc-method"]');
      return;
    }
    var act = t.getAttribute('data-act'), i = parseInt(t.getAttribute('data-i'), 10);
    if (act !== 'clear') clearArmed = false;
    if (act === 'continue' || act === 'close') closeAll();
    else if (act === 'checkout') goCheckout();
    else if (act === 'back') stepBack();
    else if (act === 'place') place();
    else if (act === 'forget') { lsDel(CUST); initForm(); renderCheckout(); }
    else if (act === 'plus') { changeQty(i, 1); }
    else if (act === 'minus') { changeQty(i, -1); }
    else if (act === 'rm') { lines.splice(i, 1); save(); updateBadge(); renderCart(); }
    else if (act === 'clear') {
      if (!clearArmed) { clearArmed = true; renderCart(); setTimeout(function () { if (clearArmed) { clearArmed = false; if (view === 'cart') renderCart(); } }, 4000); }
      else { lines = []; save(); updateBadge(); clearArmed = false; notice = ''; renderCart(); }
    }
  }

  function changeQty(i, d) {
    var l = lines[i]; if (!l) return;
    var p = find(l.id);
    if (d > 0) {
      if (p && l.qty + 1 > avail(p, l.size)) { toast(NO_MORE); return; }
      if (pieces() + 1 > MAX) { toast('You can order up to ' + MAX + ' pieces at once. For a bigger order, message us on WhatsApp.'); return; }
      l.qty += 1;
    } else {
      if (l.qty <= 1) return;
      l.qty -= 1;
    }
    save(); updateBadge(); renderCart();
    var b = bodyEl.querySelector('[data-act="' + (d > 0 ? 'plus' : 'minus') + '"][data-i="' + i + '"]');
    if (b) b.focus();
  }

  function onChange(e) {
    var t = e.target;
    if (t.getAttribute('data-act') === 'size') {
      var i = parseInt(t.getAttribute('data-i'), 10), l = lines[i], p = l && find(l.id);
      if (!l || !p) return;
      var ns = t.value, other = lines.filter(function (x, k) { return k !== i && x.id === l.id && x.size === ns; })[0];
      var want = l.qty + (other ? other.qty : 0), a = avail(p, ns);
      if (a <= 0) { toast(NO_MORE); renderCart(); return; }
      var q = Math.min(want, a, MAX);
      if (q < want) toast(NO_MORE);
      if (other) { other.qty = q; lines.splice(i, 1); } else { l.size = ns; l.qty = Math.min(l.qty, a); }
      save(); updateBadge(); renderCart();
      return;
    }
    if (t.name === 'kc-method') { form.method = t.value; form.err = {}; renderCheckout(); return; }
    var k = t.getAttribute('data-f');
    if (!k || !form) return;
    if (k === 'gov') { form.gov = t.value; form.district = ''; delete form.err.gov; delete form.err.district; renderCheckout(); }
    else if (k === 'district') { form.district = t.value; delete form.err.district; }
    else if (k === 'agree') { form.agree = t.checked; delete form.err.agree; renderCheckout(true); }
  }

  function onInput(e) {
    var t = e.target, k = t.getAttribute && t.getAttribute('data-f');
    if (!k || !form || t.type === 'checkbox' || t.tagName === 'SELECT') return;
    form[k] = t.value;
    if (form.err[k]) { delete form.err[k]; var wrap = t.closest('.kc-f'); if (wrap) { wrap.classList.remove('bad'); var er = wrap.querySelector('.kc-err'); if (er) er.remove(); } }
  }

  /* ---------- deep link from an item page: ?add=ID&size=S ---------- */
  function handleLink() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var id = q.get('add');
    if (!id || !shop() || !shop().ready()) return;
    var size = q.get('size') || '';
    try { history.replaceState(history.state, '', location.pathname + location.hash); } catch (e) {}
    var p = shop().find(id);
    if (!p) { toast('Sorry, that item is not available.'); return; }
    var ok = add(id, size, null, { silent: true });
    if (ok) { openCart(); }
  }

  var linked = false;
  function onProducts() {
    if (sanitize() && isOpen()) render();
    updateBadge();
    if (isOpen() && view === 'cart') renderCart();
    if (!linked) { linked = true; handleLink(); }
  }

  function init() {
    load(); build(); updateBadge();
    document.addEventListener('kf:products', onProducts);
    window.addEventListener('storage', function (e) { if (e.key === KEY) { load(); updateBadge(); if (isOpen() && view === 'cart') renderCart(); } });
    if (shop() && shop().ready()) onProducts();
  }

  window.KefadaCart = { add: add, open: openCart, syncTo: syncTo, count: pieces, isOpen: isOpen };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
