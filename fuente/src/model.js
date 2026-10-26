'use strict';
/* ===== Datos de la fuente (Inter Bold, contornos + kerning) ===== */
const D = __FONTDATA__;

/* ===== Identidad: manual de identidad visual de MiND (versión provisional) ===== */
const PALETTE = {
  azul:     {hex: '#0000FF', name: 'Azul'},
  rojo:     {hex: '#FF4C4C', name: 'Rojo'},
  azul50:   {hex: '#8080FF', name: 'Azul 50 %'},
  rojo50:   {hex: '#FFA6A6', name: 'Rojo 50 %'},
  amarillo: {hex: '#FFF061', name: 'Amarillo'},
  naranja:  {hex: '#F9B233', name: 'Naranja'}
};
const GEO = {F: 165, left: 90, top: 288, cw: 1920, ch: 1080,
  padR: 1.08, arrowPadL: 1.40, abLen: 4.80, abOff: 0.0, atLen: 5.45, atOff: 0.60};
const EASE = [0.45, 0, 0.2, 1];
const REF = {line2: 0.25, aux: 0.40};        /* retardos con los que se midió la duración total */
const TIMING = {lineDur: 1.1, line2: 0.15, auxDelay: 0.30, auxDur: 0.90, lead: 0.2, hold: 2.0, gap: 0.3};
const EXT = 4000;   /* alto "infinito" para que el asta de la 1ª línea baje sobre la 2ª */

function bezier(x1, y1, x2, y2) {
  return function (t) {
    if (t <= 0) return 0; if (t >= 1) return 1;
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2, x = 3*(1-m)*(1-m)*m*x1 + 3*(1-m)*m*m*x2 + m*m*m;
      if (x < t) lo = m; else hi = m;
    }
    const m = (lo + hi) / 2;
    return 3*(1-m)*(1-m)*m*y1 + 3*(1-m)*m*m*y2 + m*m*m;
  };
}
const easeFn = bezier(...EASE);

/* ===== Composición del texto ===== */
function metrics() { const k = GEO.F / D.upm, w = D.lw * k; return {k, w, H: D.cap * k + w}; }

function shapeRun(text, arrow) {
  const seq = [...text].filter(c => D.chars[c]);
  const out = []; let x = 0;
  if (arrow) {
    const a = seq.length ? D.arrow[seq[0]] : null;
    if (a) { out.push({g: a[0], x: 0}); x = a[1]; }
    else { out.push({g: D.arrowDefault, x: 0}); x = D.glyphs[D.arrowDefault].a; }
  }
  seq.forEach((c, i) => {
    const g = D.chars[c]; out.push({g, x});
    x += D.glyphs[g].a + (seq[i + 1] ? (D.kern[c + seq[i + 1]] || 0) : 0);
  });
  return out;
}

function tp(p, k, ox, oy) {
  let i = 0;
  return p.replace(/-?\d+(?:\.\d+)?/g, v => {
    const f = parseFloat(v), r = (i++ % 2 === 0) ? f * k + ox : -f * k + oy;
    let s = r.toFixed(2); if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  });
}

function layoutLine(text, arrow, baseline) {
  const {k, w, H} = metrics();
  const run = shapeRun(text, arrow).filter(r => D.glyphs[r.g].b);
  const inkL = Math.min(...run.map(r => r.x + D.glyphs[r.g].b[0])) * k;
  const inkR = Math.max(...run.map(r => r.x + D.glyphs[r.g].b[2])) * k;
  const padL = w * (arrow ? GEO.arrowPadL : 1.0), padR = w * GEO.padR;
  const x0 = GEO.left + padL - inkL, bw = padL + (inkR - inkL) + padR;
  let d = ''; const desc = [], asc = [];
  run.forEach(r => {
    const g = D.glyphs[r.g], b = g.b;
    d += tp(g.p, k, x0 + r.x * k, baseline);
    const gl = x0 + (r.x + b[0]) * k, gr = x0 + (r.x + b[2]) * k;
    if (-b[1] * k > 0.06 * GEO.F) desc.push([gl, gr]);
    if (b[3] * k > H + 1.0) asc.push([gl, gr]);
  });
  return {d, w: bw, desc, asc};
}

