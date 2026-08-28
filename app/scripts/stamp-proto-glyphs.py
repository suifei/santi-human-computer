"""Stamp seal-script 壹/零/輸入區 onto generated proto plates using the project font."""
from pathlib import Path
import tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = Path(r"C:\Users\SuiFei\.cursor\projects\d-works-Kimi-Agent\assets")
WOFF = ROOT / "src/assets/fonts/shuowen-seal.woff2"
CREAM = (246, 239, 221, 255)
GOLD = (212, 169, 82, 255)


def load_font(px: int) -> ImageFont.FreeTypeFont:
    tmp = Path(tempfile.gettempdir()) / "shuowen-seal-proto.ttf"
    if not tmp.exists() or tmp.stat().st_size < 1000:
        font = TTFont(WOFF)
        font.flavor = None
        font.save(tmp)
    return ImageFont.truetype(str(tmp), px)


def flood_bbox(im: Image.Image, seed: tuple[int, int], tol: int = 42):
    a = np.asarray(im.convert("RGB"))
    h, w = a.shape[:2]
    sx, sy = seed
    target = a[sy, sx].astype(int)
    vis = np.zeros((h, w), dtype=bool)
    stack = [(sx, sy)]
    vis[sy, sx] = True
    minx = maxx = sx
    miny = maxy = sy
    n = 0
    while stack:
        x, y = stack.pop()
        n += 1
        if n > 900_000:
            break
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if nx < 0 or ny < 0 or nx >= w or ny >= h or vis[ny, nx]:
                continue
            pix = a[ny, nx].astype(int)
            if np.abs(pix - target).max() <= tol:
                vis[ny, nx] = True
                stack.append((nx, ny))
                minx, maxx = min(minx, nx), max(maxx, nx)
                miny, maxy = min(miny, ny), max(maxy, ny)
    return (minx, miny, maxx, maxy), vis, tuple(int(c) for c in target)


def median_color(a: np.ndarray, vis: np.ndarray, inset: tuple[int, int, int, int]):
    x0, y0, x1, y1 = inset
    crop = vis[y0:y1, x0:x1]
    pix = a[y0:y1, x0:x1][crop]
    if len(pix) < 50:
        return None
    return tuple(int(v) for v in np.median(pix, axis=0))


def stamp_char(path: Path, seed: tuple[int, int], char: str, fill_inner: bool = True):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im.convert("RGB"))
    bbox, vis, _col = flood_bbox(im, seed)
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    pad_x, pad_y = int(w * 0.18), int(h * 0.18)
    ix0, iy0, ix1, iy1 = x0 + pad_x, y0 + pad_y, x1 - pad_x, y1 - pad_y
    if fill_inner and ix1 > ix0 and iy1 > iy0:
        med = median_color(a, vis, (ix0, iy0, ix1, iy1))
        if med:
            overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(overlay)
            d.rounded_rectangle([ix0, iy0, ix1, iy1], radius=8, fill=(*med, 235))
            overlay = overlay.filter(ImageFilter.GaussianBlur(1.2))
            im = Image.alpha_composite(im, overlay)
    size = int(min(ix1 - ix0, iy1 - iy0) * 0.78)
    font = load_font(max(64, size))
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    cx, cy = (ix0 + ix1) / 2, (iy0 + iy1) / 2
    draw.text((cx, cy), char, font=font, fill=CREAM, anchor="mm")
    # slight gold edge via offset
    edge = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    ed.text((cx + 1, cy + 1), char, font=font, fill=(80, 50, 30, 90), anchor="mm")
    im = Image.alpha_composite(im, edge)
    im = Image.alpha_composite(im, layer)
    out = im.convert("RGB")
    out.save(path, quality=95)
    print(f"stamped {char} on {path.name} bbox={bbox} inner={ix0,iy0,ix1,iy1}")


def stamp_sign(path: Path, text: str = "輸入區"):
    im = Image.open(path).convert("RGBA")
    # Keep glyphs inside the wood panel; gold frame is ~x 200-825, y 90-1030.
    inner = (290, 175, 730, 955)
    x0, y0, x1, y1 = inner
    box_w, box_h = x1 - x0, y1 - y0
    chars = list(text)
    cx = (x0 + x1) / 2
    lo, hi = 48, int(box_h / len(chars))
    font = load_font(max(48, int(box_h / (len(chars) + 1.6))))
    gap = box_h * 0.08
    usable = box_h - gap * 2
    step = usable / len(chars)
    while lo <= hi:
        mid = (lo + hi) // 2
        trial = load_font(mid)
        ok = True
        for i, ch in enumerate(chars):
            cy = y0 + gap + step * (i + 0.5)
            l, t, r, b = trial.getbbox(ch, anchor="mm")
            if r - l > box_w * 0.82 or cy + t < y0 + 4 or cy + b > y1 - 4:
                ok = False
                break
        if ok:
            font = trial
            lo = mid + 1
        else:
            hi = mid - 1
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for i, ch in enumerate(chars):
        cy = y0 + gap + step * (i + 0.5)
        draw.text((cx, cy), ch, font=font, fill=GOLD, anchor="mm")
    im = Image.alpha_composite(im, layer)
    im.convert("RGB").save(path, quality=95)
    print(f"stamped {text} on {path.name} inner={inner}")


if __name__ == "__main__":
    stamp_char(ASSETS / "flag-red-proto-front.png", (560, 520), "壹")
    stamp_char(ASSETS / "flag-red-proto-back.png", (420, 700), "壹", fill_inner=False)
    stamp_char(ASSETS / "flag-blue-proto-front.png", (560, 620), "零")
    stamp_char(ASSETS / "flag-blue-proto-back.png", (570, 400), "零", fill_inner=False)
    stamp_sign(ASSETS / "sign-proto-front.png")
