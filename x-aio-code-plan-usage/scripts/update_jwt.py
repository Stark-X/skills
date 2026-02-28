#!/usr/bin/env python3
"""Refresh JWT for x-aio and persist it to ~/.x_aio_jwt."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, request

LOGIN_URL = "https://dashboard.x-aio.com/api/auth/login"
DEFAULT_JWT_FILE = Path("~/.x_aio_jwt").expanduser()
DEFAULT_TIMEOUT = 15.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Login x-aio and update JWT stored in ~/.x_aio_jwt."
    )
    parser.add_argument("--account", required=True, help="x-aio account")
    parser.add_argument("--password", required=True, help="x-aio password")
    parser.add_argument("--type", type=int, default=3, help="login payload type")
    parser.add_argument(
        "--jwt-file",
        type=Path,
        default=DEFAULT_JWT_FILE,
        help="path used to store JWT (default: ~/.x_aio_jwt)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help=f"request timeout in seconds (default: {DEFAULT_TIMEOUT})",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="print formatted JSON output",
    )
    return parser.parse_args()


def json_dumps(payload: dict[str, Any], pretty: bool) -> str:
    if pretty:
        return json.dumps(payload, ensure_ascii=False, indent=2)
    return json.dumps(payload, ensure_ascii=False)


def decode_jwt_payload(token: str) -> dict[str, Any]:
    segments = token.split(".")
    if len(segments) != 3:
        raise ValueError("JWT 格式无效")

    payload_segment = segments[1]
    padded = payload_segment + "=" * (-len(payload_segment) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise ValueError("JWT payload 无法进行 base64url 解码") from exc

    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("JWT payload 不是有效 JSON") from exc

    if not isinstance(parsed, dict):
        raise ValueError("JWT payload 结构异常")
    return parsed


def to_utc_iso(ts: Any) -> str | None:
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError):
        return None


def login_and_fetch_token(
    account: str, password: str, login_type: int, timeout: float
) -> str:
    body = {
        "payload": {
            "type": login_type,
            "account": account,
            "password": password,
        }
    }
    body_bytes = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        LOGIN_URL,
        data=body_bytes,
        method="POST",
        headers={
            "content-type": "application/json",
            "user-agent": "x-aio-code-plan-usage-skill/1.0",
        },
    )

    try:
        with request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"登录请求失败: HTTP {exc.code}, body={detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"登录请求失败: {exc.reason}") from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"登录接口返回非 JSON 内容: {raw}") from exc

    if str(data.get("code")) != "200":
        raise RuntimeError(
            f"登录失败: code={data.get('code')}, message={data.get('message')}"
        )

    token = data.get("data")
    if not isinstance(token, str) or not token.strip():
        raise RuntimeError("登录成功但未返回 JWT")
    return token.strip()


def write_token(jwt_file: Path, token: str) -> Path:
    target = jwt_file.expanduser()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(token + "\n", encoding="utf-8")
    os.chmod(target, 0o600)
    return target


def main() -> int:
    args = parse_args()

    try:
        token = login_and_fetch_token(
            account=args.account,
            password=args.password,
            login_type=args.type,
            timeout=args.timeout,
        )
        jwt_file = write_token(args.jwt_file, token)
    except Exception as exc:  # noqa: BLE001
        print(json_dumps({"error": str(exc)}, pretty=args.pretty))
        return 1

    result: dict[str, Any] = {"jwt_file": str(jwt_file), "updated": True}
    try:
        payload = decode_jwt_payload(token)
        if "exp" in payload:
            result["exp"] = payload["exp"]
            exp_utc = to_utc_iso(payload["exp"])
            if exp_utc is not None:
                result["exp_utc"] = exp_utc
    except ValueError as exc:
        result["warning"] = str(exc)

    print(json_dumps(result, pretty=args.pretty))
    return 0


if __name__ == "__main__":
    sys.exit(main())
