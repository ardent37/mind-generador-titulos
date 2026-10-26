'use strict';
/* ===== Lottie (JSON). Misma línea de tiempo que el SVG y el canvas ===== */
function pathToLottie(d, view, k) {
  const toks = d.match(/[MLQCZ]|-?\d+(?:\.\d+)?/g), subs = []; let cur = null, i = 0;
  const P = (x, y) => [+((x - view.x) * k).toFixed(2), +((y - view.y) * k).toFixed(2)];
  const num = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    const t = toks[i++];
    if (t === 'M') { cur = {v: [P(num(), num())], i: [[0, 0]], o: [[0, 0]], c: true}; subs.push(cur); }
    else if (t === 'L') { while (i < toks.length && !/[MLQCZ]/.test(toks[i])) { const p = P(num(), num()); cur.v.push(p); cur.i.push([0, 0]); cur.o.push([0, 0]); } }
    else if (t === 'Q') {
      while (i < toks.length && !/[MLQCZ]/.test(toks[i])) {
        const c = P(num(), num()), e = P(num(), num()), s = cur.v[cur.v.length - 1];
        cur.o[cur.o.length - 1] = [+((c[0] - s[0]) * 2 / 3).toFixed(2), +((c[1] - s[1]) * 2 / 3).toFixed(2)];
        cur.v.push(e); cur.i.push([+((c[0] - e[0]) * 2 / 3).toFixed(2), +((c[1] - e[1]) * 2 / 3).toFixed(2)]); cur.o.push([0, 0]);
      }
    } else if (t === 'C') {
      while (i < toks.length && !/[MLQCZ]/.test(toks[i])) {
        const c1 = P(num(), num()), c2 = P(num(), num()), e = P(num(), num()), s = cur.v[cur.v.length - 1];
        cur.o[cur.o.length - 1] = [+(c1[0] - s[0]).toFixed(2), +(c1[1] - s[1]).toFixed(2)];
        cur.v.push(e); cur.i.push([+(c2[0] - e[0]).toFixed(2), +(c2[1] - e[1]).toFixed(2)]); cur.o.push([0, 0]);
      }
    }
  }
  subs.forEach(sp => {
    const n = sp.v.length - 1;
    if (n > 0 && Math.abs(sp.v[n][0] - sp.v[0][0]) < 0.01 && Math.abs(sp.v[n][1] - sp.v[0][1]) < 0.01) {
      sp.i[0] = sp.i[n]; sp.v.pop(); sp.i.pop(); sp.o.pop();
    }
  });
  return subs;
}

function lottieFor(L, TL, o) {
  const fps = o.fps || 60, view = o.fs.view, K = o.fs.cw / view.w, W = Math.round(o.fs.cw), Hh = Math.round(o.fs.ch);
  const H = L.H, LEFT = GEO.left, ox = view.x, oy = view.y;
  const q = v => +(v * K).toFixed(2);
  const mir = [1 - EASE[2], 1 - EASE[3], 1 - EASE[0], 1 - EASE[1]];
  const segsOf = id => TL.els.find(e => e.id === id).segs;
  const kf = (segs, f) => {
    const out = [];
    segs.forEach((g, i) => {
      const k = {t: +(g.t0 * fps).toFixed(3), s: f(g.p0)};
      if (g.k === 'h') k.h = 1;
      else { const c = g.k === 'e' ? EASE : mir; k.o = {x: [c[0]], y: [c[1]]}; k.i = {x: [c[2]], y: [c[3]]}; }
      out.push(k);
    });
    const last = segs[segs.length - 1]; out.push({t: +(last.t1 * fps).toFixed(3), s: f(last.p1)});
    return out;
  };
  const anim = (segs, f) => ({a: 1, k: kf(segs, f)});
  const rc = (id, wf, hf, cxf, cyf) => ({ty: 'rc', nm: 'Rect', d: 1, r: {a: 0, k: 0},
    s: anim(segsOf(id), p => [wf(p), hf(p)]), p: anim(segsOf(id), p => [cxf(p), cyf(p)])});
  const fill = hex => ({ty: 'fl', c: {a: 0, k: [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255, 1]}, o: {a: 0, k: 100}, r: 1});
  const tr = () => ({ty: 'tr', p: {a: 0, k: [0, 0]}, a: {a: 0, k: [0, 0]}, s: {a: 0, k: [100, 100]}, r: {a: 0, k: 0}, o: {a: 0, k: 100}});
  const baseKs = pos => ({o: {a: 0, k: 100}, r: {a: 0, k: 0}, p: pos || {a: 0, k: [0, 0, 0]}, a: {a: 0, k: [0, 0, 0]}, s: {a: 0, k: [100, 100, 100]}});
  const op = +(TL.total * fps).toFixed(3);
  let ind = 1; const layers = [];
  const layer = (nm, shapes, extra) => Object.assign({ddd: 0, ind: ind++, ty: 4, nm, sr: 1, ks: baseKs(), ao: 0, shapes, ip: 0, op, st: 0, bm: 0}, extra || {});

  /* geometría animada de cada elemento (rectángulos visibles) */
  const blockRc = r => rc('L' + r.i, p => q(r.w * p), () => q(H), p => q(LEFT + r.w * p / 2 - ox), () => q(r.top + H / 2 - oy));
  const bandRc = (b, n) => rc('B' + n, () => q(b.w), p => q(b.h * p), () => q(b.x + b.w / 2 - ox),
    p => q((b.kind === 'top' ? b.edge - b.h * p / 2 : b.edge + b.h * p / 2) - oy));

  L.rows.forEach(r => {
    const id = 'L' + r.i;
    /* máscara: bloque visible + bandas de la fila (+ muy por debajo en la 1ª línea de dos) */
    const clipH = (L.two && r.i === 0) ? EXT : H;
    const matteShapes = [{ty: 'gr', nm: 'Bloque', it: [rc(id, p => q(r.w * p), () => q(clipH), p => q(LEFT + r.w * p / 2 - ox), () => q(r.top + clipH / 2 - oy)), fill('#FFFFFF'), tr()]}];
    L.bands.forEach((b, n) => { if (b.row === r.i) matteShapes.push({ty: 'gr', nm: 'Banda', it: [bandRc(b, n), fill('#FFFFFF'), tr()]}); });
    const textPos = {a: 1, k: kf(segsOf(id), p => [q(-r.w * (1 - p)), 0, 0])};
    const subs = pathToLottie(r.d, view, K);
    const glyphs = {ty: 'gr', nm: 'Texto', it: subs.map(sp => ({ty: 'sh', nm: 'Trazado', ks: {a: 0, k: sp}})).concat([fill('#FFFFFF'), tr()])};
    layers.push(layer('Máscara ' + (r.i + 1), matteShapes, {td: 1}));
    layers.push(layer('Texto ' + (r.i + 1), [glyphs], {tt: 1, ks: baseKs(textPos)}));
    layers.push(layer('Bloque ' + (r.i + 1), [{ty: 'gr', nm: 'Bloque', it: [blockRc(r), fill(r.color), tr()]}]));
  });
  L.bands.forEach((b, n) => layers.push(layer('Banda ' + (n + 1), [{ty: 'gr', nm: 'Banda', it: [bandRc(b, n), fill(b.color), tr()]}])));
  return {v: '5.9.0', fr: fps, ip: 0, op, w: W, h: Hh, nm: 'MiND título', ddd: 0, assets: [], layers};
}
