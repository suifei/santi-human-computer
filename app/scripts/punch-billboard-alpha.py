"""Punch studio-gray backgrounds from tree/grass proto plates to RGBA PNGs."""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "models"
JOBS = [
    "tree-proto-front.jpg",
    "tree-proto-side.jpg",
    "grass-proto-front.jpg",
    "grass-proto-side.jpg",
]


def punch(src: Path) -> None:
    im = Image.open(src).convert("RGBA")
    arr = np.array(im)
    rgb = arr[:, :, :3].astype(np.int16)
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.max(np.abs(rgb - bg), axis=2)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    bg_mask = (dist < 36) & (sat < 22)
    alpha = np.where(bg_mask, 0, 255).astype(np.uint8)
    rim = bg_mask.copy()
    rim[1:] |= bg_mask[:-1]
    rim[:-1] |= bg_mask[1:]
    rim[:, 1:] |= bg_mask[:, :-1]
    rim[:, :-1] |= bg_mask[:, 1:]
    alpha = np.where(rim & ~bg_mask, 90, alpha)
    arr[:, :, 3] = alpha
    ys, xs = np.where(alpha > 12)
    if len(xs) < 50:
        raise SystemExit(f"no foreground in {src.name}")
    h, w = alpha.shape
    pad = 6
    box = (
        max(0, int(xs.min()) - pad),
        max(0, int(ys.min()) - pad),
        min(w, int(xs.max()) + pad + 1),
        min(h, int(ys.max()) + pad + 1),
    )
    out = Image.fromarray(arr).crop(box)
    dest = src.with_name(src.name.replace("-proto-", "-billboard-").replace(".jpg", ".png"))
    out.save(dest, "PNG", optimize=True)
    print(f"{src.name} -> {dest.name}  {out.size}  keep={(alpha > 12).mean():.3f}")


if __name__ == "__main__":
    for name in JOBS:
        punch(ROOT / name)
