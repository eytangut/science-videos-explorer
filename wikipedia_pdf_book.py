#!/usr/bin/env python3
"""
Wikipedia Category PDF Book Generator
======================================
Generates a book-like PDF from all articles in a Wikipedia category.

Usage:
    python wikipedia_pdf_book.py "Category Name" [output.pdf]

Examples:
    python wikipedia_pdf_book.py "Planets of the Solar System"
    python wikipedia_pdf_book.py "Nobel laureates in Physics" physics_laureates.pdf
    python wikipedia_pdf_book.py "Classical composers" --max-articles 20

Requirements:
    pip install reportlab Pillow requests
"""

import argparse
import io
import os
import re
import sys
import time
import textwrap
import urllib.parse
from typing import Optional

import requests
from PIL import Image
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    BaseDocTemplate,
    FrameBreak,
    HRFlowable,
    Image as RLImage,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Frame


# ─────────────────────────────────────────────────────────
#  TOGGLEABLE FEATURE FLAGS
#  Set any of these to False to disable the feature.
# ─────────────────────────────────────────────────────────

FEATURE_BOOK_COVER_PAGE = True
"""Show a full cover page for the book with the category name."""

FEATURE_TABLE_OF_CONTENTS = True
"""Include a table of contents after the cover page."""

FEATURE_ARTICLE_TITLE_PAGES = True
"""Add a dedicated title page before each article."""

FEATURE_FIRST_SENTENCE_QUOTE = True
"""Display the first sentence of the article as a large quote on the title page."""

FEATURE_COVER_IMAGES_ON_TITLE_PAGE = True
"""Fetch and display the article's main image on its title page."""

FEATURE_PAGE_NUMBERS = True
"""Print page numbers in the footer of every page."""

FEATURE_RECURSIVE_SUBCATEGORIES = False
"""Also include articles from subcategories (one level deep)."""

FEATURE_ARTICLE_IMAGES_INLINE = True
"""Embed inline images from the article body (up to MAX_INLINE_IMAGES per article)."""

FEATURE_READING_TIME_ESTIMATE = True
"""Show estimated reading time (at 200 wpm) on the article title page."""

FEATURE_INFOBOX_SUMMARY = True
"""Extract and display key infobox fields at the start of each article."""

FEATURE_ARTICLE_REFERENCES = False
"""Include the references/footnotes section at the end of each article."""

FEATURE_CATEGORY_INDEX_PAGE = True
"""Add an alphabetical index of all article titles at the end of the book."""

FEATURE_ARTICLE_WORD_COUNT = True
"""Show article word count on the title page."""

FEATURE_RUNNING_HEADERS = True
"""Show the current article title in a running header on body pages."""

# ─────────────────────────────────────────────────────────
#  CONFIGURATION
# ─────────────────────────────────────────────────────────

MAX_ARTICLES = 50
"""Maximum number of articles to include (set to 0 for unlimited)."""

MAX_INLINE_IMAGES = 2
"""Maximum number of inline article images per article."""

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
REQUEST_DELAY = 0.5
"""Seconds to wait between Wikipedia API requests (be polite)."""

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 2.5 * cm

# ─────────────────────────────────────────────────────────
#  WIKIPEDIA API HELPERS
# ─────────────────────────────────────────────────────────

def _api_get(params: dict) -> dict:
    """Make a GET request to the Wikipedia API."""
    params.setdefault("format", "json")
    params.setdefault("utf8", 1)
    params.setdefault("formatversion", 2)
    headers = {"User-Agent": "WikiPDFBook/1.0 (github.com/eytangut/science-videos-explorer)"}
    resp = requests.get(WIKIPEDIA_API, params=params, headers=headers, timeout=15)
    resp.raise_for_status()
    time.sleep(REQUEST_DELAY)
    return resp.json()


