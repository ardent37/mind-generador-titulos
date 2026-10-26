'use strict';
const $ = id => document.getElementById(id);
const BG = {transparent: {name: 'Transparente', hex: null}, white: {name: 'Blanco', hex: '#FFFFFF'}, black: {name: 'Negro', hex: '#000000'}};

/* Orden de los formatos: de más a menos probable para un equipo de diseño. */
const FORMATS = [
  {id: 'mp4',    name: 'MP4',                    ext: 'mp4',  use: 'Vídeo para redes, presentaciones y edición. Sin transparencia.', raster: true, needs: 'codecs'},
  {id: 'mov',    name: 'MOV con transparencia',  ext: 'mov',  use: 'Para superponer en Premiere, DaVinci o Final Cut (códec PNG).', raster: true},
  {id: 'svg',    name: 'SVG animado',            ext: 'svg',  use: 'Vector para web y diseño. Se anima solo en el navegador.', raster: false, canLoop: true},
  {id: 'lottie', name: 'Lottie (JSON)',          ext: 'json', use: 'Para apps y web con reproductor Lottie.', raster: false, canLoop: true},
  {id: 'webm',   name: 'WebM con transparencia', ext: 'webm', use: 'Vídeo web ligero con fondo transparente.', raster: true, needs: 'codecs'},
  {id: 'gif',    name: 'GIF',                    ext: 'gif',  use: 'Último recurso: email o chat. Menos calidad.', raster: true, canLoop: true},
  {id: 'png',    name: 'Secuencia PNG (ZIP)',    ext: 'zip',  use: 'Fotogramas con transparencia para After Effects o cualquier editor.', raster: true}
];
/* Estructura (qué ocurre) × repetición (solo en formatos que pueden llevarla incorporada). */
const STRUCTS = {
  in:    {name: 'Unidireccional', sub: 'Aparece y se queda en el título final.', code: 'unidireccional'},
  inOut: {name: 'Bidireccional',  sub: 'Aparece y se reproduce en reversa hasta desaparecer.', code: 'bidireccional'},
  clean: {name: 'Clean',          sub: 'Solo el movimiento de entrada, sin pausas. Para montar en edición.', code: 'clean'}
};
const FRAMES = [{v: 'crop', n: 'Recortado al título', s: 'Sin margen. Ideal para superponer.'}, {v: '16x9', n: '16:9'}, {v: '9x16', n: '9:16'}, {v: '1x1', n: '1:1'}];

const S = {l1: 'Área de', l2: 'seguridad', fmt: 'mp4', struct: 'in', repeat: false, bgPref: 'transparent', frame: '16x9', scalePref: 1, fpsPref: 60,
  colors: {l1: 'azul', l2: 'rojo', top: 'amarillo', bottom: 'naranja'}, place: {}};
const HAS_CODECS = supportsCodecs();
let L = null, TL = null, EFF = null, T = 0, playing = true, busy = null, FS = null;

function fmtDef(id) { return FORMATS.find(f => f.id === id); }
function modeOf() {
  if (S.struct === 'clean') return 'clean';
  const rep = EFF ? EFF.repeat : false;
  return S.struct === 'in' ? (rep ? 'loopUni' : 'once') : (rep ? 'loopBi' : 'onceBi');
}

/* ----- Reglas: qué combinaciones valen y por qué ----- */
function rules() {
  const f = S.fmt, def = fmtDef(f), why = {bg: {}, scale: {}, fps: {}, fmt: {}};
  FORMATS.forEach(x => { if (x.needs === 'codecs' && !HAS_CODECS) why.fmt[x.id] = 'Necesita Chrome o Edge actualizados.'; });
  if (f === 'mp4' || f === 'gif') why.bg.transparent = f === 'mp4' ? 'MP4 no admite transparencia.' : 'GIF no admite transparencia suave.';
  if (f === 'lottie') why.bg.white = why.bg.black = 'Lottie no lleva fondo: lo pone tu app.';
  if (f === 'gif') { why.scale[2] = 'Con este tamaño el GIF pesaría demasiado.'; [30, 60].forEach(v => why.fps[v] = 'El GIF va a 25 fps.'); }
  else why.fps[25] = 'Solo para GIF.';
  const e = {};
  e.bg = why.bg[S.bgPref] ? (f === 'lottie' ? 'transparent' : 'white') : S.bgPref;
  e.scale = why.scale[S.scalePref] ? 1 : S.scalePref;
  e.fps = f === 'gif' ? 25 : (S.fpsPref === 25 ? 60 : S.fpsPref);
  e.canRepeat = !!def.canLoop && S.struct !== 'clean';
  e.repeat = e.canRepeat && S.repeat;
  return {why, e};
}

