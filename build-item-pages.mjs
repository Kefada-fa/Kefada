// Builds one small preview page per item (item/<code>.html) and a small preview picture
// (previews/<code>.jpg). WhatsApp uses these to show the item's photo in the chat.
// This runs automatically on GitHub (see .github/workflows/build-item-pages.yml).
// You do not need to run it yourself.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cfgText = fs.readFileSync(path.join(root, 'config.js'), 'utf8');

function cfg(key, def = '') {
  const m = cfgText.match(new RegExp('^\\s*' + key + '\\s*:\\s*"([^"]*)"', 'm'));
  return m ? m[1] : def;
}

const storeName = cfg('storeName', 'Kefada Fashion');
const currency = cfg('currency', '$');
const csvUrl = cfg('sheetCsvUrl');

let siteUrl = cfg('siteUrl');
if (!siteUrl && process.env.GITHUB_REPOSITORY) {
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  siteUrl = 'https://' + owner.toLowerCase() + '.github.io/' + repo + '/';
}
if (!siteUrl) throw new Error('Set siteUrl in config.js');
siteUrl = siteUrl.replace(/\/*$/, '/');

/* ---------- reading the sheet (same rules as the website) ---------- */

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const head = rows[0];
  return rows.slice(1)
    .filter((r) => r.some((c) => String(c).trim() !== ''))
    .map((r) => {
      const o = {};
      head.forEach((h, i) => { o[h] = r[i] == null ? '' : r[i]; });
      return o;
    });
}

function fieldOf(header) {
  const h = String(header).toLowerCase();
  if (h.includes('photo')) return 'photos';
  if (h.includes('sale')) return 'sale';
  if (h.includes('status')) return null;
  if (h === 'id' || h === 'code') return 'id';
  if (h.includes('name')) return 'name';
  if (h.includes('price')) return 'price';
  if (h.includes('size')) return 'sizes';
  if (h.includes('quantity')) return 'qty';
  if (h.includes('description')) return 'description';
  if (h.includes('show')) return 'show';
  return null;
}

function toNum(v) {
  const s = String(v == null ? '' : v).replace(/[^0-9.\-]/g, '');
  if (s === '' || s === '-' || s === '.') return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

const splitList = (s) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : []);

// Must match safeId() in app.js
const safeId = (id) => String(id || '').trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

function normalize(obj) {
  const f = {};
  Object.keys(obj).forEach((k) => {
    const n = fieldOf(k);
    if (n) f[n] = obj[k] == null ? '' : String(obj[k]).trim();
  });
  if (!f.name) return null;
  if ((f.show || '').toLowerCase() === 'no') return null;
  const price = toNum(f.price);
  const sale = toNum(f.sale);
  let qty = toNum(f.qty);
  if (qty === null) qty = 0;
  const soldOut = qty <= 0;
  const onSale = price !== null && sale !== null && sale > 0 && sale < price;
  return {
    id: f.id || '',
    slug: safeId(f.id),
    name: f.name.charAt(0).toUpperCase() + f.name.slice(1),
    price,
    shown: onSale ? sale : price,
    onSale,
    soldOut,
    sizes: soldOut ? [] : splitList(f.sizes),
    photos: splitList(f.photos),
    description: f.description || ''
  };
}

async function loadRows() {
  if (csvUrl) {
    let lastErr;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(csvUrl + (csvUrl.includes('?') ? '&' : '?') + 't=' + Date.now());
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const rows = rowsToObjects(parseCsv(await r.text()));
        if (!rows.length) throw new Error('the sheet is empty');
        return rows;
      } catch (e) {
        lastErr = e;
        await new Promise((res) => setTimeout(res, 3000));
      }
    }
    throw new Error('Could not read the Google Sheet: ' + lastErr.message);
  }
  const m = fs.readFileSync(path.join(root, 'products-data.js'), 'utf8');
  return JSON.parse(m.slice(m.indexOf('['), m.lastIndexOf(']') + 1));
}

/* ---------- helpers ---------- */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => currency + (Math.round(n) === n ? String(n) : n.toFixed(2));

let sharp = null;
try { sharp = (await import('sharp')).default; } catch (e) { console.warn('sharp is not installed, previews are skipped.'); }

const imagesDir = path.join(root, 'images');
const imageFiles = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir) : [];
const lowerMap = new Map(imageFiles.map((f) => [f.toLowerCase(), f]));

function findImage(name) {
  if (imageFiles.includes(name)) return name;
  return lowerMap.get(name.toLowerCase()) || null; // tolerate capital letters
}

async function makePreview(srcName, destFile) {
  let quality = 80, width = 900, buf;
  for (let i = 0; i < 4; i++) {
    buf = await sharp(path.join(imagesDir, srcName)).rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true }).toBuffer();
    if (buf.length <= 250 * 1024) break;
    quality -= 12;
    width = Math.round(width * 0.85);
  }
  fs.writeFileSync(destFile, buf);
}