def fetch_category_members(category: str, recursive: bool = False) -> list[dict]:
    """Return list of article page dicts (title, pageid) for a category."""
    pages = []
    cmtitle = category if category.lower().startswith("category:") else f"Category:{category}"
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": cmtitle,
        "cmlimit": "500",
        "cmtype": "page|subcat",
    }
    while True:
        data = _api_get(params)
        members = data.get("query", {}).get("categorymembers", [])
        for m in members:
            if m.get("ns") == 0:  # article namespace
                pages.append({"title": m["title"], "pageid": m["pageid"]})
            elif recursive and m.get("ns") == 14:  # subcategory namespace
                sub_title = m["title"]
                print(f"  → Fetching subcategory: {sub_title}")
                sub_pages = fetch_category_members(sub_title, recursive=False)
                pages.extend(sub_pages)
        cont = data.get("continue", {})
        if "cmcontinue" not in cont:
            break
        params["cmcontinue"] = cont["cmcontinue"]
    # deduplicate by pageid
    seen = set()
    unique = []
    for p in pages:
        if p["pageid"] not in seen:
            seen.add(p["pageid"])
            unique.append(p)
    return unique


def fetch_article_extract(title: str) -> str:
    """Return the plain-text extract (article body) for a page title."""
    data = _api_get({
        "action": "query",
        "titles": title,
        "prop": "extracts",
        "explaintext": True,
        "exlimit": 1,
    })
    pages = data.get("query", {}).get("pages", [])
    if pages:
        return pages[0].get("extract", "")
    return ""


def fetch_article_summary(title: str) -> dict:
    """Return summary dict {extract, description, thumbnail} via REST summary API."""
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(title)}"
    headers = {"User-Agent": "WikiPDFBook/1.0"}
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        time.sleep(REQUEST_DELAY)
        return resp.json()
    except Exception:
        return {}


def fetch_page_images(title: str, limit: int = 6) -> list[str]:
    """Return URLs of images used in the article (filtered to relevant formats)."""
    data = _api_get({
        "action": "query",
        "titles": title,
        "prop": "images",
        "imlimit": str(limit * 3),
    })
    pages = data.get("query", {}).get("pages", [])
    if not pages:
        return []
    image_titles = [img["title"] for img in pages[0].get("images", [])]
    # Filter out icons, flags, commons-logo, etc.
    skip_keywords = ("icon", "flag", "logo", "commons", "wikimedia", "edit", "question", "stub",
                     "wikidata", "wiktionary", "portal", "padlock", "map_", "map_stub")
    image_titles = [
        t for t in image_titles
        if t.lower().endswith((".jpg", ".jpeg", ".png", ".gif"))
        and not any(kw in t.lower() for kw in skip_keywords)
    ][:limit]
    if not image_titles:
        return []
    # Resolve to actual URLs
    data2 = _api_get({
        "action": "query",
        "titles": "|".join(image_titles),
        "prop": "imageinfo",
        "iiprop": "url",
        "iiurlwidth": "800",
    })
    urls = []
    for page in data2.get("query", {}).get("pages", []):
        info = page.get("imageinfo", [])
        if info and "thumburl" in info[0]:
            urls.append(info[0]["thumburl"])
        elif info and "url" in info[0]:
            urls.append(info[0]["url"])
    return urls


def fetch_infobox_data(title: str) -> dict:
    """Extract key-value pairs from a page infobox via the Wikidata REST API."""
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(title)}"
    headers = {"User-Agent": "WikiPDFBook/1.0"}
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        time.sleep(REQUEST_DELAY)
        result = {}
        if data.get("description"):
            result["Description"] = data["description"].capitalize()
        return result
    except Exception:
        return {}


def download_image(url: str, max_bytes: int = 5_000_000) -> Optional[bytes]:
    """Download an image and return raw bytes, or None on error."""
    try:
        headers = {"User-Agent": "WikiPDFBook/1.0"}
        resp = requests.get(url, headers=headers, timeout=20, stream=True)
        resp.raise_for_status()
        content = b""
        for chunk in resp.iter_content(8192):
            content += chunk
            if len(content) > max_bytes:
                return None
        # Verify it's a valid image
        Image.open(io.BytesIO(content)).verify()
        return content
    except Exception:
        return None


# ─────────────────────────────────────────────────────────
#  TEXT HELPERS
# ─────────────────────────────────────────────────────────