/* Disposición estática: bloques, bandas auxiliares y caja envolvente. */
function layout(lines, colors) {
  const {H} = metrics(); const rows = [];
  lines.forEach((t, i) => {
    const top = GEO.top + i * H;
    const ln = layoutLine(t, i === 0, top + H);
    rows.push(Object.assign(ln, {top, bottom: top + H, i, color: PALETTE[i === 0 ? colors.l1 : colors.l2].hex}));
  });
  const first = rows[0], last = rows[rows.length - 1], bands = [];
  if (first.asc.length) {
    const gl = Math.min(...first.asc.map(a => a[0])), gr = Math.max(...first.asc.map(a => a[1]));
    let x0 = GEO.left + GEO.atOff * H; if (gl < x0 + 0.1 * H) x0 = Math.max(GEO.left, gl - 0.25 * H);
    bands.push({kind: 'top', x: x0, w: Math.max(GEO.atLen * H, gr - x0 + 0.25 * H), h: H / 2, edge: first.top, color: PALETTE[colors.top].hex, row: 0});
  }
  if (last.desc.length) {
    const gl = Math.min(...last.desc.map(a => a[0])), gr = Math.max(...last.desc.map(a => a[1]));
    let x0 = GEO.left + GEO.abOff * H; if (gl < x0 + 0.1 * H) x0 = Math.max(GEO.left, gl - 0.25 * H);
    bands.push({kind: 'bottom', x: x0, w: Math.max(GEO.abLen * H, gr - x0 + 0.25 * H), h: H / 2, edge: last.bottom, color: PALETTE[colors.bottom].hex, row: rows.length - 1});
  }
  const bx0 = GEO.left, by0 = Math.min(first.top, ...bands.filter(b => b.kind === 'top').map(b => b.edge - b.h));
  const bx1 = Math.max(...rows.map(r => GEO.left + r.w), ...bands.map(b => b.x + b.w));
  const by1 = Math.max(last.bottom, ...bands.filter(b => b.kind === 'bottom').map(b => b.edge + b.h));
  return {H, rows, bands, two: rows.length === 2, bbox: {x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0}};
}

/* ===== Línea de tiempo =====
   Cada elemento (línea o banda) tiene tramos: {t0,t1,k:'h'|'e'|'r',p0,p1}.
   'h' = mantiene, 'e' = salida con la curva, 'r' = la misma salida en sentido inverso. */
const MODES = {
  once:    {loop: false, bi: false},   /* unidireccional, una pasada: se queda en el título */
  loopUni: {loop: true,  bi: false},   /* unidireccional, bucle */
  onceBi:  {loop: false, bi: true},    /* bidireccional, una pasada: termina vacío */
  loopBi:  {loop: true,  bi: true},    /* bidireccional, bucle */
  clean:   {loop: false, bi: false}    /* solo el movimiento */
};

function buildTimeline(L, mode, tm) {
  tm = tm || TIMING; const sc = 1, lineDur = tm.lineDur, line2 = tm.line2, auxDelay = tm.auxDelay, auxDur = tm.auxDur;
  const els = [];
  L.rows.forEach(r => els.push({id: 'L' + r.i, kind: 'line', i: r.i, s: r.i ? line2 : 0, d: lineDur}));
  L.bands.forEach((b, n) => els.push({id: 'B' + n, kind: 'band', i: n, s: (b.row ? line2 : 0) + auxDelay, d: auxDur}));
  const real = Math.max(...els.map(e => e.s + e.d));
  const refM = Math.max(...L.rows.map(r => (r.i ? REF.line2 * sc : 0) + lineDur),
                        ...L.bands.map(b => (b.row ? REF.line2 * sc : 0) + REF.aux * sc + auxDur));
  const clean = mode === 'clean';
  const M = clean ? real : Math.max(real, refM);
  const lead = clean ? 0 : tm.lead, hold = clean ? 0 : tm.hold;
  const bi = MODES[mode].bi;
  let total;
  if (clean) total = M;
  else if (mode === 'once') total = lead + M + hold;
  else if (mode === 'loopUni') total = lead + M + hold + tm.gap;
  else total = lead + M + hold + M;       /* bidireccional: la salida termina con todo vacío */
  els.forEach(e => {
    const segs = [], a = lead + e.s, b = a + e.d;
    const push = (t0, t1, k, p0, p1) => { if (t1 - t0 > 1e-9) segs.push({t0, t1, k, p0, p1}); };
    push(0, a, 'h', 0, 0);
    push(a, b, 'e', 0, 1);
    if (bi) {
      const rs = lead + M + hold + (M - (e.s + e.d));
      push(b, rs, 'h', 1, 1);
      push(rs, rs + e.d, 'r', 1, 0);
      push(rs + e.d, total, 'h', 0, 0);
    } else push(b, total, 'h', 1, 1);
    if (!segs.length) segs.push({t0: 0, t1: total, k: 'h', p0: 1, p1: 1});
    e.segs = segs;
  });
  return {els, total, loop: MODES[mode].loop, mode, motion: M, lead, hold};
}

