---
name: x-aio-code-plan-usage
description: Query x-aio dashboard code plan usage (`call_quota`) with local Python scripts. Use when asked to check current `four_hours_call_count`/`four_hours_call_quota`, compute usage percentage, validate whether JWT in `~/.x_aio_jwt` is expired, or refresh the JWT through x-aio login.
---

# X-AIO Code Plan Usage

Run the bundled scripts to refresh JWT and fetch quota usage from x-aio.

## Workflow
1. Run `scripts/get_call_quota.py` first.
2. If JWT is expired, read the returned `refresh_command`.
3. Execute that full command (absolute path, replace account/password) to refresh `~/.x_aio_jwt`.
4. Run `scripts/get_call_quota.py` again and return only:

```json
{"four_hours_call_count": 33.36, "four_hours_call_quota": 500, "percentage": 6.67}
```

## Scripts

### `scripts/update_jwt.py`
Log in to `https://dashboard.x-aio.com/api/auth/login` and store JWT in `~/.x_aio_jwt`.

Example:
```bash
python3 /abs/path/to/x-aio-code-plan-usage/scripts/update_jwt.py \
  --account "Stark" \
  --password "<PASSWORD>"
```

### `scripts/get_call_quota.py`
Read JWT, check `exp`, and request `https://dashboard.x-aio.com/api/code_plan_usage/call_quota`.

If JWT is expired, print a refresh command with an absolute `update_jwt.py` path.
If JWT is valid, return `four_hours_call_count`, `four_hours_call_quota`, and computed `percentage`.

Example:
```bash
python3 /abs/path/to/x-aio-code-plan-usage/scripts/get_call_quota.py --pretty
```

## Safety
Never print account passwords or JWT tokens in final answers.
