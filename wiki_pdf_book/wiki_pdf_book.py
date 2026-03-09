#!/usr/bin/env python3
"""
Wikipedia Category PDF Book Generator
======================================
Generates a polished, book-like PDF from all articles in a Wikipedia category.

Usage:
    python wiki_pdf_book.py "Planets of the Solar System"
    python wiki_pdf_book.py "Nobel laureates in Physics" physics_laureates.pdf
    python wiki_pdf_book.py "Classical composers" --max-articles 20 --recursive

Requirements:
    pip install -r requirements.txt
"""

# ─────────────────────────────────────────────────────────────────────────────
#  TOGGLEABLE FEATURE FLAGS
#  Set any of these to True / False before running, or override with CLI flags.
# ─────────────────────────────────────────────────────────────────────────────

# 1. Full-page decorative cover for the whole book
FEATURE_BOOK_COVER_PAGE = True

# 2. Table of contents (with page numbers, auto-generated)
FEATURE_TABLE_OF_CONTENTS = True

# 3. Dedicated title page before each article
FEATURE_ARTICLE_TITLE_PAGES = True

# 4. First sentence displayed as a large italic quote on the title page
FEATURE_FIRST_SENTENCE_QUOTE = True

# 5. Article's main image shown large on its title page
FEATURE_COVER_IMAGE_ON_TITLE_PAGE = True

# 6. Page numbers in the footer on every body page
FEATURE_PAGE_NUMBERS = True

# 7. Running article title + book name in the header on body pages
FEATURE_RUNNING_HEADERS = True

# 8. Also fetch articles from subcategories (one level deep)
FEATURE_RECURSIVE_SUBCATEGORIES = False

# 9. Embed up to MAX_INLINE_IMAGES images inside each article body
FEATURE_ARTICLE_IMAGES_INLINE = True

# 10. Estimated reading time (at 200 wpm) shown on the title page
FEATURE_READING_TIME_ESTIMATE = True

# 11. Short description / infobox summary box at the start of each article
FEATURE_INFOBOX_SUMMARY = True

# 12. Include the References / External links / See also sections
FEATURE_ARTICLE_REFERENCES = False

# 13. Alphabetical index of all article titles at the back of the book
FEATURE_CATEGORY_INDEX_PAGE = True

# 14. Word count shown on each article title page
FEATURE_ARTICLE_WORD_COUNT = True

# ─────────────────────────────────────────────────────────────────────────────
#  CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────

# Hard cap on articles (0 = unlimited)
MAX_ARTICLES = 50

# Max images embedded inside one article's body
MAX_INLINE_IMAGES = 2

# Polite delay between Wikipedia API calls (seconds)
REQUEST_DELAY = 0.4

# ─────────────────────────────────────────────────────────────────────────────
#  IMPORTS
# ─────────────────────────────────────────────────────────────────────────────

import argparse
import io
import re
import sys
import time
import urllib.parse
from typing import Optional

import requests
from PIL import Image
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    Image as RLImage,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

# ─────────────────────────────────────────────────────────────────────────────
#  PAGE LAYOUT CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

PAGE_W, PAGE_H = A4
MARGIN = 2.5 * cm
HEADER_H = 0.8 * cm
FOOTER_H = 0.8 * cm
BODY_W = PAGE_W - 2 * MARGIN
BODY_H = PAGE_H - 2 * MARGIN - HEADER_H - FOOTER_H - 0.4 * cm

# Colour palette
C_DARK = colors.HexColor("#1a1a2e")
C_MID = colors.HexColor("#16213e")
C_ACCENT = colors.HexColor("#e94560")
C_GREY = colors.HexColor("#888888")
C_LIGHT_GREY = colors.HexColor("#cccccc")
C_BG_TINT = colors.HexColor("#f5f5fa")

# ─────────────────────────────────────────────────────────────────────────────
#  WIKIPEDIA API
# ─────────────────────────────────────────────────────────────────────────────

WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_REST = "https://en.wikipedia.org/api/rest_v1"
_HEADERS = {"User-Agent": "WikiPDFBook/2.0 (https://github.com/eytangut/science-videos-explorer)"}

# Filenames containing these substrings are filtered out as non-content images
_IMAGE_SKIP = (
    "icon", "flag", "logo", "commons", "wikimedia", "edit-", "question",
    "stub", "wikidata", "wiktionary", "portal", "padlock", "map_stub",
    "transparent", "blank", "placeholder", "arrow", "button",
)


def _api(params: dict) -> dict:
    """GET request to MediaWiki Action API with polite rate-limiting."""
    params.setdefault("format", "json")
    params.setdefault("utf8", 1)
    params.setdefault("formatversion", 2)
    r = requests.get(WIKI_API, params=params, headers=_HEADERS, timeout=20)
    r.raise_for_status()
    time.sleep(REQUEST_DELAY)
    return r.json()


def _rest(path: str) -> dict:
    """GET request to Wikipedia REST API."""
    r = requests.get(f"{WIKI_REST}{path}", headers=_HEADERS, timeout=20)
    if not r.ok:
        return {}
    time.sleep(REQUEST_DELAY)
    return r.json()


def fetch_category_members(category: str, recursive: bool = False) -> list[dict]:
    """Return article dicts {title, pageid} for every article in a category."""
    cat_title = category if category.lower().startswith("category:") else f"Category:{category}"
    pages: list[dict] = []
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": cat_title,
        "cmlimit": "500",
        "cmtype": "page|subcat",
    }
    while True:
        data = _api(params)
        for m in data.get("query", {}).get("categorymembers", []):
            ns = m.get("ns", -1)
            if ns == 0:  # article
                pages.append({"title": m["title"], "pageid": m["pageid"]})
            elif recursive and ns == 14:  # subcategory
                print(f"    ↳ Subcategory: {m['title']}")
                pages.extend(fetch_category_members(m["title"], recursive=False))
        cont = data.get("continue", {})
        if "cmcontinue" not in cont:
            break
        params["cmcontinue"] = cont["cmcontinue"]

    # deduplicate
    seen: set[int] = set()
    unique: list[dict] = []
    for p in pages:
        if p["pageid"] not in seen:
            seen.add(p["pageid"])
            unique.append(p)
    return unique


def fetch_summary(title: str) -> dict:
    """Return Wikipedia REST summary: {extract, description, thumbnail, ...}."""
    return _rest(f"/page/summary/{urllib.parse.quote(title, safe='')}")


def fetch_full_extract(title: str) -> str:
    """Return full plain-text article extract via Action API."""
    data = _api({
        "action": "query",
        "titles": title,
        "prop": "extracts",
        "explaintext": True,
        "exlimit": 1,
    })
    pages = data.get("query", {}).get("pages", [])
    return pages[0].get("extract", "") if pages else ""


def fetch_image_urls(title: str, limit: int = 5) -> list[str]:
    """Return content image URLs from an article (thumbnailed at 800 px)."""
    data = _api({
        "action": "query",
        "titles": title,
        "prop": "images",
        "imlimit": str(limit * 4),
    })
    pages = data.get("query", {}).get("pages", [])
    if not pages:
        return []

    img_titles = [
        img["title"] for img in pages[0].get("images", [])
        if img["title"].lower().endswith((".jpg", ".jpeg", ".png"))
        and not any(kw in img["title"].lower() for kw in _IMAGE_SKIP)
    ][:limit]

    if not img_titles:
        return []

    data2 = _api({
        "action": "query",
        "titles": "|".join(img_titles),
        "prop": "imageinfo",
        "iiprop": "url",
        "iiurlwidth": "800",
    })
    urls: list[str] = []
    for pg in data2.get("query", {}).get("pages", []):
        info = pg.get("imageinfo", [])
        if info:
            urls.append(info[0].get("thumburl") or info[0].get("url", ""))
    return [u for u in urls if u]


