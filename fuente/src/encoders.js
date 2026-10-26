'use strict';
/* ===== Utilidades ===== */
/* cede el hilo sin que el navegador lo frene si la pestaña pasa a segundo plano */
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
const even = n => n + (n % 2);
const u8 = a => (a instanceof Uint8Array ? a : new Uint8Array(a));
function concat(parts) {
  let n = 0; parts.forEach(p => n += p.length);
  const out = new Uint8Array(n); let o = 0;
  parts.forEach(p => { out.set(p, o); o += p.length; });
  return out;
}
const be32 = v => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
const be16 = v => new Uint8Array([(v >>> 8) & 255, v & 255]);
const le16 = v => new Uint8Array([v & 255, (v >>> 8) & 255]);
const le32 = v => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);
const ascii = s => Uint8Array.from(s, c => c.charCodeAt(0));

/* Dimensiones y fotogramas de una exportación raster. */
function frameCount(TL, fps) { return Math.round(TL.total * fps) + (TL.mode === 'clean' || TL.mode === 'onceBi' ? 1 : 0); }   /* termina en un estado final distinto del inicial: se incluye el último fotograma */
function frameTime(TL, fps, k) { return Math.min(k / fps, TL.total); }

/* Recorre los fotogramas y llama a cb(canvas, ctx, k, t). */
async function eachFrame(L, TL, o, cb) {
  const fs = o.fs;
  let W = Math.round(fs.cw * o.scale), H = Math.round(fs.ch * o.scale);
  if (o.even) { W = even(W); H = even(H); }
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', {willReadFrequently: !!o.readback});
  const N = frameCount(TL, o.fps);
  for (let k = 0; k < N; k++) {
    if (o.cancel && o.cancel.v) throw new Error('cancelado');
    drawFrame(ctx, L, TL, frameTime(TL, o.fps, k), fs.view, W, H, o.bg);
    await cb(canvas, ctx, k, W, H);
    if (o.progress) o.progress((k + 1) / N);
    if (k % 4 === 3) await tick();
  }
  return {W, H, N};
}

