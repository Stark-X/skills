---
name: gitlab-issue-cli
description: Use installed global python-gitlab `gitlab` CLI to query, create, update, close, reopen, or comment on GitLab project issues for current repository or another local Git repo. Trigger when Codex needs GitLab issue information or needs to operate on issues from repository context. Derive `--project-id` from `git remote` as `name_with_namespace` such as `360shuke/nova`; do not ask for numeric project id and do not spend time checking CLI configuration or auth.
---

# GitLab Issue CLI

## Overview

Use installed global `gitlab` CLI directly. Resolve `name_with_namespace` from repo remote first, then pass that value to `--project-id`.

Read [references/commands.md](references/commands.md) when you need copy-ready command patterns.

## Resolve Project ID

Run `scripts/project_id_from_remote.py` against target repo and use its stdout as `--project-id`.

```bash
python3 scripts/project_id_from_remote.py --repo /path/to/repo
python3 scripts/project_id_from_remote.py --repo /path/to/repo --remote upstream
```

Treat output as GitLab `name_with_namespace`, not numeric id.

Current repo example:

```text
ssh://git@gitlab.daikuan.qihoo.net:2222/360shuke/nova.git
-> 360shuke/nova
```

## Issue Workflow

1. Resolve project id from repo remote.
2. Choose correct resource:
   `gitlab project-issue` for issue body and issue state.
   `gitlab project-issue-note` for issue comments.
3. Prefer global flags `-o json` and `-f` before resource name when reading data for downstream use.
4. After create or update, re-read target issue or note to verify result.

## Issue Operations

Use `gitlab project-issue list` to search or filter issues.

Use `gitlab project-issue get` to fetch one issue by `--iid`.

Use `gitlab project-issue create` to open a new issue.

Use `gitlab project-issue update` to change title, description, labels, assignee, due date, or `--state-event close|reopen`.

Use `gitlab project-issue-note create|update|delete` when user asks to add or edit issue comments.

## Working Rules

Default to current repo when user does not name another repo.

Do not call extra “config check” commands. Assume `gitlab` CLI auth and config already work.

Do not convert project id to numeric id unless command output explicitly requires numeric ids for another field.

When user asks for “issue 123”, treat `123` as issue `iid` unless they explicitly say global issue id.

When mutating an issue, summarize planned field changes before command execution if request is ambiguous. If request is clear, execute directly.