def first_sentence(text: str) -> str:
    """Return the first non-trivial sentence from a text block."""
    if not text:
        return ""
    # Split on sentence-ending punctuation followed by whitespace or end
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    for s in sentences:
        s = s.strip()
        if len(s) > 20 and not s.startswith("=="):
            return s
    return sentences[0].strip() if sentences else ""


def clean_text(text: str) -> str:
    """Remove wiki markup remnants and normalise whitespace."""
    # Remove section headers
    text = re.sub(r'==+\s*[^=]+\s*==+', '', text)
    # Remove references like [1], [citation needed]
    text = re.sub(r'\[\d+\]', '', text)
    text = re.sub(r'\[citation needed\]', '', text, flags=re.IGNORECASE)
    # Remove curly brace templates
    text = re.sub(r'\{\{[^}]*\}\}', '', text)
    # Normalise whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()
    return text


def word_count(text: str) -> int:
    return len(text.split())


def reading_time_minutes(text: str, wpm: int = 200) -> int:
    return max(1, round(word_count(text) / wpm))


def split_into_sections(text: str) -> list[tuple[str, str]]:
    """Split article extract into (heading, body) tuples."""
    parts = re.split(r'\n(==+\s*.+?\s*==+)\n', text)
    sections = []
    # First section has no heading (intro)
    intro_body = parts[0].strip()
    if intro_body:
        sections.append(("", intro_body))
    i = 1
    while i + 1 < len(parts):
        heading_raw = parts[i]
        body = parts[i + 1].strip()
        # Strip == markers and count depth
        depth = len(re.match(r'^(=+)', heading_raw).group(1))
        heading = heading_raw.strip("= ").strip()
        sections.append((heading, body))
        i += 2
    return sections


# ─────────────────────────────────────────────────────────
#  PDF BUILDING BLOCKS
# ─────────────────────────────────────────────────────────

def make_styles():
    """Return a dict of custom ParagraphStyle objects."""
    base = getSampleStyleSheet()
    s = {}

    s["body"] = ParagraphStyle(
        "body",
        parent=base["Normal"],
        fontSize=10.5,
        leading=16,
        alignment=TA_JUSTIFY,
        spaceAfter=8,
    )
    s["h1"] = ParagraphStyle(
        "h1",
        parent=base["Heading1"],
        fontSize=22,
        leading=28,
        textColor=colors.HexColor("#1a1a2e"),
        spaceBefore=14,
        spaceAfter=8,
        fontName="Helvetica-Bold",
    )
    s["h2"] = ParagraphStyle(
        "h2",
        parent=base["Heading2"],
        fontSize=16,
        leading=22,
        textColor=colors.HexColor("#16213e"),
        spaceBefore=12,
        spaceAfter=6,
        fontName="Helvetica-Bold",
    )
    s["h3"] = ParagraphStyle(
        "h3",
        parent=base["Heading3"],
        fontSize=13,
        leading=18,
        textColor=colors.HexColor("#0f3460"),
        spaceBefore=10,
        spaceAfter=4,
        fontName="Helvetica-Bold",
    )
    s["quote"] = ParagraphStyle(
        "quote",
        parent=base["Normal"],
        fontSize=15,
        leading=22,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#333355"),
        fontName="Helvetica-Oblique",
        leftIndent=30,
        rightIndent=30,
        spaceAfter=20,
        spaceBefore=20,
    )
    s["cover_title"] = ParagraphStyle(
        "cover_title",
        parent=base["Normal"],
        fontSize=42,
        leading=52,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#1a1a2e"),
        fontName="Helvetica-Bold",
        spaceAfter=20,
    )
    s["cover_subtitle"] = ParagraphStyle(
        "cover_subtitle",
        parent=base["Normal"],
        fontSize=18,
        leading=24,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#444466"),
        fontName="Helvetica",
    )
    s["article_title"] = ParagraphStyle(
        "article_title",
        parent=base["Normal"],
        fontSize=32,
        leading=40,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#1a1a2e"),
        fontName="Helvetica-Bold",
        spaceBefore=0,
        spaceAfter=12,
    )
    s["meta"] = ParagraphStyle(
        "meta",
        parent=base["Normal"],
        fontSize=10,
        leading=14,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#888888"),
        fontName="Helvetica",
        spaceAfter=8,
    )
    s["infobox_key"] = ParagraphStyle(
        "infobox_key",
        parent=base["Normal"],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#444444"),
        fontName="Helvetica-Bold",
    )
    s["infobox_val"] = ParagraphStyle(
        "infobox_val",
        parent=base["Normal"],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#222222"),
        fontName="Helvetica",
    )
    s["toc_title"] = ParagraphStyle(
        "toc_title",
        parent=base["Normal"],
        fontSize=28,
        leading=36,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#1a1a2e"),
        fontName="Helvetica-Bold",
        spaceAfter=30,
    )
    s["toc_entry"] = ParagraphStyle(
        "toc_entry",
        parent=base["Normal"],
        fontSize=11,
        leading=18,
        textColor=colors.HexColor("#222244"),
        fontName="Helvetica",
        leftIndent=0,
    )
    s["index_title"] = ParagraphStyle(
        "index_title",
        parent=base["Normal"],
        fontSize=28,
        leading=36,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#1a1a2e"),
        fontName="Helvetica-Bold",
        spaceAfter=30,
    )
    s["index_entry"] = ParagraphStyle(
        "index_entry",
        parent=base["Normal"],
        fontSize=10,
        leading=16,
        textColor=colors.HexColor("#333333"),
        fontName="Helvetica",
    )
    s["caption"] = ParagraphStyle(
        "caption",
        parent=base["Normal"],
        fontSize=8.5,
        leading=12,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#666666"),
        fontName="Helvetica-Oblique",
        spaceAfter=12,
    )
    s["header"] = ParagraphStyle(
        "header",
        parent=base["Normal"],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#aaaaaa"),
        fontName="Helvetica",
    )
    s["footer"] = ParagraphStyle(
        "footer",
        parent=base["Normal"],
        fontSize=8,
        leading=10,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#aaaaaa"),
        fontName="Helvetica",
    )
    return s


