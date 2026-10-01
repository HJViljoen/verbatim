#!/usr/bin/env bash
# Design drift guards (MASTER.md §Visual identity rule 9; palette A since
# 2026-10-01). Fails the lint when the app slides off its palette.
#   (a) every neutral in app/globals.css is cool (blue >= red), EXCEPT palette
#       A's three warm neutrals (the ground, the hairline, the track); any other
#       warm neutral is a cream creeping back
#   (b) no saturated green in the app tokens: the 2026-08-28 green set retired
#       with palette A, as the 2026-07 cream/pine set did before it
#   (c) no backdrop-blur anywhere in the app (marketing under app/site excluded)
#   (d) the market-first inks (decision K, WP3.10): --ink-market, --ink-you,
#       --ink-rival and --ink-earlier are set in the light and the dark block,
#       each equal to its twin (the market the main ink --foreground, you the
#       gold --you, rivals the grey --comp, the earlier month the grey --cat),
#       mapped to a Tailwind colour, and listed in MASTER.md at the light value
#   (e) palette A is what the light block says: each of its jobs holds its value
#   (f) two brands until the marketing site is recoloured (Heinrich, 1 Oct):
#       the app's brand art (its favicons, home-screen icon, share card, yellow
#       mark and crowd art) is palette A, and the site's own (app/site's icon,
#       apple-icon and share card, its static marks) is the site's green; each
#       side's colours are on its own allow-list and no other
#   (g) the shadows are back (colour pass, 1 Oct): --shadow-card and
#       --shadow-sidebar are set in the light and the dark block and mapped to
#       their utilities, and no client page writes a card shadow by hand
#   (h) the colour roles' one hard rule: the orange (#F2651D, `--orange`) is a
#       fill and never a text colour anywhere in the app
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import re, sys, colorsys
css = open('app/globals.css').read()
# only the app token blocks — marketing's .site-theme keeps its own palette until Heinrich decides
app_css = css.split('/* ── Marketing theme')[0]
hexes = re.findall(r'#([0-9A-Fa-f]{6})\b', app_css)
# palette A's warm neutrals: the ground, the hairline, the track (2026-10-01)
allowed_warm = {'F7F6F2', 'E4E2DC', 'ECEAE4'}
retired = {'F6F1E7','FDFAF3','F7F3EA','ECE7DA','E4DCCC','DED6C4','FCF9F1','E7DFD0','14503A','14291F','E1E8DA','E7ECE1',  # the 2026-07 cream/pine set
           '0E8A5F','DDF3E9','0B6E4C','2FBF85','173B2D','7EDDB4','0B1F16'}  # the 2026-08-28 green set
bad = []
for h in set(x.upper() for x in hexes):
    r,g,b = int(h[0:2],16), int(h[2:4],16), int(h[4:6],16)
    hue,l,s = colorsys.rgb_to_hls(r/255,g/255,b/255)
    hue *= 360
    if h in retired: bad.append(f'retired token #{h} is back'); continue
    # a neutral: low chroma, OR a very light surface with modest saturation (cream lives here)
    if max(r,g,b)-min(r,g,b) <= 28 or (l > 0.85 and s < 0.5):
        if b < r and h not in allowed_warm: bad.append(f"warm neutral #{h} (blue {b} < red {r}) is not one of palette A's three")
    elif 100 <= hue <= 175 and s > 0.25:      # a saturated green
        bad.append(f'green #{h} (hue {hue:.0f}): the app carries no green')
if bad:
    print('design drift:'); [print('  -', x) for x in bad]; sys.exit(1)
print('drift guard (a)(b): ok')
PY

python3 - <<'PY'
import re, sys
css = open('app/globals.css').read()
app_css = css.split('/* ── Marketing theme')[0]
master = open('design-system/verbatim/MASTER.md').read()
TWINS = {'ink-market': 'foreground', 'ink-you': 'you', 'ink-rival': 'comp', 'ink-earlier': 'cat'}