function progAt(segs, t) {
  let g = segs[segs.length - 1];
  for (let i = 0; i < segs.length; i++) if (t < segs[i].t1) { g = segs[i]; break; }
  if (g.k === 'h') return g.p0;
  const u = Math.min(1, Math.max(0, (t - g.t0) / (g.t1 - g.t0)));
  return g.k === 'e' ? easeFn(u) : easeFn(1 - u);
}
function elProg(TL, id, t) { return progAt(TL.els.find(e => e.id === id).segs, t); }

/* ===== Dibujo en canvas (vista previa y exportación raster) ===== */
const RATIOS = {'16x9': {w: 1920, h: 1080, name: '16:9'}, '9x16': {w: 1080, h: 1920, name: '9:16'}, '1x1': {w: 1080, h: 1080, name: '1:1'}};
function marginOf(R) { return R.w * 90 / 1920; }
/* Posición inicial del título dentro de un encuadre (unidades del lienzo). */
function defaultPlace(L, frame) {
  const R = RATIOS[frame], m = marginOf(R), b = L.bbox;
  const s = Math.min(1, (R.w - 2 * m) / b.w, (R.h - 2 * m) / b.h);
  const y = frame === '16x9' ? GEO.top - (L.rows[0].top - b.y) * s : (R.h - b.h * s) / 2;
  return {x: m, y, s};
}
/* Qué parte del espacio del título se ve y a qué tamaño de lienzo se corresponde. */
function frameSpec(L, frame, pl) {
  if (frame === 'crop') { const b = L.bbox; return {view: {x: b.x, y: b.y, w: b.w, h: b.h}, cw: b.w, ch: b.h}; }
  const R = RATIOS[frame];
  return {view: {x: L.bbox.x - pl.x / pl.s, y: L.bbox.y - pl.y / pl.s, w: R.w / pl.s, h: R.h / pl.s}, cw: R.w, ch: R.h};
}

/* ===== Dibujo en canvas (vista previa y exportación raster) ===== */
function drawFrame(ctx, L, TL, t, view, W, Hh, bg) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, Hh);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, Hh); }
  ctx.setTransform(W / view.w, 0, 0, Hh / view.h, -view.x * W / view.w, -view.y * Hh / view.h);
  const H = L.H, LEFT = GEO.left;
  L.bands.forEach((b, n) => {
    const p = elProg(TL, 'B' + n, t); if (p <= 0) return;
    ctx.fillStyle = b.color;
    if (b.kind === 'top') ctx.fillRect(b.x, b.edge - b.h * p, b.w, b.h * p);
    else ctx.fillRect(b.x, b.edge, b.w, b.h * p);
  });
  const order = L.two ? L.rows.slice().reverse() : L.rows;
  order.forEach(r => {
    const p = elProg(TL, 'L' + r.i, t);
    if (p <= 0) return;
    ctx.fillStyle = r.color;
    ctx.fillRect(LEFT, r.top, r.w * p, H);
    const clip = new Path2D();
    clip.rect(LEFT, r.top, r.w * p, (L.two && r.i === 0) ? EXT : H);
    L.bands.forEach((b, n) => {
      if (b.row !== r.i) return;
      const q = elProg(TL, 'B' + n, t); if (q <= 0) return;
      if (b.kind === 'top') clip.rect(b.x, b.edge - b.h * q, b.w, b.h * q);
      else clip.rect(b.x, b.edge, b.w, b.h * q);
    });
    ctx.save();
    ctx.clip(clip);
    ctx.translate(-r.w * (1 - p), 0);
    if (!r.path2d) r.path2d = new Path2D(r.d);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill(r.path2d);
    ctx.restore();
  });
}

/* ===== SVG ===== */
const f2 = v => { let s = (Math.round(v * 100) / 100).toString(); return s === '-0' ? '0' : s; };