/* ----- Grupos de opciones ----- */
function radioGroup(host, name, items, getVal, onPick, cls) {
  host.innerHTML = '';
  host.classList.add('opts', ...(cls || 'cards').split(' '));
  items.forEach(it => {
    const id = `${name}_${String(it.v).replace(/\W/g, '')}`;
    const lab = document.createElement('label'); lab.className = 'opt'; lab.htmlFor = id; lab.dataset.v = it.v;
    lab.innerHTML = `<input type="radio" id="${id}" name="${name}" value="${it.v}"><span class="t"></span><span class="s"></span><span class="why"></span>`;
    host.appendChild(lab);
    lab.querySelector('input').addEventListener('change', () => onPick(it.v));
  });
  host._items = items; host._get = getVal;
}
function updateGroup(host, rule) {
  host.querySelectorAll('.opt').forEach(lab => {
    const it = host._items.find(x => String(x.v) === lab.dataset.v), inp = lab.querySelector('input');
    const reason = rule && rule[it.v];
    inp.checked = String(host._get()) === String(it.v);
    inp.disabled = !!reason;
    lab.classList.toggle('off', !!reason);
    lab.querySelector('.t').textContent = it.n;
    lab.querySelector('.s').textContent = typeof it.s === 'function' ? it.s() : (it.s || '');
    lab.querySelector('.why').textContent = reason || '';
  });
}
function swatchGroup(host, name, keys, get, set) {
  host.innerHTML = '';
  keys.forEach(k => {
    const id = `${name}_${k}`, lab = document.createElement('label'); lab.className = 'sw'; lab.htmlFor = id;
    lab.innerHTML = `<input type="radio" id="${id}" name="${name}" value="${k}"><span class="chip" style="background:${PALETTE[k].hex}"></span><span class="n">${PALETTE[k].name}</span>`;
    host.appendChild(lab);
    lab.querySelector('input').addEventListener('change', () => set(k));
  });
  host._get = get;
}
function updateSwatch(host, off) {
  host.querySelectorAll('input').forEach(i => { i.checked = host._get() === i.value; i.disabled = !!off; });
  host.classList.toggle('off', !!off);
}

/* ----- Estado derivado ----- */
function lines() { return [S.l1.trim(), S.l2.trim()].filter(Boolean); }
function slug() {
  return lines().join('_').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'titulo';
}
/* Posición del título en el encuadre actual. Siempre devuelve el mismo objeto; la posición
   por defecto se recalcula solo en rebuild() mientras el usuario no la haya tocado. */
function placeNow() {
  if (S.frame === 'crop' || !L) return null;
  return S.place[S.frame] || (S.place[S.frame] = Object.assign({touched: false}, defaultPlace(L, S.frame)));
}
function outDims() { return {W: even(Math.round(FS.cw * EFF.scale)), H: even(Math.round(FS.ch * EFF.scale))}; }
function fileName() {
  const f = fmtDef(S.fmt), base = `MiND_Titulo_${slug()}_${STRUCTS[S.struct].code}${EFF.repeat ? '-bucle' : ''}`;
  const fr = S.frame === 'crop' ? 'recortado' : S.frame;
  if (!f.raster) return `${base}_${fr}.${f.ext}`;
  const d = outDims();
  return `${base}_${d.W}x${d.H}_${EFF.fps}fps.${f.ext}`;
}
const fmtTime = s => s.toFixed(1).replace('.', ',') + ' s';

