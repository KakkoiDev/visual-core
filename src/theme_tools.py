"""Theme tools: render a theme's SVG marks to PNG icon sizes, and derive an OpenUI theme from a theme's tokens.

  visual.py icons SVG --out DIR [--sizes 16,32,180,192,512]
  visual.py theme-openui TOKENS.json --out FILE.json

Standard library only. The icon renderer accepts the plain SVG a theme ships (rect and path with fill, stroke,
stroke-width and caps); anything else, such as text or images, is refused with the element's name, so a mark is
outlined before export. Output is deterministic: the same SVG gives the same PNG bytes.
"""
import argparse
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

from vector import coverage, geometry, stroke_polygons
from visual_core import png

SVG = '{http://www.w3.org/2000/svg}'
DEFAULT_SIZES = (16, 32, 180, 192, 512)


def hex_rgb(value):
    value = value.strip().lower()
    if value in ('#fff', 'white'):
        value = '#ffffff'
    if value in ('#000', 'black'):
        value = '#000000'
    if re.fullmatch(r'#[0-9a-f]{3}', value):
        value = '#' + ''.join(c * 2 for c in value[1:])
    if not re.fullmatch(r'#[0-9a-f]{6}', value):
        raise ValueError(f'Colour must be a hex value, not {value!r}')
    return tuple(int(value[i:i + 2], 16) / 255 for i in (1, 3, 5))


def svg_shapes(text):
    """The shapes of a plain SVG, in paint order, and its viewBox (x, y, width, height)."""
    root = ET.fromstring(re.sub(r'<metadata\b.*?</metadata>', '', text, flags=re.S))
    box = [float(v) for v in re.split(r'[\s,]+', root.get('viewBox', '').strip()) if v]
    if len(box) != 4:
        box = [0, 0, float(root.get('width', 0)), float(root.get('height', 0))]
    shapes = []
    for element in root.iter():
        name = element.tag.replace(SVG, '')
        if name in ('svg', 'title', 'desc', 'metadata') or element.tag is ET.Comment:
            continue
        paint = {'fill': element.get('fill', '#000000'), 'stroke': element.get('stroke', 'none'),
                 'width': float(element.get('stroke-width', 1)), 'cap': element.get('stroke-linecap', 'butt')}
        if name == 'rect':
            shapes.append({'shape': 'rect', 'x': float(element.get('x', 0)), 'y': float(element.get('y', 0)),
                           'w': float(element.get('width')), 'h': float(element.get('height')), **paint})
        elif name == 'path':
            shapes.append({'shape': 'path', 'd': element.get('d'), **paint})
        else:
            raise ValueError(f'<{name}> is not supported in an icon: outline it as a path first')
    return shapes, box


def render_svg(text, size):
    """RGBA bytes of an SVG drawn into a size × size square (the viewBox is scaled to fit)."""
    shapes, (bx, by, bw, bh) = svg_shapes(text)
    scale = size / max(bw, bh)
    pixels = [[0.0, 0.0, 0.0, 0.0] for _ in range(size * size)]

    def blend(cov, rgb):
        for row, line in cov.items():
            for x, a in enumerate(line):
                if a <= 0:
                    continue
                a = min(1.0, a)
                p = pixels[row * size + x]
                inv = 1 - a
                p[0], p[1], p[2], p[3] = rgb[0] * a + p[0] * inv, rgb[1] * a + p[1] * inv, rgb[2] * a + p[2] * inv, a + p[3] * inv

    def place(point):
        return ((point[0] - bx) * scale, (point[1] - by) * scale)
    for shape in shapes:
        fills, lines = geometry(shape)
        if shape['fill'] != 'none' and fills:
            blend(coverage([[place(p) for p in poly] for poly in fills], size, size, 'nonzero'), hex_rgb(shape['fill']))
        if shape['stroke'] != 'none' and lines:
            # A square cap extends each segment by half the width, which also fills a right-angled corner.
            cap = 'square' if shape['cap'] in ('square', 'butt') else 'round'
            polys = stroke_polygons([([place(p) for p in points], closed) for points, closed in lines], shape['width'] * scale, cap)
            blend(coverage(polys, size, size), hex_rgb(shape['stroke']))
    out = bytearray(size * size * 4)
    for i, (r, g, b, a) in enumerate(pixels):
        if a > 0:
            out[i * 4:i * 4 + 4] = bytes((round(r / a * 255), round(g / a * 255), round(b / a * 255), round(a * 255)))
    return bytes(out)


def export_icons(svg_path, out, sizes=DEFAULT_SIZES):
    svg_path, out = Path(svg_path), Path(out)
    text = svg_path.read_text(encoding='utf-8')
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for size in sizes:
        target = out / f'{svg_path.stem}-{size}.png'
        target.write_bytes(png(size, size, render_svg(text, size)))
        written.append({'size': size, 'file': str(target)})
    return {'source': str(svg_path), 'icons': written}


