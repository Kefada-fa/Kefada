(function () {
  'use strict';

  var C = Object.assign({
    storeName: 'Kefada Fashion',
    whatsappNumber: '',
    whatsappDisplay: '',
    currency: '$',
    deliveryText: 'All Lebanon',
    instagram: '',
    sheetCsvUrl: '',
    lowStockAt: 3
  }, window.SITE_CONFIG || {});

  var state = { collection: 'All', genre: 'All', sizes: [], sel: {}, photoIdx: {}, products: [], page: 1 };

  var gridEl = document.getElementById('grid');
  var filtersEl = document.getElementById('filters');
  var countEl = document.getElementById('count');
  var emptyEl = document.getElementById('empty');
  var pagerEl = document.getElementById('pager');
  var phoneMq = window.matchMedia ? window.matchMedia('(max-width: 640px)') : { matches: false };

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) {
    return C.currency + (Math.round(n) === n ? String(n) : n.toFixed(2));
  }

  function toNum(v) {
    var s = String(v == null ? '' : v).replace(/[^0-9.\-]/g, '');
    if (s === '' || s === '-' || s === '.') return null;
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function splitList(s) {
    if (!s) return [];
    return String(s).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function upperFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function titleCase(s) { return s ? upperFirst(s.toLowerCase()) : ''; }

  function sizeSort(a, b) {
    var na = parseFloat(a), nb = parseFloat(b);
    var an = !isNaN(na), bn = !isNaN(nb);
    if (an && bn) return (na - nb) || a.localeCompare(b);
    if (an) return -1;
    if (bn) return 1;
    return a.localeCompare(b);
  }

  /* ---------- reading the sheet (CSV) ---------- */

  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; } else { q = false; }
        } else { cur += ch; }
      } else if (ch === '"') { q = true; }
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch !== '\r') { cur += ch; }
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    var head = rows[0];
    return rows.slice(1)
      .filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); })
      .map(function (r) {
        var o = {};
        head.forEach(function (h, i) { o[h] = r[i] == null ? '' : r[i]; });
        return o;
      });
  }

  function fieldOf(header) {
    var h = String(header).toLowerCase();
    if (h.indexOf('photo') > -1) return 'photos';
    if (h.indexOf('sale') > -1) return 'sale';
    if (h.indexOf('status') > -1) return null;
    if (h === 'id' || h === 'code') return 'id';
    if (h.indexOf('name') > -1) return 'name';
    if (h.indexOf('collection') > -1) return 'collection';
    if (h.indexOf('genre') > -1) return 'genre';
    if (h.indexOf('price') > -1) return 'price';
    if (h.indexOf('size') > -1) return 'sizes';
    if (h.indexOf('quantity') > -1) return 'qty';
    if (h.indexOf('description') > -1) return 'description';
    if (h.indexOf('show') > -1) return 'show';
    return null;
  }

  // "1,2,2,3,4,4,5" -> sizes 1,2,3,4,5 (shown once each) and how many pieces of each: 1:1, 2:2, 3:1, 4:2, 5:1.
  function parseSizes(str) {
    var list = [], counts = {}, total = 0;
    splitList(str).forEach(function (s) {
      if (!Object.prototype.hasOwnProperty.call(counts, s)) { counts[s] = 0; list.push(s); }
      counts[s] += 1;
      total += 1;
    });
    return { list: list, counts: counts, total: total };
  }

  function normalize(obj, uid) {
    var f = {};
    Object.keys(obj).forEach(function (k) {
      var n = fieldOf(k);
      if (n) f[n] = obj[k] == null ? '' : String(obj[k]).trim();
    });
    if (!f.name) return null;
    if ((f.show || '').toLowerCase() === 'no') return null;

    var price = toNum(f.price);
    var sale = toNum(f.sale);
    var sz = parseSizes(f.sizes);
    // Quantity: the Quantity column if it has a number, otherwise the number of sizes listed (1,2,2,3 = 4 pieces).
    var qty = toNum(f.qty);
    if (qty === null) qty = sz.total;
    var soldOut = qty <= 0;
    var onSale = price !== null && sale !== null && sale > 0 && sale < price;

    return {
      uid: uid,
      id: f.id || '',
      name: upperFirst(f.name),
      collection: titleCase(f.collection),
      genre: titleCase(f.genre),
      price: price,
      shown: onSale ? sale : price,
      onSale: onSale,
      qty: qty,
      soldOut: soldOut,
      sizes: soldOut ? [] : sz.list,
      sizeQty: soldOut ? {} : sz.counts,
      photos: splitList(f.photos),
      description: f.description || ''
    };
  }

  function setProducts(rows) {
    var list = [];
    rows.forEach(function (r) {
      var p = normalize(r, list.length);
      if (p) list.push(p);
    });
    state.products = list;
    state.page = 1;
    renderFilters();
    renderGrid();
  }

  /* ---------- filters ---------- */

  function orderedValues(values, preferred) {
    var set = Array.from(new Set(values.filter(Boolean)));
    set.sort(function (a, b) {
      var ia = preferred.indexOf(a), ib = preferred.indexOf(b);
      if (ia < 0) ia = 99;
      if (ib < 0) ib = 99;
      return (ia - ib) || a.localeCompare(b);
    });
    return set;
  }

  function pillHtml(group, value, label, on) {
    return '<button type="button" class="pill" data-group="' + group + '" data-value="' + esc(value) +
      '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }

  function renderFilters() {
    var P = state.products;
    var collections = orderedValues(P.map(function (p) { return p.collection; }), ['Summer', 'Winter']);
    // Unisex has no button of its own: a Unisex item shows under both Boys and Girls.
    var genreValues = [];
    P.forEach(function (p) {
      if (p.genre === 'Unisex') genreValues.push('Boys', 'Girls');
      else genreValues.push(p.genre);
    });
    var genres = orderedValues(genreValues, ['Boys', 'Girls', 'Baby']);
    var sizes = [];
    P.forEach(function (p) { p.sizes.forEach(function (s) { if (sizes.indexOf(s) < 0) sizes.push(s); }); });
    sizes.sort(sizeSort);

    function fill(rowId, boxId, group, values, current) {
      var row = document.getElementById(rowId);
      row.hidden = values.length === 0;
      var html = pillHtml(group, 'All', 'All', current === 'All');
      values.forEach(function (v) { html += pillHtml(group, v, v, current === v); });
      document.getElementById(boxId).innerHTML = html;
    }
    fill('row-collection', 'f-collection', 'collection', collections, state.collection);
    fill('row-genre', 'f-genre', 'genre', genres, state.genre);

    var sizeRow = document.getElementById('row-size');
    sizeRow.hidden = sizes.length === 0;
    var sh = pillHtml('size', '', 'All', state.sizes.length === 0);
    sizes.forEach(function (s) { sh += pillHtml('size', s, s, state.sizes.indexOf(s) > -1); });
    var sizeBox = document.getElementById('f-size');
    var keepLeft = sizeBox.scrollLeft;
    sizeBox.innerHTML = sh;
    sizeBox.scrollLeft = keepLeft;
    updateBars();
  }

  filtersEl.addEventListener('click', function (e) {
    var b = e.target.closest('.pill');
    if (!b) return;
    var g = b.getAttribute('data-group');
    var v = b.getAttribute('data-value');
    if (g === 'size') {
      if (v === '') state.sizes = [];
      else if (state.sizes.indexOf(v) > -1) state.sizes = state.sizes.filter(function (s) { return s !== v; });
      else state.sizes = state.sizes.concat([v]);
    } else {
      state[g] = v;
    }
    state.page = 1;
    renderFilters();
    renderGrid();
  });

  /* ---------- cards ---------- */

  function photoUrl(file) { return 'images/' + encodeURIComponent(file); }

  function absolutePhoto(file) {
    try { return new URL(photoUrl(file), document.baseURI).href; }
    catch (err) { return photoUrl(file); }
  }

  // Must match safeId() in build-item-pages.mjs
  function safeId(id) {
    return String(id || '').trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // Link to the item's own page (it carries the photo preview for WhatsApp).
  function itemPageUrl(p) {
    var id = safeId(p.id);
    if (!id) return '';
    try { return new URL('item/' + encodeURIComponent(id) + '.html', document.baseURI).href; }
    catch (err) { return ''; }
  }

  function waLink(p, size) {
    var lines = ['Hello ' + C.storeName + ', I would like to order:', p.name];
    if (p.id) lines.push('Code: ' + p.id);
    if (size) lines.push('Size: ' + size);
    if (p.shown !== null) lines.push('Price: ' + money(p.shown));
    var link = itemPageUrl(p) || (p.photos.length ? absolutePhoto(p.photos[0]) : '');
    if (link) lines.push('Photo: ' + link);
    return 'https://wa.me/' + C.whatsappNumber + '?text=' + encodeURIComponent(lines.join('\n'));
  }

  var ARROW_L = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"></path></svg>';
  var ARROW_R = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"></path></svg>';

  function cardHtml(p) {
    var n = p.photos.length;
    var idx = n ? (state.photoIdx[p.uid] || 0) % n : 0;
    var sel = state.sel[p.uid];
    if (sel && p.sizes.indexOf(sel) < 0) sel = null;

    var photo = '<div class="photo" data-uid="' + p.uid + '">' +
      (n ? '' : '<div class="ph" aria-hidden="true">Photo coming soon</div>');
    if (n) {
      photo += '<button type="button" class="photo-open" data-act="open" data-uid="' + p.uid +
        '" aria-label="View photo of ' + esc(p.name) + ' larger">' +
        '<img src="' + esc(photoUrl(p.photos[idx])) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async"></button>';
    }
    if (p.onSale && !p.soldOut) photo += '<div class="tag-sale">Sale</div>';
    if (n > 1) {
      photo += '<button type="button" class="arrow prev" data-act="prev" data-uid="' + p.uid + '" aria-label="Previous photo">' + ARROW_L + '</button>' +
        '<button type="button" class="arrow next" data-act="next" data-uid="' + p.uid + '" aria-label="Next photo">' + ARROW_R + '</button>' +
        '<div class="dots" aria-hidden="true">';
      for (var i = 0; i < n; i++) photo += '<span class="dot' + (i === idx ? ' on' : '') + '"></span>';
      photo += '</div>';
    }
    photo += '</div>';

    var price = '<div class="price">';
    if (p.shown !== null) {
      price += (p.onSale ? '<span class="old">' + esc(money(p.price)) + '</span>' : '') +
        '<span class="now' + (p.onSale ? ' sale' : '') + '">' + esc(money(p.shown)) + '</span>';
    }
    price += '</div>';

    var sizes = '<div class="sizes"><div class="sizes-label">Available sizes:' + (p.sizes.length ? '' : ' None') + '</div>';
    if (p.sizes.length) {
      sizes += '<div class="size-list">';
      p.sizes.forEach(function (s) {
        sizes += '<button type="button" class="size-btn" data-act="size" data-uid="' + p.uid + '" data-size="' + esc(s) +
          '" aria-pressed="' + (sel === s ? 'true' : 'false') + '">' + esc(s) + '</button>';
      });
      sizes += '</div><div class="sbar" aria-hidden="true"><span></span></div>';
    }
    sizes += '</div>';

    // Quantities are not shown to customers. Only sold-out items get a label.
    var badge = p.soldOut ? '<span class="badge out">Sold out</span>' : '';

    var order;
    if (p.soldOut) order = '<div class="out-btn">Out of stock</div>';
    else if (p.sizes.length && !sel) order = '<div class="need">Choose a size to order</div>';
    else order = '<a class="order" href="' + esc(waLink(p, sel)) + '" target="_blank" rel="noopener noreferrer">' +
      (sel ? 'Order size ' + esc(sel) + ' on WhatsApp' : 'Order on WhatsApp') + '</a>';

    return '<article class="card' + (p.soldOut ? ' sold' : '') + '" data-card="' + p.uid + '">' + photo +
      '<div class="info">' + price + '<h3 class="name">' + esc(p.name) + '</h3>' +
      (p.description ? '<p class="desc">' + esc(p.description) + '</p>' : '') +
      sizes + badge + '<div class="order-area">' + order + '</div></div></article>';
  }

  function genreMatches(itemGenre, wanted) {
    return itemGenre === wanted || (itemGenre === 'Unisex' && (wanted === 'Boys' || wanted === 'Girls'));
  }

  function visibleProducts() {
    var list = state.products.filter(function (p) {
      if (state.collection !== 'All' && p.collection !== state.collection) return false;
      if (state.genre !== 'All' && !genreMatches(p.genre, state.genre)) return false;
      if (state.sizes.length && !state.sizes.some(function (s) { return p.sizes.indexOf(s) > -1; })) return false;
      return true;
    });
    function rank(p) { return p.soldOut ? 2 : (p.onSale ? 0 : 1); }
    // Sale items first, sold out last. Inside each group the newest row of the sheet comes first.
    return list
      .map(function (p) { return p; })
      .sort(function (a, b) { return (rank(a) - rank(b)) || (b.uid - a.uid); });
  }

  // 6 items per page on phones, 12 on larger screens.
  function perPage() { return phoneMq.matches ? 6 : 12; }

  function pageNumbers(cur, total) {
    var out = [], last = 0;
    for (var n = 1; n <= total; n++) {
      if (n === 1 || n === total || Math.abs(n - cur) <= 1) {
        if (last && n - last > 1) out.push('gap');
        out.push(n);
        last = n;
      }
    }
    return out;
  }

  function renderPager(total) {
    if (total <= 1) { pagerEl.hidden = true; pagerEl.innerHTML = ''; return; }
    var cur = state.page;
    var h = '<button type="button" class="pg pg-arrow" data-page="' + (cur - 1) + '" aria-label="Previous page"' + (cur === 1 ? ' disabled' : '') + '>&#8249;</button>';
    pageNumbers(cur, total).forEach(function (n) {
      if (n === 'gap') h += '<span class="pg-gap" aria-hidden="true">&hellip;</span>';
      else h += '<button type="button" class="pg" data-page="' + n + '" aria-label="Page ' + n + '"' + (n === cur ? ' aria-current="page"' : '') + '>' + n + '</button>';
    });
    h += '<button type="button" class="pg pg-arrow" data-page="' + (cur + 1) + '" aria-label="Next page"' + (cur === total ? ' disabled' : '') + '>&#8250;</button>';
    pagerEl.innerHTML = h;
    pagerEl.hidden = false;
  }

  function renderGrid() {
    var list = visibleProducts();
    var size = perPage();
    var total = Math.max(1, Math.ceil(list.length / size));
    if (state.page > total) state.page = total;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * size;
    gridEl.innerHTML = list.slice(start, start + size).map(cardHtml).join('');
    emptyEl.hidden = list.length > 0;
    if (list.length === 0) countEl.textContent = '0 items';
    else if (list.length <= size) countEl.textContent = list.length === 1 ? '1 item' : list.length + ' items';
    else countEl.textContent = 'Showing ' + (start + 1) + '-' + Math.min(start + size, list.length) + ' of ' + list.length + ' items';
    renderPager(total);
    updateBars();
  }

  pagerEl.addEventListener('click', function (e) {
    var b = e.target.closest('.pg');
    if (!b || b.disabled) return;
    state.page = parseInt(b.getAttribute('data-page'), 10);
    renderGrid();
    var top = document.getElementById('shop');
    if (top && top.scrollIntoView) top.scrollIntoView();
  });

  // Turning the phone, or resizing the window, can change the page size.
  var lastPerPage = perPage();
  window.addEventListener('resize', function () {
    var n = perPage();
    if (n !== lastPerPage) { lastPerPage = n; renderGrid(); }
  });

  // Small slider bar under the size rows that slide sideways (phones).
  function updateBar(bar) {
    var scroller = bar.previousElementSibling;
    if (!scroller) return;
    var total = scroller.scrollWidth, visible = scroller.clientWidth;
    if (total - visible > 2) {
      var thumb = bar.firstElementChild;
      thumb.style.width = (visible / total * 100) + '%';
      thumb.style.left = (scroller.scrollLeft / total * 100) + '%';
      bar.classList.add('on');
    } else {
      bar.classList.remove('on');
    }
  }

  function updateBars() {
    Array.prototype.forEach.call(document.querySelectorAll('.sbar'), updateBar);
  }

  document.addEventListener('scroll', function (e) {
    var t = e.target;
    if (t && t.nextElementSibling && t.nextElementSibling.classList && t.nextElementSibling.classList.contains('sbar')) {
      updateBar(t.nextElementSibling);
    }
  }, true);
  window.addEventListener('resize', updateBars);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateBars);

  function byUid(uid) { return state.products[uid]; }

  function refreshCard(uid, focusSelector) {
    var el = gridEl.querySelector('[data-card="' + uid + '"]');
    if (!el) return;
    var oldList = el.querySelector('.size-list');
    var keepLeft = oldList ? oldList.scrollLeft : 0;
    el.outerHTML = cardHtml(byUid(uid));
    var newList = gridEl.querySelector('[data-card="' + uid + '"] .size-list');
    if (newList) newList.scrollLeft = keepLeft;
    updateBars();
    if (focusSelector) {
      var f = gridEl.querySelector('[data-card="' + uid + '"] ' + focusSelector);
      if (f) f.focus();
    }
  }

  function stepPhoto(p, d) {
    var n = p.photos.length;
    state.photoIdx[p.uid] = (((state.photoIdx[p.uid] || 0) + d) % n + n) % n;
    refreshCard(p.uid);
  }

  gridEl.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var p = byUid(parseInt(t.getAttribute('data-uid'), 10));
    if (!p) return;
    var act = t.getAttribute('data-act');
    if (act === 'size') {
      var s = t.getAttribute('data-size');
      state.sel[p.uid] = state.sel[p.uid] === s ? null : s;
      refreshCard(p.uid);
    } else if (act === 'prev') { stepPhoto(p, -1); }
    else if (act === 'next') { stepPhoto(p, 1); }
    else if (act === 'open') { openLightbox(p); }
  });

  // Photos that are missing: remove the broken image so "Photo coming soon" shows.
  gridEl.addEventListener('error', function (e) {
    if (e.target && e.target.tagName === 'IMG') {
      var box = e.target.closest('.photo');
      e.target.remove();
      if (box && !box.querySelector('.ph')) {
        box.insertAdjacentHTML('afterbegin', '<div class="ph" aria-hidden="true">Photo coming soon</div>');
      }
    }
  }, true);

  // Swipe left/right on a photo (phones).
  var touch = null;
  gridEl.addEventListener('touchstart', function (e) {
    var ph = e.target.closest('.photo');
    if (!ph || e.touches.length !== 1) { touch = null; return; }
    touch = { uid: parseInt(ph.getAttribute('data-uid'), 10), x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  gridEl.addEventListener('touchend', function (e) {
    if (!touch) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    var p = byUid(touch.uid);
    touch = null;
    if (p && p.photos.length > 1 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      stepPhoto(p, dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  /* ---------- photo viewer ---------- */

  var lb = document.getElementById('lightbox');
  var lbImg = document.getElementById('lb-img');
  var lbCount = document.getElementById('lb-count');
  var lbState = null;
  var lbReturnFocus = null;

  function lbShow() {
    var p = lbState.p;
    var n = p.photos.length;
    lbImg.src = photoUrl(p.photos[lbState.i]);
    lbImg.alt = p.name;
    lbCount.textContent = n > 1 ? (lbState.i + 1) + ' / ' + n : '';
    document.getElementById('lb-prev').hidden = n < 2;
    document.getElementById('lb-next').hidden = n < 2;
  }

  function openLightbox(p) {
    var n = p.photos.length;
    if (!n) return;
    lbReturnFocus = document.activeElement;
    lbState = { p: p, i: (state.photoIdx[p.uid] || 0) % n };
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    lbShow();
    document.getElementById('lb-close').focus();
  }

  function closeLightbox() {
    if (lb.hidden) return;
    var p = lbState.p;
    state.photoIdx[p.uid] = lbState.i;
    lb.hidden = true;
    lbImg.removeAttribute('src');
    document.body.style.overflow = '';
    lbState = null;
    var card = gridEl.querySelector('[data-card="' + p.uid + '"]');
    if (card) { refreshCard(p.uid, '.photo-open'); }
    else if (lbReturnFocus && lbReturnFocus.focus) { lbReturnFocus.focus(); }
  }

  function lbStep(d) {
    var n = lbState.p.photos.length;
    lbState.i = ((lbState.i + d) % n + n) % n;
    lbShow();
  }

  document.getElementById('lb-close').addEventListener('click', closeLightbox);
  document.getElementById('lb-prev').addEventListener('click', function () { lbStep(-1); });
  document.getElementById('lb-next').addEventListener('click', function () { lbStep(1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft' && lbState.p.photos.length > 1) lbStep(-1);
    else if (e.key === 'ArrowRight' && lbState.p.photos.length > 1) lbStep(1);
    else if (e.key === 'Tab') {
      var items = Array.prototype.filter.call(lb.querySelectorAll('button'), function (b) { return !b.hidden; });
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- page text from config ---------- */

  function fillStatic() {
    var wa = 'https://wa.me/' + C.whatsappNumber;
    Array.prototype.forEach.call(document.querySelectorAll('[data-wa]'), function (a) {
      a.setAttribute('href', wa);
      if (a.hasAttribute('data-wa-text')) a.textContent = 'WhatsApp: ' + (C.whatsappDisplay || C.whatsappNumber);
    });
    document.getElementById('foot-delivery').textContent = 'Delivery to: ' + C.deliveryText;
    document.getElementById('delivery-text').textContent = 'We deliver to: ' + C.deliveryText + '. All prices are in USD.';
    var handle = String(C.instagram || 'kefada.fashion').replace(/^@/, '');
    var igUrl = 'https://www.instagram.com/' + encodeURIComponent(handle) + '/';
    Array.prototype.forEach.call(document.querySelectorAll('[data-ig]'), function (a) { a.setAttribute('href', igUrl); });
    document.getElementById('foot-year').textContent = '© ' + new Date().getFullYear() + ' ' + C.storeName;
  }

  /* ---------- start ---------- */

  function init() {
    fillStatic();
    var fallback = window.FALLBACK_ROWS || [];
    if (!C.sheetCsvUrl) { setProducts(fallback); return; }
    countEl.textContent = 'Loading the collection...';
    var url = C.sheetCsvUrl + (C.sheetCsvUrl.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now();
    fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (text) {
        var rows = rowsToObjects(parseCsv(text));
        if (!rows.length) throw new Error('The sheet is empty');
        setProducts(rows);
      })
      .catch(function (err) {
        console.warn('Could not read the Google Sheet, showing the saved items instead.', err);
        setProducts(fallback);
      });
  }

  init();
})();
