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
#   (f) the marketing site and the brand art are palette A too (the whole brand
#       moved to yellow, 2026-10-01): every colour in the .site-theme block,
#       under app/site, in the favicons, the share card, the mark and the crowd
#       art is on the site's allow-list (palette A, the Room and what sits on it)
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import re, sys, colorsys
css = open('app/globals.css').read()
# only the app token blocks; the marketing .site-theme has jobs the app does not (the Room), so (f) holds it
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
    'track': '#ECEAE4', 'you': '#9A6B00', 'comp': '#8A9097', 'ink-market': '#26292C',
    'sidebar': '#FFFFFF', 'sidebar-primary': '#FFD43B', 'sidebar-accent': 'RGBA(38,41,44,0.07)',
}
bad = [f'--{k} is {vars_.get(k)}; palette A says {v}' for k, v in PALETTE_A.items() if vars_.get(k) != v]
if bad:
    print('design drift:'); [print('  -', x) for x in bad]; sys.exit(1)
print('drift guard (e): ok')
PY

python3 - <<'PY'
import re, sys, glob
# (f) The site's allow-list: palette A as the app's :root holds it, then the
# site's own few. Anything else under app/site, in .site-theme or in the brand
# art is the old green (or a new colour nobody chose) coming in.
PALETTE_A = {'26292C', 'FFD43B', 'FFF4C7', 'C2410C', 'F2651D', '5F656B', 'E4E2DC', 'F7F6F2',
             'FFFFFF', '9A6B00', '8A9097', 'ECEAE4'}
SITE_OWN = {
    '1F2124',                                # the Room, a neutral ink band
    'ECEEF0', 'C9CCD0', '9AA0A6', 'BABEC2',  # on the Room: text, quieter, quietest, the voices
    '45494D',                                # the second ink
    'FEEEE5',                                # the orange's soft panel (a flagged chip)
    'DB3B2E',                                # the app's negative red, data only
    'C6CBD0',                                # the dot field's 18,436 grey marks
    'FFB4A8',                                # the lead form's error line on the Room
}
ALLOWED = PALETTE_A | SITE_OWN
css = open('app/globals.css').read()
m = re.search(r'\.site-theme\s*\{([^}]*)\}', css)
sources = {'app/globals.css (.site-theme)': m.group(1) if m else ''}
if not m: print('design drift: no .site-theme block in app/globals.css'); sys.exit(1)
files = sorted(set(glob.glob('app/site/**/*.css', recursive=True) + glob.glob('app/site/**/*.ts*', recursive=True)
                   + ['app/icon.svg', 'app/icon.tsx', 'app/apple-icon.tsx', 'app/opengraph-image.tsx',
                      'components/brand/mark.tsx', 'components/brand/og-mark.tsx', 'scripts/build-brand-assets.ts']
                   + glob.glob('public/brand/*.svg') + glob.glob('public/crowd*.svg')))
for f in files: sources[f] = open(f).read()
def norm(h):
    h = h.upper()
    return ''.join(c * 2 for c in h) if len(h) == 3 else h
bad = []
for name, text in sources.items():
    for h in re.findall(r'#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b', text):
        h = norm(h)
        if h in ('000000',): continue  # masks and the headline's text shadow
        if h not in ALLOWED: bad.append(f'{name}: #{h} is not on the site allow-list')
    for r, g, b in re.findall(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)', text):
        h = '%02X%02X%02X' % (int(r), int(g), int(b))
        if h != '000000' and h not in ALLOWED: bad.append(f'{name}: rgb({r},{g},{b}) is not on the site allow-list')
if bad:
    print('design drift:'); [print('  -', x) for x in sorted(set(bad))]; sys.exit(1)
print(f'drift guard (f): ok ({len(sources)} site and brand sources)')
PY

if grep -rn "backdrop-blur" app components --include='*.tsx' --include='*.ts' --include='*.css' 2>/dev/null | grep -v '^app/site' ; then
  echo "design drift: backdrop-blur found in the app (rule 3: depth by elevation, no glass)"; exit 1
fi
echo "drift guard (c): ok"
