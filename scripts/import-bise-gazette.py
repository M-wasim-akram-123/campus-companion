#!/usr/bin/env python3
"""
Import a BISE Multan result gazette PDF into Supabase (run once per exam year).

Requires: pip install pypdf supabase python-dotenv

Usage:
  py scripts/import-bise-gazette.py ^
    --pdf "C:\\Users\\Admin\\Downloads\\RESULT GAZETTE HSSC Ist ANNUAL EXAM 2025 BISE MULTAN.pdf" ^
    --year 2025 ^
    --level hssc ^
    --session 1st_annual ^
    --label "HSSC 1st Annual 2025 - BISE Multan"

When a new gazette is published next year, run again with --year 2026 and the new PDF.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROLL_SUFFIX_RE = re.compile(r"(\d{6})$")
MARKS_RE = re.compile(r"\b(\d{3,4})\b")


def load_env() -> None:
    env_path = Path.cwd() / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        m = re.match(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"\n]*)"?', line)
        if m and not os.environ.get(m.group(1)):
            os.environ[m.group(1)] = m.group(2)


def parse_line(line: str) -> dict | None:
    line = line.strip()
    if not line:
        return None
    if line.startswith("Roll No") or "Board of Intermediate" in line or "Result Gazette" in line:
        return None
    if line.startswith("Part-I") or line.startswith("Pg:"):
        return None

    match = ROLL_SUFFIX_RE.search(line)
    if not match:
        return None

    roll = match.group(1)
    prefix = line[: match.start()].strip()
    upper = prefix.upper()

    status = "passed"
    if "FAILED" in upper or " MI" in f" {upper} " or upper.endswith(" MI"):
        status = "failed"
    elif "ABSENT" in upper:
        status = "absent"
    elif "RCD" in upper or "Attested Admission Form" in prefix:
        status = "incomplete"

    marks = None
    for num in reversed(MARKS_RE.findall(prefix)):
        value = int(num)
        if 200 <= value <= 1100:
            marks = value
            break

    if status != "passed" and marks is None:
        marks = None

    name = prefix
    for token in MARKS_RE.findall(prefix):
        name = name.replace(token, " ")
    name = re.sub(r"\s+", " ", name).strip(" -")
    for junk in ("FAILED TO", "MI", "RCD", "Attested Admission Form", "ABSENT"):
        name = name.replace(junk, " ")
    name = re.sub(r"\s+", " ", name).strip()
    if not name:
        name = None

    return {
        "roll_number": roll,
        "candidate_name": name,
        "marks_obtained": marks,
        "result_status": status,
    }


def parse_pdf(pdf_path: Path) -> dict[str, dict]:
    from pypdf import PdfReader

    reader = PdfReader(str(pdf_path))
    rows: dict[str, dict] = {}
    for page in reader.pages:
        text = page.extract_text() or ""
        for line in text.splitlines():
            parsed = parse_line(line)
            if not parsed:
                continue
            rows[parsed["roll_number"]] = parsed
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Import BISE Multan gazette PDF into Supabase")
    parser.add_argument("--pdf", required=True, help="Path to gazette PDF")
    parser.add_argument("--year", type=int, required=True, help="Exam year, e.g. 2025")
    parser.add_argument("--level", choices=["hssc", "ssc"], default="hssc")
    parser.add_argument("--session", default="1st_annual", help="e.g. 1st_annual, 2nd_annual, supply")
    parser.add_argument("--board", default="bise_multan")
    parser.add_argument("--label", required=True, help="Display label in inquiry form dropdown")
    parser.add_argument("--marks-total", type=int, default=1100)
    parser.add_argument("--replace", action="store_true", help="Replace existing import for same year/level/session")
    args = parser.parse_args()

    load_env()
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env", file=sys.stderr)
        return 1

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        return 1

    print(f"Parsing {pdf_path.name} ...")
    rows = parse_pdf(pdf_path)
    print(f"Parsed {len(rows)} roll numbers")

    from supabase import create_client

    client = create_client(url, key)

    existing_resp = (
        client.table("board_gazette_imports")
        .select("id")
        .eq("board_code", args.board)
        .eq("exam_level", args.level)
        .eq("exam_session", args.session)
        .eq("exam_year", args.year)
        .maybe_single()
        .execute()
    )
    existing_row = existing_resp.data if existing_resp is not None else None

    if existing_row and not args.replace:
        print(
            "Import already exists for this board/level/session/year. "
            "Use --replace to reload the gazette.",
            file=sys.stderr,
        )
        return 1

    if existing_row and args.replace:
        import_id = existing_row["id"]
        client.table("board_gazette_results").delete().eq("import_id", import_id).execute()
        client.table("board_gazette_imports").update(
            {
                "label": args.label,
                "marks_total": args.marks_total,
                "source_file": pdf_path.name,
                "row_count": len(rows),
                "imported_at": datetime.now(timezone.utc).isoformat(),
                "is_active": True,
            }
        ).eq("id", import_id).execute()
    else:
        inserted = (
            client.table("board_gazette_imports")
            .insert(
                {
                    "board_code": args.board,
                    "exam_level": args.level,
                    "exam_session": args.session,
                    "exam_year": args.year,
                    "label": args.label,
                    "marks_total": args.marks_total,
                    "source_file": pdf_path.name,
                    "row_count": len(rows),
                    "is_active": True,
                }
            )
            .select("id")
            .execute()
        )
        import_id = inserted.data[0]["id"]

    batch_size = 500
    payload = [
        {"import_id": import_id, **row}
        for row in rows.values()
    ]
    for i in range(0, len(payload), batch_size):
        chunk = payload[i : i + batch_size]
        for attempt in range(5):
            try:
                client.table("board_gazette_results").insert(chunk).execute()
                break
            except Exception as exc:
                if attempt == 4:
                    raise
                print(f"Retry batch {i // batch_size + 1} after error: {exc}", file=sys.stderr)
                time.sleep(2 * (attempt + 1))
        print(f"Inserted {min(i + batch_size, len(payload))}/{len(payload)}")

    print(f"Done. Import id: {import_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
