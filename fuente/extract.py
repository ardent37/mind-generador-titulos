import json, os, base64, io
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools import subset

FD = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Windows\Fonts")
FONT = FD + r"\Inter_18pt-Bold.ttf"
tt = TTFont(FONT); gs = tt.getGlyphSet(); cmap = tt.getBestCmap()
face = hb.Face(open(FONT, "rb").read()); font = hb.Font(face)

CHARS = (" ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
         "ÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòùÂÊÎÔÛâêîôûÄËÏÖäëïöÇçÃÕãõ"
         ".,:;¿?¡!-–—()\"'«»“”‘’%&/+*=@#€$·…_")


def n(v):
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


class P(BasePen):
    def __init__(self, gs):
        super().__init__(gs); self.o = []
    def _moveTo(self, p): self.o.append(f"M{n(p[0])} {n(p[1])}")
    def _lineTo(self, p): self.o.append(f"L{n(p[0])} {n(p[1])}")
    def _curveToOne(self, a, b, c): self.o.append(f"C{n(a[0])} {n(a[1])} {n(b[0])} {n(b[1])} {n(c[0])} {n(c[1])}")
    def _qCurveToOne(self, a, b): self.o.append(f"Q{n(a[0])} {n(a[1])} {n(b[0])} {n(b[1])}")
    def _closePath(self): self.o.append("Z")


def shape(t):
    b = hb.Buffer(); b.add_str(t); b.guess_segment_properties()
    hb.shape(font, b, {"kern": True, "calt": True})
    return [(tt.getGlyphName(i.codepoint), p.x_advance) for i, p in zip(b.glyph_infos, b.glyph_positions)]


chars, glyphs = {}, {}
def add(name):
    if name in glyphs: return
    pen = P(gs); gs[name].draw(pen)
    bp = BoundsPen(gs); gs[name].draw(bp)
    glyphs[name] = {"a": tt["hmtx"][name][0], "b": [round(v, 1) for v in bp.bounds] if bp.bounds else None, "p": "".join(pen.o)}

for c in CHARS:
    if ord(c) in cmap: chars[c] = cmap[ord(c)]; add(cmap[ord(c)])
alone = {c: shape(c)[0][1] for c in chars}
kern = {}
for a in chars:
    for b in chars:
        s = shape(a + b)
        if len(s) != 2: continue
        d = s[0][1] - alone[a]
        if d: kern[a + b] = d
arrow = {}
for b in chars:
    s = shape("→" + b)
    if len(s) == 2:
        add(s[0][0]); arrow[b] = [s[0][0], s[0][1]]
add(cmap[0x2192])
l = glyphs[cmap[ord("l")]]["b"]
data = {"upm": tt["head"].unitsPerEm, "cap": tt["OS/2"].sCapHeight, "lw": l[2] - l[0],
        "chars": chars, "glyphs": glyphs, "kern": kern, "arrow": arrow, "arrowDefault": cmap[0x2192]}
json.dump(data, open("fontdata.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

# fuentes de interfaz (subconjunto latino) en base64
uni = list(range(0x20, 0x7f)) + list(range(0xa0, 0x180)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x2192, 0x00d7, 0x2190]
css = ""
for w, name in ((500, "Medium"), (700, "Bold")):
    opts = subset.Options(); opts.layout_features = ["kern", "calt", "case", "tnum"]; opts.name_IDs = []
    f = subset.load_font(FD + f"\\Inter_18pt-{name}.ttf", opts)
    s = subset.Subsetter(opts); s.populate(unicodes=uni); s.subset(f)
    buf = io.BytesIO(); f.flavor = None; f.save(buf)
    b64 = base64.b64encode(buf.getvalue()).decode()
    css += f"@font-face{{font-family:'Inter MiND';font-weight:{w};font-style:normal;src:url(data:font/ttf;base64,{b64}) format('truetype')}}\n"
open("fonts.css", "w").write(css)
print(len(chars), len(glyphs), len(kern), os.path.getsize("fontdata.json"), len(css))