def download_image(url: str, max_mb: float = 5.0) -> Optional[bytes]:
    """Download an image URL and return raw bytes, or None on any error."""
    try:
        r = requests.get(url, headers=_HEADERS, timeout=25, stream=True)
        r.raise_for_status()
        # Validate image content-type before downloading
        ct = r.headers.get("content-type", "")
        if not ct.startswith("image/"):
            return None
        data = b""
        for chunk in r.iter_content(8192):
            data += chunk
            if len(data) > max_mb * 1_000_000:
                return None
        Image.open(io.BytesIO(data)).verify()  # validate
        return data
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
#  TEXT UTILITIES
# ─────────────────────────────────────────────────────────────────────────────

_SECTIONS_SKIP = {
    "references", "notes", "further reading", "external links",
    "bibliography", "see also", "citations", "footnotes",
}


def first_sentence(text: str) -> str:
    """Extract the first meaningful sentence."""
    if not text:
        return ""
    for s in re.split(r"(?<=[.!?])\s+", text.strip()):
        s = s.strip()
        if len(s) > 30 and not s.startswith("="):
            return s
    return text.split("\n")[0].strip()


def clean_wiki_text(text: str) -> str:
    """Strip leftover wiki markup from a plain-text extract."""
    text = re.sub(r"==+\s*.+?\s*==+", "", text)
    text = re.sub(r"\[\d+\]", "", text)
    text = re.sub(r"\[citation needed\]", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\{\{[^}]*\}\}", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_sections(text: str) -> list[tuple[str, str]]:
    """Split plain-text extract into [(heading, body), ...] pairs."""
    parts = re.split(r"\n(==+\s*.+?\s*==+)\n", text)
    sections: list[tuple[str, str]] = []
    if parts[0].strip():
        sections.append(("", parts[0].strip()))
    i = 1
    while i + 1 < len(parts):
        heading = re.sub(r"=+", "", parts[i]).strip()
        body = parts[i + 1].strip()
        sections.append((heading, body))
        i += 2
    return sections


def word_count(text: str) -> int:
    return len(text.split()) if text else 0


def reading_time(text: str, wpm: int = 200) -> int:
    return max(1, round(word_count(text) / wpm))


def xml_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ─────────────────────────────────────────────────────────────────────────────
#  STYLES
# ─────────────────────────────────────────────────────────────────────────────