function rebuild() {
  const ls = lines(), miss = [...new Set((S.l1 + S.l2).split('').filter(c => !D.chars[c]))];
  const hasInk = ls.some(l => [...l].some(c => D.chars[c] && c !== ' '));
  $('warn').hidden = !miss.length;
  $('warn').textContent = miss.length ? 'Estos caracteres no están disponibles y se omiten: ' + miss.join(' ') : '';
  const r = rules(); EFF = r.e;
  if (!hasInk) { L = null; TL = null; FS = null; refresh(r); return; }
  L = layout(ls, S.colors);
  TL = buildTimeline(L, modeOf(), TIMING);
  if (S.frame !== 'crop' && S.place[S.frame] && !S.place[S.frame].touched) S.place[S.frame] = null;   /* sin tocar: recalcula la posición por defecto */
  FS = frameSpec(L, S.frame, placeNow());
  refresh(r);
}

function refresh(r) {
  r = r || rules();
  const has = !!L, two = has && L.two, f = fmtDef(S.fmt), ed = has && S.frame !== 'crop';
  updateGroup($('g_fmt'), r.why.fmt);
  updateGroup($('g_struct'));
  updateGroup($('g_repeat'));
  $('repeatBox').hidden = !r.e.canRepeat;
  $('hint_repeat').textContent = S.fmt === 'lottie' ? 'Activa loop en tu reproductor Lottie.' : '';
  updateGroup($('g_bg'), r.why.bg);
  updateGroup($('g_frame'));
  $('titleBox').hidden = !ed;
  if (ed) { const p = placeNow(); $('scaleT').value = Math.round(p.s * 100); $('scaleTv').textContent = Math.round(p.s * 100) + ' %'; }
  /* resolución y fps solo si el formato los usa: el SVG es vectorial y no tiene fotogramas */
  $('sec_res').hidden = !f.raster; $('sec_fps').hidden = S.fmt === 'svg'; $('fs_size').hidden = $('sec_res').hidden && $('sec_fps').hidden;
  $('fpsLabel').classList.toggle('first', $('sec_res').hidden);
  updateGroup($('g_fps'), r.why.fps);
  updateSwatch($('sw_l1')); updateSwatch($('sw_l2'), !two);
  updateSwatch($('sw_top'), !(has && L.bands.some(b => b.kind === 'top')));
  updateSwatch($('sw_bottom'), !(has && L.bands.some(b => b.kind === 'bottom')));
  $('note_l2').textContent = two ? '' : 'Añade una 2ª línea para elegir su color.';
  $('note_top').textContent = (has && !L.bands.some(b => b.kind === 'top')) ? 'Este texto no lleva banda superior: ninguna tilde sobresale.' : '';
  $('note_bottom').textContent = (has && !L.bands.some(b => b.kind === 'bottom')) ? 'Este texto no lleva banda inferior: ningún asta baja.' : '';
  $('exportLabel').textContent = 'Descargar ' + f.name.replace(' con transparencia', '');
  $('export').disabled = !has || !!busy || !!r.why.fmt[S.fmt];
  $('editHelp').hidden = !ed;
  $('g_scale')._items.forEach(it => { it.s = () => FS ? `${even(Math.round(FS.cw * it.v))} × ${even(Math.round(FS.ch * it.v))}` : ''; });
  updateGroup($('g_scale'), r.why.scale);
  if (!has) { $('summary').textContent = 'Escribe un texto en la línea 1.'; $('fname').textContent = ''; return; }
  const d = outDims(), n = f.raster ? frameCount(TL, EFF.fps) : null;
  const size = f.raster ? `${d.W} × ${d.H}` : (S.fmt === 'lottie' ? `${Math.round(FS.cw)} × ${Math.round(FS.ch)}` : 'vectorial');
  const bits = [fmtTime(TL.total), size, (f.raster || S.fmt === 'lottie') ? `${EFF.fps} fps` : null, n ? `${n} fotogramas` : null,
    EFF.bg === 'transparent' ? 'fondo transparente' : 'fondo ' + BG[EFF.bg].name.toLowerCase()].filter(Boolean);
  $('summary').textContent = bits.join(' · ');
  $('fname').textContent = fileName();
  $('stageBox').style.aspectRatio = `${FS.cw} / ${FS.ch}`;
  $('stageBox').style.setProperty('--ar', FS.cw / FS.ch);
  $('stageBox').dataset.bg = EFF.bg;
  const sd = $('scrub'); sd.max = TL.total.toFixed(3); sd.step = '0.001';
}

