#!/usr/bin/env -S uv run --script
#
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
import argparse
import json
import re
import subprocess
from pathlib import Path


def run_json(command):
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError:
        raise SystemExit(f"missing command: {command[0]}")
    except subprocess.CalledProcessError as exc:
        message = exc.stderr.strip() or exc.stdout.strip() or str(exc)
        raise SystemExit(f"{' '.join(command)} failed: {message}")

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid JSON from {' '.join(command)}: {exc}")


def normalized(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


def searchable_text(window):
    keys = (
        "address",
        "class",
        "title",
        "initialClass",
        "initialTitle",
        "xdgTag",
        "xdgDescription",
        "stableId",
    )
    return normalized(" ".join(str(window.get(key, "")) for key in keys))


def list_windows(windows):
    for index, window in enumerate(sorted(windows, key=focus_key), start=1):
        at = window.get("at", ["?", "?"])
        size = window.get("size", ["?", "?"])
        print(
            f"{index:2d}. class={window.get('class', '')!r} "
            f"title={window.get('title', '')!r} "
            f"floating={window.get('floating')} "
            f"focus={window.get('focusHistoryID')} "
            f"at={at[0]},{at[1]} size={size[0]}x{size[1]} "
            f"address={window.get('address', '')}"
        )


def focus_key(window):
    value = window.get("focusHistoryID")
    return value if isinstance(value, int) and value >= 0 else 1_000_000


def pick_window(args):
    if args.active:
        window = run_json(["hyprctl", "-j", "activewindow"])
        if not window or not window.get("mapped", True):
            raise SystemExit("active window is empty or unmapped")
        return window

    windows = run_json(["hyprctl", "-j", "clients"])
    candidates = [window for window in windows if window.get("mapped", True)]

    if args.query:
        query = normalized(args.query)
        query_parts = query.split()
        candidates = [
            window
            for window in candidates
            if all(part in searchable_text(window) for part in query_parts)
        ]

    if args.floating:
        candidates = [window for window in candidates if window.get("floating")]

    if args.list:
        list_windows(candidates)
        raise SystemExit(0)

    if not candidates:
        raise SystemExit("no matching Hyprland windows found")

    return sorted(candidates, key=focus_key)[0]


def capture(window, output):
    at = window.get("at")
    size = window.get("size")
    if not (isinstance(at, list) and isinstance(size, list) and len(at) == 2 and len(size) == 2):
        raise SystemExit(f"window has invalid geometry: at={at!r} size={size!r}")

    x, y = int(at[0]), int(at[1])
    width, height = int(size[0]), int(size[1])
    if width <= 0 or height <= 0:
        raise SystemExit(f"window has non-positive size: {width}x{height}")

    output_path = Path(output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    geometry = f"{x},{y} {width}x{height}"
    try:
        subprocess.run(["grim", "-g", geometry, str(output_path)], check=True)
    except FileNotFoundError:
        raise SystemExit("missing command: grim")
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"grim failed for geometry {geometry!r}: {exc}")

    print(json.dumps({
        "output": str(output_path),
        "geometry": geometry,
        "class": window.get("class", ""),
        "title": window.get("title", ""),
        "address": window.get("address", ""),
        "floating": window.get("floating"),
    }, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Capture one Hyprland window using hyprctl and grim.")
    target = parser.add_mutually_exclusive_group()
    target.add_argument("--active", action="store_true", help="capture the active window")
    target.add_argument("--query", help="case-insensitive substring match across class/title/address/stableId")
    parser.add_argument("--floating", action="store_true", help="only consider floating windows")
    parser.add_argument("--list", action="store_true", help="list matching windows instead of capturing")
    parser.add_argument("--output", default="./hypr-window-screenshot.png", help="PNG output path")
    args = parser.parse_args()

    if not args.active and not args.query and not args.list:
        parser.error("provide --active, --query, or --list")

    window = pick_window(args)
    if not args.list:
        capture(window, args.output)


if __name__ == "__main__":
    main()