def rl_image_from_bytes(data: bytes, max_width: float, max_height: float) -> Optional[RLImage]:
    """Create a ReportLab Image object from raw bytes, scaled to fit."""
    try:
        pil_img = Image.open(io.BytesIO(data))
        pil_img = pil_img.convert("RGB")
        w, h = pil_img.size
        ratio = min(max_width / w, max_height / h)
        new_w = w * ratio
        new_h = h * ratio
        buf = io.BytesIO()
        pil_img.save(buf, format="JPEG", quality=85)
        buf.seek(0)
        img = RLImage(buf, width=new_w, height=new_h)
        img.hAlign = "CENTER"
        return img
    except Exception:
        return None


# ─────────────────────────────────────────────────────────
#  CUSTOM DOCUMENT WITH HEADERS / FOOTERS
# ─────────────────────────────────────────────────────────

class BookDocTemplate(BaseDocTemplate):
    """BaseDocTemplate with running headers and footers."""

    def __init__(self, filename, category_name: str, **kwargs):
        self.category_name = category_name
        self.current_article_title = ""
        super().__init__(filename, **kwargs)
        self._build_page_templates()

    def _build_page_templates(self):
        margin = MARGIN
        w = PAGE_WIDTH - 2 * margin
        h = PAGE_HEIGHT - 2 * margin
        header_h = 0.8 * cm
        footer_h = 0.8 * cm
        body_h = h - header_h - footer_h - 0.4 * cm

        body_frame = Frame(
            margin, margin + footer_h + 0.2 * cm,
            w, body_h,
            id="body",
            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        )
        cover_frame = Frame(
            margin, margin,
            w, h,
            id="cover",
            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        )

        self.addPageTemplates([
            PageTemplate(id="cover", frames=[cover_frame], onPage=self._on_cover_page),
            PageTemplate(id="normal", frames=[body_frame], onPage=self._on_normal_page),
        ])

    def _on_cover_page(self, canvas, doc):
        canvas.saveState()
        # Background gradient-like rectangle
        canvas.setFillColor(colors.HexColor("#1a1a2e"))
        canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
        canvas.restoreState()

    def _on_normal_page(self, canvas, doc):
        canvas.saveState()
        margin = MARGIN
        w = PAGE_WIDTH - 2 * margin

        if FEATURE_RUNNING_HEADERS and self.current_article_title:
            canvas.setFont("Helvetica", 8)
            canvas.setFillColor(colors.HexColor("#aaaaaa"))
            canvas.drawString(margin, PAGE_HEIGHT - margin + 0.3 * cm,
                              self.current_article_title)
            canvas.drawRightString(margin + w, PAGE_HEIGHT - margin + 0.3 * cm,
                                   self.category_name)
            canvas.setStrokeColor(colors.HexColor("#dddddd"))
            canvas.line(margin, PAGE_HEIGHT - margin + 0.15 * cm,
                        margin + w, PAGE_HEIGHT - margin + 0.15 * cm)

        if FEATURE_PAGE_NUMBERS:
            canvas.setFont("Helvetica", 8)
            canvas.setFillColor(colors.HexColor("#aaaaaa"))
            page_str = f"— {doc.page} —"
            canvas.drawCentredString(PAGE_WIDTH / 2, margin - 0.45 * cm, page_str)
            canvas.setStrokeColor(colors.HexColor("#dddddd"))
            canvas.line(margin, margin - 0.2 * cm,
                        margin + w, margin - 0.2 * cm)

        canvas.restoreState()

    def afterFlowable(self, flowable):
        """Track current article title for running headers."""
        if hasattr(flowable, "_articleTitle"):
            self.current_article_title = flowable._articleTitle


