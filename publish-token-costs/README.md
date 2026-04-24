# publish-token-costs

将当天 Claude Code + Codex CLI 的 Token 用量以灰度折线图推送到 Zectrix 墨水屏设备。  
所有脚本基于 **Bun** 运行，TypeScript 自包含，无需额外编译步骤。

## 目录结构

```text
publish-token-costs/
├── README.md
├── SKILL.md
├── agents/openai.yaml
└── scripts/
    ├── package.json        # 包元数据（无额外依赖，Bun 自动解析）
    ├── collect.ts          # 采集用量（调用 ccusage / 解析本地 JSONL）
    ├── render_chart.ts     # 渲染灰度 PNG 折线图
    └── publish.ts          # 入口：采集 → 渲染 → 推送至设备
```

## 前置条件

| 依赖 | 检查方式 |
|---|---|
| `bun` | `which bun` |
| `convert` (ImageMagick) | `which convert` |

- **Bun**：https://bun.sh/docs/installation
- **ImageMagick**：https://imagemagick.org/script/download.php

数据源工具（首次调用时由 Bun 自动下载缓存，无需手动安装）：
- `bunx ccusage@latest` — Claude Code 用量
- `bunx @ccusage/codex@latest` — Codex CLI 用量

## 环境变量配置

```bash
export ZECTRIX_DEVICE_ID="11:22:33:EE:DD:FF"   # 设备 MAC 地址
export ZECTRIX_API_KEY="zt_your_key_here"        # 云平台 API Key
```

建议写入 `~/.zshrc` 或 `~/.bashrc` 以持久生效。

## 快速使用

**推送今日用量（完整流程）：**
```bash
bun run publish-token-costs/scripts/publish.ts
```

**Dry-run（本地预览，不推送设备）：**
```bash
bun run publish-token-costs/scripts/publish.ts --dry-run
```

**推送指定日期：**
```bash
bun run publish-token-costs/scripts/publish.ts --date 2026-04-24
```

**仅查看采集结果：**
```bash
bun run publish-token-costs/scripts/collect.ts --pretty
```

**仅渲染图表：**
```bash
bun run publish-token-costs/scripts/collect.ts | \
  bun run publish-token-costs/scripts/render_chart.ts --output /tmp/chart.png
```

## 推送内容

| 设备页面 | 内容 |
|---|---|
| Page 1 | 灰度折线图：上图为每小时 USD 费用，下图为每小时 Token 数，两条线分别代表 Claude Code（实线）和 Codex（虚线） |
| Page 2 | 文字摘要：每工具的 Token 总数、费用，以及当日合计 |

## 故障排查

| 现象 | 解决方法 |
|---|---|
| `ZECTRIX_DEVICE_ID is not set` | 检查环境变量是否已 export |
| `Cannot find module 'chartjs-node-canvas'` | 在 `scripts/` 目录执行 `bun install` |
| `HTTP 401` | 检查 `ZECTRIX_API_KEY` 是否正确 |
| 图表全为 0 | 确认今日是否已有 Claude Code / Codex 使用记录 |
| Codex 数据为 0 | 检查 `~/.codex/sessions/YYYY/MM/DD/` 目录是否存在今日会话文件 |

## 安全说明

- `ZECTRIX_API_KEY` 属于敏感凭据，不要提交到代码库、截图或 Issue 中。