/* ===== ZIP (sin compresión) para la secuencia PNG ===== */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) {
  const parts = [], central = []; let off = 0;
  files.forEach(f => {
    const name = ascii(f.name), crc = crc32(f.data), n = f.data.length;
    const lh = concat([le32(0x04034b50), le16(20), le16(0x0800), le16(0), le16(0), le16(0x21), le32(crc), le32(n), le32(n), le16(name.length), le16(0), name]);
    parts.push(lh, f.data);
    central.push(concat([le32(0x02014b50), le16(20), le16(20), le16(0x0800), le16(0), le16(0), le16(0x21), le32(crc), le32(n), le32(n), le16(name.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(off), name]));
    off += lh.length + n;
  });
  const cd = concat(central);
  return concat([...parts, cd, le32(0x06054b50), le16(0), le16(0), le16(files.length), le16(files.length), le32(cd.length), le32(off), le16(0)]);
}
const pngBytes = canvas => new Promise((res, rej) => canvas.toBlob(b => b ? b.arrayBuffer().then(x => res(new Uint8Array(x))) : rej(new Error('PNG')), 'image/png'));
/* PNG propio (deflate nativo): no depende de toBlob, que el navegador frena en segundo plano. */
async function pngFromCanvas(canvas) {
  if (typeof CompressionStream === 'undefined') return pngBytes(canvas);
  const W = canvas.width, H = canvas.height, px = canvas.getContext('2d').getImageData(0, 0, W, H).data, row = W * 4 + 1;
  const raw = new Uint8Array(row * H);
  for (let y = 0; y < H; y++) raw.set(px.subarray(y * W * 4, (y + 1) * W * 4), y * row + 1);
  const cs = new CompressionStream('deflate'), w = cs.writable.getWriter(); w.write(raw); w.close();
  const z = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  const chunk = (type, data) => { const body = concat([ascii(type), data]); return concat([be32(data.length), body, be32(crc32(body))]); };
  return concat([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', concat([be32(W), be32(H), Uint8Array.of(8, 6, 0, 0, 0)])), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))]);
}

async function exportPngZip(L, TL, o, base) {
  const files = [];
  await eachFrame(L, TL, Object.assign({readback: true}, o), async (c, ctx, k) => { files.push({name: `${base}_${String(k + 1).padStart(4, '0')}.png`, data: await pngFromCanvas(c)}); });
  return new Blob([zipStore(files)], {type: 'application/zip'});
}

/* ===== MOV con códec PNG (admite transparencia) ===== */
function box(type, ...parts) { const p = concat(parts); return concat([be32(p.length + 8), ascii(type), p]); }
function fullbox(type, ver, flags, ...parts) { return box(type, new Uint8Array([ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...parts); }
const MAT = concat([be32(0x10000), be32(0), be32(0), be32(0), be32(0x10000), be32(0), be32(0), be32(0), be32(0x40000000)]);
async function exportMov(L, TL, o) {
  const frames = [];
  const dim = await eachFrame(L, TL, Object.assign({readback: true}, o), async c => { frames.push(await pngFromCanvas(c)); });
  const {W, H, N} = dim, fps = o.fps, ts = fps * 100, dms = Math.round(N / fps * 1000);
  const ftyp = box('ftyp', ascii('qt  '), be32(0x200), ascii('qt  '));
  const mdatSize = frames.reduce((a, f) => a + f.length, 0) + 8;
  const mdatHead = concat([be32(mdatSize), ascii('mdat')]);
  const dataStart = ftyp.length + 8;
  const offs = []; let cur = dataStart; frames.forEach(f => { offs.push(cur); cur += f.length; });
  const name = new Uint8Array(32); name[0] = 3; name.set(ascii('PNG'), 1);
  const stsd = fullbox('stsd', 0, 0, be32(1), concat([be32(86), ascii('png '), new Uint8Array(6), be16(1), be16(0), be16(0), be32(0), be32(0), be32(512), be16(W), be16(H), be32(0x480000), be32(0x480000), be32(0), be16(1), name, be16(32), be16(0xFFFF)]));
  const stts = fullbox('stts', 0, 0, be32(1), be32(N), be32(100));
  const stsc = fullbox('stsc', 0, 0, be32(1), be32(1), be32(1), be32(1));
  const stsz = fullbox('stsz', 0, 0, be32(0), be32(N), ...frames.map(f => be32(f.length)));
  const stco = fullbox('stco', 0, 0, be32(N), ...offs.map(be32));
  const stbl = box('stbl', stsd, stts, stsc, stsz, stco);
  const dinf = box('dinf', fullbox('dref', 0, 0, be32(1), fullbox('alis', 0, 1)));
  const minf = box('minf', fullbox('vmhd', 0, 1, be16(0), be16(0), be16(0), be16(0)),
    fullbox('hdlr', 0, 0, ascii('dhlr'), ascii('alis'), be32(0), be32(0), be32(0), concat([new Uint8Array([11]), ascii('DataHandler')])), dinf, stbl);
  const mdia = box('mdia', fullbox('mdhd', 0, 0, be32(0), be32(0), be32(ts), be32(N * 100), be16(0x55c4), be16(0)),
    fullbox('hdlr', 0, 0, ascii('mhlr'), ascii('vide'), be32(0), be32(0), be32(0), concat([new Uint8Array([12]), ascii('VideoHandler')])), minf);
  const trak = box('trak', fullbox('tkhd', 0, 0x0f, be32(0), be32(0), be32(1), be32(0), be32(dms), new Uint8Array(8), be16(0), be16(0), be16(0), be16(0), MAT, be32(W << 16), be32(H << 16)), mdia);
  const moov = box('moov', fullbox('mvhd', 0, 0, be32(0), be32(0), be32(1000), be32(dms), be32(0x10000), be16(0x100), new Uint8Array(10), MAT, new Uint8Array(24), be32(2)), trak);
  return new Blob([ftyp, mdatHead, ...frames, moov], {type: 'video/quicktime'});
}

/* ===== GIF ===== */
function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function gifPalette(colors) {
  const base = []; colors.forEach(c => { const r = hexRgb(c); if (!base.some(b => b[0] === r[0] && b[1] === r[1] && b[2] === r[2])) base.push(r); });
  const pal = base.slice();
  for (let i = 0; i < base.length; i++) for (let j = i + 1; j < base.length; j++)
    for (let s = 1; s < 8; s++) pal.push([0, 1, 2].map(c => Math.round(base[i][c] + (base[j][c] - base[i][c]) * s / 8)));
  const real = Math.min(pal.length, 256);
  while (pal.length < 256) pal.push([0, 0, 0]);
  const lut = new Uint8Array(32768);
  for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) {
    const R = r * 8 + 4, G = g * 8 + 4, B = b * 8 + 4; let best = 0, bd = 1e9;
    for (let i = 0; i < real; i++) {
      const d = (pal[i][0] - R) ** 2 + (pal[i][1] - G) ** 2 + (pal[i][2] - B) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    lut[(r << 10) | (g << 5) | b] = best;
  }
  return {pal: pal.slice(0, 256), lut};
}
function lzw(indices, minCode) {
  const clear = 1 << minCode, eoi = clear + 1, out = []; let cur = 0, nb = 0;
  const put = (code, size) => { cur |= code << nb; nb += size; while (nb >= 8) { out.push(cur & 255); cur >>>= 8; nb -= 8; } };
  let dict = new Map(), next = eoi + 1, size = minCode + 1;
  put(clear, size);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = (prefix << 8) | k, hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    put(prefix, size);
    if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
    else { put(clear, size); dict = new Map(); next = eoi + 1; size = minCode + 1; }
    prefix = k;
  }
  put(prefix, size); put(eoi, size);
  if (nb > 0) out.push(cur & 255);
  return Uint8Array.from(out);
}
async function exportGif(L, TL, o, colors) {
  const {pal, lut} = gifPalette(colors);
  const chunks = [], delay = Math.round(100 / o.fps);
  let dims = null;
  const head = (W, H) => concat([ascii('GIF89a'), le16(W), le16(H), new Uint8Array([0xF7, 0, 0]), Uint8Array.from(pal.flat()),
    TL.loop ? concat([new Uint8Array([0x21, 0xFF, 0x0B]), ascii('NETSCAPE2.0'), new Uint8Array([3, 1, 0, 0, 0])]) : new Uint8Array(0)]);
  const res = await eachFrame(L, TL, Object.assign({readback: true}, o), async (c, ctx, k, W, H) => {
    if (!dims) { dims = [W, H]; chunks.push(head(W, H)); }
    const px = ctx.getImageData(0, 0, W, H).data, idx = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < idx.length; i++, j += 4) idx[i] = lut[((px[j] >> 3) << 10) | ((px[j + 1] >> 3) << 5) | (px[j + 2] >> 3)];
    chunks.push(concat([new Uint8Array([0x21, 0xF9, 4, 0x04]), le16(delay), new Uint8Array([0, 0]), new Uint8Array([0x2C]), le16(0), le16(0), le16(W), le16(H), new Uint8Array([0, 8])]));
    const data = lzw(idx, 8);
    for (let p = 0; p < data.length; p += 255) { const n = Math.min(255, data.length - p); chunks.push(concat([new Uint8Array([n]), data.subarray(p, p + n)])); }
    chunks.push(new Uint8Array([0]));
  });
  chunks.push(new Uint8Array([0x3B]));
  return new Blob(chunks, {type: 'image/gif'});
}

/* ===== Conversión RGBA -> I420 (BT.709, rango limitado) ===== */
function rgbaToI420(px, W, H, out) {
  const ySize = W * H, cw = W >> 1;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    let rs = 0, gs = 0, bs = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = ((y + dy) * W + x + dx) * 4, r = px[i], g = px[i + 1], b = px[i + 2];
      out[(y + dy) * W + x + dx] = 16 + 0.8588 * (0.2126 * r + 0.7152 * g + 0.0722 * b) + 0.5;
      rs += r; gs += g; bs += b;
    }
    rs /= 4; gs /= 4; bs /= 4;
    const ci = (y >> 1) * cw + (x >> 1);
    out[ySize + ci] = 128 + 0.8784 * (-0.1146 * rs - 0.3854 * gs + 0.5 * bs) + 0.5;
    out[ySize + (ySize >> 2) + ci] = 128 + 0.8784 * (0.5 * rs - 0.4542 * gs - 0.0458 * bs) + 0.5;
  }
  return out;
}
function bleedColors(px, W, H) {   /* colores de píxeles transparentes = vecino opaco, para evitar halos oscuros */
  const has = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) has[i] = px[i * 4 + 3] > 0 ? 1 : 0;
  const copy = (a, b) => { px[a * 4] = px[b * 4]; px[a * 4 + 1] = px[b * 4 + 1]; px[a * 4 + 2] = px[b * 4 + 2]; has[a] = 1; };
  for (let y = 0; y < H; y++) { const r = y * W;
    for (let x = 1; x < W; x++) if (!has[r + x] && has[r + x - 1]) copy(r + x, r + x - 1);
    for (let x = W - 2; x >= 0; x--) if (!has[r + x] && has[r + x + 1]) copy(r + x, r + x + 1); }
  for (let x = 0; x < W; x++) {
    for (let y = 1; y < H; y++) if (!has[y * W + x] && has[(y - 1) * W + x]) copy(y * W + x, (y - 1) * W + x);
    for (let y = H - 2; y >= 0; y--) if (!has[y * W + x] && has[(y + 1) * W + x]) copy(y * W + x, (y + 1) * W + x);
  }
}
const CS709 = {primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'bt709', fullRange: false};
const supportsCodecs = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

