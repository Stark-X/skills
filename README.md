# Skills

这个仓库存放本地可复用的 Agent Skills。

## Adding Skills

添加新 skill 时使用：

```sh
bunx skills add <source>
```

例如：

```sh
bunx skills add Stark-X/skills
```

## Skills Summary

- `publish-token-costs`：采集 Claude Code + Codex CLI 当日 token 用量，渲染 400x300 灰度 PNG，并发布到 Zectrix 墨水屏；也支持安装 user-level systemd timer 定时发布。详情见 `publish-token-costs/README.md`。
- `x-aio-code-plan-usage`：查询 x-aio `call_quota` 使用情况并计算 4 小时占比。详情见 `x-aio-code-plan-usage/README.md`。
- `drawio-generate-diagrams`：根据需求生成、修复并校验 draw.io / diagrams.net 原生 XML，并可生成浏览器编辑链接。详情见 `drawio-generate-diagrams/SKILL.md`。
- `mermaid-beautify`：将 Markdown/HTML 中的 ` ```mermaid ` 代码块转换为「隐藏源码 + 精美渲染图」组合，支持 15 套内置主题的 SVG 输出或终端友好的 ASCII/Unicode 方框字符图。底层基于 beautiful-mermaid 渲染引擎。详情见 `mermaid-beautify/SKILL.md`。
- `hypr-window-screenshot`：基于 Hyprland 窗口元数据和 `grim` 区域截图，按活动窗口或窗口 class/title/name 捕获单个窗口截图。详情见 `hypr-window-screenshot/SKILL.md`。
- `gitlab-issue-cli`：使用已安装的 python-gitlab `gitlab` CLI，从当前仓库 git remote 自动推导 `name_with_namespace`，查询、创建、更新、关闭或评论 GitLab Issue。详情见 `gitlab-issue-cli/SKILL.md`。