def build_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()

    def s(name, **kw) -> ParagraphStyle:
        return ParagraphStyle(name, parent=base["Normal"], **kw)

    return {
        # --- cover page ---
        "cover_eyebrow": s(
            "cover_eyebrow",
            fontSize=13, leading=18, alignment=TA_CENTER,
            textColor=C_ACCENT, fontName="Helvetica",
        ),
        "cover_title": s(
            "cover_title",
            fontSize=44, leading=54, alignment=TA_CENTER,
            textColor=colors.white, fontName="Helvetica-Bold",
        ),
        "cover_subtitle": s(
            "cover_subtitle",
            fontSize=14, leading=20, alignment=TA_CENTER,
            textColor=colors.HexColor("#cccccc"), fontName="Helvetica",
        ),
        "cover_footnote": s(
            "cover_footnote",
            fontSize=10, leading=14, alignment=TA_CENTER,
            textColor=colors.HexColor("#888888"), fontName="Helvetica",
        ),
        # --- table of contents ---
        "toc_heading": s(
            "toc_heading",
            fontSize=28, leading=36, alignment=TA_CENTER,
            textColor=C_DARK, fontName="Helvetica-Bold", spaceAfter=24,
        ),
        # --- article title page ---
        "art_num": s(
            "art_num",
            fontSize=11, leading=16, alignment=TA_CENTER,
            textColor=C_ACCENT, fontName="Helvetica-Bold",
        ),
        "art_title": s(
            "art_title",
            fontSize=32, leading=40, alignment=TA_CENTER,
            textColor=C_DARK, fontName="Helvetica-Bold", spaceAfter=12,
        ),
        "art_meta": s(
            "art_meta",
            fontSize=10, leading=14, alignment=TA_CENTER,
            textColor=C_GREY, fontName="Helvetica", spaceAfter=8,
        ),
        "art_quote": s(
            "art_quote",
            fontSize=14, leading=21, alignment=TA_CENTER,
            textColor=colors.HexColor("#333355"), fontName="Helvetica-Oblique",
            leftIndent=24, rightIndent=24, spaceBefore=14, spaceAfter=14,
        ),
        # --- article body ---
        "body": s(
            "body",
            fontSize=10.5, leading=16, alignment=TA_JUSTIFY,
            textColor=colors.HexColor("#111111"), spaceAfter=8,
        ),
        "h1": s(
            "h1",
            fontSize=22, leading=28, textColor=C_DARK,
            fontName="Helvetica-Bold", spaceBefore=12, spaceAfter=6,
        ),
        "h2": s(
            "h2",
            fontSize=16, leading=22, textColor=C_MID,
            fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=5,
        ),
        "h3": s(
            "h3",
            fontSize=13, leading=18, textColor=colors.HexColor("#0f3460"),
            fontName="Helvetica-Bold", spaceBefore=8, spaceAfter=4,
        ),
        "caption": s(
            "caption",
            fontSize=8.5, leading=12, alignment=TA_CENTER,
            textColor=C_GREY, fontName="Helvetica-Oblique", spaceAfter=10,
        ),
        "infobox_key": s(
            "infobox_key",
            fontSize=9, leading=13, textColor=colors.HexColor("#444444"),
            fontName="Helvetica-Bold",
        ),
        "infobox_val": s(
            "infobox_val",
            fontSize=9, leading=13, textColor=colors.HexColor("#222222"),
            fontName="Helvetica",
        ),
        # --- index ---
        "index_heading": s(
            "index_heading",
            fontSize=28, leading=36, alignment=TA_CENTER,
            textColor=C_DARK, fontName="Helvetica-Bold", spaceAfter=24,
        ),
        "index_entry": s(
            "index_entry",
            fontSize=10, leading=15, textColor=colors.HexColor("#333333"),
            fontName="Helvetica",
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
#  IMAGE HELPER
# ─────────────────────────────────────────────────────────────────────────────

def make_rl_image(data: bytes, max_w: float, max_h: float) -> Optional[RLImage]:
    """Convert raw image bytes into a scaled ReportLab Image flowable."""
    try:
        pil = Image.open(io.BytesIO(data)).convert("RGB")
        w, h = pil.size
        scale = min(max_w / w, max_h / h)
        buf = io.BytesIO()
        pil.save(buf, format="JPEG", quality=82)
        buf.seek(0)
        img = RLImage(buf, width=w * scale, height=h * scale)
        img.hAlign = "CENTER"
        return img
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
#  DOCUMENT TEMPLATE (headers / footers)
# ─────────────────────────────────────────────────────────────────────────────

class BookDoc(BaseDocTemplate):
    """Custom BaseDocTemplate with per-page running headers and footers."""

    def __init__(self, path: str, category: str, **kw):
        self.category = category
        self._current_article = ""
        super().__init__(path, **kw)
        self._setup_templates()

    def _setup_templates(self):
        m = MARGIN
        w = BODY_W
        h_body = PAGE_H - 2 * m - HEADER_H - FOOTER_H - 0.4 * cm

        body_frame = Frame(
            m, m + FOOTER_H + 0.2 * cm,
            w, h_body,
            id="body",
            leftPadding=0, rightPadding=0,
            topPadding=0, bottomPadding=0,
        )
        cover_frame = Frame(
            m, m, w, PAGE_H - 2 * m,
            id="cover",
            leftPadding=0, rightPadding=0,
            topPadding=0, bottomPadding=0,
        )

        self.addPageTemplates([
            PageTemplate(
                id="cover",
                frames=[cover_frame],
                onPage=self._draw_cover_bg,
            ),
            PageTemplate(
                id="normal",
                frames=[body_frame],
                onPage=self._draw_normal_chrome,
            ),
        ])

    # --- background for the cover page ---
    def _draw_cover_bg(self, canvas, doc):
        canvas.saveState()
        # Deep navy background
        canvas.setFillColor(C_DARK)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        # Subtle accent stripe at bottom
        canvas.setFillColor(C_ACCENT)
        canvas.rect(0, 0, PAGE_W, 0.8 * cm, fill=1, stroke=0)
        canvas.restoreState()

    # --- header + footer for normal pages ---
    def _draw_normal_chrome(self, canvas, doc):
        canvas.saveState()
        m = MARGIN
        w = BODY_W

        if FEATURE_RUNNING_HEADERS and self._current_article:
            canvas.setFont("Helvetica", 8)
            canvas.setFillColor(C_GREY)
            canvas.drawString(m, PAGE_H - m + 0.35 * cm,
                              self._current_article)
            canvas.drawRightString(m + w, PAGE_H - m + 0.35 * cm,
                                   self.category)
            canvas.setStrokeColor(C_LIGHT_GREY)
            canvas.line(m, PAGE_H - m + 0.15 * cm,
                        m + w, PAGE_H - m + 0.15 * cm)

        if FEATURE_PAGE_NUMBERS:
            canvas.setFont("Helvetica", 8)
            canvas.setFillColor(C_GREY)
            canvas.drawCentredString(PAGE_W / 2, m - 0.5 * cm,
                                     f"— {doc.page} —")
            canvas.setStrokeColor(C_LIGHT_GREY)
            canvas.line(m, m - 0.25 * cm, m + w, m - 0.25 * cm)

        canvas.restoreState()

    def afterFlowable(self, flowable):
        """Track current article title for the running header."""
        if hasattr(flowable, "_wiki_article_title"):
            self._current_article = flowable._wiki_article_title
        # Feed article headings into the TOC
        if hasattr(flowable, "_toc_entry"):
            lvl, txt = flowable._toc_entry
            self.notify("TOCEntry", (lvl, txt, self.page))


class _ArticleMarker(Spacer):
    """Zero-height spacer that sets the running header title and TOC entry."""

    def __init__(self, title: str):
        super().__init__(0, 0)
        self._wiki_article_title = title
        self._toc_entry = (0, title)


# ─────────────────────────────────────────────────────────────────────────────
#  STORY BUILDERS
# ─────────────────────────────────────────────────────────────────────────────

def story_cover(category: str, n_articles: int, st: dict) -> list:
    """Return flowables for the full-page book cover."""
    els: list = [NextPageTemplate("cover"), PageBreak(), NextPageTemplate("normal")]
    els.append(Spacer(1, 3.5 * cm))

    # Eyebrow text
    cat_style = ParagraphStyle(
        "cov_eye", parent=st["cover_eyebrow"],
        textColor=C_ACCENT,
    )
    els.append(Paragraph("Wikipedia Category", cat_style))
    els.append(Spacer(1, 0.6 * cm))

    # Dynamic font size for the title (shorter names get bigger text)
    font_size = max(22, min(44, int(800 / len(category))))
    title_style = ParagraphStyle(
        "cov_dyn_title", parent=st["cover_title"],
        fontSize=font_size,
        leading=int(font_size * 1.2),
    )
    els.append(Paragraph(category, title_style))
    els.append(Spacer(1, 1.2 * cm))
    els.append(HRFlowable(width=6 * cm, thickness=3, color=C_ACCENT, hAlign="CENTER"))
    els.append(Spacer(1, 1.2 * cm))
    els.append(Paragraph(f"{n_articles} Articles", st["cover_subtitle"]))
    els.append(Spacer(1, 0.5 * cm))
    els.append(Paragraph("Generated from Wikipedia", st["cover_footnote"]))
    return els


def story_toc(toc: TableOfContents, st: dict) -> list:
    """Return flowables for the Table of Contents spread."""
    els: list = [PageBreak()]
    els.append(Paragraph("Table of Contents", st["toc_heading"]))
    els.append(HRFlowable(width="100%", thickness=1, color=C_LIGHT_GREY, spaceAfter=16))
    els.append(toc)
    return els


def story_article_title_page(
    title: str,
    extract: str,
    thumbnail_url: Optional[str],
    article_num: int,
    st: dict,
) -> list:
    """Return flowables for one article's title page."""
    els: list = [PageBreak()]

    # Meta badge
    els.append(Spacer(1, 2 * cm))
    els.append(Paragraph(f"Article {article_num}", st["art_num"]))
    els.append(Spacer(1, 0.4 * cm))

    # Title
    els.append(Paragraph(xml_escape(title), st["art_title"]))
    els.append(HRFlowable(width=8 * cm, thickness=2, color=C_ACCENT,
                          hAlign="CENTER", spaceAfter=14))

    # Stats
    meta_parts: list[str] = []
    if FEATURE_ARTICLE_WORD_COUNT:
        meta_parts.append(f"{word_count(extract):,} words")
    if FEATURE_READING_TIME_ESTIMATE:
        meta_parts.append(f"~{reading_time(extract)} min read")
    if meta_parts:
        els.append(Paragraph(" · ".join(meta_parts), st["art_meta"]))
        els.append(Spacer(1, 0.6 * cm))

    # First-sentence quote
    if FEATURE_FIRST_SENTENCE_QUOTE and extract:
        sentence = first_sentence(extract)
        if sentence:
            els.append(Paragraph(f'"{xml_escape(sentence)}"', st["art_quote"]))

    # Cover image
    if FEATURE_COVER_IMAGE_ON_TITLE_PAGE and thumbnail_url:
        img_data = download_image(thumbnail_url)
        if img_data:
            img = make_rl_image(img_data, BODY_W * 0.72, BODY_H * 0.38)
            if img:
                els.append(Spacer(1, 0.6 * cm))
                els.append(img)

    return els


def story_article_body(
    title: str,
    extract: str,
    description: str,
    image_urls: list[str],
    st: dict,
) -> list:
    """Return flowables for the article body text."""
    els: list = [PageBreak()]

    # Zero-height marker: sets running header and feeds the TOC
    els.append(_ArticleMarker(title))

    # Article H1 — large heading
    els.append(Paragraph(xml_escape(title), st["h1"]))
    els.append(HRFlowable(width="100%", thickness=0.5, color=C_LIGHT_GREY, spaceAfter=10))

    # Infobox / description summary
    if FEATURE_INFOBOX_SUMMARY and description:
        rows = [[
            Paragraph("Description", st["infobox_key"]),
            Paragraph(xml_escape(description.capitalize()), st["infobox_val"]),
        ]]
        tbl = Table(rows, colWidths=[3.5 * cm, BODY_W - 3.5 * cm])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), C_BG_TINT),
            ("BOX", (0, 0), (-1, -1), 0.5, C_LIGHT_GREY),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#dddddd")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        els.append(tbl)
        els.append(Spacer(1, 10))

    # Sections
    sections = split_sections(clean_wiki_text(extract))
    inline_count = 0
    img_idx = 0

    for heading, body in sections:
        # Skip back-matter sections unless requested
        if not FEATURE_ARTICLE_REFERENCES and heading.lower() in _SECTIONS_SKIP:
            continue

        if heading:
            els.append(Paragraph(xml_escape(heading), st["h2"]))

        # Inline image (float-right style by inserting before the paragraph)
        if (
            FEATURE_ARTICLE_IMAGES_INLINE
            and img_idx < len(image_urls)
            and inline_count < MAX_INLINE_IMAGES
        ):
            img_data = download_image(image_urls[img_idx])
            img_idx += 1
            if img_data:
                img = make_rl_image(img_data, BODY_W * 0.45, 7 * cm)
                if img:
                    img.hAlign = "RIGHT"
                    els.append(img)
                    inline_count += 1

        # Paragraphs
        for para_text in body.split("\n\n"):
            para_text = para_text.strip()
            if len(para_text) < 10:
                continue
            els.append(Paragraph(xml_escape(para_text), st["body"]))

    return els