/* ----- Vista previa y edición del encuadre ----- */
const cv = $('cv'), cctx = cv.getContext('2d'), ov = $('ov'), octx = ov.getContext('2d');
let last = 0, hover = false, focused = false, drag = null, snapLines = {x: null, y: null};
const editable = () => !!L && S.frame !== 'crop';
function unit() { return $('stageBox').clientWidth / FS.cw; }
function boxRect() { const p = placeNow(); return {x: p.x, y: p.y, w: L.bbox.w * p.s, h: L.bbox.h * p.s}; }
function guides() { const R = RATIOS[S.frame], m = marginOf(R); return {x: [m, R.w / 2, R.w - m], y: [m, R.h / 2, R.h - m]}; }

function drawPreview() {
  if (!L) { cctx.clearRect(0, 0, cv.width, cv.height); octx.clearRect(0, 0, ov.width, ov.height); return; }
  const box = $('stageBox'), cssW = box.clientWidth || 600, cssH = cssW * FS.ch / FS.cw, dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(cssW * dpr), Hh = Math.round(cssH * dpr);
  if (cv.width !== W || cv.height !== Hh) { cv.width = ov.width = W; cv.height = ov.height = Hh; }
  const t = Math.min(T, TL.total);
  drawFrame(cctx, L, TL, t, FS.view, W, Hh, BG[EFF.bg].hex);
  $('time').textContent = `${t.toFixed(2).replace('.', ',')} / ${TL.total.toFixed(2).replace('.', ',')} s`;
  const sd = $('scrub'); if (document.activeElement !== sd) sd.value = t.toFixed(3);
  drawOverlay(dpr);
}
function drawOverlay(dpr) {
  octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, ov.width, ov.height);
  if (!editable() || !(hover || focused || drag)) return;
  const u = unit() * dpr, b = boxRect();
  octx.save();
  /* las guías solo se ven cuando el título se pega a una */
  octx.strokeStyle = '#FF4C4C'; octx.lineWidth = Math.max(1, dpr);
  if (snapLines.x !== null) { octx.beginPath(); octx.moveTo(snapLines.x * u, 0); octx.lineTo(snapLines.x * u, ov.height); octx.stroke(); }
  if (snapLines.y !== null) { octx.beginPath(); octx.moveTo(0, snapLines.y * u); octx.lineTo(ov.width, snapLines.y * u); octx.stroke(); }
  octx.lineWidth = 3 * dpr; octx.strokeStyle = '#fff'; octx.strokeRect(b.x * u, b.y * u, b.w * u, b.h * u);
  octx.lineWidth = 1.5 * dpr; octx.strokeStyle = '#0000FF'; octx.strokeRect(b.x * u, b.y * u, b.w * u, b.h * u);
  const hs = 5 * dpr;
  [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].forEach(([x, y]) => {
    octx.fillStyle = '#fff'; octx.fillRect(x * u - hs, y * u - hs, hs * 2, hs * 2);
    octx.lineWidth = 1.5 * dpr; octx.strokeStyle = '#0000FF'; octx.strokeRect(x * u - hs, y * u - hs, hs * 2, hs * 2);
  });
  octx.restore();
}
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing && TL) { T += dt; const tail = TL.loop ? 0 : 0.8; if (T > TL.total + tail) T = 0; }
  drawPreview(); requestAnimationFrame(loop);
}
function setPlaying(v) { playing = v; $('play').textContent = v ? 'Pausa' : 'Reproducir'; $('play').setAttribute('aria-pressed', String(v)); }