def openui_theme(tokens):
    """OpenUI ThemeProvider overrides (lightTheme, darkTheme) from Basecoat-style theme tokens."""
    def mode(t):
        v = lambda name: t[name]
        theme = {
            # OpenUI's `foreground` is a surface (cards, the composer), not the text colour; text is textNeutralPrimary.
            'background': v('--background'), 'foreground': v('--card'), 'popoverBackground': v('--popover'),
            'sunkLight': v('--muted'), 'sunk': v('--muted'), 'sunkDeep': v('--secondary'),
            'elevatedLight': v('--card'), 'elevated': v('--card'), 'elevatedStrong': v('--card'), 'elevatedIntense': v('--card'),
            'overlay': v('--foreground') + '66',
            'highlightSubtle': v('--muted'), 'highlight': v('--muted'), 'highlightStrong': v('--border'), 'highlightIntense': v('--input'),
            'invertedBackground': v('--primary'),
            'infoBackground': v('--muted'), 'successBackground': v('--muted'), 'alertBackground': v('--muted'),
            'dangerBackground': v('--muted'), 'purpleBackground': v('--muted'), 'pinkBackground': v('--muted'),
            'textNeutralPrimary': v('--foreground'), 'textNeutralSecondary': v('--muted-foreground'),
            'textNeutralTertiary': v('--muted-foreground'), 'textNeutralLink': v('--foreground'), 'textBrand': v('--foreground'),
            'textWhite': '#ffffff', 'textBlack': '#000000',
            'textAccentPrimary': v('--foreground'), 'textAccentSecondary': v('--muted-foreground'), 'textAccentTertiary': v('--muted-foreground'),
            'textSuccessPrimary': v('--success'), 'textSuccessInverted': v('--background'),
            'textAlertPrimary': v('--warning'), 'textAlertInverted': v('--background'),
            'textDangerPrimary': v('--destructive'), 'textDangerSecondary': v('--destructive'), 'textDangerTertiary': v('--destructive'),
            'textDangerInvertedPrimary': v('--destructive-foreground'), 'textDangerInvertedSecondary': v('--destructive-foreground'),
            'textDangerInvertedTertiary': v('--destructive-foreground'),
            'textInfoPrimary': v('--info'), 'textInfoInverted': v('--background'),
            'textPinkPrimary': v('--foreground'), 'textPinkInverted': v('--background'),
            'textPurplePrimary': v('--foreground'), 'textPurpleInverted': v('--background'),
            'interactiveAccentDefault': v('--primary'), 'interactiveAccentHover': v('--muted-foreground'),
            'interactiveAccentPressed': v('--muted-foreground'), 'interactiveAccentDisabled': v('--muted'),
            'interactiveDestructiveDefault': v('--destructive'), 'interactiveDestructiveHover': v('--destructive'),
            'interactiveDestructivePressed': v('--destructive'), 'interactiveDestructiveDisabled': v('--muted'),
            'interactiveDestructiveAccentDefault': v('--destructive'), 'interactiveDestructiveAccentHover': v('--destructive'),
            'interactiveDestructiveAccentPressed': v('--destructive'), 'interactiveDestructiveAccentDisabled': v('--muted'),
            'borderDefault': v('--border'), 'borderInteractive': v('--input'), 'borderInteractiveEmphasis': v('--foreground'),
            'borderInteractiveSelected': v('--foreground'), 'borderAccent': v('--foreground'), 'borderAccentEmphasis': v('--foreground'),
            'borderAccentSelected': v('--foreground'), 'borderInfo': v('--border'), 'borderInfoEmphasis': v('--foreground'),
            'borderAlert': v('--warning'), 'borderAlertEmphasis': v('--warning'), 'borderSuccess': v('--success'),
            'borderSuccessEmphasis': v('--success'), 'borderDanger': v('--destructive'), 'borderDangerEmphasis': v('--destructive'),
            'chatUserResponseBg': v('--primary'), 'chatUserResponseText': v('--primary-foreground'),
        }
        palette = [t[f'--chart-{i}'] for i in range(1, 5) if f'--chart-{i}' in t]
        for key in ('defaultChartPalette', 'barChartPalette', 'lineChartPalette', 'areaChartPalette', 'pieChartPalette',
                    'radarChartPalette', 'radialChartPalette', 'horizontalBarChartPalette'):
            theme[key] = palette
        radius = t.get('--radius', '0px')
        for key in ('radiusNone', 'radius3xs', 'radius2xs', 'radiusXs', 'radiusS', 'radiusM', 'radiusL', 'radiusXl', 'radius2xl',
                    'radius3xl', 'radius4xl', 'radius5xl', 'radius6xl', 'radius7xl', 'radius8xl', 'radius9xl', 'radiusFull'):
            theme[key] = radius if radius == '0px' or key != 'radiusFull' else '9999px'
        return theme
    fonts = tokens.get('font', {})
    # Headings in replies are model output: the style keeps the display face for the wordmark and section titles.
    type_roles = {'fontBody': fonts.get('sans'), 'fontHeading': fonts.get('sans'), 'fontLabel': fonts.get('sans'),
                  'fontNumbers': fonts.get('sans'), 'fontCode': fonts.get('mono')}
    type_roles = {k: v for k, v in type_roles.items() if v}
    return {'name': tokens.get('name'), 'version': tokens.get('version'),
            'lightTheme': {**mode(tokens['light']), **type_roles}, 'darkTheme': {**mode(tokens['dark']), **type_roles}}


def main(argv):
    parser = argparse.ArgumentParser(prog='visual.py', description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    icons = commands.add_parser('icons')
    icons.add_argument('svg')
    icons.add_argument('--out', required=True)
    icons.add_argument('--sizes', default=','.join(map(str, DEFAULT_SIZES)))
    theme = commands.add_parser('theme-openui')
    theme.add_argument('tokens')
    theme.add_argument('--out', required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == 'icons':
            sizes = [int(s) for s in args.sizes.split(',') if s.strip()]
            if not sizes or any(s < 8 or s > 2048 for s in sizes):
                raise ValueError('Sizes must be between 8 and 2048 pixels')
            result = export_icons(args.svg, args.out, sizes)
        else:
            out = Path(args.out)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(openui_theme(json.loads(Path(args.tokens).read_text())), indent=2) + '\n')
            result = {'theme': str(out)}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, OSError, ET.ParseError, KeyError) as error:
        print(json.dumps({'error': str(error), 'published': False}))
        return 1