def story_index(titles: list[str], st: dict) -> list:
    """Return flowables for the alphabetical article index."""
    els: list = [PageBreak()]
    els.append(Paragraph("Article Index", st["index_heading"]))
    els.append(HRFlowable(width="100%", thickness=1, color=C_LIGHT_GREY, spaceAfter=16))

    sorted_titles = sorted(titles, key=str.casefold)
    half = (len(sorted_titles) + 1) // 2
    left_col = sorted_titles[:half]
    right_col = sorted_titles[half:]

    col_w = (BODY_W - 0.5 * cm) / 2
    rows = []
    for i in range(half):
        l = Paragraph(f"• {xml_escape(left_col[i])}", st["index_entry"]) if i < len(left_col) else Paragraph("", st["index_entry"])
        r = Paragraph(f"• {xml_escape(right_col[i])}", st["index_entry"]) if i < len(right_col) else Paragraph("", st["index_entry"])
        rows.append([l, r])

    tbl = Table(rows, colWidths=[col_w, col_w])
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    els.append(tbl)
    return els


# ─────────────────────────────────────────────────────────────────────────────
#  MAIN GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

def generate(category: str, output: str, max_articles: int = MAX_ARTICLES):
    print(f"\n📚  Wikipedia PDF Book Generator")
    print(f"    Category : {category}")
    print(f"    Output   : {output}\n")

    # ── Fetch article list ────────────────────────────────────────────────────
    print("🔍  Fetching article list …")
    articles = fetch_category_members(category, recursive=FEATURE_RECURSIVE_SUBCATEGORIES)
    if not articles:
        sys.exit(
            f"No articles found in Wikipedia category '{category}'.\n"
            "Check the spelling — category names are case-sensitive.\n"
            "Example: 'Planets of the Solar System'"
        )

    if max_articles and len(articles) > max_articles:
        print(f"    Capping at {max_articles} of {len(articles)} articles.")
        articles = articles[:max_articles]
    else:
        print(f"    Found {len(articles)} articles.")
    print()

    st = build_styles()

    # ── Create document ───────────────────────────────────────────────────────
    doc = BookDoc(
        output,
        category=category,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN + HEADER_H,
        bottomMargin=MARGIN + FOOTER_H,
        title=f"{category} — Wikipedia Book",
        author="Wikipedia PDF Book Generator",
        subject=f"Wikipedia articles from category: {category}",
    )

    story: list = []

    # ── Cover page ────────────────────────────────────────────────────────────
    if FEATURE_BOOK_COVER_PAGE:
        story.extend(story_cover(category, len(articles), st))

    # ── Table of contents ─────────────────────────────────────────────────────
    toc = None
    if FEATURE_TABLE_OF_CONTENTS:
        toc = TableOfContents()
        toc.levelStyles = [
            ParagraphStyle(
                "TOC0",
                fontSize=11, leading=18,
                textColor=C_DARK, fontName="Helvetica",
                leftIndent=0, firstLineIndent=0,
            )
        ]
        toc.dotsMinLevel = 0
        story.extend(story_toc(toc, st))

    # ── Articles ──────────────────────────────────────────────────────────────
    all_titles: list[str] = []
    for idx, art in enumerate(articles, start=1):
        title = art["title"]
        all_titles.append(title)
        print(f"  [{idx:3}/{len(articles)}] {title}")

        # Data fetching
        summary = fetch_summary(title)
        extract = summary.get("extract") or fetch_full_extract(title)
        description = summary.get("description", "")
        thumbnail_url: Optional[str] = None
        if summary.get("thumbnail"):
            thumbnail_url = summary["thumbnail"].get("source")

        # Inline image URLs (exclude the thumbnail so we don't show it twice)
        image_urls: list[str] = []
        if FEATURE_ARTICLE_IMAGES_INLINE:
            image_urls = fetch_image_urls(title, limit=MAX_INLINE_IMAGES + 2)
            if thumbnail_url:
                image_urls = [u for u in image_urls if u != thumbnail_url]

        # Title page
        if FEATURE_ARTICLE_TITLE_PAGES:
            story.extend(story_article_title_page(title, extract, thumbnail_url, idx, st))

        # Body
        story.extend(story_article_body(title, extract, description, image_urls, st))

    # ── Index ─────────────────────────────────────────────────────────────────
    if FEATURE_CATEGORY_INDEX_PAGE:
        story.extend(story_index(all_titles, st))

    # ── Render PDF ────────────────────────────────────────────────────────────
    print(f"\n📄  Building PDF …")
    doc.multiBuild(story)
    print(f"✅  Saved: {output}\n")


