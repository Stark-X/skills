# publish-token-costs

将当天 Claude Code + Codex CLI 的 Token 用量渲染为 400×300 灰度 PNG，并推送到 Zectrix 墨水屏设备。  
所有脚本基于 **Bun** 运行，TypeScript 自包含，无需额外编译步骤。

## 目录结构

```text
publish-token-costs/
├── README.md
├── SKILL.md
├── agents/openai.yaml
├── systemd/
│   ├── env.example
│   ├── publish-token-costs.service
│   └── publish-token-costs.timer
└── scripts/
    ├── package.json                 # 包元数据（无额外依赖，Bun 自动解析）
    ├── collect.ts                   # 采集用量（调用 ccusage / 解析本地 JSONL）
    ├── render_token_costs_card.ts   # 简单 CLI：读取用量 JSON，写 SVG/PNG
    ├── publish.ts                   # 流程入口：采集 → 渲染 → 推送
    ├── install_timer.sh             # 安装并启用 user-level systemd timer
    ├── token-costs/
    │   └── token_costs_card.ts      # 当前 skill 专用的 Token 成本卡片渲染
    └── modules/                     # git submodule: ../libs
        ├── bun/
        │   ├── image-handling/
        │   │   └── svg_to_png.ts    # Bun/Node 通用 SVG → PNG 转换
        │   └── zectrix/
        │       └── zectrix.ts       # Bun/Node 通用 Zectrix 图片发布客户端
        └── uv/                      # Python/uv 通用库位置
```

`scripts/` 下的入口脚本和 `token-costs/` 保留当前 skill 的业务流程；`scripts/modules/` 是指向 `../libs` 的 git submodule，只放可复用通用能力。

## 前置条件

| 依赖 | 检查方式 |
|---|---|
| `bun` | `which bun` |
| `convert` (ImageMagick) | `which convert` |

- **Bun**：https://bun.sh/docs/installation

数据源工具（首次调用时由 Bun 自动下载缓存，无需手动安装）：
- `bunx ccusage@latest` — Claude Code 用量
- `bunx @ccusage/codex@latest` — Codex CLI 用量

## 环境变量配置

```bash
export ZECTRIX_DEVICE_ID="11:22:33:EE:DD:FF"   # 设备 MAC 地址
export ZECTRIX_API_KEY="zt_your_key_here"        # 云平台 API Key
export TOKEN_COSTS_FONT="/usr/share/fonts/truetype/MapleMono-NF-CN-unhinted/MapleMono-NF-CN-Regular.ttf"
```

建议写入 `~/.zshrc` 或 `~/.bashrc` 以持久生效。

定时任务使用 `~/.config/publish-token-costs/env`，可参考 `systemd/env.example`。该文件权限建议为 `0600`。

## 快速使用

**推送今日用量：**
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

**指定设备页面：**
```bash
bun run publish-token-costs/scripts/publish.ts --page 2
```

**仅查看采集结果：**
```bash
bun run publish-token-costs/scripts/collect.ts --pretty
```

## 定时发布

安装 user-level systemd timer，默认每 5 分钟推送一次：

```bash
publish-token-costs/scripts/install_timer.sh
```

显式指定每 5 分钟推送：

```bash
publish-token-costs/scripts/install_timer.sh --on-calendar '*:0/5'
```

查看状态和日志：

```bash
systemctl --user list-timers publish-token-costs.timer
systemctl --user status publish-token-costs.timer
journalctl --user -u publish-token-costs.service -n 100
```

## 推送内容

默认推送到 Page 1，内容是一张 400×300 灰度 PNG：

- 顶部：`TOKEN COSTS`、日期和统计时间
- 中部：Codex / Claude Code 总 token 和费用，以及每小时 token bar
- 底部：图例和当前小时最大 token 刻度

## 故障排查

| 现象 | 解决方法 |
|---|---|
| `ZECTRIX_DEVICE_ID is not set` | 检查环境变量是否已 export |
| `HTTP 401` | 检查 `ZECTRIX_API_KEY` 是否正确 |
| `convert failed` | 检查 ImageMagick `convert` 是否可用 |
| Codex 数据为 0 | 检查 `~/.codex/sessions/YYYY/MM/DD/` 目录是否存在今日会话文件 |

## 安全说明

- `ZECTRIX_API_KEY` 属于敏感凭据，不要提交到代码库、截图或 Issue 中。
