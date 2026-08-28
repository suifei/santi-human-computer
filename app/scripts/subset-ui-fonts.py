"""Subset 清松行楷 + 霞鹜文楷 TC to the characters used in the app."""
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
TMP = ROOT / "tmp-fonts"
OUT = ROOT / "src" / "assets" / "fonts"

QING = TMP / "JasonHandwriting5p.ttf"
WEN = TMP / "LXGWWenKaiTC-Regular.ttf"

LATIN = "".join(chr(i) for i in range(0x20, 0x7F))
EXTRA = "·—–…「」『』【】（）《》〈〉，。、；：？！％°—─│"


def collect_text() -> str:
    blob = [LATIN, EXTRA]
    for p in SRC.rglob("*"):
        if p.suffix.lower() in {".ts", ".tsx", ".css", ".json", ".html", ".svg"}:
            try:
                blob.append(p.read_text(encoding="utf-8"))
            except OSError:
                pass
    return "".join(blob)


def cmap_of(path: Path) -> dict[int, str]:
    font = TTFont(path)
    cmap: dict[int, str] = {}
    for table in font["cmap"].tables:
        cmap.update(table.cmap)
    return cmap


def rename(font: TTFont, family: str) -> None:
    for rec in font["name"].names:
        if rec.nameID in (1, 4, 6, 16):
            rec.string = family if rec.nameID != 6 else family.replace(" ", "")


def subset_to(src: Path, dest: Path, text: str, family: str) -> None:
    opt = Options()
    opt.layout_features = ["*"]
    opt.desubroutinize = True
    opt.notdef_outline = True
    opt.recommended_glyphs = True
    opt.drop_tables += ["FFTM", "DSIG"]
    font = TTFont(src)
    sub = Subsetter(options=opt)
    sub.populate(text=text)
    sub.subset(font)
    rename(font, family)
    font.flavor = "woff2"
    dest.parent.mkdir(parents=True, exist_ok=True)
    font.save(dest)
    print(f"{dest.name}: {dest.stat().st_size / 1024:.1f} KB  glyphs={len(font.getGlyphOrder())}")


def main() -> None:
    raw = collect_text()
    need = "".join(sorted(set(raw)))
    qing_cmap = cmap_of(QING)
    wen_cmap = cmap_of(WEN)
    qing_text = "".join(ch for ch in need if ord(ch) in qing_cmap)
    wen_text = "".join(ch for ch in need if ord(ch) not in qing_cmap and ord(ch) in wen_cmap)
    latin_text = "".join(ch for ch in (LATIN + EXTRA) if ord(ch) in qing_cmap)
    cjk_text = "".join(ch for ch in qing_text if ord(ch) >= 0x80)
    subset_to(QING, OUT / "xingkai-zh.woff2", cjk_text, "QinYardXingKai")
    subset_to(QING, OUT / "xingkai-latin.woff2", latin_text, "QinYardXingKai")
    subset_to(WEN, OUT / "wenkai-fallback.woff2", wen_text, "QinYardKai")
    leftover = "".join(ch for ch in need if ord(ch) >= 0x80 and ord(ch) not in qing_cmap and ord(ch) not in wen_cmap)
    if leftover:
        print("still missing:", leftover)


if __name__ == "__main__":
    main()