def block(selector):
    m = re.search(re.escape(selector) + r'\s*\{([^}]*)\}', app_css)
    if not m: return None
    return dict((k, v.strip().upper()) for k, v in re.findall(r'--([a-z0-9-]+):\s*([^;]+);', m.group(1)))

bad = []
themes = {':root': block(':root'), '.dark': block('.dark')}
for name, vars_ in themes.items():
    if vars_ is None: bad.append(f'no {name} block in app/globals.css'); continue
    for ink, twin in TWINS.items():
        if ink not in vars_: bad.append(f'--{ink} is not set in {name}'); continue
        if vars_.get(twin) != vars_[ink]: bad.append(f'--{ink} {vars_[ink]} is not --{twin} {vars_.get(twin)} in {name}')
for ink in TWINS:
    if f'--color-{ink}: var(--{ink});' not in app_css: bad.append(f'--{ink} has no --color-{ink} mapping')
    light = (themes[':root'] or {}).get(ink)
    if light and not re.search(r'`--' + ink + r'`\s*`' + re.escape(light) + r'`', master, re.I) and not re.search(r'`' + re.escape(light) + r'`[^\n]*`--' + ink + r'`', master, re.I):
        bad.append(f'MASTER.md does not list --{ink} at {light}')
if bad:
    print('design drift:'); [print('  -', x) for x in bad]; sys.exit(1)
print('drift guard (d): ok')
PY

python3 - <<'PY'
import re, sys
css = open('app/globals.css').read()
m = re.search(r':root\s*\{([^}]*)\}', css.split('/* ── Marketing theme')[0])
vars_ = dict((k, re.sub(r'\s+', '', v).upper()) for k, v in re.findall(r'--([a-z0-9-]+):\s*([^;]+);', m.group(1))) if m else {}
# palette A (Heinrich, 2026-10-01; the approved page designs)
PALETTE_A = {
    'background': '#F7F6F2', 'tile': '#FFFFFF', 'card': '#FFFFFF', 'inner': '#F7F6F2',
    'foreground': '#26292C', 'muted-foreground': '#5F656B', 'border': '#E4E2DC',
    'primary': '#26292C', 'primary-foreground': '#FFFFFF', 'accent': '#FFF4C7',
    'brand': '#FFD43B', 'brand-foreground': '#26292C', 'orange-text': '#C2410C', 'orange': '#F2651D',
    'track': '#ECEAE4', 'you': '#9A6B00', 'you-foreground': '#FFFFFF', 'comp': '#8A9097', 'ink-market': '#26292C',
    'sidebar': '#FFFFFF', 'sidebar-primary': '#FFD43B', 'sidebar-accent': 'RGBA(38,41,44,0.07)',
}
bad = [f'--{k} is {vars_.get(k)}; palette A says {v}' for k, v in PALETTE_A.items() if vars_.get(k) != v]
if bad:
    print('design drift:'); [print('  -', x) for x in bad]; sys.exit(1)
print('drift guard (e): ok')
PY

python3 - <<'PY'
import re, sys
# (f) Each side's brand art on its own allow-list. Anything else is the other
# brand leaking across (a green favicon in the app, a yellow mark on the site)
# or a colour nobody chose.
SIDES = {
    'app (palette A)': (
        ['app/icon.svg', 'app/icon.tsx', 'app/apple-icon.tsx', 'app/opengraph-image.tsx',
         'public/brand/verbatim-mark-yellow.svg', 'public/crowd.svg', 'public/crowd-live.svg'],
        {'26292C', 'FFD43B', 'FFFFFF',  # ink, the brand yellow, the wordmark on the card
         '1F2124'},                     # the card's Room: a neutral ink band
    ),
    'site (green, until it is recoloured)': (
        ['app/site/icon.svg', 'app/site/icon.tsx', 'app/site/apple-icon.tsx', 'app/site/opengraph-image.tsx',
         'public/brand/verbatim-mark.svg', 'public/brand/verbatim-mark-mint.svg', 'public/brand/verbatim-mark-white.svg'],
        {'0E8A5F', '3DBF8C', 'FFFFFF',  # the green, the mint on the Room, white on a green tile
         '0F1F19'},                     # the site's Room
    ),
}
def norm(h):
    h = h.upper()
    return ''.join(c * 2 for c in h) if len(h) == 3 else h
