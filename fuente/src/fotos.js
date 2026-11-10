'use strict';
/* ===== Coloración de fotos =====
   Reproduce el ajuste "Coloración" de Affinity con el que se hace hoy a mano:
   tono fijo (rojo 0° / azul 230°), saturación 80 % y claridad 49 %.
   Por cada píxel se toma la claridad HSL (máx + mín) / 2 y se sustituye por 0,49 + 0,51 × claridad. */
(function () {
  const $ = id => document.getElementById(id);
  const SAT = 0.80, BASE = 0.49;
  const LOOKS = {
    rojo: {name: 'Rojo', sub: 'Tono 0°', h: 0},
    azul: {name: 'Azul', sub: 'Tono 230°', h: 230}
  };
  const FORMATS = {
    jpg:  {name: 'JPG',  mime: 'image/jpeg', ext: 'jpg',  sub: 'Ligero, ideal para fotos.'},
    png:  {name: 'PNG',  mime: 'image/png',  ext: 'png',  sub: 'Sin pérdida y con transparencia.'},
    webp: {name: 'WebP', mime: 'image/webp', ext: 'webp', sub: 'Más ligero que JPG, para web.'}
  };
  const SIZES = [{v: 0, n: 'Original'}, {v: 4096, n: 'Máx. 4096 px'}, {v: 2048, n: 'Máx. 2048 px'}, {v: 1080, n: 'Máx. 1080 px'}];
  const PREV_MAX = 1600;
  const WEBP_OK = (() => { try { return document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'); } catch (e) { return false; } })();

  const st = {items: [], sel: -1, look: 'rojo', fmt: 'jpg', size: 0, pos: 0.5, busy: false, sample: null};
  const luts = {};

  /* HSL -> RGB con la fórmula estándar */
  function hsl(h, s, l) {
    const a = s * Math.min(l, 1 - l), out = [];
    [0, 8, 4].forEach(n => { const k = (n + h / 30) % 12; out.push(l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); });
    return out.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255));
  }
  /* Tabla de 511 entradas: índice = máx + mín del píxel original (0..510) */
  function lutFor(look) {
    if (luts[look]) return luts[look];
    const lut = new Uint8Array(511 * 3), h = LOOKS[look].h;
    for (let i = 0; i <= 510; i++) { const c = hsl(h, SAT, BASE + (1 - BASE) * (i / 510)); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
    return (luts[look] = lut);
  }
  function applyLut(data, lut) {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b), k = (mx + mn) * 3;
      data[i] = lut[k]; data[i + 1] = lut[k + 1]; data[i + 2] = lut[k + 2];
    }
  }

  /* Imagen de ejemplo generada en código, para que la vista previa no esté vacía */
  function makeSample() {
    const W = 1254, H = 836, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, H * 0.6); sky.addColorStop(0, '#d9dde6'); sky.addColorStop(1, '#f4e6cf');
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    const sun = x.createRadialGradient(W * 0.72, H * 0.24, 10, W * 0.72, H * 0.24, 360); sun.addColorStop(0, 'rgba(255,244,214,.95)'); sun.addColorStop(1, 'rgba(255,244,214,0)');
    x.fillStyle = sun; x.fillRect(0, 0, W, H);
    const layers = [['#9aa88f', 0.42, 60, 0.004], ['#738a62', 0.52, 80, 0.0055], ['#4f6b3d', 0.62, 100, 0.007], ['#2f4a26', 0.74, 120, 0.009]];
    layers.forEach(([col, base, amp, f], n) => {
      x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
      for (let px = 0; px <= W; px += 6) {
        const y = H * base + Math.sin(px * f + n * 1.7) * amp * 0.5 + Math.sin(px * f * 2.3 + n) * amp * 0.25 + Math.sin(px * f * 5.1 + n * 3) * amp * 0.08;
        x.lineTo(px, y);
      }
      x.lineTo(W, H); x.closePath(); x.fill();
    });
    const river = x.createLinearGradient(0, H * 0.55, 0, H); river.addColorStop(0, '#b9c3cf'); river.addColorStop(1, '#6f7f8d');
    x.fillStyle = river; x.beginPath(); x.moveTo(W * 0.46, H * 0.62); x.bezierCurveTo(W * 0.56, H * 0.64, W * 0.6, H * 0.8, W * 0.74, H); x.lineTo(W * 0.5, H); x.bezierCurveTo(W * 0.5, H * 0.8, W * 0.42, H * 0.7, W * 0.46, H * 0.62); x.fill();
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(${rnd() < 0.5 ? '20,40,20' : '240,230,200'},${0.05 + rnd() * 0.08})`; const s = 2 + rnd() * 5; x.fillRect(rnd() * W, H * 0.5 + rnd() * H * 0.5, s, s); }
    return c;
  }

  /* ----- Decodificación y miniaturas ----- */
  async function loadItem(file) {
    const bmp = await createImageBitmap(file, {imageOrientation: 'from-image'});
    const k = Math.min(1, PREV_MAX / Math.max(bmp.width, bmp.height));
    const prev = document.createElement('canvas'); prev.width = Math.max(1, Math.round(bmp.width * k)); prev.height = Math.max(1, Math.round(bmp.height * k));
    const pc = prev.getContext('2d'); pc.imageSmoothingQuality = 'high'; pc.drawImage(bmp, 0, 0, prev.width, prev.height);
    const th = document.createElement('canvas'); th.width = 128; th.height = 96;
    const tk = Math.max(128 / prev.width, 96 / prev.height); const tc = th.getContext('2d');
    tc.drawImage(prev, (128 - prev.width * tk) / 2, (96 - prev.height * tk) / 2, prev.width * tk, prev.height * tk);
    const item = {file, name: file.name, w: bmp.width, h: bmp.height, prev, thumb: th};
    bmp.close();
    return item;
  }
  async function addFiles(fileList) {
    const files = [...fileList]; $('f_warn').hidden = true;
    const bad = [];
    for (const f of files) {
      if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name)) { bad.push(f.name); continue; }
      try { const it = await loadItem(f); st.items.push(it); st.sel = st.items.length - 1; }
      catch (e) { bad.push(f.name); }
    }
    if (bad.length) { $('f_warn').hidden = false; $('f_warn').textContent = 'No se pudo abrir: ' + bad.join(', ') + '. Usa JPG, PNG o WebP.'; }
    st.pos = 0.5; render();
  }

  /* ----- Vista previa ----- */
  const cvO = $('f_cvO'), cvR = $('f_cvR');
  function current() { return st.sel >= 0 ? st.items[st.sel] : null; }
  function drawPreview() {
    const it = current(), src = it ? it.prev : st.sample;
    if (!src) return;
    cvO.width = cvR.width = src.width; cvO.height = cvR.height = src.height;
    cvO.getContext('2d').drawImage(src, 0, 0);
    const rc = cvR.getContext('2d'); rc.drawImage(src, 0, 0);
    const id = rc.getImageData(0, 0, src.width, src.height); applyLut(id.data, lutFor(st.look)); rc.putImageData(id, 0, 0);
    $('f_stage').style.setProperty('--ar', src.width / src.height);
    $('f_stage').style.aspectRatio = `${src.width} / ${src.height}`;
    setPos(st.pos);
  }
  function setPos(p) {
    st.pos = Math.min(1, Math.max(0, p));
    $('f_cvR').style.clipPath = `inset(0 0 0 ${st.pos * 100}%)`;
    $('f_div').style.left = `${st.pos * 100}%`;
    $('f_div').setAttribute('aria-valuenow', String(Math.round(st.pos * 100)));
  }

  /* ----- Tamaño de salida ----- */
  function outSize(w, h) { const k = st.size ? Math.min(1, st.size / Math.max(w, h)) : 1; return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]; }
  function slug(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'foto'; }
  function outName(it) { return `${slug(it.name)}_MiND-${st.look}.${FORMATS[st.fmt].ext}`; }

  /* ----- Interfaz ----- */
  function render() {
    const has = st.items.length > 0, it = current();
    updateGroup($('f_color')); updateGroup($('f_fmt'), WEBP_OK ? null : {webp: 'Tu navegador no puede exportar WebP.'}); updateGroup($('f_size'));
    const ul = $('f_list'); ul.innerHTML = '';
    st.items.forEach((x, i) => {
      const li = document.createElement('li'); li.className = 'fi'; if (i === st.sel) li.setAttribute('aria-current', 'true');
      const c = document.createElement('canvas'); c.width = 128; c.height = 96; c.getContext('2d').drawImage(x.thumb, 0, 0);
      const info = document.createElement('div'); info.className = 'fin';
      info.innerHTML = '<span class="nm"></span><span class="dm"></span>'; info.firstChild.textContent = x.name; info.lastChild.textContent = `${x.w} × ${x.h}`;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mini'; b.textContent = 'Quitar'; b.setAttribute('aria-label', `Quitar ${x.name}`);
      b.addEventListener('click', e => { e.stopPropagation(); st.items.splice(i, 1); st.sel = Math.min(st.sel, st.items.length - 1); if (st.sel < 0 && st.items.length) st.sel = 0; render(); });
      li.addEventListener('click', () => { st.sel = i; render(); });
      li.append(c, info, b); ul.appendChild(li);
    });
    $('f_sample').hidden = has;
    $('f_export').disabled = !has; $('f_copy').disabled = !has;   /* mientras trabaja no se deshabilitan: así no parpadean */
    const n = st.items.length;
    $('f_exportLabel').textContent = !has ? 'Sube una foto para descargar' : n > 1 ? `Descargar ${n} fotos (ZIP)` : `Descargar ${FORMATS[st.fmt].name}`;
    if (!has) { $('f_summary').textContent = 'Imagen de ejemplo. Sube una foto para verla con tu coloración.'; $('f_fname').textContent = ''; }
    else {
      const [ow, oh] = outSize(it.w, it.h);
      $('f_summary').textContent = `${it.w} × ${it.h}` + (ow !== it.w ? ` → ${ow} × ${oh}` : '') + ` · ${FORMATS[st.fmt].name} · coloración ${LOOKS[st.look].name.toLowerCase()}`;
      $('f_fname').textContent = n > 1 ? `${n} archivos en un ZIP` : outName(it);
    }
    drawPreview();
  }

  /* ----- Exportación ----- */
  const mb = n => (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
  const toBlob = (c, mime, q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('El navegador no pudo codificar la imagen.')), mime, q));
  async function processItem(it, fmtOverride) {
    const fmtKey = fmtOverride || st.fmt;
    const bmp = await createImageBitmap(it.file, {imageOrientation: 'from-image'});
    let w = bmp.width, h = bmp.height; const [tw, th] = outSize(w, h);
    let src = bmp;
    while (w / 2 >= tw && h / 2 >= th) {            /* reduce a pasos para mantener la nitidez */
      const c = document.createElement('canvas'); c.width = Math.round(w / 2); c.height = Math.round(h / 2);
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
      if (src !== bmp) src.width = src.height = 0;
      src = c; w = c.width; h = c.height;
    }
    const out = document.createElement('canvas'); out.width = tw; out.height = th;
    const ctx = out.getContext('2d', {willReadFrequently: true}); ctx.imageSmoothingQuality = 'high';
    if (fmtKey === 'jpg') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, tw, th); }
    ctx.drawImage(src, 0, 0, tw, th); bmp.close();
    const id = ctx.getImageData(0, 0, tw, th); applyLut(id.data, lutFor(st.look)); ctx.putImageData(id, 0, 0);
    const f = FORMATS[fmtKey], blob = await toBlob(out, f.mime, 0.95);
    out.width = out.height = 0;
    return blob;
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function exportAll() {
    if (st.busy || !st.items.length) return;
    st.busy = true; $('f_err').hidden = true; $('f_prog').hidden = false; $('f_prog').value = 0;
    try {
      const files = [], used = new Set();
      for (let i = 0; i < st.items.length; i++) {
        $('f_status').textContent = `Procesando ${i + 1} de ${st.items.length}…`;
        const blob = await processItem(st.items[i]);
        let name = outName(st.items[i]); for (let k = 2; used.has(name); k++) name = name.replace(/(\.[a-z]+)$/, `-${k}$1`); used.add(name);
        files.push({name, blob}); $('f_prog').value = (i + 1) / st.items.length;
      }
      if (files.length === 1) { download(files[0].blob, files[0].name); $('f_status').textContent = `Listo: ${files[0].name} (${mb(files[0].blob.size)})`; }
      else {
        const data = await Promise.all(files.map(async f => ({name: f.name, data: new Uint8Array(await f.blob.arrayBuffer())})));
        const zip = new Blob([zipStore(data)], {type: 'application/zip'}), zn = `MiND_fotos_${st.look}.zip`;
        download(zip, zn); $('f_status').textContent = `Listo: ${zn} (${mb(zip.size)})`;
      }
    } catch (e) { $('f_err').hidden = false; $('f_err').textContent = 'No se pudo generar la foto: ' + e.message; $('f_status').textContent = ''; }
    finally { st.busy = false; $('f_prog').hidden = true; }
  }

  /* Copia la foto seleccionada, ya coloreada, al portapapeles (el portapapeles solo admite PNG). */
  async function copyImage() {
    const it = current();
    if (!it || st.busy) return;
    $('f_err').hidden = true;
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') { $('f_err').hidden = false; $('f_err').textContent = 'Tu navegador no permite copiar imágenes. Usa Descargar.'; return; }
    st.busy = true; $('f_status').textContent = 'Copiando…';
    try {
      await navigator.clipboard.write([new ClipboardItem({'image/png': processItem(it, 'png')})]);
      $('f_status').textContent = 'Imagen copiada. Pégala con Ctrl + V (o Cmd + V).';
    } catch (e) {
      $('f_err').hidden = false; $('f_status').textContent = '';
      $('f_err').textContent = e && e.name === 'NotAllowedError' ? 'El navegador no ha dado permiso para usar el portapapeles. Usa Descargar.' : 'No se pudo copiar la imagen: ' + (e && e.message ? e.message : e);
    } finally { st.busy = false; }
  }

  /* ----- Arranque ----- */
  function init() {
    radioGroup($('f_color'), 'fcolor', Object.keys(LOOKS).map(k => ({v: k, n: LOOKS[k].name, s: LOOKS[k].sub})), () => st.look, v => { st.look = v; render(); });
    Object.keys(LOOKS).forEach(k => {
      const lab = $('f_color').querySelector(`[data-v="${k}"]`), lut = lutFor(k), c = i => `rgb(${lut[i * 3]},${lut[i * 3 + 1]},${lut[i * 3 + 2]})`;
      const bar = document.createElement('span'); bar.className = 'chipbar'; bar.style.background = `linear-gradient(90deg,${c(0)},${c(255)},${c(510)})`; lab.insertBefore(bar, lab.firstChild);
    });
    radioGroup($('f_fmt'), 'ffmt', Object.keys(FORMATS).map(k => ({v: k, n: FORMATS[k].name, s: FORMATS[k].sub})), () => st.fmt, v => { st.fmt = v; render(); });
    radioGroup($('f_size'), 'fsize', SIZES, () => st.size, v => { st.size = +v; render(); }, 'seg');
    st.sample = makeSample();
    const input = $('f_input'), drop = $('f_drop');
    input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { if (!$('panel-fotos').hidden && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('over'); } }));
    ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { if (ev === 'dragleave' && e.relatedTarget) return; drop.classList.remove('over'); }));
    document.addEventListener('drop', e => { if (!$('panel-fotos').hidden && e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
    /* comparador */
    const stage = $('f_stage'); let dragging = false;
    const at = e => { const r = stage.getBoundingClientRect(); setPos((e.clientX - r.left) / r.width); };
    stage.addEventListener('pointerdown', e => { dragging = true; stage.setPointerCapture(e.pointerId); at(e); });
    stage.addEventListener('pointermove', e => { if (dragging) at(e); });
    ['pointerup', 'pointercancel'].forEach(ev => stage.addEventListener(ev, () => { dragging = false; }));
    $('f_div').addEventListener('keydown', e => {
      const step = e.shiftKey ? 0.1 : 0.02;
      if (e.key === 'ArrowLeft') setPos(st.pos - step); else if (e.key === 'ArrowRight') setPos(st.pos + step);
      else if (e.key === 'Home') setPos(0); else if (e.key === 'End') setPos(1); else return;
      e.preventDefault();
    });
    $('f_export').addEventListener('click', exportAll);
    $('f_copy').addEventListener('click', copyImage);
    render();
  }
  window.MiNDFotos = {lutFor, applyLut, st, render, processItem, addFiles};
  init();
})();
