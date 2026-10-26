import sys
r = lambda p: open(p, encoding="utf-8").read()
app = "\n".join(r(f"src/{f}") for f in ("model.js", "encoders.js", "lottie.js", "ui.js"))
app = app.replace("__FONTDATA__", r("fontdata.json"))
html = r("src/template.html")
html = html.replace("__FONTCSS__", r("fonts.css")).replace("__MP4LIB__", r("lib/mp4-muxer.js"))
html = html.replace("__APP__", app)
out = sys.argv[1] if len(sys.argv) > 1 else "tool.html"
open(out, "w", encoding="utf-8").write(html)
print(out, len(html))