function smilValues(segs, total, f) {
  const vals = [f(segs[0].p0)], kt = [0], sp = [];
  const mir = [1 - EASE[2], 1 - EASE[3], 1 - EASE[0], 1 - EASE[1]];
  segs.forEach(g => {
    vals.push(f(g.p1)); kt.push(g.t1 / total);
    sp.push(g.k === 'h' ? '0 0 1 1' : g.k === 'e' ? EASE.join(' ') : mir.map(v => +v.toFixed(4)).join(' '));
  });
  kt[kt.length - 1] = 1;
  return {values: vals.join(';'), keyTimes: kt.map(v => v.toFixed(5)).join(';'), keySplines: sp.join(';')};
}
function animEl(tag, attrs, segs, total, loop, f) {
  const a = smilValues(segs, total, f);
  return `<${tag} ${attrs} values="${a.values}" keyTimes="${a.keyTimes}" keySplines="${a.keySplines}" calcMode="spline" begin="0s" dur="${f2(total * 1000) / 1000}s" ${loop ? 'repeatCount="indefinite"' : 'fill="freeze"'}/>`;
}

/* svgFor: animado (TL) o estático en estado final (TL = null). */
function svgFor(L, TL, o) {
  o = o || {};
  const view = o.fs.view, H = L.H, LEFT = GEO.left, uid = o.uid || '';
  const total = TL ? TL.total : 1, loop = TL ? TL.loop : false;
  const segsOf = id => TL.els.find(e => e.id === id).segs;
  const defs = [], body = [];
  if (o.bg) body.push(`<rect x="${f2(view.x)}" y="${f2(view.y)}" width="${f2(view.w)}" height="${f2(view.h)}" fill="${o.bg}"/>`);
  L.bands.forEach((b, n) => {
    const top = b.kind === 'top';
    const yAt = p => f2(top ? b.edge - b.h * p : b.edge), hAt = p => f2(b.h * p);
    const dy = TL && top ? animEl('animate', 'attributeName="y"', segsOf('B' + n), total, loop, yAt) : '';
    const dh = TL ? animEl('animate', 'attributeName="height"', segsOf('B' + n), total, loop, hAt) : '';
    const p0 = TL ? 0 : 1;
    b.sv = {yAt, hAt, dy, dh, p0};
    body.push(`<rect x="${f2(b.x)}" y="${yAt(p0)}" width="${f2(b.w)}" height="${hAt(p0)}" fill="${b.color}">${dy}${dh}</rect>`);
  });
  const order = L.two ? L.rows.slice().reverse() : L.rows;
  order.forEach(r => {
    const p0 = TL ? 0 : 1, id = 'L' + r.i;
    const wAt = p => f2(r.w * p);
    const dw = TL ? animEl('animate', 'attributeName="width"', segsOf(id), total, loop, wAt) : '';
    const dx = TL ? animEl('animateTransform', 'attributeName="transform" type="translate"', segsOf(id), total, loop, p => `${f2(-r.w * (1 - p))} 0`) : '';
    const clipH = (L.two && r.i === 0) ? EXT : H;
    let rects = `<rect x="${f2(LEFT)}" y="${f2(r.top)}" width="${wAt(p0)}" height="${f2(clipH)}">${dw}</rect>`;
    L.bands.forEach((b, n) => {
      if (b.row === r.i) rects += `<rect x="${f2(b.x)}" y="${b.sv.yAt(b.sv.p0)}" width="${f2(b.w)}" height="${b.sv.hAt(b.sv.p0)}">${b.sv.dy}${b.sv.dh}</rect>`;
    });
    defs.push(`<clipPath id="${uid}c${r.i}">${rects}</clipPath>`);
    body.push(`<rect x="${f2(LEFT)}" y="${f2(r.top)}" width="${wAt(p0)}" height="${f2(H)}" fill="${r.color}">${dw}</rect>`);
    body.push(`<g clip-path="url(#${uid}c${r.i})"><path d="${r.d}" fill="#FFFFFF" transform="translate(${f2(-r.w * (1 - p0))},0)">${dx}</path></g>`);
  });
  const label = (o.label || '').replace(/[<>&-]/g, ' ');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="${f2(view.x)} ${f2(view.y)} ${f2(view.w)} ${f2(view.h)}">\n` +
    `<!-- MiND titulo animado: ${label}${TL ? ` · ${total.toFixed(2)}s` : ''} -->\n<defs>${defs.join('')}</defs>\n${body.join('\n')}\n</svg>\n`;
}
