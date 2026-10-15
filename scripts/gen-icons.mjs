/**
 * gen-icons.mjs — génère les icônes PWA (PNG + SVG) sans dépendance externe.
 *
 * Encodage PNG fait main : signature + IHDR + IDAT (deflate via node:zlib) +
 * IEND, avec CRC32. Le dessin est sur-échantillonné 3x pour lisser les bords.
 * Chaque ligne est filtrée avec le filtre PNG le plus économique (None, Sub,
 * Up, Average, Paeth), ce qui allège nettement les dégradés.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'icons');

/* ------------------------------------------------------------------ CRC32 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([len, typed, crc]);
}

/**
 * Applique un filtre PNG (0=None, 1=Sub, 2=Up, 3=Average, 4=Paeth) sur une
 * ligne. `bpp` = octets par pixel (4 en RGBA 8 bits).
 */
function filterRow(type, cur, prev, bpp, out, offset) {
  for (let i = 0; i < cur.length; i += 1) {
    const a = i >= bpp ? cur[i - bpp] : 0;
    const b = prev ? prev[i] : 0;
    const c = prev && i >= bpp ? prev[i - bpp] : 0;
    let pred = 0;
    if (type === 1) pred = a;
    else if (type === 2) pred = b;
    else if (type === 3) pred = (a + b) >> 1;
    else if (type === 4) {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    out[offset + i] = (cur[i] - pred) & 0xff;
  }
}

/** Somme des magnitudes signées : heuristique standard de choix de filtre. */
function filterCost(buf, start, end) {
  let sum = 0;
  for (let i = start; i < end; i += 1) {
    const v = buf[i];
    sum += v < 128 ? v : 256 - v;
  }
  return sum;
}

/**
 * Encode en PNG (RGBA 8 bits) avec filtrage adaptatif par ligne : les dégradés
 * de l'icône se compressent bien mieux qu'avec un filtre None partout, sans
 * changer un seul pixel.
 */
function pngEncode(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  const candidate = Buffer.alloc(stride);
  let prev = null;
  let prevRow = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const row = rgba.subarray(y * stride, (y + 1) * stride);
    let best = 0;
    let bestCost = Infinity;
    for (let type = 0; type <= 4; type += 1) {
      filterRow(type, row, prev, 4, candidate, 0);
      const cost = filterCost(candidate, 0, stride);
      if (cost < bestCost) {
        bestCost = cost;
        best = type;
        candidate.copy(raw, y * (stride + 1) + 1);
      }
    }
    raw[y * (stride + 1)] = best;
    prevRow = Buffer.from(row);
    prev = prevRow;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ dessin */
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function inRoundRect(u, v, cx, cy, hw, hh, r) {
  const dx = Math.abs(u - cx) - (hw - r);
  const dy = Math.abs(v - cy) - (hh - r);
  if (dx <= 0) return Math.abs(u - cx) <= hw && Math.abs(v - cy) <= hh;
  if (dy <= 0) return Math.abs(u - cx) <= hw && Math.abs(v - cy) <= hh;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Motif : une île en grille vue de trois-quarts, entourée d'un anneau cyan,
 * avec l'avatar debout sur son centre. `maskable` = fond plein bord à bord et
 * dessin réduit dans la zone sûre (80 %).
 */
function drawIcon(size, { maskable = false } = {}) {
  const bgTop = [10, 16, 36];
  const bgBottom = [46, 32, 88];
  const island = [24, 33, 64];
  const grid = [124, 140, 255];
  const accent = [55, 224, 200];
  const skin = [242, 244, 255];

  // Repère normalisé, 0..1. Le dessin est réduit pour les icônes maskable.
  const s = maskable ? 0.66 : 1;
  const cx = 0.5;
  const cy = 0.5;
  const px = (u) => cx + (u - 0.5) * s;
  const py = (v) => cy + (v - 0.5) * s;

  const islandCY = py(0.665);
  const rx = 0.38 * s;
  const ry = 0.15 * s;
  const feet = py(0.645);

  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3; // sur-échantillonnage anti-crénelage
  const cornerRadius = maskable ? 0 : size * 0.22;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const deviceX = x + (sx + 0.5) / SS;
          const deviceY = y + (sy + 0.5) / SS;
          const u = deviceX / size;
          const v = deviceY / size;

          // Masque à coins arrondis (icônes « any » uniquement).
          let coverage = 1;
          if (cornerRadius > 0) {
            const dx = Math.min(deviceX, size - deviceX);
            const dy = Math.min(deviceY, size - deviceY);
            if (dx < cornerRadius && dy < cornerRadius) {
              const d = Math.hypot(cornerRadius - dx, cornerRadius - dy);
              coverage = clamp01(cornerRadius - d + 0.5);
            }
          }

          let color = mix(bgTop, bgBottom, v);

          // Halo derrière l'île.
          const halo = clamp01(1.5 - Math.hypot((u - cx) / (0.5 * s), (v - islandCY) / (0.24 * s)));
          color = mix(color, accent, halo * 0.22);

          // Île + grille.
          const nx = (u - cx) / rx;
          const ny = (v - islandCY) / ry;
          const d = Math.hypot(nx, ny);
          if (d <= 1.05) {
            color = mix(color, island, 0.9);
            if (d <= 1) {
              // Modulo positif : sinon toute la moitié négative serait « ligne ».
              const frac = (x) => ((x % 1) + 1) % 1;
              const lx = Math.abs(frac(nx * 4) - 0.5) * 2;
              const ly = Math.abs(frac(ny * 4) - 0.5) * 2;
              if (lx > 0.84 || ly > 0.84) color = mix(color, grid, 0.55);
            }
            // Anneau cyan.
            if (Math.abs(d - 1) < 0.05) color = mix(color, accent, 0.95);
          }

          // Avatar debout sur le centre de l'île.
          const bodyTop = feet - 0.18 * s;
          const headCY = bodyTop - 0.055 * s;
          const headR = 0.062 * s;
          if (inRoundRect(u, v, px(0.5), (bodyTop + feet) / 2, 0.058 * s, 0.09 * s, 0.05 * s)) {
            color = skin;
          }
          const headD = Math.hypot(u - px(0.5), v - headCY);
          if (headD < headR) color = v < headCY - headR * 0.15 ? accent : skin;

          // Légère vignette pour asseoir le tout.
          const vig = 1 - 0.35 * Math.hypot((u - 0.5) * 1.4, (v - 0.5) * 1.4);
          color = color.map((c) => c * clamp01(vig + 0.15));

          r += color[0] * coverage;
          g += color[1] * coverage;
          b += color[2] * coverage;
          a += coverage;
        }
      }

      const n = SS * SS;
      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(r / n);
      rgba[idx + 1] = Math.round(g / n);
      rgba[idx + 2] = Math.round(b / n);
      rgba[idx + 3] = Math.round((a / n) * 255);
    }
  }
  return pngEncode(size, size, rgba);
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a1024"/>
      <stop offset="1" stop-color="#2a1e52"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.7" r="0.7">
      <stop offset="0" stop-color="#37e0c8" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#37e0c8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <ellipse cx="256" cy="320" rx="190" ry="66" fill="url(#glow)"/>
  <ellipse cx="256" cy="320" rx="168" ry="58" fill="#121a34" stroke="#7c8cff" stroke-opacity="0.75" stroke-width="4"/>
  <g stroke="#7c8cff" stroke-opacity="0.5" stroke-width="2.5" fill="none">
    <path d="M88 320h336M120 292h272M120 348h272"/>
    <path d="M256 262v116M180 274l38 92M332 274l-38 92M130 300l84 58M382 300l-84 58"/>
  </g>
  <ellipse cx="256" cy="320" rx="168" ry="58" fill="none" stroke="#37e0c8" stroke-width="7"/>
  <g transform="translate(256 330)">
    <rect x="-27" y="-62" width="54" height="62" rx="22" fill="#f2f4ff"/>
    <circle cx="0" cy="-84" r="24" fill="#f2f4ff"/>
    <path d="M-23.5 -88a24 24 0 0 1 47 0z" fill="#37e0c8"/>
    <rect x="-3" y="-122" width="6" height="20" rx="3" fill="#37e0c8"/>
    <circle cx="0" cy="-126" r="8" fill="#37e0c8"/>
  </g>
</svg>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'icon-192.png'), drawIcon(192));
writeFileSync(resolve(outDir, 'icon-512.png'), drawIcon(512));
writeFileSync(resolve(outDir, 'apple-touch-icon.png'), drawIcon(180, { maskable: true }));
writeFileSync(resolve(outDir, 'maskable-512.png'), drawIcon(512, { maskable: true }));
writeFileSync(resolve(outDir, 'icon.svg'), SVG);
console.log('Icônes écrites dans', outDir);