/* Imán: acerca bordes, centro y esquinas del título a las guías (márgenes y ejes medios). */
function nearest(cands, lines, thr) {
  let best = null;
  cands.forEach(c => lines.forEach(l => { const d = l - c; if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = {d, l}; }));
  return best;
}
function pointerUnits(e) { const r = ov.getBoundingClientRect(), u = unit(); return {x: (e.clientX - r.left) / u, y: (e.clientY - r.top) / u}; }
function hitHandle(pt) {
  const b = boxRect(), thr = 12 / unit();
  const cs = {tl: [b.x, b.y], tr: [b.x + b.w, b.y], bl: [b.x, b.y + b.h], br: [b.x + b.w, b.y + b.h]};
  for (const k in cs) if (Math.abs(pt.x - cs[k][0]) <= thr && Math.abs(pt.y - cs[k][1]) <= thr) return k;
  return null;
}
const inBox = pt => { const b = boxRect(); return pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h; };
function applyDrag(pt) {
  const p = placeNow(), g = guides(), thr = 8 / unit(), bb = L.bbox;
  snapLines = {x: null, y: null};
  if (drag.kind === 'move') {
    let nx = drag.x0 + (pt.x - drag.px), ny = drag.y0 + (pt.y - drag.py);
    const w = bb.w * p.s, h = bb.h * p.s;
    const sx = nearest([nx, nx + w / 2, nx + w], g.x, thr), sy = nearest([ny, ny + h / 2, ny + h], g.y, thr);
    if (sx) { nx += sx.d; snapLines.x = sx.l; }
    if (sy) { ny += sy.d; snapLines.y = sy.l; }
    p.x = nx; p.y = ny;
  } else {
    const a = drag.anchor, c = drag.corner;
    const sgnx = c.includes('l') ? -1 : 1, sgny = c.includes('t') ? -1 : 1;
    let s = Math.max(Math.abs(pt.x - a.x) / bb.w, Math.abs(pt.y - a.y) / bb.h);
    s = Math.min(5, Math.max(0.15, s));
    const mx = a.x + sgnx * bb.w * s, my = a.y + sgny * bb.h * s;
    const sx = nearest([mx], g.x, thr), sy = nearest([my], g.y, thr);
    const cx = sx ? Math.abs(sx.l - a.x) / bb.w : null, cy = sy ? Math.abs(sy.l - a.y) / bb.h : null;
    if (sx && (!sy || Math.abs(sx.d) <= Math.abs(sy.d)) && cx >= 0.15) { s = cx; snapLines.x = sx.l; }
    else if (sy && cy >= 0.15) { s = cy; snapLines.y = sy.l; }
    p.s = s; p.x = c.includes('l') ? a.x - bb.w * s : a.x; p.y = c.includes('t') ? a.y - bb.h * s : a.y;
  }
  p.touched = true; commitPlace();
}
function commitPlace() {
  FS = frameSpec(L, S.frame, placeNow()); const p = placeNow();
  $('scaleT').value = Math.round(p.s * 100); $('scaleTv').textContent = Math.round(p.s * 100) + ' %';
}
function scaleAboutCenter(ns) {
  const p = placeNow(), b = boxRect(), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  ns = Math.min(5, Math.max(0.15, ns));
  p.s = ns; p.x = cx - L.bbox.w * ns / 2; p.y = cy - L.bbox.h * ns / 2; p.touched = true; commitPlace();
}
function initEditing() {
  ov.addEventListener('pointerenter', () => { hover = true; });
  ov.addEventListener('pointerleave', () => { hover = false; });
  ov.addEventListener('pointerdown', e => {
    if (!editable()) return;
    const pt = pointerUnits(e), h = hitHandle(pt), p = placeNow(), b = boxRect();
    if (h) {
      const opp = {tl: [b.x + b.w, b.y + b.h], tr: [b.x, b.y + b.h], bl: [b.x + b.w, b.y], br: [b.x, b.y]}[h];
      drag = {kind: 'scale', corner: h, anchor: {x: opp[0], y: opp[1]}};
    } else if (inBox(pt)) drag = {kind: 'move', px: pt.x, py: pt.y, x0: p.x, y0: p.y};
    else return;
    ov.setPointerCapture(e.pointerId); e.preventDefault(); ov.focus({preventScroll: true});
  });
  ov.addEventListener('pointermove', e => {
    if (!editable()) return;
    const pt = pointerUnits(e);
    if (drag) applyDrag(pt);
    else { const h = hitHandle(pt); ov.style.cursor = h ? (h === 'tl' || h === 'br' ? 'nwse-resize' : 'nesw-resize') : inBox(pt) ? 'move' : 'default'; }
  });
  const end = () => { drag = null; snapLines = {x: null, y: null}; fileUpdate(); };
  ov.addEventListener('pointerup', end); ov.addEventListener('pointercancel', end);
  ov.addEventListener('focus', () => { focused = true; }); ov.addEventListener('blur', () => { focused = false; });
  ov.addEventListener('keydown', e => {
    if (!editable()) return;
    const p = placeNow(), st = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') p.x -= st; else if (e.key === 'ArrowRight') p.x += st;
    else if (e.key === 'ArrowUp') p.y -= st; else if (e.key === 'ArrowDown') p.y += st;
    else if (e.key === '+' || e.key === '=') { scaleAboutCenter(p.s * 1.03); e.preventDefault(); return; }
    else if (e.key === '-') { scaleAboutCenter(p.s / 1.03); e.preventDefault(); return; }
    else return;
    p.touched = true; commitPlace(); e.preventDefault();
  });
  $('scaleT').addEventListener('input', e => { if (editable()) scaleAboutCenter(parseInt(e.target.value, 10) / 100); });
  $('resetPlace').addEventListener('click', () => { S.place[S.frame] = null; rebuild(); });
}
function fileUpdate() { if (L) $('fname').textContent = fileName(); }

