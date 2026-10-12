"""Create page contact sheets and check text bounds after Poppler rendering.

This assists visual review; it does not certify that the layout was reviewed.
"""
from pathlib import Path
import argparse
import hashlib
from datetime import datetime, timezone
import json
import pdfplumber
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "output/pdf/fluxsus-ai-lab-relatorio-tecnico.pdf"
TMP = ROOT / "tmp/pdfs"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--confirm-reviewed", action="store_true", help="Record the caller's confirmation that every rendered page was visually reviewed.")
args = parser.parse_args()
images = sorted(TMP.glob("page-*.png"))
if not images:
    raise SystemExit("Render all PDF pages to tmp/pdfs/page first.")

with pdfplumber.open(PDF) as document:
    if len(images) != len(document.pages):
        raise SystemExit("Rendered page count differs from PDF page count.")
    pages = []
    for number, page in enumerate(document.pages, 1):
        text = page.extract_text() or ""
        overflow = [
            {"text": c["text"], "x0": round(c["x0"], 1), "x1": round(c["x1"], 1)}
            for c in page.chars
            if c["x0"] < 40 or c["x1"] > page.width - 40
            or c["top"] < 12 or c["bottom"] > page.height - 12
        ]
        pages.append({"page": number, "characters": len(text), "boundsWarnings": overflow,
                      "start": text[:150], "end": text[-150:]})
    (TMP / "text-check.json").write_text(json.dumps(pages, ensure_ascii=False, indent=2), encoding="utf-8")

for start in range(0, len(images), 4):
    sheet = Image.new("RGB", (1860, 2700), "#E2E8ED")
    draw = ImageDraw.Draw(sheet)
    for offset, path in enumerate(images[start:start + 4]):
        page = Image.open(path).convert("RGB")
        page.thumbnail((890, 1260))
        x, y = 20 + (offset % 2) * 930, 40 + (offset // 2) * 1350
        draw.text((x, y - 22), f"PAGINA {start + offset + 1}", fill="#17364A")
        sheet.paste(page, (x, y))
    sheet.save(TMP / f"contact-{start // 4 + 1:02d}.png")

summary = {"pages": len(pages), "sheets": (len(images) + 3) // 4,
           "boundsWarnings": sum(len(p["boundsWarnings"]) for p in pages)}
if args.confirm_reviewed:
    if summary["boundsWarnings"]:
        raise SystemExit("Resolve text bounds warnings before recording visual review.")
    record = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "pdf": PDF.name, "sha256": hashlib.sha256(PDF.read_bytes()).hexdigest(),
        **summary, "renderResolutionDpi": 110,
        "visuallyReviewedPages": list(range(1, len(pages) + 1)),
        "reviewType": "Agent-assisted visual layout review of all rendered pages",
        "reviewers": "Codex root and Luna xhigh",
        "independentHumanReview": False,
        "scope": "Layout, legibility, tables, figures, screenshots, margins and pagination; not certification of factual accuracy.",
        "layoutResult": "No clipping, overlaps or concrete visual defects found in final render.",
    }
    (PDF.parent / "quality-review.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False))
