#!/usr/bin/env python3
"""Convert plain draw.io XML into an app.diagrams.net #create URL."""

from __future__ import annotations

import argparse
import base64
import json
import sys
import urllib.parse
import zlib
from pathlib import Path


def load_xml(path: str) -> str:
    if path == "-":
        return sys.stdin.read()
    return Path(path).read_text(encoding="utf-8")


def encode_uri_component(value: str) -> str:
    return urllib.parse.quote(value, safe="-_.!~*'()")


def raw_deflate(data: bytes) -> bytes:
    compressor = zlib.compressobj(level=9, wbits=-15)
    return compressor.compress(data) + compressor.flush()


def build_url(xml_text: str, *, lightbox: bool, edit_blank: bool, dark: bool, border: int | None) -> str:
    encoded_xml = encode_uri_component(xml_text)
    compressed = raw_deflate(encoded_xml.encode("utf-8"))
    payload = {
        "type": "xml",
        "compressed": True,
        "data": base64.b64encode(compressed).decode("ascii"),
    }

    query = {"pv": "0", "grid": "0"}
    if lightbox:
        query["lightbox"] = "1"
    if edit_blank:
        query["edit"] = "_blank"
    if dark:
        query["dark"] = "1"
    if border is not None:
        query["border"] = str(border)

    base_url = "https://app.diagrams.net/?" + urllib.parse.urlencode(query)
    return base_url + "#create=" + urllib.parse.quote(
        json.dumps(payload, separators=(",", ":"))
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build an app.diagrams.net editor URL from plain draw.io XML."
    )
    parser.add_argument(
        "input",
        help="Path to a .drawio/.xml file, or '-' to read XML from stdin",
    )
    parser.add_argument("--lightbox", action="store_true", help="Open in lightbox mode")
    parser.add_argument(
        "--edit-blank",
        action="store_true",
        help="Add an edit button that opens the editor in a new tab",
    )
    parser.add_argument("--dark", action="store_true", help="Enable dark mode")
    parser.add_argument("--border", type=int, help="Set border size in pixels")
    args = parser.parse_args()

    try:
        xml_text = load_xml(args.input).strip()
    except FileNotFoundError:
        print(f"File not found: {args.input}", file=sys.stderr)
        return 1

    if not xml_text:
        print("Input XML is empty", file=sys.stderr)
        return 1

    print(
        build_url(
            xml_text,
            lightbox=args.lightbox,
            edit_blank=args.edit_blank,
            dark=args.dark,
            border=args.border,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
