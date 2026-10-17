# Self-hosted fonts

| Family | Files | Source | License |
|---|---|---|---|
| Google Sans Flex | `google-sans-flex/GoogleSansFlex-opsz-wght-ROND.woff2` | Same file Harvous ships (`harvous/public/fonts/google-sans-flex/`): the variable font with the `wght`, `ROND` and `opsz` axes | [SIL Open Font License 1.1](https://openfontlicense.org) |
| Google Sans Flex (OG images) | `og/GoogleSansFlex-{Title,Body}.ttf` | Static Latin instances cut by `scripts/build-og-fonts.py` for satori (OG image renderers), which can't read variable fonts or woff2 | SIL Open Font License 1.1 |

Self-hosted (not the Google Fonts CDN) so the font loads from our own origin with the page,
matching Harvous.

Usage, as in Harvous: titles use the rounded axis (`"ROND" 100`); body, labels, buttons and
inputs stay square (`"ROND" 0`). Because `font-variation-settings` overrides `font-weight`,
title rules repeat `wght` inside the variation settings. See `src/styles/theme.css`.