class _TitleTracker(Spacer):
    """Zero-height spacer that carries the article title for running headers."""
    def __init__(self, title: str):
        super().__init__(0, 0)
        self._articleTitle = title


# ─────────────────────────────────────────────────────────
#  PDF CONTENT BUILDERS
# ─────────────────────────────────────────────────────────

def build_cover_page(story: list, category: str, article_count: int, styles: dict):
    """Add the book cover page to the story."""
    story.append(NextPageTemplate("cover"))
    story.append(PageBreak())
    story.append(NextPageTemplate("normal"))

    w = PAGE_WIDTH - 2 * MARGIN

    # Spacer to push content down
    story.append(Spacer(1, 4 * cm))

    # Category label in lighter colour
    cat_para = Paragraph(
        f'<font color="#e94560" size="13">Wikipedia Category</font>',
        styles["cover_subtitle"]
    )
    cat_para.hAlign = "CENTER"
    story.append(cat_para)
    story.append(Spacer(1, 0.5 * cm))

    # Main title — white on dark background
    title_style = ParagraphStyle(
        "cover_main_title",
        parent=styles["cover_title"],
        textColor=colors.white,
        fontSize=min(42, max(24, 400 // max(len(category), 1))),
        leading=min(52, max(32, 480 // max(len(category), 1))),
    )
    story.append(Paragraph(category, title_style))
    story.append(Spacer(1, 1.5 * cm))

    # Divider bar
    story.append(HRFlowable(width=6 * cm, thickness=3,
                             color=colors.HexColor("#e94560"), hAlign="CENTER"))
    story.append(Spacer(1, 1.5 * cm))

    # Article count
    count_style = ParagraphStyle(
        "cover_count",
        parent=styles["cover_subtitle"],
        textColor=colors.HexColor("#cccccc"),
        fontSize=14,
    )
    story.append(Paragraph(f"{article_count} Articles", count_style))
    story.append(Spacer(1, 0.4 * cm))

    # Generated with
    gen_style = ParagraphStyle(
        "cover_gen",
        parent=styles["cover_subtitle"],
        textColor=colors.HexColor("#888888"),
        fontSize=10,
    )
    story.append(Paragraph("Generated from Wikipedia", gen_style))


def build_toc_page(story: list, toc: TableOfContents, styles: dict):
    """Add the table of contents page."""
    story.append(PageBreak())
    story.append(Paragraph("Table of Contents", styles["toc_title"]))
    story.append(HRFlowable(width="100%", thickness=1,
                             color=colors.HexColor("#cccccc"), spaceAfter=12))
    story.append(toc)


def build_article_title_page(
    story: list,
    title: str,
    extract: str,
    thumbnail_url: Optional[str],
    styles: dict,
    article_num: int,
):
    """Add a title page for a single article."""
    story.append(PageBreak())
    # Tracker for running headers
    story.append(_TitleTracker(title))

    content_w = PAGE_WIDTH - 2 * MARGIN
    content_h = PAGE_HEIGHT - 2 * MARGIN - 1.6 * cm  # room for header/footer

    story.append(Spacer(1, 2 * cm))

    # Article number badge
    num_style = ParagraphStyle(
        "article_num",
        parent=styles["meta"],
        textColor=colors.HexColor("#e94560"),
        fontSize=11,
        fontName="Helvetica-Bold",
    )
    story.append(Paragraph(f"Article {article_num}", num_style))
    story.append(Spacer(1, 0.4 * cm))

    # Title
    story.append(Paragraph(title, styles["article_title"]))

    # Decorative line
    story.append(HRFlowable(width=8 * cm, thickness=2,
                             color=colors.HexColor("#e94560"), hAlign="CENTER", spaceAfter=16))

    # Meta info line
    meta_parts = []
    if FEATURE_WORD_COUNT := FEATURE_ARTICLE_WORD_COUNT:
        wc = word_count(extract)
        meta_parts.append(f"{wc:,} words")
    if FEATURE_READING_TIME_ESTIMATE:
        rt = reading_time_minutes(extract)
        meta_parts.append(f"~{rt} min read")
    if meta_parts:
        story.append(Paragraph(" · ".join(meta_parts), styles["meta"]))
        story.append(Spacer(1, 0.6 * cm))

    # First sentence as quote
    if FEATURE_FIRST_SENTENCE_QUOTE and extract:
        sentence = first_sentence(extract)
        if sentence:
            story.append(Paragraph(f'"{sentence}"', styles["quote"]))

    # Cover image
    if FEATURE_COVER_IMAGES_ON_TITLE_PAGE and thumbnail_url:
        img_data = download_image(thumbnail_url)
        if img_data:
            max_img_w = content_w * 0.75
            max_img_h = content_h * 0.35
            img = rl_image_from_bytes(img_data, max_img_w, max_img_h)
            if img:
                img.hAlign = "CENTER"
                story.append(Spacer(1, 0.5 * cm))
                story.append(img)


def build_article_body(
    story: list,
    title: str,
    extract: str,
    infobox: dict,
    image_urls: list[str],
    styles: dict,
):
    """Add the main body content of an article."""
    story.append(PageBreak())
    story.append(_TitleTracker(title))

    # Article heading (used for TOC)
    h = Paragraph(title, styles["h1"])
    h._bookmarkName = f"article_{hash(title)}"
    story.append(h)
    story.append(HRFlowable(width="100%", thickness=0.5,
                             color=colors.HexColor("#cccccc"), spaceAfter=10))

    # Infobox
    if FEATURE_INFOBOX_SUMMARY and infobox:
        rows = []
        for k, v in list(infobox.items())[:6]:
            rows.append([
                Paragraph(k, styles["infobox_key"]),
                Paragraph(str(v), styles["infobox_val"]),
            ])
        if rows:
            tbl = Table(rows, colWidths=[4 * cm, PAGE_WIDTH - 2 * MARGIN - 4 * cm])
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f5f5fa")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#dddddd")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]))
            story.append(tbl)
            story.append(Spacer(1, 12))

    # Body text — split into sections
    sections = split_into_sections(clean_text(extract))
    image_idx = 0
    inline_img_count = 0

    for heading, body in sections:
        # Skip references section if not wanted
        if not FEATURE_ARTICLE_REFERENCES and heading.lower() in (
            "references", "notes", "further reading", "external links",
            "bibliography", "see also", "citations"
        ):
            continue

        if heading:
            story.append(Paragraph(heading, styles["h2"]))

        # Insert an inline image every ~2 sections if available
        if (
            FEATURE_ARTICLE_IMAGES_INLINE
            and image_urls
            and image_idx < len(image_urls)
            and inline_img_count < MAX_INLINE_IMAGES
        ):
            img_data = download_image(image_urls[image_idx])
            if img_data:
                content_w = PAGE_WIDTH - 2 * MARGIN
                img = rl_image_from_bytes(img_data, content_w * 0.55, 8 * cm)
                if img:
                    img.hAlign = "RIGHT"
                    story.append(img)
                    inline_img_count += 1
            image_idx += 1

        # Paragraphs
        for para in body.split("\n\n"):
            para = para.strip()
            if not para or len(para) < 10:
                continue
            # Escape XML special chars
            para = para.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            story.append(Paragraph(para, styles["body"]))


