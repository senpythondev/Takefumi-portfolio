"""Subset OFL fonts to the characters the site uses and write WOFF2 (called by scripts/build-fonts.ts).

Input (stdin, JSON): [{"source", "output", "text", "rename": {"family", "style", "postscript"} | null}]
Output (stdout, JSON): [{"output", "bytes", "glyphs", "missing"}]

`rename` is required for fonts with a Reserved Font Name (IBM Plex: "Plex"). Under the SIL OFL 1.1 a
subset is a Modified Version, which may not carry the reserved name: the family, full, PostScript
and unique names are replaced; the copyright notice and the licence (name IDs 0, 13, 14) are kept,
and the licence text ships next to the fonts (src/fonts/LICENSES/).
"""
import json
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

KEEP_IDS = {0, 5, 13, 14}  # copyright, version, licence, licence URL


def rename(font: TTFont, family: str, style: str, postscript: str) -> None:
    table = font["name"]
    for rec in list(table.names):
        if rec.nameID not in KEEP_IDS:
            table.removeNames(nameID=rec.nameID)
    table.setName(family, 1, 3, 1, 0x409)
    table.setName(style, 2, 3, 1, 0x409)
    table.setName(f"{postscript};subset", 3, 3, 1, 0x409)
    table.setName(f"{family} {style}", 4, 3, 1, 0x409)
    table.setName(postscript, 6, 3, 1, 0x409)
    if "CFF " in font:  # PostScript outlines carry their own name
        font["CFF "].cff.fontNames = [postscript]
    leftovers = [r.toUnicode() for r in table.names if r.nameID not in KEEP_IDS and "Plex" in r.toUnicode()]
    if leftovers:
        raise SystemExit(f"reserved name still present: {leftovers}")


def main() -> None:
    jobs = json.load(sys.stdin)
    results = []
    for job in jobs:
        options = subset.Options()
        options.flavor = "woff2"
        options.hinting = False  # the browsers' rasterisers do not need TrueType hints; saves bytes
        options.desubroutinize = True
        options.layout_features = ["*"]  # keep kerning and alternates for the kept glyphs
        options.name_IDs = ["*"]
        options.name_languages = ["*"]
        options.notdef_outline = True
        font = subset.load_font(job["source"], options)
        cmap = font.getBestCmap()
        missing = sorted({c for c in job["text"] if ord(c) not in cmap and not c.isspace()})
        subsetter = subset.Subsetter(options)
        subsetter.populate(text=job["text"])
        subsetter.subset(font)
        if job.get("rename"):
            r = job["rename"]
            rename(font, r["family"], r["style"], r["postscript"])
        font.flavor = "woff2"
        font.save(job["output"])
        with open(job["output"], "rb") as f:
            size = len(f.read())
        results.append({"output": job["output"], "bytes": size, "glyphs": len(font.getGlyphOrder()), "missing": "".join(missing)})
    json.dump(results, sys.stdout)


main()
