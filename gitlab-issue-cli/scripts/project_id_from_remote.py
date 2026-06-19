#!/usr/bin/env python3

import argparse
import subprocess
import sys
from urllib.parse import urlparse


def get_remote_url(repo: str, remote: str) -> str:
    result = subprocess.run(
        ["git", "-C", repo, "remote", "get-url", remote],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"failed to read remote {remote!r}")
    return result.stdout.strip()


def parse_name_with_namespace(url: str) -> str:
    if "://" in url:
        path = urlparse(url).path
        candidate = path.lstrip("/")
    elif ":" in url and "@" in url.split(":", 1)[0]:
        candidate = url.split(":", 1)[1]
    else:
        candidate = url

    if candidate.endswith(".git"):
        candidate = candidate[:-4]
    candidate = candidate.strip("/")

    parts = [part for part in candidate.split("/") if part]
    if len(parts) < 2:
        raise ValueError(f"cannot derive name_with_namespace from remote url: {url}")
    return "/".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract GitLab name_with_namespace from git remote URL."
    )
    parser.add_argument("--repo", default=".", help="Target git repository path.")
    parser.add_argument("--remote", default="origin", help="Git remote name.")
    args = parser.parse_args()

    try:
        remote_url = get_remote_url(args.repo, args.remote)
        print(parse_name_with_namespace(remote_url))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