bad = []
for side, (files, allowed) in SIDES.items():
    for f in files:
        try: text = open(f).read()
        except FileNotFoundError: bad.append(f'{f}: missing ({side} brand art)'); continue
        for h in re.findall(r'#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b', text):
            if norm(h) not in allowed: bad.append(f'{f}: #{norm(h)} is not on the {side} list')
        for r, g, b in re.findall(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)', text):
            h = '%02X%02X%02X' % (int(r), int(g), int(b))
            if h not in allowed: bad.append(f'{f}: rgb({r},{g},{b}) is not on the {side} list')
if bad:
    print('design drift:'); [print('  -', x) for x in sorted(set(bad))]; sys.exit(1)
print('drift guard (f): ok (app brand art yellow, site brand art green)')
PY

python3 - <<'PY'
import re, sys, os
css = open('app/globals.css').read().split('/* ── Marketing theme')[0]
bad = []
def block(selector):
    m = re.search(re.escape(selector) + r'\s*\{([^}]*)\}', css)
    return dict(re.findall(r'--([a-z0-9-]+):\s*([^;]+);', m.group(1))) if m else {}
# (g) the two shadow tokens, in both themes, mapped to utilities
for name in (':root', '.dark'):
    vars_ = block(name)
    for t in ('shadow-card', 'shadow-sidebar'):
        if t not in vars_: bad.append(f'--{t} is not set in {name}')
for t in ('shadow-card', 'shadow-sidebar'):
    if f'--{t}: var(--{t});' not in css: bad.append(f'--{t} has no utility mapping')
# (g) no card shadow written by hand on a client page (the Agent's body is its own branch's)
for root, _, files in os.walk('components/pages'):
    if root.startswith('components/pages/agent'): continue
    for f in files:
        if not f.endswith('.tsx') or f.endswith('.test.tsx'): continue
        p = os.path.join(root, f)
        for i, line in enumerate(open(p), 1):
            if re.search(r'shadow-\[0_1px_2px_rgba\(0,0,0,0\.05\),0_4px_14px', line):
                bad.append(f'{p}:{i}: a card shadow written by hand; use shadow-card')
# (h) the orange is never a text colour
ORANGE_TEXT = re.compile(r"\btext-orange(?!-text)\b|\btext-\[#F2651D\]|\bcolor:\s*['\"`]#F2651D", re.I)
for top in ('app', 'components', 'lib'):
    for root, _, files in os.walk(top):
        if root.startswith('app/site'): continue
        for f in files:
            if not re.search(r'\.(tsx?|css)$', f) or re.search(r'\.test\.tsx?$', f): continue
            p = os.path.join(root, f)
            for i, line in enumerate(open(p, errors='ignore'), 1):
                if ORANGE_TEXT.search(line): bad.append(f'{p}:{i}: the orange as text; use text-orange-text (#C2410C)')
if bad:
    print('design drift:'); [print('  -', x) for x in bad]; sys.exit(1)
print('drift guard (g)(h): ok (one card shadow, one sidebar shadow; the orange never text)')
PY

if grep -rn "backdrop-blur" app components --include='*.tsx' --include='*.ts' --include='*.css' 2>/dev/null | grep -v '^app/site' ; then
  echo "design drift: backdrop-blur found in the app (rule 3: depth by elevation, no glass)"; exit 1
fi
echo "drift guard (c): ok"