function pageHtml(p, previewUrl, pageUrl, photoRel) {
  const bits = [];
  if (p.shown !== null) bits.push(p.onSale ? money(p.shown) + ' (was ' + money(p.price) + ')' : money(p.shown));
  if (p.soldOut) bits.push('Sold out');
  else if (p.sizes.length) bits.push('Sizes: ' + p.sizes.join(', '));
  if (p.description) bits.push(p.description);
  let desc = bits.join(' · ');
  if (desc.length > 200) desc = desc.slice(0, 197) + '...';
  const title = p.name + ' | ' + storeName;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(storeName)}">
<meta property="og:title" content="${esc(p.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(previewUrl)}">
<meta property="og:image:alt" content="${esc(p.name)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.name)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(previewUrl)}">
<link rel="icon" href="../assets/logo.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700&family=Jost:wght@400;500;600&display=swap">
<style>
*{box-sizing:border-box}
body{margin:0;font-family:'Jost',system-ui,sans-serif;color:#1A1A1A;background:#FAF7F2;line-height:1.4}
a{color:inherit;text-decoration:none}
header{padding:14px 20px;background:#fff;border-bottom:2px solid #B8893A}
.wordmark{font-family:'Cormorant Garamond',Georgia,serif;font-weight:700;font-size:28px}
main{max-width:520px;margin:0 auto;padding:20px 16px 40px}
img.photo{display:block;width:100%;height:auto;border-radius:20px;background:#EEE3D0}
.price{margin:18px 0 4px;font-size:24px;font-weight:600}
.price s{font-size:16px;font-weight:400;color:#5C554B;margin-right:8px}
.price .sale{color:#8F2A1C}
h1{margin:0 0 10px;font-size:22px;font-weight:600}
p{margin:0 0 10px;color:#5C554B}
.sold{display:inline-block;padding:4px 12px;border-radius:999px;background:#ECE8E1;color:#5C554B;font-weight:600;font-size:14px;margin-bottom:10px}
.btn{display:flex;align-items:center;justify-content:center;min-height:50px;margin-top:18px;border-radius:12px;background:#1A1A1A;color:#fff;font-weight:600;font-size:16px}
:focus-visible{outline:3px solid #7A5A1F;outline-offset:2px}
</style>
</head>
<body>
<header><a class="wordmark" href="../">${esc(storeName)}</a></header>
<main>
${photoRel ? `<img class="photo" src="${esc(photoRel)}" alt="${esc(p.name)}">` : ''}
<div class="price">${p.shown === null ? '' : (p.onSale ? `<s>${esc(money(p.price))}</s><span class="sale">${esc(money(p.shown))}</span>` : `<span>${esc(money(p.shown))}</span>`)}</div>
<h1>${esc(p.name)}</h1>
${p.soldOut ? '<div class="sold">Sold out</div>' : ''}
${!p.soldOut && p.sizes.length ? `<p>Available sizes: ${esc(p.sizes.join(', '))}</p>` : ''}
${p.description ? `<p>${esc(p.description)}</p>` : ''}
<a class="btn" href="../#shop">Browse the full collection</a>
</main>
</body>
</html>
`;
}

/* ---------- build ---------- */

const rows = await loadRows();
const products = rows.map(normalize).filter(Boolean).filter((p) => p.slug);

const itemDir = path.join(root, 'item');
const prevDir = path.join(root, 'previews');
fs.mkdirSync(itemDir, { recursive: true });
fs.mkdirSync(prevDir, { recursive: true });

const keepItems = new Set();
const keepPrevs = new Set();
const seen = new Set();
let withPreview = 0;

for (const p of products) {
  if (seen.has(p.slug)) { console.warn('Duplicate code, skipped: ' + p.slug); continue; }
  seen.add(p.slug);

  let previewUrl = siteUrl + 'assets/logo.jpg';
  let photoRel = '';
  const real = p.photos.length ? findImage(p.photos[0]) : null;
  if (real) {
    photoRel = '../images/' + encodeURIComponent(real);
    if (sharp) {
      try {
        await makePreview(real, path.join(prevDir, p.slug + '.jpg'));
        previewUrl = siteUrl + 'previews/' + encodeURIComponent(p.slug) + '.jpg';
        keepPrevs.add(p.slug + '.jpg');
        withPreview++;
      } catch (e) {
        console.warn('Could not make a preview for ' + p.slug + ': ' + e.message);
      }
    }
  }
  const pageUrl = siteUrl + 'item/' + encodeURIComponent(p.slug) + '.html';
  fs.writeFileSync(path.join(itemDir, p.slug + '.html'), pageHtml(p, previewUrl, pageUrl, photoRel));
  keepItems.add(p.slug + '.html');
}

// Remove pages and pictures of items that no longer exist.
for (const f of fs.readdirSync(itemDir)) if (f.endsWith('.html') && !keepItems.has(f)) fs.unlinkSync(path.join(itemDir, f));
for (const f of fs.readdirSync(prevDir)) if (f.endsWith('.jpg') && !keepPrevs.has(f)) fs.unlinkSync(path.join(prevDir, f));

console.log('Item pages: ' + keepItems.size + ', preview pictures: ' + withPreview);
