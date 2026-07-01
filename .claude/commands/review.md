---
description: Review backend changes against this project's Spring Boot conventions and CLAUDE.md invariants
argument-hint: [module or path — optional, defaults to current uncommitted changes]
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git status:*), Task
---

Review the backend changes for correctness and convention compliance.

**Scope:** `$ARGUMENTS` if provided (a module like `ticket-service` or a path); otherwise the current
uncommitted changes.

Steps:

1. Establish scope: run `git status` / `git diff` (or list files under the given path). Read the full changed
   files, not just the diff hunks.
2. Dispatch the `reviewer` subagent on this scope so the review is done with the project's rules loaded.
3. Cross-check against `CLAUDE.md` (the 8 invariants) and `.claude/docs/coding-standards.md`.
4. Present findings ranked most-severe first, each with file:line, the problem, why it matters in this project,
   and the fix. State clearly if the changes are clean.

Do not modify code as part of `/review` — this is read-only. Note: this complements the built-in `/code-review`
skill (which hunts generic bugs); `/review` enforces the TVU-project-specific gates.