def build_index_page(story: list, articles: list[str], styles: dict):
    """Add an alphabetical index of article titles."""
    story.append(PageBreak())
    story.append(Paragraph("Article Index", styles["index_title"]))
    story.append(HRFlowable(width="100%", thickness=1,
                             color=colors.HexColor("#cccccc"), spaceAfter=16))

    sorted_articles = sorted(articles, key=lambda t: t.lower())

    # Split into 2 columns
    half = (len(sorted_articles) + 1) // 2
    col1 = sorted_articles[:half]
    col2 = sorted_articles[half:]

    rows = []
    for i in range(half):
        left = Paragraph(f"• {col1[i]}", styles["index_entry"]) if i < len(col1) else Paragraph("", styles["index_entry"])
        right = Paragraph(f"• {col2[i]}", styles["index_entry"]) if i < len(col2) else Paragraph("", styles["index_entry"])
        rows.append([left, right])

    col_w = (PAGE_WIDTH - 2 * MARGIN - 0.5 * cm) / 2
    tbl = Table(rows, colWidths=[col_w, col_w])
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    story.append(tbl)


# ─────────────────────────────────────────────────────────
#  MAIN ENTRY POINT
# ─────────────────────────────────────────────────────────

def generate_pdf(category: str, output_path: str, max_articles: int = MAX_ARTICLES):
    """Fetch articles from a Wikipedia category and build the PDF."""
    print(f"\n📚 Wikipedia PDF Book Generator")
    print(f"   Category : {category}")
    print(f"   Output   : {output_path}")
    print()

    # ── 1. Fetch article list ──────────────────────────────
    print("🔍 Fetching article list from Wikipedia...")
    articles = fetch_category_members(
        category,
        recursive=FEATURE_RECURSIVE_SUBCATEGORIES,
    )
    if not articles:
        print(f"❌ No articles found in category '{category}'. "
              "Check the spelling (case-sensitive).")
        sys.exit(1)

    if max_articles and len(articles) > max_articles:
        print(f"   Limiting to first {max_articles} of {len(articles)} articles.")
        articles = articles[:max_articles]
    else:
        print(f"   Found {len(articles)} articles.")
    print()

    styles = make_styles()

    # ── 2. Set up document ────────────────────────────────
    doc = BookDocTemplate(
        output_path,
        category_name=category,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN + 0.8 * cm,
        bottomMargin=MARGIN + 0.8 * cm,
        title=f"{category} — Wikipedia Book",
        author="Wikipedia PDF Book Generator",
        subject=f"Wikipedia articles from category: {category}",
    )

    story = []

    # ── 3. Cover page ─────────────────────────────────────
    if FEATURE_BOOK_COVER_PAGE:
        build_cover_page(story, category, len(articles), styles)

    # ── 4. TOC placeholder ────────────────────────────────
    toc = None
    if FEATURE_TABLE_OF_CONTENTS:
        toc = TableOfContents()
        toc.levelStyles = [
            ParagraphStyle(
                "TOCHeading1",
                fontSize=11,
                leading=18,
                leftIndent=0,
                firstLineIndent=0,
                textColor=colors.HexColor("#1a1a2e"),
                fontName="Helvetica",
            )
        ]
        toc.dotsMinLevel = 0
        build_toc_page(story, toc, styles)

    # ── 5. Articles ───────────────────────────────────────
    all_titles = []
    for idx, article in enumerate(articles, start=1):
        title = article["title"]
        all_titles.append(title)
        print(f"[{idx:3}/{len(articles)}] {title}")

        # Fetch data
        summary = fetch_article_summary(title)
        extract = summary.get("extract", "") or fetch_article_extract(title)
        thumbnail_url = None
        if summary.get("thumbnail"):
            thumbnail_url = summary["thumbnail"].get("source")
        infobox = fetch_infobox_data(title) if FEATURE_INFOBOX_SUMMARY else {}
        image_urls = []
        if FEATURE_ARTICLE_IMAGES_INLINE:
            image_urls = fetch_page_images(title, limit=MAX_INLINE_IMAGES + 1)
            # Remove thumbnail from inline images to avoid duplication
            if thumbnail_url:
                image_urls = [u for u in image_urls if u != thumbnail_url]

        # Article title page
        if FEATURE_ARTICLE_TITLE_PAGES:
            build_article_title_page(
                story, title, extract, thumbnail_url, styles, idx
            )

        # Article body — H1 is used as a TOC entry
        h1 = Paragraph(
            f'<a name="article_{hash(title)}"/>{title}',
            styles["h1"]
        )
        h1._bookmarkName = f"art_{idx}"
        # We'll build the body inline
        build_article_body(story, title, extract, infobox, image_urls, styles)

    # ── 6. Index page ─────────────────────────────────────
    if FEATURE_CATEGORY_INDEX_PAGE:
        build_index_page(story, all_titles, styles)

    # ── 7. Build PDF ──────────────────────────────────────
    print("\n📄 Building PDF...")

    def _on_create_toc(_, doc2):
        pass

    doc.multiBuild(story)
    print(f"✅ PDF saved to: {output_path}")
    return output_path