/* ===== MP4 (H.264) ===== */
async function exportMp4(L, TL, o) {
  const W = even(Math.round(o.fs.cw * o.scale)), H = even(Math.round(o.fs.ch * o.scale));
  const big = W * H > 2200000;
  const cands = [big ? 'avc1.640034' : 'avc1.64002A', 'avc1.640033', 'avc1.64002A', 'avc1.4D0028'];
  let cfg = null;
  for (const codec of cands) {
    const c = {codec, width: W, height: H, bitrate: big ? 40e6 : 14e6, framerate: o.fps, avc: {format: 'avc'}, latencyMode: 'quality'};
    try { const s = await VideoEncoder.isConfigSupported(c); if (s.supported) { cfg = c; break; } } catch (e) {}
  }
  if (!cfg) throw new Error('Este navegador no puede codificar H.264. Usa Chrome o Edge.');
  const muxer = new Mp4Muxer.Muxer({target: new Mp4Muxer.ArrayBufferTarget(), video: {codec: 'avc', width: W, height: H, frameRate: o.fps}, fastStart: 'in-memory', firstTimestampBehavior: 'offset'});
  let err = null;
  const enc = new VideoEncoder({output: (c, m) => muxer.addVideoChunk(c, m), error: e => { err = e; }});
  enc.configure(cfg);
  const buf = new Uint8Array(W * H * 3 / 2);
  await eachFrame(L, TL, Object.assign({readback: true, even: true}, o), async (c, ctx, k) => {
    if (err) throw err;
    rgbaToI420(ctx.getImageData(0, 0, W, H).data, W, H, buf);
    const vf = new VideoFrame(buf.slice(), {format: 'I420', codedWidth: W, codedHeight: H, timestamp: Math.round(k * 1e6 / o.fps), duration: Math.round(1e6 / o.fps), colorSpace: CS709});
    enc.encode(vf, {keyFrame: k % 60 === 0}); vf.close();
    while (enc.encodeQueueSize > 8) await tick();
  });
  await enc.flush(); enc.close(); if (err) throw err;
  muxer.finalize();
  return new Blob([muxer.target.buffer], {type: 'video/mp4'});
}