# ─────────────────────────────────────────────────────────────────────────────
#  CLI
# ─────────────────────────────────────────────────────────────────────────────

def _parse_args():
    p = argparse.ArgumentParser(
        prog="wiki_pdf_book",
        description="Generate a book-like PDF from a Wikipedia category.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python wiki_pdf_book.py 'Planets of the Solar System'\n"
            "  python wiki_pdf_book.py 'Nobel laureates in Physics' laureates.pdf\n"
            "  python wiki_pdf_book.py 'Classical composers' --max-articles 15 --recursive\n"
            "  python wiki_pdf_book.py 'Dogs' dogs.pdf --no-images\n"
        ),
    )
    p.add_argument(
        "category",
        help='Wikipedia category name, e.g. "Planets of the Solar System"',
    )
    p.add_argument(
        "output",
        nargs="?",
        help='Output PDF path (default: <category>.pdf)',
    )
    p.add_argument(
        "--max-articles", type=int, default=MAX_ARTICLES, metavar="N",
        help=f"Max articles to include (default {MAX_ARTICLES}, 0=unlimited)",
    )
    p.add_argument(
        "--recursive", action="store_true",
        help="Also include articles from subcategories",
    )
    p.add_argument(
        "--no-images", action="store_true",
        help="Skip all image downloads (much faster)",
    )
    p.add_argument(
        "--no-toc", action="store_true",
        help="Omit table of contents",
    )
    p.add_argument(
        "--no-cover", action="store_true",
        help="Omit book cover page",
    )
    p.add_argument(
        "--no-title-pages", action="store_true",
        help="Omit per-article title pages",
    )
    p.add_argument(
        "--with-references", action="store_true",
        help="Include References / See Also sections",
    )
    return p.parse_args()


