'use strict';
/* ===== Estilo "Mayúsculas" (segundo estilo de títulos del manual) =====
   Texto en mayúsculas sin colorblock; la I pasa a i minúscula. Cada letra emerge desde un límite invisible en la base
   de su línea, una tras otra. La I aparece como palo entero; al terminar de colocarse la última letra de su palabra,
   el palo reduce su altura y el punto de la i emerge desde arriba (límite a la altura de la I mayúscula). */
const CAPS = {step: 0.09, d1: 0.90, d2: 0.70, istep: 0.12, overlap: 0.70, ease: [0.33, 1, 0.68, 1]};
const CAPS_EASE = bezier(...CAPS.ease);
const MONO_OVERLAP = 0.6;           /* las filas del monoblock se solapan 0,6 u. para que no asome una línea entre ellas */
const I_STEM = {x0: 123, x1: 421, xh: 1104, dotTop: 1557, dotBot: 1247};   /* medidas de la i de Inter Bold (unidades de fuente) */

function capsPrep(text) { return [...text].map(c => c.toUpperCase() === 'I' ? 'i' : c.toUpperCase()).join(''); }

/* mono = color del monoblock (tercer estilo): un bloque por línea tras el texto. Margen lateral y superior = ancho de la l;
   el interlineado (= ancho de la l) queda dentro del bloque de la línea siguiente, de modo que las filas encajan sin huecos. */
function layoutCaps(rawLines, colorHex, mono) {
  const K = GEO.F / D.upm, capH = D.cap * K, lw = D.lw * K, pitch = capH + lw;     /* interlineado = ancho de la l */
  const pad = mono ? lw : 0;
  const iPath = D.glyphs[D.chars['i']].p, dotP = iPath.slice(iPath.indexOf('Z') + 1);   /* 2.º trazado de la i = el punto */
  let k = 0; const lines = [];
  rawLines.forEach((raw, li) => {
    const text = capsPrep(raw), base = GEO.top + capH + pad + li * pitch, chars = [...text].filter(c => D.chars[c]);
    /* posiciones con kerning */
    let x = 0; const run = [];
    chars.forEach((c, n) => { const g = D.glyphs[D.chars[c]]; run.push({c, g, x}); x += g.a + (chars[n + 1] ? (D.kern[c + chars[n + 1]] || 0) : 0); });
    const ink = run.filter(r => r.g.b);
    if (!ink.length) { lines.push({letters: [], base, floorY: base, limitY: base, width: 0, empty: true}); return; }
    const inkL = Math.min(...ink.map(r => r.x + r.g.b[0])) * K, inkR = Math.max(...ink.map(r => r.x + r.g.b[2])) * K;
    const ox = GEO.left + pad - inkL;
    const letters = [];
    run.forEach(r => {
      if (r.c === ' ') return;
      const isI = r.c === 'i', top = (isI ? I_STEM.dotTop : r.g.b[3]) * K, bot = isI ? 0 : -r.g.b[1] * K;
      const lt = {c: r.c, k: k++, line: li, isI, x: ox + r.x * K, top, bot};
      if (isI) {
        lt.stemX = lt.x + I_STEM.x0 * K; lt.stemW = (I_STEM.x1 - I_STEM.x0) * K;
        lt.dot = tp(dotP, K, lt.x, base);
      } else lt.d = tp(r.g.p, K, lt.x, base);
      letters.push(lt);
    });
    const desc = Math.max(0, ...letters.map(l => l.bot)), floorY = base + Math.max(0.02 * GEO.F, desc + 0.01 * GEO.F);
    const limitY = base - I_STEM.dotTop * K - 0.01 * GEO.F;
    letters.forEach(l => { l.hide = (floorY - base) + l.top + 2; l.dotDy = (limitY - (base - I_STEM.dotBot * K)) - 2; });
    const ln = {letters, base, floorY, limitY, width: (inkR - inkL), desc};
    if (mono) ln.block = {x0: GEO.left, w: (inkR - inkL) + 2 * lw, y0: base - capH - lw, y1: base};
    lines.push(ln);
  });
  if (mono) {
    /* Manual (pág. 41): si parte del monoblock queda en voladizo (la línea es más ancha que la siguiente) o es la última, el
       bloque se prolonga por debajo de la línea media altura de la "I" (la mitad de la altura de las mayúsculas). */
    const real = lines.filter(l => !l.empty);
    real.forEach((ln, j) => {
      const next = real[j + 1], over = !next || ln.block.w > next.block.w + 0.5;
      ln.block.y1 = ln.base + (over ? Math.max(capH / 2, (ln.desc || 0) + 0.01 * GEO.F) : 0);
    });
  }
  const all = lines.flatMap(l => l.letters || []).filter(Boolean);
  const L = {style: 2, lines, color: colorHex, capH, K, pitch, letters: all, words: wordsOf(rawLines, lines), rows: [{top: GEO.top}], bands: [], two: false,
          bbox: capsBox(lines, capH, mono), H: capH, xh: I_STEM.xh * K, mono: mono || null, lw};
  return L;
}
/* palabras = grupos de letras entre espacios, dentro de cada línea */
function wordsOf(rawLines, lines) {
  const words = [];
  rawLines.forEach((raw, li) => {
    const ln = lines[li]; if (ln.empty) return;
    const chars = [...capsPrep(raw)].filter(c => D.chars[c]); let idx = 0, cur = [];
    chars.forEach(c => { if (c === ' ') { if (cur.length) words.push(cur); cur = []; } else cur.push(ln.letters[idx++]); });
    if (cur.length) words.push(cur);
  });
  return words;
}
function capsBox(lines, capH, mono) {
  const real = lines.filter(l => !l.empty);
  if (mono) {
    const bottom = Math.max(...real.map(l => l.block.y1));
    return {x: GEO.left, y: real[0].block.y0, w: Math.max(...real.map(l => l.block.w)), h: bottom - real[0].block.y0};
  }
  const first = real[0], last = real[real.length - 1];
  const topExt = Math.max(...first.letters.map(l => l.top));
  const y = first.base - topExt, bottom = last.base + (last.desc > 0.015 * GEO.F ? last.desc : 0);
  const w = Math.max(...real.map(l => l.width));
  return {x: GEO.left, y, w, h: bottom - y};
}