/* ----- Exportación ----- */
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const mb = n => (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
async function doExport(forceFmt) {
  if (!L || busy) return null;
  const fmt = forceFmt || S.fmt, bgHex = BG[EFF.bg].hex;
  const cancel = {v: false}; busy = cancel;
  $('export').disabled = true; $('cancel').hidden = false; $('prog').hidden = false; $('prog').value = 0;
  $('status').textContent = 'Generando…'; $('err').hidden = true;
  const fs = FS;
  const o = {fs, scale: EFF.scale, fps: EFF.fps, bg: bgHex, cancel, progress: v => { $('prog').value = v; $('status').textContent = `Generando… ${Math.round(v * 100)} %`; }};
  const colorsUsed = [bgHex || '#FFFFFF', '#FFFFFF', ...L.rows.map(r => r.color), ...L.bands.map(b => b.color)];
  let blob;
  try {
    if (fmt === 'svg') blob = new Blob([svgFor(L, TL, {fs, bg: bgHex, label: lines().join(' / ')})], {type: 'image/svg+xml'});
    else if (fmt === 'lottie') blob = new Blob([JSON.stringify(lottieFor(L, TL, {fs, fps: EFF.fps}))], {type: 'application/json'});
    else if (fmt === 'png') blob = await exportPngZip(L, TL, o, `MiND_Titulo_${slug()}`);
    else if (fmt === 'mov') blob = await exportMov(L, TL, o);
    else if (fmt === 'mp4') blob = await exportMp4(L, TL, o);
    else if (fmt === 'webm') blob = await exportWebm(L, TL, o);
    else if (fmt === 'gif') blob = await exportGif(L, TL, o, colorsUsed);
    const name = fileName();
    if (!forceFmt) download(blob, name);
    $('status').textContent = `Listo: ${name} (${mb(blob.size)})`;
    return {blob, name};
  } catch (e) {
    if (e.message === 'cancelado') $('status').textContent = 'Exportación cancelada.';
    else { $('err').hidden = false; $('err').textContent = 'No se pudo generar el archivo: ' + e.message; $('status').textContent = ''; }
    return null;
  } finally { busy = null; $('cancel').hidden = true; $('prog').hidden = true; refresh(); }
}

/* ----- Arranque ----- */
function init() {
  /* título de la herramienta con el propio sistema de títulos del manual */
  const hl = layout(['Generador de', 'títulos'], {l1: 'azul', l2: 'rojo', top: 'amarillo', bottom: 'naranja'});
  $('brand').innerHTML = svgFor(hl, null, {fs: frameSpec(hl, 'crop'), uid: 'h_'}).replace(/^<\?xml[^>]*\?>\s*/, '').replace('width="100%" height="100%"', 'role="img" aria-label="Generador de títulos"');
  $('brand').style.aspectRatio = `${hl.bbox.w} / ${hl.bbox.h}`;

  radioGroup($('g_fmt'), 'fmt', FORMATS.map(f => ({v: f.id, n: f.name, s: f.use})), () => S.fmt, v => { S.fmt = v; rebuild(); });
  radioGroup($('g_struct'), 'struct', Object.keys(STRUCTS).map(k => ({v: k, n: STRUCTS[k].name, s: STRUCTS[k].sub})), () => S.struct, v => { S.struct = v; T = 0; rebuild(); }, 'cards one');
  radioGroup($('g_repeat'), 'repeat', [{v: 'once', n: 'Una pasada'}, {v: 'loop', n: 'Bucle'}], () => (EFF && EFF.repeat) ? 'loop' : 'once', v => { S.repeat = v === 'loop'; T = 0; rebuild(); }, 'seg');
  radioGroup($('g_bg'), 'bg', Object.keys(BG).map(k => ({v: k, n: BG[k].name})), () => EFF ? EFF.bg : S.bgPref, v => { S.bgPref = v; rebuild(); }, 'seg');
  radioGroup($('g_frame'), 'frame', FRAMES.map(f => ({v: f.v, n: f.n, s: f.s})), () => S.frame, v => { S.frame = v; rebuild(); }, 'seg');
  radioGroup($('g_scale'), 'scale', [{v: 0.5, n: 'Pequeño'}, {v: 1, n: 'Estándar'}, {v: 2, n: 'Grande'}], () => EFF ? EFF.scale : S.scalePref, v => { S.scalePref = v; rebuild(); }, 'seg');
  radioGroup($('g_fps'), 'fps', [{v: 25, n: '25'}, {v: 30, n: '30'}, {v: 60, n: '60'}], () => EFF ? EFF.fps : S.fpsPref, v => { S.fpsPref = v; rebuild(); }, 'seg');
  swatchGroup($('sw_l1'), 'cl1', ['azul', 'rojo', 'azul50', 'rojo50'], () => S.colors.l1, k => { S.colors.l1 = k; rebuild(); });
  swatchGroup($('sw_l2'), 'cl2', ['rojo', 'azul', 'rojo50', 'azul50'], () => S.colors.l2, k => { S.colors.l2 = k; rebuild(); });
  swatchGroup($('sw_top'), 'ctop', ['amarillo', 'naranja'], () => S.colors.top, k => { S.colors.top = k; rebuild(); });
  swatchGroup($('sw_bottom'), 'cbot', ['naranja', 'amarillo'], () => S.colors.bottom, k => { S.colors.bottom = k; rebuild(); });

  $('l1').value = S.l1; $('l2').value = S.l2;
  let timer; ['l1', 'l2'].forEach(id => $(id).addEventListener('input', e => { S[id] = e.target.value; clearTimeout(timer); timer = setTimeout(() => { T = 0; rebuild(); }, 120); }));
  $('play').addEventListener('click', () => setPlaying(!playing));
  $('scrub').addEventListener('input', e => { setPlaying(false); T = parseFloat(e.target.value); });
  $('export').addEventListener('click', () => doExport());
  $('cancel').addEventListener('click', () => { if (busy) busy.v = true; });
  initEditing();
  const rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  rebuild();
  if (rm) { setPlaying(false); T = TL ? TL.total : 0; } else setPlaying(true);
  requestAnimationFrame(t => { last = t; loop(t); });
  window.addEventListener('resize', drawPreview);
}
init();
