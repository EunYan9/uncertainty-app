# 生成 PWA 图标：深色圆角方块 + 白色 σ
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)

FONT_CANDIDATES = [
    'C:/Windows/Fonts/seguisym.ttf',   # Segoe UI Symbol，含希腊字母
    'C:/Windows/Fonts/arial.ttf',
    'C:/Windows/Fonts/msyh.ttc',
    'C:/Windows/Fonts/DejaVuSans.ttf',
]

def make_icon(size: int, maskable: bool = False):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(size * (0.0 if maskable else 0.22))
    bg = (15, 23, 42, 255)  # slate-900
    if radius:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=bg)
    else:
        d.rectangle([0, 0, size - 1, size - 1], fill=bg)
    scale = 0.42 if maskable else 0.58  # maskable 需留安全区
    fsize = int(size * scale)
    font = None
    for fp in FONT_CANDIDATES:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, fsize)
                break
            except Exception:
                continue
    if font is None:
        font = ImageFont.load_default()
    text = 'σ'
    bbox = d.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - w) / 2 - bbox[0]
    y = (size - h) / 2 - bbox[1] - size * 0.02
    d.text((x, y), text, font=font, fill=(248, 250, 252, 255))
    name = f'icon-{size}{"-maskable" if maskable else ""}.png'
    img.save(os.path.join(OUT, name))
    print('saved', name)

make_icon(512)
make_icon(512, maskable=True)
make_icon(192)
make_icon(180)