/* ----- línea de tiempo: un elemento por letra (T), y por i el palo (S) y el punto (D) ----- */
const MONO = {rowDelay: 0.25, lag: 0.10, step: 0.07};      /* monoblock: cada fila arranca algo después de la anterior */
function easeInv(y) { let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (easeFn(m) < y) lo = m; else hi = m; } return (lo + hi) / 2; }
function capsElements(L) {
  const els = [], start = {};
  if (L.mono) {
    let nth = 0;
    L.lines.forEach((ln, i) => {
      if (ln.empty) return;
      const s0 = nth++ * MONO.rowDelay;
      els.push({id: 'M' + i, kind: 'block', s: s0, d: TIMING.lineDur, ease: EASE, ez: easeFn});
      /* cada letra emerge cuando el borde del bloque ya la ha cubierto (y al menos con el ritmo mínimo) */
      ln.letters.forEach((l, n) => {
        const frac = Math.min(1, Math.max(0, (l.x - ln.block.x0) / ln.block.w));
        start[l.k] = s0 + Math.max(MONO.lag + n * MONO.step, TIMING.lineDur * easeInv(frac));
      });
    });
  } else L.letters.forEach(l => { start[l.k] = l.k * CAPS.step; });
  L.letters.forEach(l => els.push({id: 'T' + l.k, kind: 'letter', s: start[l.k], d: CAPS.d1, ease: CAPS.ease, ez: CAPS_EASE}));
  L.words.forEach(w => {
    const wend = Math.max(...w.map(l => start[l.k] + CAPS.d1)), is = w.filter(l => l.isI);
    is.forEach((l, n) => {
      const p2 = wend - CAPS.overlap * CAPS.d1 + n * CAPS.istep;
      els.push({id: 'S' + l.k, kind: 'stem', s: p2, d: CAPS.d2, ease: CAPS.ease, ez: CAPS_EASE});
      els.push({id: 'D' + l.k, kind: 'dot', s: p2, d: CAPS.d2, ease: CAPS.ease, ez: CAPS_EASE});
    });
  });
  return els;
}

