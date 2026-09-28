# CenterPro visual identity

The mandatory source is **CenterPro_Visual_Identity (1).pdf**, 2026 / V1.0 (13 pages).

- Primary: `#A51C30`; white: `#FFFFFF`; ink: `#111318`.
- Product typography: Noto Sans Arabic for Arabic; Inter for Latin.
- Horizontal lockup is preferred wherever space permits. Symbol-only is for compact digital applications.
- Preserve the supplied logo geometry, original stroke weights, square terminals and colors.
- The primary symbol is a crimson C with an ink P. The reversed symbol and lockup are white.
- Use 60-70% white, 20-30% crimson, and up to 10% neutral support as the recommended balance.
- Keep color flat: the identity explicitly prohibits gradients, random blobs, crowded decoration, and generic tech effects.
- Minimum digital symbol size: 20 px. Keep clear space at least equal to the mark's inner stroke width, and never stretch or alter lockup spacing.

## Exact vector extraction

All symbols and wordmarks in `public/brand` were extracted directly from page 4, “Primary & secondary lockups”, using PyMuPDF SVG export with text converted to paths. The three original symbol paths, stroke widths, line caps and joins are retained. The horizontal wordmark uses the original embedded Inter Display Bold glyph outlines, positions and kerning. No logo was traced, generated or approximated.

`symbol-crimson.svg` is a monochrome recoloring of those exact source paths. `app-icon.svg` and the PNG/ICO sizes in `public/icons` use the extracted white symbol over brand crimson; the symbol fits inside the maskable central safe circle. PNGs are rasterized from the vector master.

Source SHA-256: `ce5bea70dd80f43902bd34924f34ca264b332b4a36fedaa92914f4f07a8de8ff`.

## Assets

- `/brand/logo.svg`: original primary horizontal lockup on transparent background.
- `/brand/logo-white.svg`: white reversed horizontal lockup.
- `/brand/symbol.svg`: original crimson/ink monogram.
- `/brand/symbol-white.svg`: white reversed monogram.
- `/brand/symbol-crimson.svg`: crimson monochrome monogram.
- `/brand/app-icon.svg`: app icon vector master.
- `/icons/icon-192.png`, `/icons/icon-512.png`: application icons.
- `/icons/maskable-192.png`, `/icons/maskable-512.png`: maskable application icons.
- `/icons/apple-touch-icon.png`: 180 px Apple icon.
- `/icons/favicon.ico`, `/icons/favicon-32.png`, `/icons/favicon-16.png`: browser icons.
