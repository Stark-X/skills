# publish-token-costs

将本机当天 Claude Code + Codex CLI 的 token 用量采集、汇总、渲染成 400x300 灰度 PNG，并发布到 Zectrix 墨水屏设备。

脚本全部使用 Bun 直接运行 TypeScript，不需要额外编译步骤。业务入口保留在 `scripts/` 和 `scripts/token-costs/`，通用能力放在 `scripts/modules/` submodule 中。

## 目录结构

```text
publish-token-costs/
├── README.md
├── SKILL.md
├── agents/
│   └── openai.yaml
├── systemd/
│   ├── env.example
│   ├── publish-token-costs.service
│   └── publish-token-costs.timer
└── scripts/
    ├── package.json
    ├── collect.ts
    ├── render_token_costs_card.ts
    ├── publish.ts
    ├── install_timer.sh
    ├── token-costs/
    │   └── token_costs_card.ts
    └── modules/
        ├── README.md
        ├── bun/
        │   ├── image-handling/
        │   │   └── svg_to_png.ts
        │   └── zectrix/
        │       └── zectrix.ts
        └── uv/
```

## 前置条件

| 依赖 | 用途 | 检查方式 |
|---|---|---|
| `bun` | 运行 TypeScript 脚本和 `bunx` 数据源命令 | `which bun` |
| `convert` | ImageMagick SVG 到灰度 PNG 转换 | `which convert` |
| `systemctl` | 仅安装定时发布时需要 | `which systemctl` |

采集脚本会调用：

- `~/.bun/bin/bunx ccusage@latest daily --json` 获取 Claude Code 当日总量和费用。
- `~/.bun/bin/bunx @ccusage/codex@latest daily --json` 获取 Codex CLI 当日总量和费用。
- 本地 JSONL 日志计算小时分布：`~/.claude/projects/**/*.jsonl` 和 `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`。

首次运行 `bunx` 可能需要下载包；之后通常走本地缓存。

## 环境变量

发布到 Zectrix 需要：

```bash
export ZECTRIX_DEVICE_ID="11:22:33:EE:DD:FF"
export ZECTRIX_API_KEY="zt_your_key_here"
```

可选：

```bash
export TOKEN_COSTS_FONT="/usr/share/fonts/truetype/MapleMono-NF-CN-unhinted/MapleMono-NF-CN-Regular.ttf"
```

`TOKEN_COSTS_FONT` 只影响 SVG/PNG 渲染字体。未设置时使用上面的 Maple Mono 默认路径。

dry-run 不会请求 Zectrix API，也不要求真实 `ZECTRIX_DEVICE_ID` 或 `ZECTRIX_API_KEY`；它会使用占位值并输出本地生成的 SVG/PNG 路径。

## 快速使用

推送今日用量到默认 Page 1：

```bash
bun run publish-token-costs/scripts/publish.ts
```

本地 dry-run，生成图片但不触碰设备：

```bash
bun run publish-token-costs/scripts/publish.ts --dry-run
```

指定日期：

```bash
bun run publish-token-costs/scripts/publish.ts --date 2026-04-24
```

指定 Zectrix 页面：

```bash
bun run publish-token-costs/scripts/publish.ts --page 2
```

`publish.ts` 会执行三步：

1. 运行 `collect.ts --date YYYY-MM-DD` 采集 JSON。
2. 运行 `render_token_costs_card.ts --input - --output /tmp/token-costs-YYYYMMDD.svg --png /tmp/token-costs-YYYYMMDD.png` 渲染图片。
3. 调用 `cloud.zectrix.com/open/v1/devices/{deviceId}/display/image` 上传 PNG，表单字段包含 `images`、`dither=true`、`pageId`。

发布成功后会打印类似 `Image: {"code":0,...}` 的响应体。dry-run 会打印 PNG 字节数、SVG 路径和将要提交的表单字段。

## 单独运行脚本

采集用量 JSON：

```bash
bun run publish-token-costs/scripts/collect.ts
bun run publish-token-costs/scripts/collect.ts --pretty
bun run publish-token-costs/scripts/collect.ts --date 2026-04-24 --pretty
```

渲染 demo 图片：

```bash
bun run publish-token-costs/scripts/render_token_costs_card.ts --demo --png /tmp/token-costs-demo.png
```

采集后渲染：

```bash
bun run publish-token-costs/scripts/collect.ts | \
  bun run publish-token-costs/scripts/render_token_costs_card.ts --png /tmp/token-costs.png
```

渲染 CLI 支持：

```text
--input, -i   report JSON 文件路径；默认 "-" 表示 stdin
--output, -o  SVG 输出路径；默认 /tmp/token-costs-card.svg
--png         同时输出 PNG
--demo        使用内置演示数据
```

