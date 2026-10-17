#!/usr/bin/env python3
"""
Cut static Google Sans Flex TTFs for the OG image renderers (api/og-image.ts and
supabase/functions/make-server-283d8046/og-image.tsx). satori can't read variable fonts
or woff2, so we pin the axes and save plain TTFs, subset to Latin to keep them small.

  title: wght 600, ROND 100 (rounded, like titles in the app)
  body:  wght 400, ROND 0

Usage: python3 scripts/build-og-fonts.py [path/to/GoogleSansFlex-Variable.ttf]
Default source is Harvous's native copy of the variable font. Requires fonttools.
Google Sans Flex is licensed under the SIL Open Font License (see public/fonts/README.md).
"""
import sys
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else
           "/Users/heyderekj/harvous/native/Harvous/Resources/Fonts/GoogleSansFlex-Variable.ttf")
OUT = Path(__file__).resolve().parent.parent / "public" / "fonts" / "og"

INSTANCES = {
    "GoogleSansFlex-Title.ttf": {"wght": 600, "ROND": 100, "opsz": 32, "wdth": 100, "GRAD": 0, "slnt": 0},
    "GoogleSansFlex-Body.ttf": {"wght": 400, "ROND": 0, "opsz": 18, "wdth": 100, "GRAD": 0, "slnt": 0},
}

# Basic Latin + Latin-1 + Latin Extended-A + common punctuation (curly quotes, dashes, bullet, ellipsis).
UNICODES = list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + [
    0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2032, 0x2033,
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, axes in INSTANCES.items():
        font = instantiateVariableFont(TTFont(SRC), axes)
        opts = Options()
        opts.layout_features = ["kern", "liga", "calt"]
        opts.name_IDs = ["*"]
        sub = Subsetter(options=opts)
        sub.populate(unicodes=UNICODES)
        sub.subset(font)
        path = OUT / name
        font.save(path)
        print(f"wrote {path} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
