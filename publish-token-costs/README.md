# publish-token-costs

将当天 Claude Code + Codex CLI 的 Token 用量以纯文本图表和摘要推送到 Zectrix 墨水屏设备。  
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
    ├── package.json        # 包元数据（无额外依赖，Bun 自动解析）
    ├── collect.ts          # 采集用量（调用 ccusage / 解析本地 JSONL）
    ├── publish.ts          # 入口：采集 → 生成纯文本图表 → 推送至设备
    └── install_timer.sh    # 安装并启用 user-level systemd timer
```

## 前置条件

| 依赖 | 检查方式 |
|---|---|
| `bun` | `which bun` |

- **Bun**：https://bun.sh/docs/installation

数据源工具（首次调用时由 Bun 自动下载缓存，无需手动安装）：
- `bunx ccusage@latest` — Claude Code 用量
- `bunx @ccusage/codex@latest` — Codex CLI 用量

## 环境变量配置

```bash
export ZECTRIX_DEVICE_ID="11:22:33:EE:DD:FF"   # 设备 MAC 地址
export ZECTRIX_API_KEY="zt_your_key_here"        # 云平台 API Key
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

默认推送到 Page 1，内容是一个结构化文本页面：

- 标题：`Token Costs · YYYY-MM-DD HH:mm`
- 正文：从当天首次有 token 消耗的小时到当前推送小时的 token 柱状图
- 摘要：Claude Code、Codex CLI 的 token 总数、费用和合计费用

## 故障排查

| 现象 | 解决方法 |
|---|---|
| `ZECTRIX_DEVICE_ID is not set` | 检查环境变量是否已 export |
| `HTTP 401` | 检查 `ZECTRIX_API_KEY` 是否正确 |
| `No token usage yet` | 确认今日是否已有 Claude Code / Codex 使用记录 |
| Codex 数据为 0 | 检查 `~/.codex/sessions/YYYY/MM/DD/` 目录是否存在今日会话文件 |

## 安全说明

- `ZECTRIX_API_KEY` 属于敏感凭据，不要提交到代码库、截图或 Issue 中。
