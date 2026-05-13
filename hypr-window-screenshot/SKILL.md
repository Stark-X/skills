---
name: hypr-window-screenshot
description: Capture a specific Hyprland window screenshot by using hyprctl window metadata and grim region capture. Use when the user asks to screenshot, capture, preview, or show an image of one desktop window, a floating window, the active window, or a window identified by class/title/name such as "cc switch"; especially on Hyprland/Wayland where X11 tools like import or xwd are unreliable.
---

# Hypr Window Screenshot

## Workflow

Use this skill when the user asks for a screenshot of one window.

1. Locate the window with `hyprctl -j clients` or `hyprctl -j activewindow`.
2. Prefer the uv inline script `scripts/capture_hypr_window.py` to avoid rewriting JSON parsing and geometry logic.
3. Run `grim -g "X,Y WIDTHxHEIGHT" <output.png>` through the script.
4. Verify the output with `file` or `identify`.
5. If the user asked to see the image, call `view_image` on the generated file.

In Codex sandboxed sessions, `hyprctl` or `grim` may need `sandbox_permissions="require_escalated"` because they access the host Hyprland/Wayland session.

## Script Usage

Capture the active window:

```bash
./scripts/capture_hypr_window.py --active --output /tmp/window.png
```

Capture a window by class/title substring:

```bash
./scripts/capture_hypr_window.py --query "cc switch" --output ./cc-switch-window.png
```

The script uses `uv run --script` in its shebang and declares `dependencies = []`, so it can run directly when executable or via `uv run --script scripts/capture_hypr_window.py`.

If multiple windows match, the script selects the lowest `focusHistoryID`, which is usually the most recently focused matching window. Use `--list` to inspect candidates before capture.

## Notes

- Hyprland reports window geometry as `at: [x, y]` and `size: [w, h]`; pass it to grim as `x,y wxh`.
- Native Wayland windows usually cannot be captured by X11 tools like ImageMagick `import` or `xwd`.
- If `gnome-screenshot -w` is unavailable or fails under Hyprland, use `grim` with the Hyprland geometry.
