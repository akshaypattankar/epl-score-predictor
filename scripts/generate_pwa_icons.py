import os
from PIL import Image, ImageDraw

def generate_icons():
    src_path = 'assets/pl-logo.png'
    out_dir = 'public/icons'
    os.makedirs(out_dir, exist_ok=True)

    src = Image.open(src_path).convert('RGBA')

    # Brand colors
    PL_PURPLE = (55, 0, 60, 255)       # #37003c (Premier League signature purple)
    PL_MAGENTA = (255, 0, 90, 255)     # #ff005a (Premier League magenta accent)
    PL_CYAN = (0, 255, 135, 255)       # #00ff87 (Premier League cyan/green accent)

    sizes = [
        ('icon-72.png', 72, True),
        ('icon-96.png', 96, True),
        ('icon-128.png', 128, True),
        ('icon-144.png', 144, True),
        ('icon-152.png', 152, True),
        ('icon-192.png', 192, True),
        ('icon-384.png', 384, True),
        ('icon-512.png', 512, True),
        ('apple-touch-icon.png', 180, True),
        ('favicon-16x16.png', 16, True),
        ('favicon-32x32.png', 32, True),
        ('favicon-48x48.png', 48, True),
    ]

    # Generate full-bleed / solid background branded icons
    for name, size, has_bg in sizes:
        img = Image.new('RGBA', (size, size), PL_PURPLE)
        
        # Lion logo inside safe area (padding ~15%)
        padding = int(size * 0.14)
        inner_size = size - (padding * 2)
        if inner_size < 1:
            inner_size = size
            padding = 0
            
        logo_resized = src.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
        img.paste(logo_resized, (padding, padding), logo_resized)
        
        out_path = os.path.join(out_dir, name)
        img.save(out_path, format='PNG')
        print(f"Generated {out_path} ({size}x{size})")

    # Generate Maskable Icons (Android requires 20% safe zone padding)
    for mask_size in [192, 512]:
        img = Image.new('RGBA', (mask_size, mask_size), PL_PURPLE)
        padding = int(mask_size * 0.20)
        inner_size = mask_size - (padding * 2)
        logo_resized = src.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
        img.paste(logo_resized, (padding, padding), logo_resized)
        
        out_path = os.path.join(out_dir, f'icon-{mask_size}-maskable.png')
        img.save(out_path, format='PNG')
        print(f"Generated {out_path} ({mask_size}x{mask_size} maskable)")

    # Generate favicon.ico with multi-resolution (16, 32, 48)
    ico_img = Image.new('RGBA', (48, 48), PL_PURPLE)
    logo_48 = src.resize((36, 36), Image.Resampling.LANCZOS)
    ico_img.paste(logo_48, (6, 6), logo_48)
    ico_path = 'public/favicon.ico'
    ico_img.save(ico_path, format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"Generated {ico_path}")

    # Copy favicon.ico to public/icons/favicon.ico as well
    ico_img.save(os.path.join(out_dir, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])

    # Also keep a transparent version if needed
    for trans_size in [192, 512]:
        trans_img = Image.new('RGBA', (trans_size, trans_size), (0, 0, 0, 0))
        logo_trans = src.resize((trans_size, trans_size), Image.Resampling.LANCZOS)
        trans_img.paste(logo_trans, (0, 0), logo_trans)
        trans_path = os.path.join(out_dir, f'icon-{trans_size}-transparent.png')
        trans_img.save(trans_path, format='PNG')
        print(f"Generated {trans_path}")

if __name__ == '__main__':
    generate_icons()
