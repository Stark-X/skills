#!/usr/bin/env python3
"""Read x-aio JWT, validate expiry, and fetch call quota usage."""

from __future__ import annotations

import argparse
import base64
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, request

CALL_QUOTA_URL = "https://dashboard.x-aio.com/api/code_plan_usage/call_quota"
DEFAULT_JWT_FILE = Path("~/.x_aio_jwt").expanduser()
DEFAULT_TIMEOUT = 15.0
DEFAULT_EXPIRY_SKEW = 30


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch x-aio call_quota and calculate 4-hour usage percentage."
    )
    parser.add_argument(
        "--jwt-file",
        type=Path,
        default=DEFAULT_JWT_FILE,
        help="path to JWT file (default: ~/.x_aio_jwt)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help=f"request timeout in seconds (default: {DEFAULT_TIMEOUT})",
    )
    parser.add_argument(
        "--expiry-skew",
        type=int,
        default=DEFAULT_EXPIRY_SKEW,
        help=f"treat token as expired this many seconds early (default: {DEFAULT_EXPIRY_SKEW})",
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


def read_jwt(jwt_file: Path) -> tuple[str, Path]:
    target = jwt_file.expanduser()
    if not target.exists():
        raise RuntimeError(f"JWT 文件不存在: {target}")

    token = target.read_text(encoding="utf-8").strip()
    if not token:
        raise RuntimeError(f"JWT 文件为空: {target}")
    return token, target


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


def build_refresh_command() -> str:
    update_script = Path(__file__).resolve().with_name("update_jwt.py")
    return (
        f"python3 {update_script} "
        "--account '<YOUR_ACCOUNT>' --password '<YOUR_PASSWORD>'"
    )


def token_expired(exp: Any, skew: int) -> bool:
    try:
        exp_ts = float(exp)
    except (TypeError, ValueError):
        return True
    return exp_ts <= (time.time() + skew)


def fetch_call_quota(token: str, timeout: float) -> dict[str, Any]:
    req = request.Request(
        CALL_QUOTA_URL,
        data=b"{}",
        method="POST",
        headers={
            "authorization": f"Bearer {token}",
            "content-type": "application/json",
            "user-agent": "x-aio-code-plan-usage-skill/1.0",
        },
    )

    try:
        with request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"call_quota 请求失败: HTTP {exc.code}, body={detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"call_quota 请求失败: {exc.reason}") from exc

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"call_quota 返回非 JSON 内容: {raw}") from exc

    if str(payload.get("code")) != "200":
        raise RuntimeError(
            f"call_quota 返回错误: code={payload.get('code')}, message={payload.get('message')}"
        )

    data = payload.get("data")
    if not isinstance(data, dict):
        raise RuntimeError("call_quota 返回 data 结构异常")
    return data


def to_number(name: str, value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError as exc:
            raise RuntimeError(f"{name} 不是有效数字: {value}") from exc
    raise RuntimeError(f"{name} 不是有效数字: {value!r}")


def compact_number(value: float) -> int | float:
    if value.is_integer():
        return int(value)
    return value


def main() -> int:
    args = parse_args()

    try:
        token, jwt_path = read_jwt(args.jwt_file)
        payload = decode_jwt_payload(token)
    except Exception as exc:  # noqa: BLE001
        print(json_dumps({"error": str(exc)}, pretty=args.pretty))
        return 1

    exp = payload.get("exp")
    if token_expired(exp, args.expiry_skew):
        result: dict[str, Any] = {
            "error": "JWT 已过期，请先刷新 ~/.x_aio_jwt",
            "jwt_file": str(jwt_path),
            "refresh_command": build_refresh_command(),
        }
        if exp is not None:
            result["exp"] = exp
            exp_utc = to_utc_iso(exp)
            if exp_utc is not None:
                result["exp_utc"] = exp_utc
        result["now_utc"] = datetime.now(timezone.utc).isoformat()
        print(json_dumps(result, pretty=args.pretty))
        return 2

    try:
        data = fetch_call_quota(token, args.timeout)
        call_count = to_number("four_hours_call_count", data.get("four_hours_call_count"))
        call_quota = to_number("four_hours_call_quota", data.get("four_hours_call_quota"))
    except Exception as exc:  # noqa: BLE001
        print(json_dumps({"error": str(exc)}, pretty=args.pretty))
        return 1

    percentage = round((call_count / call_quota) * 100, 2) if call_quota > 0 else None
    result = {
        "four_hours_call_count": compact_number(call_count),
        "four_hours_call_quota": compact_number(call_quota),
        "percentage": percentage,
    }
    print(json_dumps(result, pretty=args.pretty))
    return 0


if __name__ == "__main__":
    sys.exit(main())