/* ----- canvas ----- */
function drawCaps(ctx, L, TL, t) {
  const capH = L.capH, xh = L.xh, BIG = 1e5;
  const bw = [];                      /* monoblock: anchura visible de cada fila */
  if (L.mono) {
    const path = new Path2D();
    L.lines.forEach((ln, i) => {
      if (ln.empty) return;
      bw[i] = ln.block.w * elProg(TL, 'M' + i, t);
      if (bw[i] > 0) path.rect(ln.block.x0, ln.block.y0, bw[i], ln.block.y1 - ln.block.y0 + (i < L.lines.length - 1 ? MONO_OVERLAP : 0));
    });
    ctx.fillStyle = L.mono; ctx.fill(path);
  }
  ctx.fillStyle = L.color;
  L.lines.forEach((ln, i) => {
    if (ln.empty) return;
    if (L.mono && !(bw[i] > 0)) return;
    const cx0 = L.mono ? ln.block.x0 : -BIG, cw = L.mono ? bw[i] : 2 * BIG;
    ctx.save();
    const clip = new Path2D(); clip.rect(cx0, -BIG, cw, BIG + ln.floorY); ctx.clip(clip);
    ln.letters.forEach(l => {
      const p = elProg(TL, 'T' + l.k, t); if (p <= 0) return;
      ctx.save(); ctx.translate(0, l.hide * (1 - p));
      if (l.isI) {
        const ps = elProg(TL, 'S' + l.k, t), h = capH + (xh - capH) * ps;
        ctx.fillRect(l.stemX, ln.base - h, l.stemW, h);
      } else {
        if (!l.p2d) l.p2d = new Path2D(l.d);
        ctx.fill(l.p2d);
      }
      ctx.restore();
    });
    ctx.restore();
    ctx.save();
    const lim = new Path2D(); lim.rect(cx0, ln.limitY, cw, BIG); ctx.clip(lim);
    ln.letters.forEach(l => {
      if (!l.isI) return;
      const p = elProg(TL, 'D' + l.k, t); if (p <= 0) return;
      ctx.save(); ctx.translate(0, l.dotDy * (1 - p));
      if (!l.dot2d) l.dot2d = new Path2D(l.dot);
      ctx.fill(l.dot2d); ctx.restore();
    });
    ctx.restore();
  });
}

