"""Copy retained originals and derive small UI PNGs by cropping transparent padding and nearest-neighbor resize."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--gallery-root', type=Path, required=True)
args = parser.parse_args()
meta = json.loads((HERE / 'generation.json').read_text(encoding='utf-8'))
art = ROOT / 'src/art/townbuild'
art.mkdir(parents=True, exist_ok=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
fontpath = Path('C:/Windows/Fonts/msjh.ttc')
font = ImageFont.truetype(str(fontpath), 18) if fontpath.exists() else ImageFont.load_default()
titlefont = ImageFont.truetype(str(fontpath), 24) if fontpath.exists() else font
board = Image.new('RGB', (1056, 536), '#e9decb')
draw = ImageDraw.Draw(board)
draw.text((20, 8), '城鎮建築分類 · 原創像素圖示', fill='#28383e', font=titlefont)
for i, asset in enumerate(meta['assets']):
    master = args.gallery_root / asset['master']
    if not master.exists():
        shutil.copy2(asset['source'], master)
    with Image.open(master) as src:
        src = src.convert('RGBA')
        bbox = src.getchannel('A').getbbox()
        crop = src.crop(bbox)
        crop.thumbnail((108, 108), Image.Resampling.NEAREST)
        icon = Image.new('RGBA', (128, 128))
        icon.paste(crop, ((128 - crop.width) // 2, (128 - crop.height) // 2))
        target = art / (asset['key'] + '.png')
        icon.save(target)
        asset.update(master_sha256=sha(master), game_sha256=sha(target), source_size=list(src.size), crop=list(bbox), game='src/art/townbuild/' + target.name)
        x, y = (i % 6) * 176, 50 + (i // 6) * 240
        board.paste(icon, (x + 24, y), icon)
        draw.text((x + 88, y + 132), asset['name'], fill='#28383e', font=font, anchor='mt')
        tiny = icon.resize((32, 32), Image.Resampling.NEAREST)
        for j, color in enumerate(('#15232d', '#fff7e7')):
            xx = x + 44 + j * 48
            draw.rectangle((xx - 5, y + 165, xx + 36, y + 206), fill=color)
            board.paste(tiny, (xx, y + 170), tiny)
board.save(HERE / 'overview.png')
meta['derivation'] = 'Crop original alpha bounds; nearest-neighbor fit within 108x108; center on 128x128 RGBA. Preserve generated alpha. UI uses 32px and image-rendering:pixelated.'
(HERE / 'generation.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
print('Derived and retained', len(meta['assets']), 'icons')
