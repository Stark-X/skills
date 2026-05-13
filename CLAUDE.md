# Repository Instructions

- Always respond in Chinese.
- Follow `/home/stark/.codex/RTK.md`; prefix shell commands with `rtk`.

## Python Scripts

- For standalone Python scripts in skills, prefer uv inline scripts.
- Use this shebang and PEP 723 metadata at the top of executable scripts:

```python
#!/usr/bin/env -S uv run --script
#
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
```

- Put third-party packages in `dependencies`; keep `dependencies = []` for stdlib-only scripts.
- Make executable scripts mode `755` and document usage as `./scripts/name.py ...` or `uv run --script scripts/name.py ...`.
