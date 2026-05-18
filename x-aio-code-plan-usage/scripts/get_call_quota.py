#!/usr/bin/env python3
"""Read ~/.x_aio_jwt, check exp, and fetch call quota from x-aio dashboard."""

import argparse
import base64
import json
import os
import sys
import urllib.request
import urllib.error

JWT_PATH = os.path.expanduser("~/.x_aio_jwt")
UPDATE_JWT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "update_jwt.py")
API_URL = "https://dashboard.x-aio.com/api/code_plan_usage/call_quota"


def decode_jwt_payload(token):
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT format")
    payload = parts[1]
    # Add padding if necessary
    padding = 4 - len(payload) % 4
    if padding != 4:
        payload += "=" * padding
    decoded = base64.urlsafe_b64decode(payload)
    return json.loads(decoded)


def is_expired(payload):
    exp = payload.get("exp")
    if not exp:
        return True
    import time
    return time.time() > exp


def fetch_quota(token):
    req = urllib.request.Request(
        API_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    parser = argparse.ArgumentParser(description="Get x-aio code plan call quota")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    args = parser.parse_args()

    if not os.path.exists(JWT_PATH):
        print(json.dumps({
            "error": "JWT not found",
            "refresh_command": f'python3 {UPDATE_JWT_PATH} --account "YOUR_ACCOUNT" --password "YOUR_PASSWORD"'
        }), file=sys.stderr)
        sys.exit(1)

    with open(JWT_PATH, "r") as f:
        token = f.read().strip()

    try:
        payload = decode_jwt_payload(token)
    except Exception as e:
        print(json.dumps({
            "error": f"Failed to decode JWT: {e}",
            "refresh_command": f'python3 {UPDATE_JWT_PATH} --account "YOUR_ACCOUNT" --password "YOUR_PASSWORD"'
        }), file=sys.stderr)
        sys.exit(1)

    if is_expired(payload):
        print(json.dumps({
            "error": "JWT expired",
            "refresh_command": f'python3 {UPDATE_JWT_PATH} --account "YOUR_ACCOUNT" --password "YOUR_PASSWORD"'
        }), file=sys.stderr)
        sys.exit(1)

    try:
        data = fetch_quota(token)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            print(json.dumps({
                "error": f"HTTP {e.code}: JWT rejected",
                "refresh_command": f'python3 {UPDATE_JWT_PATH} --account "YOUR_ACCOUNT" --password "YOUR_PASSWORD"'
            }), file=sys.stderr)
            sys.exit(1)
        print(json.dumps({
            "error": f"HTTP {e.code}: {e.reason}"
        }), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            "error": f"Request failed: {e}"
        }), file=sys.stderr)
        sys.exit(1)

    count = data.get("four_hours_call_count", 0)
    quota = data.get("four_hours_call_quota", 0)
    percentage = round((count / quota * 100), 2) if quota else 0

    result = {
        "four_hours_call_count": count,
        "four_hours_call_quota": quota,
        "percentage": percentage,
    }

    if args.pretty:
        print(json.dumps(result, indent=2))
    else:
        print(json.dumps(result))


if __name__ == "__main__":
    main()