def main():
    args = _parse_args()

    # Apply CLI overrides to the global feature flags
    global FEATURE_RECURSIVE_SUBCATEGORIES
    global FEATURE_COVER_IMAGE_ON_TITLE_PAGE, FEATURE_ARTICLE_IMAGES_INLINE
    global FEATURE_TABLE_OF_CONTENTS, FEATURE_BOOK_COVER_PAGE
    global FEATURE_ARTICLE_TITLE_PAGES, FEATURE_ARTICLE_REFERENCES

    if args.recursive:
        FEATURE_RECURSIVE_SUBCATEGORIES = True
    if args.no_images:
        FEATURE_COVER_IMAGE_ON_TITLE_PAGE = False
        FEATURE_ARTICLE_IMAGES_INLINE = False
    if args.no_toc:
        FEATURE_TABLE_OF_CONTENTS = False
    if args.no_cover:
        FEATURE_BOOK_COVER_PAGE = False
    if args.no_title_pages:
        FEATURE_ARTICLE_TITLE_PAGES = False
    if args.with_references:
        FEATURE_ARTICLE_REFERENCES = True

    if args.output:
        output = args.output
    else:
        safe = re.sub(r"[^\w\s-]", "", args.category).strip().replace(" ", "_")
        output = f"{safe}.pdf"

    generate(args.category, output, max_articles=args.max_articles)


if __name__ == "__main__":
    main()