/* ===== WebM VP9 con transparencia (color + alfa como dos flujos) ===== */
function ebmlSize(n) {
  if (n < 127) return Uint8Array.of(0x80 | n);
  if (n < 16383) return Uint8Array.of(0x40 | (n >> 8), n & 255);
  if (n < 2097151) return Uint8Array.of(0x20 | (n >> 16), (n >> 8) & 255, n & 255);
  if (n < 268435455) return Uint8Array.of(0x10 | (n >> 24), (n >> 16) & 255, (n >> 8) & 255, n & 255);
  const hi = Math.floor(n / 4294967296), lo = n >>> 0;
  return Uint8Array.of(0x01, 0, 0, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
}
const el = (id, ...p) => { const d = concat(p); return concat([Uint8Array.from(id), ebmlSize(d.length), d]); };
const euint = (id, v) => { const b = []; do { b.unshift(v & 255); v = Math.floor(v / 256); } while (v > 0); return el(id, Uint8Array.from(b)); };
const efloat = (id, v) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return el(id, b); };
const estr = (id, s) => el(id, ascii(s));
function muxWebM(W, H, fps, color, alpha, durMs) {
  const head = el([0x1A, 0x45, 0xDF, 0xA3], euint([0x42, 0x86], 1), euint([0x42, 0xF7], 1), euint([0x42, 0xF2], 4), euint([0x42, 0xF3], 8), estr([0x42, 0x82], 'webm'), euint([0x42, 0x87], 4), euint([0x42, 0x85], 2));
  const info = el([0x15, 0x49, 0xA9, 0x66], euint([0x2A, 0xD7, 0xB1], 1000000), efloat([0x44, 0x89], durMs), estr([0x4D, 0x80], 'MiND'), estr([0x57, 0x41], 'MiND'));
  const track = el([0x16, 0x54, 0xAE, 0x6B], el([0xAE], euint([0xD7], 1), euint([0x73, 0xC5], 1), euint([0x83], 1), euint([0x9C], 0), estr([0x86], 'V_VP9'),
    el([0xE0], euint([0xB0], W), euint([0xBA], H), alpha ? euint([0x53, 0xC0], 1) : new Uint8Array(0), el([0x55, 0xB0], euint([0x55, 0xB1], 1), euint([0x55, 0xB9], 1), euint([0x55, 0xBA], 13), euint([0x55, 0xBB], 1)))));
  const clusters = []; let cur = null, base = 0;
  const flush = () => { if (cur) clusters.push(el([0x1F, 0x43, 0xB6, 0x75], euint([0xE7], base), ...cur)); cur = null; };
  const dur = Math.round(1000 / fps);
  color.forEach((c, i) => {
    const t = Math.round(i * 1000 / fps);
    if (!cur || t - base > 30000 || (c.type === 'key' && t - base > 1000)) { flush(); cur = []; base = t; }
    const data = new Uint8Array(c.byteLength); c.copyTo(data);
    const blk = concat([Uint8Array.of(0x81), be16((t - base) & 0xFFFF), Uint8Array.of(0), data]);
    const parts = [el([0xA1], blk)];
    if (alpha) { const a = new Uint8Array(alpha[i].byteLength); alpha[i].copyTo(a); parts.push(el([0x75, 0xA1], el([0xA6], euint([0xEE], 1), el([0xA5], a)))); }
    parts.push(euint([0x9B], dur));
    if (c.type !== 'key') parts.push(el([0xFB], Uint8Array.of(0xFF)));
    cur.push(el([0xA0], ...parts));
  });
  flush();
  const seg = concat([info, track, ...clusters]);
  const sz = new Uint8Array(8); sz[0] = 1;
  let n = seg.length; for (let i = 7; i >= 1; i--) { sz[i] = n % 256; n = Math.floor(n / 256); }
  return concat([head, Uint8Array.from([0x18, 0x53, 0x80, 0x67]), sz, seg]);
}

