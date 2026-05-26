from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DASHBOARD_DIR = ROOT / "dashboard"
STOCKS_JS = DASHBOARD_DIR / "data" / "stocks.js"
OUTPUT_JS = DASHBOARD_DIR / "data" / "stock-details.js"


def extract_stocks_js_paths(text: str) -> list[tuple[str, str]]:
    pattern = re.compile(r'ticker: "([^"]+)"[\s\S]*?notePath: "([^"]+)"')
    return pattern.findall(text)


def extract_sections(markdown: str) -> dict[str, str]:
    matches = list(re.finditer(r"^##\s+(.+)$", markdown, re.MULTILINE))
    sections: dict[str, str] = {}

    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        sections[match.group(1).strip()] = markdown[start:end].strip()

    return sections


def extract_meta(markdown: str) -> dict[str, str]:
    head = markdown.split("\n## ", 1)[0]
    meta: dict[str, str] = {}

    for line in head.splitlines():
        matched = re.match(r"^-\s*([^：:]+)[：:]\s*(.+)$", line.strip())
        if matched:
            meta[matched.group(1).strip()] = matched.group(2).strip()

    return meta


def extract_bullets(section: str) -> list[str]:
    return [line.strip()[2:].strip() for line in section.splitlines() if line.strip().startswith("- ")]


def extract_sources(section: str) -> list[dict[str, str]]:
    sources = []

    for item in extract_bullets(section):
        matched = re.match(r"^(.+?)[：:]\s*<([^>]+)>$", item)
        if matched:
            sources.append({"label": matched.group(1).strip(), "url": matched.group(2).strip()})
        else:
            sources.append({"label": item, "url": ""})

    return sources


def build_detail_bundle() -> dict[str, dict[str, object]]:
    bundle: dict[str, dict[str, object]] = {}
    stocks_text = STOCKS_JS.read_text()

    for ticker, note_path in extract_stocks_js_paths(stocks_text):
        markdown_path = (DASHBOARD_DIR / note_path).resolve()
        markdown = markdown_path.read_text()
        sections = extract_sections(markdown)
        title = re.search(r"^#\s+(.+)$", markdown, re.MULTILINE)

        bundle[ticker] = {
            "title": title.group(1).strip() if title else ticker,
            "meta": extract_meta(markdown),
            "summary": sections.get("一句話定位", "").strip(),
            "fundamentals": extract_bullets(sections.get("最新基本面", "")),
            "focus": extract_bullets(sections.get("追蹤重點", "")),
            "risks": extract_bullets(sections.get("主要風險", "")),
            "sources": extract_sources(sections.get("資料來源", "")),
            "sourcePath": note_path,
        }

    return bundle


def main() -> None:
    payload = build_detail_bundle()
    OUTPUT_JS.write_text(
        "window.stockDetailData = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"
    )


if __name__ == "__main__":
    main()
