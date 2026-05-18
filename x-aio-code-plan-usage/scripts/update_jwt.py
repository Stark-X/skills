#!/usr/bin/env python3
"""Log in to x-aio dashboard and store JWT in ~/.x_aio_jwt."""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error

JWT_PATH = os.path.expanduser("~/.x_aio_jwt")
LOGIN_URL = "https://dashboard.x-aio.com/api/auth/login"


def login(account, password):
    payload = json.dumps({"account": account, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        LOGIN_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    parser = argparse.ArgumentParser(description="Update x-aio JWT")
    parser.add_argument("--account", required=True, help="x-aio account name")
    parser.add_argument("--password", required=True, help="x-aio password")
    args = parser.parse_args()

    try:
        data = login(args.account, args.password)
    except urllib.error.HTTPError as e:
        print(f"Login failed: HTTP {e.code} {e.reason}", file=sys.stderr)
        try:
            body = json.loads(e.read().decode("utf-8"))
            print(json.dumps(body, indent=2, ensure_ascii=False), file=sys.stderr)
        except Exception:
            pass
        sys.exit(1)
    except Exception as e:
        print(f"Login failed: {e}", file=sys.stderr)
        sys.exit(1)

    token = data.get("token") or data.get("access_token") or data.get("jwt")
    if not token:
        # Some APIs return the token directly as the response or under a different key
        if isinstance(data, str):
            token = data
        else:
            print(f"Unexpected response format: {json.dumps(data, indent=2)}", file=sys.stderr)
            sys.exit(1)

    os.makedirs(os.path.dirname(JWT_PATH), exist_ok=True)
    with open(JWT_PATH, "w") as f:
        f.write(token)

    print("JWT updated successfully.")


if __name__ == "__main__":
    main()
