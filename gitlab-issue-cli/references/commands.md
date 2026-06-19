# GitLab Issue Commands

## Resolve `project_id`

Use `scripts/project_id_from_remote.py` first.

```bash
project_id="$(python3 scripts/project_id_from_remote.py --repo /path/to/repo)"
```

`project_id` is `name_with_namespace`, for example `360shuke/nova`.

## Read Issues

List open issues:

```bash
gitlab -o json -f iid,title,state,labels,assignees,web_url project-issue list \
  --project-id "$project_id" \
  --state opened \
  --per-page 20
```

Search by keyword:

```bash
gitlab -o json -f iid,title,state,web_url project-issue list \
  --project-id "$project_id" \
  --search "关键字" \
  --per-page 20
```

Read single issue:

```bash
gitlab -o json project-issue get \
  --project-id "$project_id" \
  --iid 123
```

## Create or Update Issues

Create issue:

```bash
gitlab project-issue create \
  --project-id "$project_id" \
  --title "标题" \
  --description "描述" \
  --labels "backend,bug"
```

Update title or description:

```bash
gitlab project-issue update \
  --project-id "$project_id" \
  --iid 123 \
  --title "新标题" \
  --description "新描述"
```

Close or reopen:

```bash
gitlab project-issue update \
  --project-id "$project_id" \
  --iid 123 \
  --state-event close
```

```bash
gitlab project-issue update \
  --project-id "$project_id" \
  --iid 123 \
  --state-event reopen
```

Update labels, assignee, due date:

```bash
gitlab project-issue update \
  --project-id "$project_id" \
  --iid 123 \
  --labels "backend,high-priority" \
  --assignee-id 42 \
  --due-date 2026-04-30
```

## Issue Notes

Add note:

```bash
gitlab project-issue-note create \
  --project-id "$project_id" \
  --issue-iid 123 \
  --body "补充说明"
```

List notes:

```bash
gitlab -o json project-issue-note list \
  --project-id "$project_id" \
  --issue-iid 123
```

## Verification

After mutation, re-read target issue:

```bash
gitlab -o json project-issue get \
  --project-id "$project_id" \
  --iid 123
```
