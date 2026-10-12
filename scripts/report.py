"""Build the Fluxsus AI Lab report from project documentation and run evidence.

Case definitions in evaluation/*.json are never treated as observed outputs.
Historical *-initial.json runs are excluded from final aggregates.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import sys
import textwrap
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
CASE_FILE = ROOT / "evaluation" / "cases.json"
CALIBRATION_FILE = ROOT / "evaluation" / "calibration.json"
OUTPUT_DIR = ROOT / "output"
SCREENSHOT_DIR = OUTPUT_DIR / "screenshots"
DEFAULT_OUTPUT = OUTPUT_DIR / "pdf" / "fluxsus-ai-lab-relatorio-tecnico.pdf"

INK = colors.HexColor("#20313B")
MUTED = colors.HexColor("#61717B")
TEAL = colors.HexColor("#12566A")
DEEP_BLUE = colors.HexColor("#17364A")
PALE = colors.HexColor("#F0F6F8")
RULE = colors.HexColor("#C9D8DD")
GREEN = colors.HexColor("#28794F")
AMBER = colors.HexColor("#8A5A00")
RED = colors.HexColor("#A64730")


def pdf_text(value: Any) -> str:
    """Normalize presentation punctuation while preserving Portuguese accents."""
    value = unicodedata.normalize("NFC", str(value))
    replacements = {
        "\u00a0": " ",
        "\u2009": " ",
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2212": "-",
        "\u2192": "->",
        "\u2194": "<->",
        "\u00d7": "x",
        "\u2265": ">=",
        "\u2264": "<=",
        "\u2026": "...",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2022": "*",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


def inline_markup(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", pdf_text(text), flags=re.I)
    escaped = html.escape(text, quote=False)
    escaped = re.sub(
        r"\[([^\]]+)\]\(([^\s)]+)\)",
        lambda m: f'<link href="{html.escape(m.group(2), quote=True)}" color="#12566A">{m.group(1)}</link>' if m.group(2).startswith(("https://", "http://")) else m.group(1),
        escaped,
    )
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", escaped)
    code_font = "FluxCode" if "FluxCode" in pdfmetrics.getRegisteredFontNames() else "Courier"
    escaped = re.sub(
        r"`+([^`]+)`+",
        lambda m: f'<font name="{code_font}" color="#12566A">{m.group(1)}</font>',
        escaped,
    )
    return escaped.replace("\n", "<br/>")


def register_fonts() -> None:
    try:
        import reportlab

        font_dir = Path(reportlab.__file__).resolve().parent / "fonts"
        pdfmetrics.registerFont(TTFont("FluxSans", str(font_dir / "Vera.ttf")))
        pdfmetrics.registerFont(TTFont("FluxSans-Bold", str(font_dir / "VeraBd.ttf")))
        pdfmetrics.registerFont(TTFont("FluxSans-Italic", str(font_dir / "VeraIt.ttf")))
        pdfmetrics.registerFont(TTFont("FluxCode", str(font_dir / "Vera.ttf")))
        pdfmetrics.registerFontFamily(
            "FluxSans", normal="FluxSans", bold="FluxSans-Bold", italic="FluxSans-Italic", boldItalic="FluxSans-Bold"
        )
        pdfmetrics.registerFontFamily(
            "FluxCode", normal="FluxCode", bold="FluxCode", italic="FluxCode", boldItalic="FluxCode"
        )
    except Exception as exc:  # pragma: no cover - platform fallback
        print(f"Aviso: usando fontes padrão do ReportLab ({exc})", file=sys.stderr)
        pdfmetrics.registerFontFamily(
            "Courier", normal="Courier", bold="Courier-Bold", italic="Courier-Oblique", boldItalic="Courier-BoldOblique"
        )


def make_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    body_font = "FluxSans" if "FluxSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
    bold_font = "FluxSans-Bold" if "FluxSans-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
    code_font = "FluxCode" if "FluxCode" in pdfmetrics.getRegisteredFontNames() else "Courier"
    return {
        "body": ParagraphStyle(
            "BodyFlux", parent=base["BodyText"], fontName=body_font, fontSize=8.5, leading=12.1,
            textColor=INK, spaceAfter=5.4, splitLongWords=1,
        ),
        "small": ParagraphStyle(
            "SmallFlux", parent=base["BodyText"], fontName=body_font, fontSize=7.1, leading=9.2,
            textColor=INK, spaceAfter=1.6, splitLongWords=1,
        ),
        "caption": ParagraphStyle(
            "CaptionFlux", parent=base["BodyText"], fontName=body_font, fontSize=7.3, leading=9.2,
            textColor=MUTED, spaceBefore=2, spaceAfter=7,
        ),
        "h1": ParagraphStyle(
            "FluxH1", parent=base["Heading1"], fontName=bold_font, fontSize=17, leading=21,
            textColor=DEEP_BLUE, spaceBefore=10, spaceAfter=9, keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "FluxH2", parent=base["Heading2"], fontName=bold_font, fontSize=12.1, leading=15,
            textColor=TEAL, spaceBefore=9, spaceAfter=5, keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "FluxH3", parent=base["Heading3"], fontName=bold_font, fontSize=9.6, leading=12,
            textColor=DEEP_BLUE, spaceBefore=6, spaceAfter=3, keepWithNext=True,
        ),
        "quote": ParagraphStyle(
            "QuoteFlux", parent=base["BodyText"], fontName=body_font, fontSize=8.2, leading=11.5,
            leftIndent=10, rightIndent=8, textColor=TEAL, borderColor=TEAL, borderWidth=0.6,
            borderPadding=6, spaceBefore=3, spaceAfter=7, backColor=PALE,
        ),
        "bullet": ParagraphStyle(
            "BulletFlux", parent=base["BodyText"], fontName=body_font, fontSize=8.2, leading=11.5,
            leftIndent=13, firstLineIndent=-8, textColor=INK, spaceAfter=2.4,
        ),
        "code": ParagraphStyle(
            "CodeFlux", parent=base["Code"], fontName=code_font, fontSize=6.8, leading=8.7,
            leftIndent=5, rightIndent=5, borderColor=RULE, borderWidth=0.4, borderPadding=5,
            backColor=PALE, textColor=DEEP_BLUE, spaceBefore=3, spaceAfter=7,
        ),
        "toc1": ParagraphStyle(
            "TOCFlux1", fontName=bold_font, fontSize=9.1, leading=12.5, leftIndent=0,
            firstLineIndent=0, textColor=DEEP_BLUE, spaceBefore=2.2,
        ),
        "toc2": ParagraphStyle(
            "TOCFlux2", fontName=body_font, fontSize=8.0, leading=10.5, leftIndent=13,
            firstLineIndent=0, textColor=INK,
        ),
    }


class FluxDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str, **kwargs: Any):
        super().__init__(filename, **kwargs)
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="body", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates(PageTemplate(id="main", frames=[frame], onPage=self.draw_page))

    def draw_page(self, canvas: Any, doc: BaseDocTemplate) -> None:
        if doc.page == 1:
            return
        canvas.saveState()
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.45)
        canvas.line(doc.leftMargin, A4[1] - 15 * mm, A4[0] - doc.rightMargin, A4[1] - 15 * mm)
        canvas.setFont("FluxSans" if "FluxSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(doc.leftMargin, A4[1] - 11.7 * mm, "FLUXSUS AI LAB  |  RELATÓRIO TÉCNICO")
        canvas.line(doc.leftMargin, 13 * mm, A4[0] - doc.rightMargin, 13 * mm)
        canvas.drawString(doc.leftMargin, 8.5 * mm, "Dados sintéticos. Não usar para atendimento clínico ou operação empresarial.")
        canvas.drawRightString(A4[0] - doc.rightMargin, 8.5 * mm, f"{doc.page}")
        canvas.restoreState()

    def afterFlowable(self, flowable: Flowable) -> None:
        if not isinstance(flowable, Paragraph):
            return
        style_name = flowable.style.name
        if style_name not in {"FluxH1", "FluxH2"}:
            return
        level = 0 if style_name == "FluxH1" else 1
        title = flowable.getPlainText()
        key = f"toc-{level}-{self.page}-{len(title)}-{hash(title) & 0xFFFF}"
        self.canv.bookmarkPage(key)
        self.notify("TOCEntry", (level, title, self.page, key))


class Cover(Flowable):
    def __init__(self, height: float):
        super().__init__()
        self.height = height

    def wrap(self, avail_width: float, avail_height: float) -> tuple[float, float]:
        self.width = avail_width
        return avail_width, self.height

    def draw(self) -> None:
        c = self.canv
        w, h = self.width, self.height
        c.saveState()
        c.setFillColor(DEEP_BLUE)
        c.rect(0, 0, w, h, stroke=0, fill=1)
        c.setFillColor(TEAL)
        c.rect(0, h * 0.47, w, h * 0.53, stroke=0, fill=1)
        c.setFillColor(colors.HexColor("#6ABF8A"))
        c.roundRect(0, h * 0.44, 34 * mm, 3 * mm, 1.5 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("FluxSans-Bold" if "FluxSans-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold", 28)
        c.drawString(14 * mm, h * 0.77, "Fluxsus AI Lab")
        c.setFont("FluxSans" if "FluxSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica", 16)
        c.drawString(14 * mm, h * 0.68, "Relatório técnico e de avaliação")
        c.setFont("FluxSans" if "FluxSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica", 10)
        c.drawString(14 * mm, h * 0.57, "Contexto estruturado, memória, RAG e autorização")
        c.setFillColor(colors.HexColor("#EAF2F4"))
        c.setFont("FluxSans-Bold" if "FluxSans-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold", 10)
        c.drawString(14 * mm, h * 0.29, "Capstone - Módulo 3")
        c.setFont("FluxSans" if "FluxSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica", 9)
        c.drawString(14 * mm, h * 0.24, "Protótipo local com usuários, tickets e manuais fictícios")
        c.drawString(14 * mm, h * 0.20, "Sem integração empresarial, dados reais ou conteúdo clínico")
        c.restoreState()


class ArchitectureDiagram(Flowable):
    """A compact vector diagram that remains legible in print."""
    def wrap(self, avail_width: float, avail_height: float) -> tuple[float, float]:
        self.width = avail_width
        self.height = 140 * mm
        return self.width, self.height

    def draw(self) -> None:
        c = self.canv
        w = self.width
        nodes = [
            ("Usuário", "sessão autenticada"),
            ("React / Vite", "entrada, chat e painel"),
            ("Fastify", "API + validação"),
            ("Autorização", "role + participação / grant"),
            ("Contexto + retriever", "regras, memória e evidências atuais"),
        ]
        left = 8 * mm
        box_w = w - 16 * mm
        box_h = 13 * mm
        gap = 5 * mm
        top = self.height - 5 * mm
        for i, (title, detail) in enumerate(nodes):
            y = top - (i + 1) * box_h - i * gap
            fill = TEAL if i == 0 else DEEP_BLUE if i == 2 else PALE
            c.setFillColor(fill)
            c.setStrokeColor(TEAL)
            c.roundRect(left, y, box_w, box_h, 3 * mm, stroke=1, fill=1)
            fg = colors.white if i in (0, 2) else INK
            c.setFillColor(fg)
            c.setFont("FluxSans-Bold" if "FluxSans-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold", 8.5)
            c.drawString(left + 5 * mm, y + 8 * mm, pdf_text(title))
            c.setFont("FluxSans" if "FluxSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica", 7.2)
            c.drawRightString(left + box_w - 5 * mm, y + 8 * mm, pdf_text(detail))
            if i < len(nodes) - 1:
                c.setStrokeColor(MUTED)
                x = left + box_w / 2
                c.line(x, y, x, y - gap + 1 * mm)
                c.line(x - 1.5 * mm, y - gap + 2.5 * mm, x, y - gap + 1 * mm)
                c.line(x + 1.5 * mm, y - gap + 2.5 * mm, x, y - gap + 1 * mm)
        db_w = box_w * 0.53
        gen_w = box_w * 0.43
        y = 21 * mm
        for x, bw, title, detail, fill in [
            (left, db_w, "PostgreSQL + pgvector", "RLS, tickets, fontes, vetores, memória", PALE),
            (left + db_w + 4 * mm, gen_w, "DeepSeek Flash", "se a consulta exigir geração", colors.HexColor("#E7F3EA")),
        ]:
            c.setFillColor(fill)
            c.setStrokeColor(TEAL)
            c.roundRect(x, y, bw, 16 * mm, 3 * mm, stroke=1, fill=1)
            c.setFillColor(INK)
            c.setFont("FluxSans-Bold" if "FluxSans-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold", 7.5)
            c.drawString(x + 4 * mm, y + 10 * mm, pdf_text(title))
            c.setFont("FluxSans" if "FluxSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica", 6.5)
            c.drawString(x + 4 * mm, y + 5.5 * mm, pdf_text(detail))
        c.setStrokeColor(MUTED)
        context_bottom = top - len(nodes) * box_h - (len(nodes) - 1) * gap
        for x in (left + db_w / 2, left + db_w + 4 * mm + gen_w / 2):
            c.line(x, context_bottom, x, y + 16 * mm)
        c.setFillColor(DEEP_BLUE)
        c.roundRect(left, 2 * mm, box_w, 12 * mm, 3 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("FluxSans-Bold", 8.5)
        c.drawString(left + 5 * mm, 9 * mm, "Validação e saída")
        c.setFont("FluxSans", 7.2)
        c.drawRightString(left + box_w - 5 * mm, 9 * mm, "JSON, citações, estado e acesso revalidados")
        c.line(left + box_w * .77, y, left + box_w * .77, 14 * mm)


def load_json(path: Path) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def normalize_case_id(value: Any) -> str:
    return str(value or "").strip().lower()


def iter_dicts(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for nested in value.values():
            yield from iter_dicts(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from iter_dicts(nested)


OBSERVED_KEYS = {
    "actualResult", "result", "answer", "actualAnswer", "response", "responseText",
    "sources", "sourceIds", "actualSourceIds", "retrievedSourceIds", "metrics", "scores",
    "retrieved", "similarities", "latencyMs", "durationMs", "actual", "observed", "error", "statusCode",
}


def looks_observed(item: dict[str, Any]) -> bool:
    if not any(key in item for key in OBSERVED_KEYS):
        return False
    expected_only = {"expectedResult", "expectedSourceIds", "expectedTerms"}
    return not (expected_only.issubset(item.keys()) and not (set(item) & (OBSERVED_KEYS - {"result"})))


def observation_index() -> tuple[dict[str, list[dict[str, Any]]], list[Path]]:
    case_ids = {f"eval-{i:02d}" for i in range(1, 31)} | {f"cal-{i:02d}" for i in range(1, 11)}
    found: dict[str, list[dict[str, Any]]] = defaultdict(list)
    evidence_files: list[Path] = []
    if not OUTPUT_DIR.exists():
        return found, evidence_files
    for path in OUTPUT_DIR.rglob("*.json"):
        if path.is_relative_to(OUTPUT_DIR / "pdf"):
            continue
        # Initial runs are retained in docs/13 as experiment history, never
        # blended into the final holdout or calibration statistics.
        if path.name.lower().endswith("-initial.json"):
            continue
        data = load_json(path)
        if data is None:
            continue
        discovered = False
        for item in iter_dicts(data):
            case_id = normalize_case_id(item.get("id") or item.get("caseId") or item.get("case_id"))
            if case_id in case_ids and looks_observed(item):
                copy = dict(item)
                copy["_artifact"] = path.relative_to(ROOT).as_posix()
                found[case_id].append(copy)
                discovered = True
        if discovered or any(k in path.name.lower() for k in ("test", "eval", "calibr", "result", "run")):
            evidence_files.append(path)
    return found, sorted(set(evidence_files))


def append_executive_evaluation_summary(
    story: list[Flowable], styles: dict[str, ParagraphStyle], observations: dict[str, list[dict[str, Any]]],
    cases: list[dict[str, Any]], page_width: float,
) -> None:
    """Put a compact, evidence-backed run summary near the beginning of the report."""
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for case in cases:
        case_id = normalize_case_id(case.get("id"))
        for item in observations.get(case_id, []):
            grouped[mode_variant(item)].append(item)

    story.append(Paragraph("Resumo das execuções observadas", styles["h2"]))
    if not grouped:
        story.append(Paragraph(
            "Ainda não há respostas observadas nos artefatos finais de output/. O conteúdo abaixo define o sistema e os casos; não representa uma avaliação executada.",
            styles["quote"],
        ))
        return

    total_rows = sum(len(items) for items in grouped.values())
    calls = sum(provider_call_status(item) == "sim" for items in grouped.values() for item in items)
    paid_calls = sum(int(item.get("paidCalls") or 0) for items in grouped.values() for item in items)
    story.append(Paragraph(
        f"Foram localizados {total_rows} resultados finais em {len(grouped)} combinação(ões) de modo e variante; "
        f"{calls} linhas confirmam resposta da DeepSeek e essas observações registram {paid_calls} chamadas pagas; follow-ups podem exigir uma chamada por turno. "
        "A coluna de concordância compara somente o rótulo actualResult ao rótulo esperado; não mede correção factual. "
        "As médias automáticas são heurísticas. A revisão qualitativa é assistida por agente, sem avaliador humano independente, e aparece separada das notas automáticas.",
        styles["small"],
    ))

    def mean(items: list[dict[str, Any]], aliases: tuple[str, ...]) -> str:
        values = [value for item in items if (value := numeric_metric(item, aliases)) is not None]
        return f"{sum(values) / len(values):.2f} (n={len(values)})" if values else "N/A"

    rows: list[list[Paragraph]] = [[Paragraph(label, styles["small"]) for label in (
        "Modo", "Variante", "Linhas", "DeepSeek / pagas", "Rótulo igual", "Recuperação heurística", "Fidelidade heurística", "Coerência heurística"
    )]]
    for (mode, variant), items in sorted(grouped.items()):
        compared = [item for item in items if isinstance(item.get("resultMatches"), bool)]
        matches = sum(item["resultMatches"] is True for item in compared)
        cells = [
            mode, variant, str(len(items)),
            f"{sum(provider_call_status(item) == 'sim' for item in items)} / {sum(int(item.get('paidCalls') or 0) for item in items)}",
            f"{matches}/{len(compared)}" if compared else "N/A",
            mean(items, ("retrieval", "relevance", "retrievalRelevance")),
            mean(items, ("fidelity", "faithfulness")),
            mean(items, ("coherence", "coerencia")),
        ]
        rows.append([Paragraph(inline_markup(value), styles["small"]) for value in cells])
    widths = [15 * mm, 19 * mm, 14 * mm, 22 * mm, 19 * mm, 29 * mm, 29 * mm, 29 * mm]
    if sum(widths) > page_width:
        scale = page_width / sum(widths)
        widths = [width * scale for width in widths]
    story.append(style_table(Table(rows, colWidths=widths, repeatRows=1, splitByRow=1), True, 5.8))


def source_ids(item: dict[str, Any]) -> list[str]:
    raw = item.get("actualSourceIds") or item.get("retrievedSourceIds") or item.get("sourceIds") or item.get("sources") or item.get("retrieved") or []
    if isinstance(raw, dict):
        raw = raw.get("ids") or raw.get("sources") or []
    result: list[str] = []
    if isinstance(raw, list):
        for value in raw:
            if isinstance(value, dict):
                value = value.get("id") or value.get("sourceId") or value.get("source_id")
            if value:
                result.append(str(value))
    elif raw:
        result.append(str(raw))
    return result


def actual_result(item: dict[str, Any]) -> str:
    value = item.get("actualResult") or item.get("result") or item.get("status")
    if isinstance(value, dict):
        value = value.get("result") or value.get("status") or value.get("label")
    if value in (None, ""):
        nested = item.get("actual") or item.get("observed")
        if isinstance(nested, dict):
            return actual_result(nested)
    return str(value or "observado")


def actual_answer(item: dict[str, Any]) -> str:
    value = item.get("answer") or item.get("actualAnswer") or item.get("responseText") or item.get("response")
    if not value:
        nested = item.get("actual") or item.get("observed")
        if isinstance(nested, dict):
            return actual_answer(nested)
    return str(value or "")


def score_value(item: dict[str, Any], names: tuple[str, ...]) -> str:
    for source in (item, item.get("scores"), item.get("metrics"), item.get("rubric")):
        if isinstance(source, dict):
            for name in names:
                if source.get(name) is not None:
                    value = source[name]
                    if isinstance(value, dict):
                        value = value.get("score") or value.get("value")
                    if isinstance(value, (float, int)):
                        return f"{value:g}/5"
                    return str(value)
    return "N/A"


def numeric_metric(item: dict[str, Any], names: tuple[str, ...]) -> float | None:
    """Read a numeric metric without inventing a scale or coercing labels."""
    for source in (item.get("metrics"), item.get("scores"), item.get("rubric"), item):
        if not isinstance(source, dict):
            continue
        for name in names:
            value = source.get(name)
            if isinstance(value, dict):
                value = value.get("score", value.get("value"))
            if isinstance(value, bool) or value is None:
                continue
            try:
                parsed = float(value)
            except (TypeError, ValueError):
                continue
            if math.isfinite(parsed):
                return parsed
    return None


def mode_variant(item: dict[str, Any]) -> tuple[str, str]:
    mode = first_value(item, ("mode", "evaluationMode", "provider"))
    variant = first_value(item, ("variant", "strategy", "approach"))
    return mode, variant


def provider_call_status(item: dict[str, Any]) -> str:
    for key in ("calledDeepSeek", "providerCalled", "deepseekCalled", "llmCalled", "generationCalled", "apiCalled"):
        value = item.get(key)
        if value is True:
            return "sim"
        if value is False:
            return "não"
    paid_calls = item.get("paidCalls")
    if isinstance(paid_calls, (int, float)) and not isinstance(paid_calls, bool):
        return "sim" if paid_calls > 0 else "não"
    return "não informado"


def usage_summary(item: dict[str, Any]) -> str:
    usage = item.get("usage")
    sources = [item, usage] if isinstance(usage, dict) else [item]
    input_tokens = output_tokens = total_tokens = None
    for source in sources:
        if not isinstance(source, dict):
            continue
        input_tokens = input_tokens if input_tokens is not None else next(
            (source[k] for k in ("inputTokens", "promptTokens", "input_tokens", "prompt_tokens") if source.get(k) is not None), None
        )
        output_tokens = output_tokens if output_tokens is not None else next(
            (source[k] for k in ("outputTokens", "completionTokens", "output_tokens", "completion_tokens") if source.get(k) is not None), None
        )
        total_tokens = total_tokens if total_tokens is not None else next(
            (source[k] for k in ("totalTokens", "total_tokens") if source.get(k) is not None), None
        )
    if total_tokens is None and input_tokens is not None and output_tokens is not None:
        try:
            total_tokens = int(input_tokens) + int(output_tokens)
        except (TypeError, ValueError):
            pass
    token_text = f"tokens entrada/saída/total {input_tokens if input_tokens is not None else 'N/A'}/{output_tokens if output_tokens is not None else 'N/A'}/{total_tokens if total_tokens is not None else 'N/A'}"
    recorded_cost = next((item[key] for key in ("estimatedCostUsd", "costUsd", "estimated_cost_usd", "cost_usd", "actualCostUsd", "actual_cost_usd") if item.get(key) is not None), None)
    estimated_cost = next((item[key] for key in ("estimatedCostUsd", "estimated_cost_usd") if item.get(key) is not None), None)
    cumulative_cost = next((item[key] for key in ("cumulativeCostUpperEstimateUsd", "cumulative_cost_upper_estimate_usd") if item.get(key) is not None), None)
    cost_value = estimated_cost if estimated_cost is not None else recorded_cost
    cost_text = f"custo estimado US${float(cost_value):.7f}" if cost_value is not None else "custo por caso N/A"
    if cumulative_cost is not None:
        cost_text += f"; teto acumulado estimado US${float(cumulative_cost):.7f}"
    model = first_value(item, ("model", "modelId"))
    return f"{token_text}; {cost_text}; modelo {model}"


def first_value(item: dict[str, Any], names: tuple[str, ...]) -> str:
    for name in names:
        value = item.get(name)
        if value is not None and value != "":
            return str(value)
    return "N/A"


def style_table(table: Table, header: bool = True, font_size: float = 7.0) -> Table:
    commands: list[tuple[Any, ...]] = [
        ("GRID", (0, 0), (-1, -1), 0.35, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("FONTSIZE", (0, 0), (-1, -1), font_size),
        ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [colors.white, PALE]),
    ]
    if header:
        # Paragraphs carry their own text color, so TableStyle alone is not
        # enough to make the dark header readable (including inline markup).
        for cell in table._cellvalues[0]:
            if isinstance(cell, Paragraph):
                cell.style = ParagraphStyle(
                    cell.style.name + "Header", parent=cell.style,
                    textColor=colors.white, fontName="FluxSans-Bold",
                )
                for fragment in cell.frags:
                    fragment.textColor = colors.white
                    fragment.fontName = "FluxSans-Bold"
        commands.extend([
            ("BACKGROUND", (0, 0), (-1, 0), DEEP_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ])
    table.setStyle(TableStyle(commands))
    return table


def md_table(lines: list[str], styles: dict[str, ParagraphStyle], available_width: float) -> Table:
    rows: list[list[str]] = []
    for line in lines:
        raw_cells = [part.strip() for part in line.strip().strip("|").split("|")]
        if raw_cells and all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in raw_cells):
            continue
        rows.append(raw_cells)
    if not rows:
        return Table([[""]])
    ncols = max(len(row) for row in rows)
    normalized = [row + [""] * (ncols - len(row)) for row in rows]
    weights = [1.0] * ncols
    for row in normalized[1:]:
        for i, cell in enumerate(row):
            weights[i] = min(5.5, max(weights[i], min(5.0, len(cell) / 34 + 0.7)))
    total = sum(weights)
    cell_style = styles["small"] if ncols >= 4 else styles["body"]
    # Reserve enough width for header words and short first-column identifiers.
    minimums = [min(100, max((pdfmetrics.stringWidth(word.strip('`*'), "FluxSans-Bold", cell_style.fontSize)
                             for word in cell.split()), default=18) + 9) for cell in normalized[0]]
    first_words = [word.strip('`*') for row in normalized for word in row[0].split()]
    minimums[0] = max(minimums[0], min(100, max((pdfmetrics.stringWidth(word, cell_style.fontName, cell_style.fontSize)
                                               for word in first_words), default=18) + 9))
    remainder = available_width - sum(minimums)
    widths = [minimums[i] + max(0, remainder) * weight / total for i, weight in enumerate(weights)]
    if remainder < 0:
        widths = [available_width * width / sum(widths) for width in widths]
    data = [[Paragraph(inline_markup(cell), cell_style) for cell in row] for row in normalized]
    result = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT", splitByRow=1)
    return style_table(result, True, 6.9 if ncols >= 4 else 7.4)


def markdown_flowables(path: Path, styles: dict[str, ParagraphStyle], doc: FluxDocTemplate) -> list[Flowable]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    story: list[Flowable] = []
    buf: list[str] = []
    in_code = False
    code_language = ""
    code_buf: list[str] = []

    def flush_paragraph() -> None:
        nonlocal buf
        if buf:
            content = " ".join(part.strip() for part in buf if part.strip())
            if content:
                story.append(Paragraph(inline_markup(content), styles["body"]))
            buf = []

    i = 0
    while i < len(lines):
        line = lines[i]
        fence = re.match(r"^\s*```(.*)$", line)
        if fence:
            flush_paragraph()
            if in_code:
                if code_language == "mermaid":
                    story.append(Paragraph(
                        "A figura vetorial na seção Arquitetura e fluxo de uma requisição representa as camadas deste sistema. "
                        "A definição Mermaid editável, com ligações detalhadas de ingestão, memória, recuperação e geração, está preservada em docs/01-arquitetura.md.",
                        styles["body"],
                    ))
                else:
                    wrapped = []
                    for item in code_buf:
                        wrapped.extend(textwrap.wrap(pdf_text(item), width=116, replace_whitespace=False, drop_whitespace=False) or [""])
                    story.append(Preformatted("\n".join(wrapped), styles["code"], maxLineLength=116))
                code_buf = []
                in_code = False
            else:
                in_code = True
                code_language = fence.group(1).strip()
            i += 1
            continue
        if in_code:
            code_buf.append(line)
            i += 1
            continue
        if line.startswith("|") and "|" in line[1:]:
            flush_paragraph()
            table_lines: list[str] = []
            while i < len(lines) and lines[i].startswith("|") and "|" in lines[i][1:]:
                table_lines.append(lines[i])
                i += 1
            story.append(md_table(table_lines, styles, doc.width))
            story.append(Spacer(1, 5))
            continue
        if not line.strip():
            flush_paragraph()
            i += 1
            continue
        if re.match(r"^\s*[-*]\s+", line):
            flush_paragraph()
            content = re.sub(r"^\s*[-*]\s+", "", line)
            story.append(Paragraph("- " + inline_markup(content), styles["bullet"]))
            i += 1
            continue
        if re.match(r"^\s*\d+[.)]\s+", line):
            flush_paragraph()
            content = re.sub(r"^\s*\d+[.)]\s+", "", line)
            number = re.match(r"^\s*(\d+)", line).group(1)  # type: ignore[union-attr]
            story.append(Paragraph(f"{number}. " + inline_markup(content), styles["bullet"]))
            i += 1
            continue
        if line.startswith(">"):
            flush_paragraph()
            story.append(Paragraph(inline_markup(line.lstrip("> ")), styles["quote"]))
            i += 1
            continue
        heading = re.match(r"^(#{1,3})\s+(.+?)\s*#*\s*$", line)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            plain_title = heading.group(2).strip()
            if level == 1:
                story.append(Paragraph(inline_markup(plain_title), styles["h1"]))
            elif level == 2:
                heading_style = styles["h2"]
                if path.name == "10-matriz-de-aceite-e-referencias.md" and plain_title.startswith("Rastreabilidade"):
                    # Allow this full-page matrix to split after its document
                    # introduction instead of reserving a nearly empty page.
                    heading_style = ParagraphStyle("FluxH2", parent=heading_style, keepWithNext=False)
                story.append(Paragraph(inline_markup(plain_title), heading_style))
            else:
                story.append(Paragraph(inline_markup(plain_title), styles["h3"]))
            i += 1
            continue
        if re.fullmatch(r"\s*([-*_])\1{2,}\s*", line):
            flush_paragraph()
            story.append(Spacer(1, 4))
            i += 1
            continue
        buf.append(line)
        i += 1
    flush_paragraph()
    if in_code and code_buf:
        story.append(Preformatted("\n".join(pdf_text(line) for line in code_buf), styles["code"], maxLineLength=116))
    return story


def collect_cases() -> list[dict[str, Any]]:
    data = load_json(CASE_FILE)
    return data if isinstance(data, list) else []


def collect_calibration_cases() -> list[dict[str, Any]]:
    data = load_json(CALIBRATION_FILE)
    return data if isinstance(data, list) else []


def collect_threshold_results(artifacts: list[Path]) -> list[dict[str, Any]]:
    """Read calibration measurements only from observed output artifacts."""
    results: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str]] = set()
    threshold_keys = ("threshold", "similarityThreshold", "minSimilarity")
    for path in artifacts:
        data = load_json(path)
        if data is None:
            continue
        selected_threshold = None
        if isinstance(data, dict):
            selected_threshold = next((data[key] for key in ("selectedThreshold", "chosenThreshold", "bestThreshold") if data.get(key) is not None), None)
        for item in iter_dicts(data):
            threshold = next((item[key] for key in threshold_keys if item.get(key) is not None), None)
            if threshold is None or not any(key in item for key in ("f1", "precision", "recall")):
                continue
            precision = item.get("precision")
            recall = item.get("recall")
            f1 = item.get("f1")
            selected = item.get("selected") is True or item.get("chosen") is True or item.get("isSelected") is True
            selected = selected or (selected_threshold is not None and str(threshold) == str(selected_threshold))
            row = {"threshold": threshold, "precision": precision, "recall": recall, "f1": f1, "selected": selected, "artifact": path}
            key = (str(threshold), str(precision), str(recall), str(f1))
            if key not in seen:
                results.append(row)
                seen.add(key)
    return results


def make_evaluation_section(story: list[Flowable], styles: dict[str, ParagraphStyle], observations: dict[str, list[dict[str, Any]]], case_file_names: list[Path]) -> None:
    story.append(Paragraph("Avaliação do sistema: casos e evidências executadas", styles["h1"]))
    cases = collect_cases()
    calibrations = collect_calibration_cases()
    measured = sum(1 for case in cases if observations.get(normalize_case_id(case.get("id"))))
    observation_count = sum(len(observations.get(normalize_case_id(case.get("id")), [])) for case in cases)
    all_observations = [
        item for case in cases for item in observations.get(normalize_case_id(case.get("id")), [])
    ]
    modes = Counter(mode_variant(item)[0] for item in all_observations)
    provider_states = Counter(provider_call_status(item) for item in all_observations)
    if measured == 0:
        status = (
            f"<b>Resultados observados: pendentes.</b> Encontramos {len(cases)} definições de avaliação e "
            f"{len(calibrations)} definições de calibração, mas nenhum resultado observado correspondente em output/. "
            "As linhas abaixo exibem expectativa e estado pendente; não representam respostas executadas nem avaliação da DeepSeek."
        )
        story.append(Paragraph(status, styles["quote"]))
    else:
        story.append(Paragraph(
            f"Há observações para {measured} de {len(cases)} casos ({observation_count} resultados/variantes); "
            f"os demais casos permanecem pendentes. Contagem por modo: {dict(sorted(modes.items()))}. "
            f"Linhas com uso confirmado da DeepSeek: {provider_states['sim']}; sem chamada: {provider_states['não']}; "
            f"sem indicador de chamada: {provider_states['não informado']}. Um modo live identifica a configuração da execução, "
            "não prova que cada caso usou o provedor. Consultas determinísticas por ID e falhas injetadas não medem a geração da DeepSeek.", styles["body"]
        ))

    story.append(Paragraph(inline_markup(
        "As notas em `metrics` são automáticas e heurísticas, com escala definida pelo executor; não certificam a resposta. "
        "Os campos `*Reviewed` e `resolutionScore` indicam revisão qualitativa assistida por agente, não avaliação humana independente. "
        "Nesta versão, as notas numéricas foram anexadas ao snapshot por regras documentadas no script de revisão; devem ser lidas como apoio analítico limitado, sem certificação. "
        "Métricas e resultados não aplicáveis permanecem N/A, sem serem tratados como zero."),
        styles["quote"],
    ))

    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for case in cases:
        for item in observations.get(normalize_case_id(case.get("id")), []):
            mode, variant = mode_variant(item)
            copy = dict(item)
            copy["_case_id"] = normalize_case_id(case.get("id"))
            groups[(mode, variant)].append(copy)

    if groups:
        story.append(Paragraph("Métricas automáticas por modo e variante", styles["h2"]))
        story.append(Paragraph(inline_markup(
            "Médias calculadas somente sobre valores numéricos presentes. `n` informa quantas observações entram em cada dimensão; "
            "esta tabela contém somente notas heurísticas automáticas. A diferença pareada (RAG menos prompting) é exibida apenas "
            "quando ambos os resultados do mesmo caso e modo têm valores numéricos."), styles["small"]
        ))

        def mean_cell(items: list[dict[str, Any]], keys: tuple[str, ...]) -> str:
            values = [value for item in items if (value := numeric_metric(item, keys)) is not None]
            return f"{sum(values) / len(values):.2f} (n={len(values)})" if values else "N/A"

        summary_rows: list[list[Paragraph]] = [[Paragraph(x, styles["small"]) for x in [
            "Modo", "Variante", "Obs. / casos", "Recuperação automática 0-5", "Fidelidade automática 0-5", "Coerência automática 0-5",
            "Respostas DeepSeek / chamadas pagas",
        ]]]
        for (mode, variant), items in sorted(groups.items()):
            case_count = len({item["_case_id"] for item in items})
            provider_yes = sum(provider_call_status(item) == "sim" for item in items)
            paid_calls = sum(int(item.get("paidCalls") or 0) for item in items)
            row = [
                mode, variant, f"{len(items)} / {case_count}",
                mean_cell(items, ("retrieval", "relevance", "retrievalRelevance")),
                mean_cell(items, ("fidelity", "faithfulness")),
                mean_cell(items, ("coherence", "coerencia")),
                f"{provider_yes} / {paid_calls}",
            ]
            summary_rows.append([Paragraph(inline_markup(value), styles["small"]) for value in row])
        summary_table = Table(summary_rows, colWidths=[17*mm, 20*mm, 22*mm, 29*mm, 29*mm, 29*mm, 30*mm], repeatRows=1, splitByRow=1)
        story.append(style_table(summary_table, True, 6.0))

        review_heading = Paragraph("Revisão qualitativa assistida por agente", styles["h3"])
        review_note = Paragraph(inline_markup(
            "Os escores abaixo vêm do artefato anotado com `reviewType=agent-assisted qualitative review`; `manualReview=false` em todos os casos. "
            "Na revisão v2, fidelidade mede somente respostas factuais; recusas, esclarecimentos e falhas são pontuados em abstenção. "
            "A relevância é revista no nível dos chunks, incluindo ruído. A revisão humana independente continua ausente."),
            styles["small"],
        )
        review_rows: list[list[Paragraph]] = [[Paragraph(x, styles["small"]) for x in [
            "Modo", "Variante", "Agente revisou", "Relevância assistida 0-5", "Fidelidade assistida 0-5", "Coerência assistida 0-5",
            "Abstenção assistida 0-5",
        ]]]
        outcome_rows = [[Paragraph(x, styles["small"]) for x in ("Modo", "Variante", "Resolutividade assistida 0-5", "Revisão humana independente")]]
        for (mode, variant), items in sorted(groups.items()):
            agent_count = sum(item.get("agentReviewed") is True for item in items)
            independent_count = sum(item.get("manualReview") is True for item in items)
            row = [
                mode, variant, f"{agent_count}/{len(items)}",
                mean_cell(items, ("relevanceReviewed", "relevance_reviewed")),
                mean_cell(items, ("fidelityReviewed", "fidelity_reviewed")),
                mean_cell(items, ("coherenceReviewed", "coherence_reviewed")),
                mean_cell(items, ("abstentionReviewed",)),
            ]
            review_rows.append([Paragraph(inline_markup(value), styles["small"]) for value in row])
            outcome_rows.append([Paragraph(inline_markup(value), styles["small"]) for value in (
                mode, variant, mean_cell(items, ("resolutionScore", "resolution_score")), f"{independent_count}/{len(items)}",
            )])
        review_table = style_table(Table(review_rows, colWidths=[16*mm, 20*mm, 22*mm, 29*mm, 29*mm, 29*mm, 31*mm], repeatRows=1, splitByRow=1), True, 5.8)
        outcome_table = style_table(Table(outcome_rows, colWidths=[25*mm, 30*mm, 60*mm, 61*mm], repeatRows=1), True)
        story.append(KeepTogether([review_heading, review_note, review_table, Spacer(1, 6), outcome_table]))

        paired_by_mode: dict[str, dict[str, dict[str, dict[str, Any]]]] = defaultdict(lambda: defaultdict(dict))
        for (mode, variant), items in groups.items():
            for item in items:
                paired_by_mode[mode][item["_case_id"]][variant.lower()] = item
        paired_rows: list[list[Paragraph]] = [[Paragraph(x, styles["small"]) for x in ["Modo", "Métrica automática", "RAG - prompting", "Pares"]]]
        for mode, by_case in sorted(paired_by_mode.items()):
            for metric_name, aliases in [
                ("Recuperação", ("retrieval", "relevance", "retrievalRelevance")),
                ("Fidelidade", ("fidelity", "faithfulness")),
                ("Coerência", ("coherence", "coerencia")),
            ]:
                differences: list[float] = []
                for variants in by_case.values():
                    prompting = next((v for k, v in variants.items() if "prompt" in k), None)
                    rag = next((v for k, v in variants.items() if k == "rag" or "retrieval" in k), None)
                    if prompting and rag:
                        left = numeric_metric(prompting, aliases)
                        right = numeric_metric(rag, aliases)
                        if left is not None and right is not None:
                            differences.append(right - left)
                paired_rows.append([Paragraph(inline_markup(x), styles["small"]) for x in [
                    mode, metric_name, f"{sum(differences) / len(differences):+.2f}" if differences else "N/A", str(len(differences))
                ]])
        if len(paired_rows) > 1:
            story.append(Paragraph("Diferença pareada automática: RAG menos prompting", styles["h3"]))
            story.append(style_table(Table(paired_rows, colWidths=[40*mm, 48*mm, 45*mm, 25*mm], repeatRows=1), True, 6.4))

    if calibrations:
        story.append(Paragraph("Casos de calibração (10 perguntas)", styles["h2"]))
        calibration = load_json(OUTPUT_DIR / "calibration.json") or {}
        selected_run = next((run for run in calibration.get("results", [])
                             if run.get("threshold") == calibration.get("selectedThreshold")), {})
        selected_questions = {item["id"]: item for item in selected_run.get("questions", [])}
        story.append(Paragraph(
            f"Fontes recuperadas no limiar escolhido ({calibration.get('selectedThreshold', 'N/A')}); "
            "estas consultas avaliam recuperação e roteamento, sem gerar respostas pela DeepSeek. A tabela seguinte compara os quatro limiares.",
            styles["small"],
        ))
        cal_rows: list[list[Paragraph]] = [[Paragraph(x, styles["small"]) for x in ["ID", "Categoria", "Pergunta", "Evidência esperada", "Recuperação observada"]]]
        for case in calibrations:
            measured_case = selected_questions.get(case.get("id"))
            observed = ", ".join(measured_case.get("retrieved") or []) or "nenhuma fonte" if measured_case else "PENDENTE"
            if measured_case:
                similarities = [value for value in measured_case.get("similarities", []) if isinstance(value, (int, float))]
                if similarities:
                    observed += f"; maior similaridade {max(similarities):.3f}"
            cal_rows.append([
                Paragraph(inline_markup(case.get("id", "")), styles["small"]),
                Paragraph(inline_markup(case.get("category", "")), styles["small"]),
                Paragraph(inline_markup(case.get("question", "")), styles["small"]),
                Paragraph(inline_markup(", ".join(case.get("expectedSourceIds") or []) or "nenhuma fonte"), styles["small"]),
                Paragraph(inline_markup(observed), styles["small"]),
            ])
        cal_table = Table(cal_rows, colWidths=[15 * mm, 23 * mm, 74 * mm, 25 * mm, 39 * mm], repeatRows=1, splitByRow=1)
        story.extend([style_table(cal_table, True, 6.5), Spacer(1, 7)])
        threshold_rows = collect_threshold_results(case_file_names)
        story.append(Paragraph("Resultados da calibração do limiar", styles["h3"]))
        if threshold_rows:
            metric_rows: list[list[Paragraph]] = [[Paragraph(x, styles["small"]) for x in ["Threshold", "Precisão", "Recall", "F1", "Selecionado", "Artefato"]]]
            for item in sorted(threshold_rows, key=lambda row: float(row["threshold"])):
                values = [
                    str(item["threshold"]),
                    str(item["precision"] if item["precision"] is not None else "N/A"),
                    str(item["recall"] if item["recall"] is not None else "N/A"),
                    str(item["f1"] if item["f1"] is not None else "N/A"),
                    "sim" if item["selected"] else "não informado",
                    item["artifact"].relative_to(ROOT).as_posix(),
                ]
                metric_rows.append([Paragraph(inline_markup(value), styles["small"]) for value in values])
            story.append(style_table(Table(metric_rows, colWidths=[18*mm, 20*mm, 20*mm, 20*mm, 25*mm, 73*mm], repeatRows=1, splitByRow=1), True, 6.4))
            story.append(Paragraph(
                "A tabela mostra somente medições gravadas nos JSONs. O threshold selecionado precisa seguir o maior F1 observado; em empate, o maior threshold. "
                "A presença de uma marca explícita de seleção é informada pelo artefato, sem inferir que a regra foi aplicada quando ela não está registrada.",
                styles["small"],
            ))
        else:
            story.append(Paragraph(
                "Ainda não há uma medição por threshold com precisão, recall e F1 em output/. A definição dos dez casos de calibração não é resultado de calibração.",
                styles["quote"],
            ))
    else:
        story.append(Paragraph("Arquivo evaluation/calibration.json indisponível; casos de calibração não foram carregados.", styles["body"]))

    story.append(Paragraph("Tabela por pergunta: 30 casos finais", styles["h2"]))
    story.append(Paragraph(
        "A tabela compara a rodada final live. A/R/F/C indicam, respectivamente, recuperação automática, "
        "relevância assistida, fidelidade assistida e coerência assistida, todas de 0 a 5; N/A significa dimensão não aplicável. "
        "A seguir, os registros completos trazem respostas, fontes, notas automáticas e justificativas. As observações offline "
        "estão resumidas nas tabelas anteriores e preservadas integralmente no JSON, sem duplicar respostas do gerador falso.",
        styles["body"],
    ))

    def final_items(case_id: str) -> list[dict[str, Any]]:
        items = observations.get(case_id, [])
        live = [item for item in items if mode_variant(item)[0] == "live"]
        return live or items

    def compact_result(item: dict[str, Any] | None) -> str:
        if item is None:
            return "PENDENTE"
        scores = [
            score_value(item, ("retrieval", "relevance", "retrievalRelevance")),
            score_value(item, ("relevanceReviewed",)),
            score_value(item, ("fidelityReviewed",)),
            score_value(item, ("coherenceReviewed",)),
        ]
        return f"{actual_result(item)}\nA/R/F/C: {'; '.join(scores)}\nFontes: {', '.join(source_ids(item)) or '-'}"

    headers = ["ID", "Pergunta", "Esperado", "Prompting final", "RAG final"]
    rows = [[Paragraph(x, styles["small"]) for x in headers]]
    for case in cases:
        items = final_items(normalize_case_id(case.get("id")))
        prompting = next((item for item in items if "prompt" in mode_variant(item)[1]), None)
        rag = next((item for item in items if mode_variant(item)[1] == "rag"), None)
        values = [case.get("id", ""), case.get("question", ""), case.get("expectedResult", ""),
                  compact_result(prompting), compact_result(rag)]
        rows.append([Paragraph(inline_markup(value), styles["small"]) for value in values])
    if len(rows) > 1:
        story.append(style_table(Table(rows, colWidths=[15*mm, 53*mm, 26*mm, 41*mm, 41*mm], repeatRows=1), True))

    details_heading = Paragraph("Respostas, evidências e análise por caso", styles["h2"])
    for case_index, case in enumerate(cases):
        case_id = normalize_case_id(case.get("id"))
        case_story: list[Flowable] = [details_heading] if case_index == 0 else []
        case_story.append(Paragraph(inline_markup(f"{case_id}: {case.get('question', '')}"), styles["h3"]))
        expected = (
            f"Categoria: {case.get('category', 'N/A')}. Resultado esperado: {case.get('expectedResult', 'N/A')}. "
            f"Evidências esperadas: {', '.join(case.get('expectedSourceIds') or []) or 'nenhuma'}."
        )
        if case.get("setup"):
            expected += f" Pré-condição de teste: {case['setup']}."
        if case.get("followUps"):
            expected += " Turnos seguintes: " + " -> ".join(case["followUps"]) + ". A resposta abaixo corresponde ao último turno; tokens e custo incluem a sequência."
        case_story.append(Paragraph(inline_markup(expected), styles["body"]))
        detail_rows = [[Paragraph(x, styles["small"]) for x in ("Execução", f"{case_id}: observação e evidências")]]
        for item in final_items(case_id):
            mode, variant = mode_variant(item)
            answer = actual_answer(item) or "Sem texto de resposta registrado."
            retrieved = item.get("retrievedSources") or []
            retrieved_ids = [str(value.get("id", "")) if isinstance(value, dict) else str(value) for value in retrieved]
            automatic = "; ".join(
                f"{label} {score_value(item, aliases)}" for label, aliases in [
                    ("recuperação", ("retrieval", "relevance")),
                    ("fidelidade", ("fidelity", "faithfulness")),
                    ("coerência", ("coherence",)),
                ]
            )
            reviewed = "; ".join(
                f"{label} {score_value(item, aliases)}" for label, aliases in [
                    ("relevância", ("relevanceReviewed",)), ("fidelidade", ("fidelityReviewed",)),
                    ("coerência", ("coherenceReviewed",)), ("abstenção", ("abstentionReviewed",)), ("resolutividade", ("resolutionScore",)),
                ]
            )
            detail = (
                f"Resultado: {actual_result(item)}. DeepSeek chamada: {provider_call_status(item)}; "
                f"tipo de provedor: {item.get('providerMode', 'N/A')}; chamadas pagas: {item.get('paidCalls', 'N/A')}.\n"
                f"Resposta: {answer}\n"
                f"Fontes recuperadas: {', '.join(retrieved_ids) or 'nenhuma'}. Fontes citadas: {', '.join(source_ids(item)) or 'nenhuma'}.\n"
                f"Notas automáticas (heurísticas): {automatic}.\n"
                f"Notas assistidas por agente: {reviewed}.\n"
                f"Justificativa: {first_value(item, ('reviewJustification', 'fidelityReviewedReason', 'coherenceReviewedReason'))}.\n"
                f"Latência: {first_value(item, ('latencyMs', 'durationMs'))} ms; {usage_summary(item)}."
            )
            failure = first_value(item, ("failureCategory", "failureClass"))
            if failure != "N/A":
                detail += f"\nFalha: {failure}. Hipótese: {first_value(item, ('failureHypothesis', 'failureReason'))}."
            if item.get("error"):
                detail += f"\nErro registrado: {item['error']}."
            if item.get("relevanceReviewedReason"):
                detail += f"\nPertinência dos chunks: {item['relevanceReviewedReason']}"
            detail_rows.append([Paragraph(inline_markup(f"{mode}/{variant}"), styles["small"]),
                                Paragraph(inline_markup(detail), styles["small"])])
        if len(detail_rows) == 1:
            detail_rows.append([Paragraph("PENDENTE", styles["small"]), Paragraph("Sem execução observada.", styles["small"])])
        case_story.append(style_table(Table(detail_rows, colWidths=[25*mm, 151*mm], repeatRows=1), True))
        case_story.append(Spacer(1, 8))
        story.append(KeepTogether(case_story))

    classified_failures: list[tuple[str, str, str, str]] = []
    for case in cases:
        case_id = normalize_case_id(case.get("id"))
        for item in observations.get(case_id, []):
            category = first_value(item, ("failureCategory", "failureClass", "failure_category"))
            if category != "N/A":
                mode, variant = mode_variant(item)
                hypothesis = first_value(item, ("failureHypothesis", "failureReason", "failure_hypothesis"))
                classified_failures.append((category, case_id, f"{mode}/{variant}", hypothesis))
    story.append(Paragraph("Análise de falhas observadas", styles["h2"]))
    if classified_failures:
        failure_counts = Counter(row[0] for row in classified_failures)
        story.append(Paragraph(
            "As categorias e hipóteses abaixo vêm do artefato de execução; esta tabela não deduz a causa apenas pela nota ou pelo status.",
            styles["small"],
        ))
        failure_rows: list[list[Paragraph]] = [[Paragraph(x, styles["small"]) for x in ["Categoria", "Ocorrências", "Caso / modo / variante", "Hipótese registrada"]]]
        for category, count in sorted(failure_counts.items()):
            examples = [row for row in classified_failures if row[0] == category]
            details = "; ".join(f"{case_id} ({run})" for _, case_id, run, _ in examples)
            hypotheses = "; ".join(dict.fromkeys(row[3] for row in examples if row[3] != "N/A")) or "N/A"
            failure_rows.append([Paragraph(inline_markup(value), styles["small"]) for value in [category, str(count), details, hypotheses]])
        story.append(style_table(Table(failure_rows, colWidths=[25*mm, 18*mm, 50*mm, 83*mm], repeatRows=1, splitByRow=1), True, 6.2))
    else:
        story.append(Paragraph(
            "Nenhuma classificação explícita de causa foi encontrada nos resultados por pergunta. Erros e respostas divergentes permanecem visíveis na tabela; "
            "a causa retrieval/context/generation/authorization só é afirmada quando foi registrada na evidência ou na análise documentada.",
            styles["quote"],
        ))

    if case_file_names:
        story.append(Paragraph("Artefatos JSON localizados", styles["h2"]))
        for path in case_file_names:
            story.append(Paragraph(f"- {inline_markup(path.relative_to(ROOT).as_posix())}", styles["small"]))
    else:
        story.append(Paragraph("Nenhum JSON de execução foi encontrado em output/.", styles["body"]))


def add_screenshots(story: list[Flowable], styles: dict[str, ParagraphStyle], page_width: float) -> int:
    images = sorted(SCREENSHOT_DIR.glob("*.png")) if SCREENSHOT_DIR.exists() else []
    heading = Paragraph("Evidências visuais da demonstração", styles["h1"])
    if not images:
        story.append(heading)
        story.append(Paragraph(
            "Nenhuma captura PNG foi encontrada em output/screenshots/. Esta seção permanece pendente até serem adicionadas capturas sintéticas da interface.",
            styles["quote"],
        ))
        return 0
    count = 0
    for path in images:
        try:
            img = Image(str(path))
            max_w, max_h = page_width - 12 * mm, 130 * mm
            scale = min(max_w / img.imageWidth, max_h / img.imageHeight, 1.0)
            img.drawWidth = img.imageWidth * scale
            img.drawHeight = img.imageHeight * scale
            screenshot_story = [heading] if count == 0 else []
            screenshot_story.extend([
                Paragraph(inline_markup(path.stem.replace("_", " ").replace("-", " ")), styles["h3"]),
                img,
                Paragraph("Fonte: captura local de demonstração com dados sintéticos.", styles["caption"]),
                Spacer(1, 4),
            ])
            story.append(KeepTogether(screenshot_story))
            count += 1
        except Exception as exc:
            story.append(Paragraph(f"Imagem não pôde ser incorporada: {inline_markup(path.name)} ({inline_markup(exc)})", styles["small"]))
    return count


def build_report(output: Path) -> tuple[int, int, int]:
    register_fonts()
    styles = make_styles()
    output.parent.mkdir(parents=True, exist_ok=True)
    doc = FluxDocTemplate(
        str(output), pagesize=A4, leftMargin=17 * mm, rightMargin=17 * mm,
        topMargin=21 * mm, bottomMargin=18 * mm, title="Fluxsus AI Lab - Relatório técnico",
        author="Capstone Fluxsus AI Lab", subject="Chatbot com RAG, contexto, memória e autorização",
    )
    observations, evidence_files = observation_index()
    cases = collect_cases()
    story: list[Flowable] = [Cover(doc.height - 1), PageBreak()]
    story.append(Paragraph("Leitura deste relatório", styles["h1"]))
    story.append(Paragraph(
        "O relatório reúne arquitetura, decisões, políticas de acesso, memória, recuperação, avaliação, escala e roteiro operacional. "
        "Todos os exemplos são fictícios. As notas empíricas vêm exclusivamente de artefatos JSON de execução encontrados em output/. "
        "Quando um teste pago ou screenshot ainda não existe, a seção mostra PENDENTE e mantém expectativas separadas de observações.",
        styles["body"],
    ))
    append_executive_evaluation_summary(story, styles, observations, cases, doc.width)
    story.append(Paragraph("Sumário", styles["h1"]))
    toc = TableOfContents()
    toc.levelStyles = [styles["toc1"], styles["toc2"]]
    toc.dotsMinLevel = 0
    story.append(toc)
    story.append(PageBreak())

    story.append(Paragraph("Arquitetura e fluxo de uma requisição", styles["h1"]))
    story.append(Paragraph(
        "A figura resume a fronteira principal: uma mensagem só chega ao gerador depois de autenticação, autorização no banco e montagem de evidência atual.",
        styles["body"],
    ))
    story.append(ArchitectureDiagram())
    story.append(Spacer(1, 3))
    story.append(Paragraph("Fluxo seguro de resposta", styles["h2"]))
    flow_rows = [
        [Paragraph("1. Sessão", styles["small"]), Paragraph("2. ACL + RLS", styles["small"]), Paragraph("3. Retrieval atual", styles["small"]), Paragraph("4. Contexto", styles["small"]), Paragraph("5. Validação", styles["small"])],
        [Paragraph("Identidade do cookie", styles["small"]), Paragraph("Ticket elegível antes de recuperar", styles["small"]), Paragraph("ID exato ou híbrido autorizado", styles["small"]), Paragraph("Janela e fontes autorizadas", styles["small"]), Paragraph("Fonte, formato e estado", styles["small"])],
    ]
    story.append(style_table(Table(flow_rows, colWidths=[doc.width / 5] * 5), False, 7.0))
    story.append(PageBreak())

    docs_in_order = [
        "00-plano-e-contrato.md", "01-arquitetura.md", "02-controles-de-acesso-e-memoria.md",
        "03-corpus.md", "04-avaliacao-metodo.md", "05-pipeline-rag.md",
        "06-decisao-de-customizacao.md", "07-escala-10x.md", "08-operacao-e-demonstracao.md",
        "09-interface.md", "10-matriz-de-aceite-e-referencias.md", "11-analise-do-projeto-exemplo.md",
    ]
    included: list[Path] = []
    for name in docs_in_order:
        path = DOCS / name
        if path.is_file():
            included.append(path)
            story.extend(markdown_flowables(path, styles, doc))
            story.append(Spacer(1, 3))
    for path in sorted(DOCS.glob("*.md")):
        if path not in included:
            included.append(path)
            story.extend(markdown_flowables(path, styles, doc))
            story.append(Spacer(1, 3))

    make_evaluation_section(story, styles, observations, evidence_files)
    screenshot_count = add_screenshots(story, styles, doc.width)
    story.append(Paragraph("Metadados de geração e limites", styles["h1"]))
    story.append(Paragraph(
        f"Documentos markdown incluídos: {len(included)}. Casos finais definidos: {len(collect_cases())}. "
        f"Casos com observação: {sum(1 for c in collect_cases() if observations.get(normalize_case_id(c.get('id'))))}; "
        f"resultados/variantes observados: {sum(len(observations.get(normalize_case_id(c.get('id')), [])) for c in collect_cases())}. "
        f"Screenshots PNG incorporadas: {screenshot_count}. Este relatório não é laudo clínico nem evidência de prontidão produtiva.",
        styles["body"],
    ))
    doc.multiBuild(story)
    return len(included), len(collect_cases()), screenshot_count


def main() -> int:
    parser = argparse.ArgumentParser(description="Gera o relatório técnico a partir de docs/ e output/.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Caminho de saída do PDF.")
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output
    included, case_count, screenshot_count = build_report(output)
    print(f"PDF criado: {output}")
    print(f"Documentos incluídos: {included}; casos de avaliação listados: {case_count}; screenshots: {screenshot_count}.")
    if not collect_cases():
        print("Aviso: evaluation/cases.json não contém casos; relatório explicita a pendência.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