# ─────────────────────────────────────────────────────────
#  CLI
# ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate a book-like PDF from a Wikipedia category.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "category",
        help='Wikipedia category name (e.g. "Planets of the Solar System")',
    )
    parser.add_argument(
        "output",
        nargs="?",
        help="Output PDF filename (default: <category>.pdf)",
    )
    parser.add_argument(
        "--max-articles",
        type=int,
        default=MAX_ARTICLES,
        metavar="N",
        help=f"Maximum number of articles to include (default: {MAX_ARTICLES}, 0=unlimited)",
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        default=FEATURE_RECURSIVE_SUBCATEGORIES,
        help="Also include articles from subcategories",
    )
    parser.add_argument(
        "--no-images",
        action="store_true",
        help="Disable all image downloading (faster)",
    )
    parser.add_argument(
        "--no-toc",
        action="store_true",
        help="Disable table of contents",
    )
    parser.add_argument(
        "--no-cover",
        action="store_true",
        help="Disable book cover page",
    )
    args = parser.parse_args()

    # Apply CLI overrides to global flags
    global FEATURE_RECURSIVE_SUBCATEGORIES, FEATURE_COVER_IMAGES_ON_TITLE_PAGE
    global FEATURE_ARTICLE_IMAGES_INLINE, FEATURE_TABLE_OF_CONTENTS
    global FEATURE_BOOK_COVER_PAGE

    if args.recursive:
        FEATURE_RECURSIVE_SUBCATEGORIES = True
    if args.no_images:
        FEATURE_COVER_IMAGES_ON_TITLE_PAGE = False
        FEATURE_ARTICLE_IMAGES_INLINE = False
    if args.no_toc:
        FEATURE_TABLE_OF_CONTENTS = False
    if args.no_cover:
        FEATURE_BOOK_COVER_PAGE = False

    # Determine output path
    if args.output:
        output_path = args.output
    else:
        safe_name = re.sub(r'[^\w\s-]', '', args.category).strip().replace(" ", "_")
        output_path = f"{safe_name}.pdf"

    generate_pdf(args.category, output_path, max_articles=args.max_articles)


if __name__ == "__main__":
    main()
