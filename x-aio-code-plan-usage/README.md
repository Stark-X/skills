# x-aio-code-plan-usage

用于查询 x-aio dashboard 的 `call_quota`，并计算最近 4 小时调用占比。

## 目录结构

```text
x-aio-code-plan-usage/
├── README.md
├── SKILL.md
├── agents/openai.yaml
└── scripts/
    ├── get_call_quota.py
    └── update_jwt.py
```

## 组件说明

- 主脚本：`scripts/get_call_quota.py`
- JWT 刷新脚本：`scripts/update_jwt.py`
- 技能说明：`SKILL.md`

## 快速使用

1. 先查询 quota：

```bash
python3 x-aio-code-plan-usage/scripts/get_call_quota.py --pretty
```

2. 如果返回 JWT 过期，按返回的 `refresh_command` 刷新，或手动执行：

```bash
python3 x-aio-code-plan-usage/scripts/update_jwt.py \
  --account "<YOUR_ACCOUNT>" \
  --password "<YOUR_PASSWORD>" \
  --pretty
```

3. 刷新后再次运行 `get_call_quota.py`，预期输出示例：

```json
{
  "four_hours_call_count": 33.36,
  "four_hours_call_quota": 500,
  "percentage": 6.67
}
```

## 安全说明

- `~/.x_aio_jwt` 属于敏感凭据，避免泄露或提交到版本库。
- 不要在日志、终端截图、Issue 中暴露账号密码或 JWT。