## 采集口径

`collect.ts` 输出结构：

```json
{
  "date": "2026-04-24",
  "claude_code": {
    "total_tokens": 0,
    "total_cost_usd": 0,
    "hourly": [{ "hour": 0, "tokens": 0, "cost_usd": 0 }]
  },
  "codex": {
    "total_tokens": 0,
    "total_cost_usd": 0,
    "hourly": [{ "hour": 0, "tokens": 0, "cost_usd": 0 }]
  }
}
```

总 token 和总费用来自 `ccusage` / `@ccusage/codex`。小时 token 分布来自本地 JSONL：

- Claude Code 小时 activity 使用 `output_tokens + cache_creation_input_tokens`，避免把 `cache_read_tokens` 重复计入每小时图形。
- Codex 小时 activity 使用 rollout 事件里的 `payload.info.last_token_usage.total_tokens`。
- 每小时费用按小时 token 占比从当日总费用中分摊，因此小时费用主要用于图形趋势和近似展示。
- Codex 会扫描目标日期前后各一天的 session 目录，再按本地日期过滤时间戳，处理跨时区/跨日会话文件。

## 卡片内容

输出固定为 400x300：

- 顶部：`TOKEN COSTS`、报告日期、渲染时间。
- 汇总区：Codex 和 Claude Code token 总量、费用，以及总费用。
- 小时区：最多展示最近 5 个有数据的小时行；黑色为 Codex，灰色为 Claude Code。
- 底部：图例和当前图表 token/hour 最大刻度。

如果当天还没有 token 使用，会显示 `No token usage yet`。

## 定时发布

定时发布使用 user-level systemd timer。service 是 `Type=oneshot`，每次触发只运行一次 `scripts/publish.ts`。

安装并立即启用默认 5 分钟周期：

```bash
publish-token-costs/scripts/install_timer.sh
```

指定 systemd `OnCalendar`：

```bash
publish-token-costs/scripts/install_timer.sh --on-calendar '*:0/5'
```

只启用，不立即启动 timer：

```bash
publish-token-costs/scripts/install_timer.sh --no-start
```

安装脚本会：

1. 检查 `systemctl`、`bun`、`convert` 是否可用。
2. 安装 service/timer 到 `~/.config/systemd/user/`。
3. 使用或创建 `~/.config/publish-token-costs/env`，权限设为 `0600`。
4. 在 env 文件中写入或更新 `PUBLISH_TOKEN_COSTS_DIR` 和 `BUN_BIN`。
5. 执行 `systemctl --user daemon-reload`，然后 enable timer。

如果 `~/.config/publish-token-costs/env` 不存在，安装脚本要求当前 shell 已导出 `ZECTRIX_DEVICE_ID` 和 `ZECTRIX_API_KEY`，并会用它们创建 env 文件。脚本不会打印 API key。

env 文件格式参考：

```text
PUBLISH_TOKEN_COSTS_DIR=/path/to/publish-token-costs
BUN_BIN=/path/to/bun
ZECTRIX_DEVICE_ID=11:22:33:EE:DD:FF
ZECTRIX_API_KEY=zt_your_key_here
```

查看状态和日志：

```bash
systemctl --user list-timers publish-token-costs.timer
systemctl --user status publish-token-costs.timer
journalctl --user -u publish-token-costs.service -n 100
```

手动触发一次：

```bash
systemctl --user start publish-token-costs.service
```

## 故障排查

| 现象 | 处理方式 |
|---|---|
| `environment variable ZECTRIX_DEVICE_ID is not set` | 发布模式需要导出 `ZECTRIX_DEVICE_ID`；dry-run 不需要 |
| `environment variable ZECTRIX_API_KEY is not set` | 发布模式需要导出 `ZECTRIX_API_KEY`；不要在日志或 issue 中贴出值 |
| `HTTP 401` 或 Zectrix 响应认证失败 | 检查 `ZECTRIX_API_KEY` 和设备 ID 是否匹配 |
| `convert failed` | 确认 ImageMagick `convert` 在 PATH 中可用 |
| 采集结果全是 0 | 确认 `bunx ccusage@latest`、`bunx @ccusage/codex@latest` 能运行，并检查本地 `~/.claude/projects`、`~/.codex/sessions` 是否有目标日期日志 |
| timer 不触发 | 检查 `systemctl --user status publish-token-costs.timer`，再看 `journalctl --user -u publish-token-costs.service -n 100` |

## 安全说明

- `ZECTRIX_API_KEY` 是敏感凭据，不要提交到仓库、截图、日志或 issue。
- 文档和脚本输出都不应打印 API key 的真实值。
- `~/.config/publish-token-costs/env` 建议保持 `0600` 权限。
