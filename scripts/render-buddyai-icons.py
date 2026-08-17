from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def paint_icon(size: int, glow: bool) -> Image.Image:
    scale = size / 32
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cyan = (92, 255, 224)
    mint = (61, 255, 138)

    def xy(*vals: float) -> list[float]:
        return [v * scale for v in vals]

    radius = 9 * scale
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=(13, 17, 23, 255))

    if glow:
        halo = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        hd = ImageDraw.Draw(halo)
        hd.ellipse(xy(6, 8, 26, 26), fill=(61, 255, 208, 70))
        img = Image.alpha_composite(img, halo.filter(ImageFilter.GaussianBlur(radius=size * 0.06)))
        draw = ImageDraw.Draw(img)

    draw.rounded_rectangle(
        [0.7 * scale, 0.7 * scale, size - 0.7 * scale, size - 0.7 * scale],
        radius=8.3 * scale,
        outline=(*lerp(cyan, mint, 0.4), 220),
        width=max(1, round(1.1 * scale)),
    )

    band_w = max(2, round(2.2 * scale))
    draw.arc(xy(7.4, 5.4, 24.6, 22.6), start=200, end=340, fill=(*lerp(cyan, mint, 0.35), 255), width=band_w)

    cup_fill = (*lerp(cyan, mint, 0.45), 255)
    draw.rounded_rectangle(xy(5.1, 13.1, 9.5, 20.5), radius=2.2 * scale, fill=cup_fill)
    draw.rounded_rectangle(xy(22.5, 13.1, 26.9, 20.5), radius=2.2 * scale, fill=cup_fill)

    draw.ellipse(xy(8.95, 10.05, 23.05, 24.15), fill=(18, 24, 33, 255), outline=(*cyan, 230), width=max(1, round(1.05 * scale)))
    draw.rounded_rectangle(xy(9.6, 14.35, 22.4, 19.85), radius=2.75 * scale, fill=(*lerp(cyan, mint, 0.25), 255))

    eye_w = max(2, round(1.2 * scale))
    draw.arc(xy(11.7, 14.7, 14.5, 17.6), start=200, end=340, fill=(4, 16, 24, 255), width=eye_w)
    draw.arc(xy(17.5, 14.7, 20.3, 17.6), start=200, end=340, fill=(4, 16, 24, 255), width=eye_w)
    draw.arc(xy(13.7, 16.7, 18.3, 19.8), start=20, end=160, fill=(4, 16, 24, 255), width=max(2, round(1.1 * scale)))

    wave_w = max(1, round(1.1 * scale))
    draw.arc(xy(10.4, 21.6, 21.6, 28.2), start=20, end=160, fill=(61, 255, 208, 150), width=wave_w)
    draw.arc(xy(6.4, 6.6, 10.6, 12.4), start=220, end=310, fill=(61, 255, 138, 190), width=wave_w)
    draw.arc(xy(21.4, 6.6, 25.6, 12.4), start=230, end=320, fill=(92, 255, 224, 190), width=wave_w)
    return img


def save_all(root: Path) -> None:
    public = root / "public"
    app = root / "src" / "app"
    public.mkdir(parents=True, exist_ok=True)
    hi = paint_icon(1024, glow=True)

    def save(path: Path, size: int, glow: bool) -> None:
        src = hi if glow else paint_icon(1024, glow=False)
        out = src.resize((size, size), Image.Resampling.LANCZOS)
        out.save(path, format="PNG", optimize=True)

    save(public / "icon-512.png", 512, True)
    save(public / "icon-192.png", 192, True)
    save(public / "icon.png", 512, True)
    save(public / "apple-touch-icon.png", 180, True)
    save(app / "icon.png", 32, False)
    save(app / "apple-icon.png", 180, True)
    ico = paint_icon(256, glow=False)
    ico.save(public / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])


if __name__ == "__main__":
    save_all(Path(__file__).resolve().parents[1])