/* ----- SVG (SMIL) ----- */
function svgCaps(L, TL, o) {
  const view = o.fs.view, uid = o.uid || '', total = TL ? TL.total : 1, loop = TL ? TL.loop : false;
  const el = id => TL.els.find(e => e.id === id);
  const an = (tag, attrs, id, f) => TL ? animEl(tag, attrs, el(id).segs, total, loop, f, el(id).ease) : '';
  const defs = [], body = [], blocks = [];
  if (o.bg) body.push(`<rect x="${f2(view.x)}" y="${f2(view.y)}" width="${f2(view.w)}" height="${f2(view.h)}" fill="${o.bg}"/>`);
  const capH = L.capH, xh = L.xh, X0 = f2(view.x - 50), WW = f2(view.w + 100);
  const p0 = TL ? 0 : 1;
  const grp = [];
  L.lines.forEach((ln, i) => {
    if (ln.empty) return;
    const bwAt = p => f2(ln.block.w * p), wAnim = L.mono ? an('animate', 'attributeName="width"', 'M' + i, bwAt) : '';
    const cx = L.mono ? f2(ln.block.x0) : X0, cwid = L.mono ? bwAt(p0) : WW;
    if (L.mono) {
      const last = i < L.lines.length - 1;
      blocks.push(`<rect x="${f2(ln.block.x0)}" y="${f2(ln.block.y0)}" width="${bwAt(p0)}" height="${f2(ln.block.y1 - ln.block.y0 + (last ? MONO_OVERLAP : 0))}">${wAnim}</rect>`);
    }
    defs.push(`<clipPath id="${uid}f${i}"><rect x="${cx}" y="${f2(view.y - 2000)}" width="${cwid}" height="${f2(ln.floorY - view.y + 2000)}">${wAnim}</rect></clipPath>`);
    defs.push(`<clipPath id="${uid}l${i}"><rect x="${cx}" y="${f2(ln.limitY)}" width="${cwid}" height="${f2(view.h + 4000)}">${wAnim}</rect></clipPath>`);
    let letters = '', dots = '';
    ln.letters.forEach(l => {
      const ty = an('animateTransform', 'attributeName="transform" type="translate"', 'T' + l.k, p => `0 ${f2(l.hide * (1 - p))}`);
      let inner;
      if (l.isI) {
        const yAt = p => f2(ln.base - (capH + (xh - capH) * p)), hAt = p => f2(capH + (xh - capH) * p);
        inner = `<rect x="${f2(l.stemX)}" y="${yAt(TL ? 0 : 1)}" width="${f2(l.stemW)}" height="${hAt(TL ? 0 : 1)}">` +
          an('animate', 'attributeName="y"', 'S' + l.k, yAt) + an('animate', 'attributeName="height"', 'S' + l.k, hAt) + '</rect>';
        const dty = an('animateTransform', 'attributeName="transform" type="translate"', 'D' + l.k, p => `0 ${f2(l.dotDy * (1 - p))}`);
        dots += `<g transform="translate(0,${f2(l.dotDy * (1 - p0))})">${dty}<path d="${l.dot}"/></g>`;
      } else inner = `<path d="${l.d}"/>`;
      letters += `<g transform="translate(0,${f2(l.hide * (1 - p0))})">${ty}${inner}</g>`;
    });
    grp.push(`<g clip-path="url(#${uid}f${i})">${letters}</g><g clip-path="url(#${uid}l${i})">${dots}</g>`);
  });
  if (blocks.length) body.push(`<g fill="${L.mono}">${blocks.join('')}</g>`);
  body.push(`<g fill="${L.color}">${grp.join('')}</g>`);
  const label = (o.label || '').replace(/[<>&-]/g, ' ');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="${f2(view.x)} ${f2(view.y)} ${f2(view.w)} ${f2(view.h)}">\n` +
    `<!-- MiND titulo animado (mayusculas): ${label}${TL ? ` · ${total.toFixed(2)}s` : ''} -->\n<defs>${defs.join('')}</defs>\n${body.join('\n')}\n</svg>\n`;
}

/* ----- Lottie: máscaras estáticas por línea + movimiento dentro de cada grupo ----- */
function lottieCaps(L, TL, o) {
  const fps = o.fps || 60, view = o.fs.view, K = o.fs.cw / view.w, W = Math.round(o.fs.cw), Hh = Math.round(o.fs.ch);
  const q = v => +(v * K).toFixed(2), qx = x => +((x - view.x) * K).toFixed(2), qy = y => +((y - view.y) * K).toFixed(2);
  const el = id => TL.els.find(e => e.id === id);
  const mirOf = e => [1 - e.ease[2], 1 - e.ease[3], 1 - e.ease[0], 1 - e.ease[1]];
  const kf = (id, f) => {
    const e = el(id), segs = e.segs, out = [];
    segs.forEach(g => {
      const k = {t: +(g.t0 * fps).toFixed(3), s: f(g.p0)};
      if (g.k === 'h') k.h = 1; else { const c = g.k === 'e' ? e.ease : mirOf(e); k.o = {x: [c[0]], y: [c[1]]}; k.i = {x: [c[2]], y: [c[3]]}; }
      out.push(k);
    });
    const last = segs[segs.length - 1]; out.push({t: +(last.t1 * fps).toFixed(3), s: f(last.p1)});
    return {a: 1, k: out};
  };
  const hexRgb = hex => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255, 1];
  const fill = {ty: 'fl', c: {a: 0, k: hexRgb(L.color)}, o: {a: 0, k: 100}, r: 1};
  const tr = pos => ({ty: 'tr', p: pos, a: {a: 0, k: [0, 0]}, s: {a: 0, k: [100, 100]}, r: {a: 0, k: 0}, o: {a: 0, k: 100}});
  const baseKs = {o: {a: 0, k: 100}, r: {a: 0, k: 0}, p: {a: 0, k: [0, 0, 0]}, a: {a: 0, k: [0, 0, 0]}, s: {a: 0, k: [100, 100, 100]}};
  const op = +(TL.total * fps).toFixed(3);
  let ind = 1; const layers = [];
  const mask = (y0, y1) => [{inv: false, mode: 'a', nm: 'Límite', o: {a: 0, k: 100}, x: {a: 0, k: 0},
    pt: {a: 0, k: {c: true, i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]], v: [[-100, y0], [W + 100, y0], [W + 100, y1], [-100, y1]]}}}];
  const layer = (nm, shapes, masks) => Object.assign({ddd: 0, ind: ind++, ty: 4, nm, sr: 1, ks: baseKs, ao: 0, shapes, ip: 0, op, st: 0, bm: 0}, masks ? {hasMask: true, masksProperties: masks} : {});
  /* monoblock: la máscara de cada línea se abre con el bloque (rectángulo animado) */
  const z4 = () => [[0, 0], [0, 0], [0, 0], [0, 0]];
  const amask = (i, ln, y0, y1) => [{inv: false, mode: 'a', nm: 'Bloque', o: {a: 0, k: 100}, x: {a: 0, k: 0},
    pt: kf('M' + i, p => { const xa = qx(ln.block.x0), xb = +(xa + q(ln.block.w * p)).toFixed(2); return [{c: true, i: z4(), o: z4(), v: [[xa, y0], [xb, y0], [xb, y1], [xa, y1]]}]; })}];
  const capH = L.capH, xh = L.xh;
  L.lines.forEach((ln, i) => {
    if (ln.empty) return;
    /* máscaras justo del tamaño del lienzo: lottie-web falla con coordenadas enormes */
    const floorM = L.mono ? amask(i, ln, -100, qy(ln.floorY)) : mask(-100, qy(ln.floorY)), limitM = L.mono ? amask(i, ln, qy(ln.limitY), Hh + 100) : mask(qy(ln.limitY), Hh + 100);
    ln.letters.forEach(l => {
      const pos = kf('T' + l.k, p => [0, q(l.hide * (1 - p))]);
      let shapes;
      if (l.isI) {
        const rc = {ty: 'rc', nm: 'Palo', d: 1, r: {a: 0, k: 0},
          s: kf('S' + l.k, p => [q(l.stemW), q(capH + (xh - capH) * p)]),
          p: kf('S' + l.k, p => [qx(l.stemX + l.stemW / 2), qy(ln.base - (capH + (xh - capH) * p) / 2)])};
        shapes = [{ty: 'gr', nm: 'Palo', it: [rc, fill, tr(pos)]}];
        const dpos = kf('D' + l.k, p => [0, q(l.dotDy * (1 - p))]);
        const dsubs = pathToLottie(l.dot, view, K);
        layers.push(layer(`Punto ${l.k + 1}`, [{ty: 'gr', nm: 'Punto', it: dsubs.map(sp => ({ty: 'sh', nm: 'Trazado', ks: {a: 0, k: sp}})).concat([fill, tr(dpos)])}], limitM));
      } else {
        const subs = pathToLottie(l.d, view, K);
        shapes = [{ty: 'gr', nm: 'Letra', it: subs.map(sp => ({ty: 'sh', nm: 'Trazado', ks: {a: 0, k: sp}})).concat([fill, tr(pos)])}];
      }
      layers.push(layer(`Letra ${l.k + 1}`, shapes, floorM));
    });
  });
  if (L.mono) {                      /* bloques: al fondo (última posición = capa inferior) */
    const fillM = {ty: 'fl', c: {a: 0, k: hexRgb(L.mono)}, o: {a: 0, k: 100}, r: 1};
    L.lines.forEach((ln, i) => {
      if (ln.empty) return;
      const h = ln.block.y1 - ln.block.y0 + (i < L.lines.length - 1 ? MONO_OVERLAP : 0), xa = qx(ln.block.x0);
      const rc = {ty: 'rc', nm: 'Bloque', d: 1, r: {a: 0, k: 0},
        s: kf('M' + i, p => [q(ln.block.w * p), q(h)]), p: kf('M' + i, p => [+(xa + q(ln.block.w * p) / 2).toFixed(2), +(qy(ln.block.y0) + q(h) / 2).toFixed(2)])};
      layers.push(layer(`Bloque ${i + 1}`, [{ty: 'gr', nm: 'Bloque', it: [rc, fillM, tr({a: 0, k: [0, 0]})]}]));
    });
  }
  return {v: '5.9.0', fr: fps, ip: 0, op, w: W, h: Hh, nm: 'MiND título mayúsculas', ddd: 0, assets: [], layers};
}