async function exportWebm(L, TL, o) {
  const W = even(Math.round(o.fs.cw * o.scale)), H = even(Math.round(o.fs.ch * o.scale));
  const cfg = {codec: 'vp09.00.10.08', width: W, height: H, bitrate: Math.min(60e6, Math.round(W * H * o.fps * 0.9)), framerate: o.fps, latencyMode: 'quality'};
  const s = await VideoEncoder.isConfigSupported(cfg);
  if (!s.supported) throw new Error('Este navegador no puede codificar VP9. Usa Chrome o Edge.');
  const colorChunks = [], alphaChunks = []; let err = null;
  const withAlpha = !o.bg;
  const mk = list => { const e = new VideoEncoder({output: c => list.push(c), error: x => { err = x; }}); e.configure(cfg); return e; };
  const ec = mk(colorChunks), ea = withAlpha ? mk(alphaChunks) : null;
  const yuv = new Uint8Array(W * H * 3 / 2), ayuv = new Uint8Array(W * H * 3 / 2);
  ayuv.fill(128, W * H);
  await eachFrame(L, TL, Object.assign({readback: true, even: true}, o), async (c, ctx, k) => {
    if (err) throw err;
    const img = ctx.getImageData(0, 0, W, H), px = img.data, key = k % 60 === 0;
    if (withAlpha) { for (let i = 0; i < W * H; i++) ayuv[i] = px[i * 4 + 3]; bleedColors(px, W, H); }
    rgbaToI420(px, W, H, yuv);
    const ts = Math.round(k * 1e6 / o.fps), du = Math.round(1e6 / o.fps);
    const vf = new VideoFrame(yuv.slice(), {format: 'I420', codedWidth: W, codedHeight: H, timestamp: ts, duration: du, colorSpace: CS709});
    ec.encode(vf, {keyFrame: key}); vf.close();
    if (withAlpha) {
      const af = new VideoFrame(ayuv.slice(), {format: 'I420', codedWidth: W, codedHeight: H, timestamp: ts, duration: du, colorSpace: {primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'bt709', fullRange: true}});
      ea.encode(af, {keyFrame: key}); af.close();
    }
    while (ec.encodeQueueSize > 8) await tick();
  });
  await ec.flush(); ec.close(); if (ea) { await ea.flush(); ea.close(); }
  if (err) throw err;
  const bytes = muxWebM(W, H, o.fps, colorChunks, withAlpha ? alphaChunks : null, Math.round(frameCount(TL, o.fps) * 1000 / o.fps));
  return new Blob([bytes], {type: 'video/webm'});
}
