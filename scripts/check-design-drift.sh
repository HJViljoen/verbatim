#!/usr/bin/env bash
# Design drift guards (MASTER.md §Visual identity rule 9). Fails the build when
# the app slides back toward the cream/pine AI-default look.
#   (a) every neutral in app/globals.css must be cool: blue >= red (cream fails)
#   (b) the only saturated greens in app/globals.css are the Verbatim green set
#   (c) no backdrop-blur anywhere in the app (marketing under app/site excluded)
#   (d) the market-first inks (decision K, WP3.10): --ink-market, --ink-you,
#       --ink-rival and --ink-earlier are set in the light and the dark block,
#       each equal to its twin (the market the main ink --foreground, you the
#       green --you, rivals the orange --comp, the earlier month the grey --cat),
#       mapped to a Tailwind colour, and listed in MASTER.md at the light value
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import re, sys, colorsys
css = open('app/globals.css').read()
# only the app token blocks — marketing's .site-theme keeps its own palette until its rewrite
app_css = css.split('/* ── Marketing theme')[0]
hexes = re.findall(r'#([0-9A-Fa-f]{6})\b', app_css)
allowed_green = {'0E8A5F','DDF3E9','0B6E4C','2FBF85','173B2D','7EDDB4','0B1F16'}
retired = {'F6F1E7','FDFAF3','F7F3EA','ECE7DA','E4DCCC','DED6C4','FCF9F1','E7DFD0','14503A','14291F','E1E8DA','E7ECE1'}  # the 2026-07 cream/pine set
bad = []
for h in set(x.upper() for x in hexes):
    r,g,b = int(h[0:2],16), int(h[2:4],16), int(h[4:6],16)
    hue,l,s = colorsys.rgb_to_hls(r/255,g/255,b/255)
    hue *= 360
    if h in retired: bad.append(f'retired token #{h} is back'); continue
    # a neutral: low chroma, OR a very light surface with modest saturation (cream lives here)
    if max(r,g,b)-min(r,g,b) <= 28 or (l > 0.85 and s < 0.5):
        if b < r: bad.append(f'warm neutral #{h} (blue {b} < red {r})')
    elif 100 <= hue <= 175 and s > 0.25:      # a saturated green
        if h not in allowed_green: bad.append(f'unlisted green #{h} (hue {hue:.0f})')
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

if grep -rn "backdrop-blur" app components --include='*.tsx' --include='*.ts' --include='*.css' 2>/dev/null | grep -v '^app/site' ; then
  echo "design drift: backdrop-blur found in the app (rule 3: depth by elevation, no glass)"; exit 1
fi
echo "drift guard (c): ok"
