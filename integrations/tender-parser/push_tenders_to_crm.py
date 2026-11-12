"""Send the tender parser's JSON export to the CRM intake API.

Standard library only, so it runs with the parser's own Python.

    python push_tenders_to_crm.py C:\\path\\to\\tender-parser\\exports\\latest.json

The integration key is read from the CRM_INTEGRATION_KEY environment variable or,
with --key-file, from a file kept outside any repository. It is never printed.

Sending the same file twice is safe: the CRM matches tenders by their source key
and refreshes them instead of creating duplicates.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_URL = "https://crm.oasis.com.ru/api"
BATCH_SIZE = 200
TIMEOUT_SECONDS = 120


def load_items(path: Path) -> list:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)

    items = data.get("items") if isinstance(data, dict) else data

    if not isinstance(items, list):
        raise ValueError(f'{path}: expected a list of tenders or {{"items": [...]}}')

    return items


def read_key(key_file: str | None) -> str:
    if key_file:
        key = Path(key_file).read_text(encoding="utf-8").strip()
    else:
        key = os.environ.get("CRM_INTEGRATION_KEY", "").strip()

    if not key:
        raise ValueError("Integration key is missing: set CRM_INTEGRATION_KEY or pass --key-file")

    return key


def post_batch(url: str, key: str, items: list) -> dict:
    request = urllib.request.Request(
        f"{url.rstrip('/')}/intake/tenders",
        data=json.dumps({"items": items}, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "X-Integration-Key": key,
            "User-Agent": "crm-tender-push/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"CRM answered HTTP {error.code}: {body}") from error


def main() -> int:
    parser = argparse.ArgumentParser(description="Send tender parser export to the CRM")
    parser.add_argument("export", help="path to latest.json or new_tenders.json")
    parser.add_argument("--url", default=os.environ.get("CRM_API_URL", DEFAULT_URL))
    parser.add_argument("--key-file", help="file that contains the integration key")
    parser.add_argument("--dry-run", action="store_true", help="read the file and report, send nothing")
    args = parser.parse_args()

    try:
        items = load_items(Path(args.export))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Cannot read export: {error}", file=sys.stderr)
        return 2

    print(f"Tenders in export: {len(items)}")

    if args.dry_run:
        return 0

    try:
        key = read_key(args.key_file)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 2

    totals = {"created": 0, "updated": 0, "skipped": 0, "errors": 0}

    for start in range(0, len(items), BATCH_SIZE):
        batch = items[start : start + BATCH_SIZE]

        try:
            result = post_batch(args.url, key, batch)
        except (RuntimeError, urllib.error.URLError, TimeoutError) as error:
            print(f"Batch starting at {start} failed: {error}", file=sys.stderr)
            print(f"Sent before the failure: {totals}", file=sys.stderr)
            return 1

        totals["created"] += result.get("created", 0)
        totals["updated"] += result.get("updated", 0)
        totals["skipped"] += result.get("skipped", 0)
        errors = result.get("errors", [])
        totals["errors"] += len(errors)

        for error in errors[:5]:
            print(f"  rejected item {start + error.get('index', 0)}: {error.get('message')}")

    print(
        "Created: {created}, updated: {updated}, skipped: {skipped}, rejected: {errors}".format(**totals)
    )

    return 0 if totals["errors"] == 0 else 3


if __name__ == "__main__":
    sys.exit(main())
