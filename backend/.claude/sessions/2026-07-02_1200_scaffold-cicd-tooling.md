# Session: Backend scaffold, CI, monorepo restructure, and Claude Code tooling

**Date:** 2026-07-02 12:00 (local)
**Starting commit:** repo init (no prior session log — full history included)
**Ending commit:** 7e5f01b

## Summary

Scaffolded the Maven multi-module Spring Boot backend for the TVU Event & Ticket capstone project (4 services:
api-gateway, event-service, ticket-service, notification-service), set up git/GitHub with a path-filtered CI
workflow, then restructured the repo into a team monorepo (`backend/` nested to make room for a teammate's
`frontend/`), and configured project-scoped Claude Code tooling (skills, agents, hooks, GitNexus code-graph
indexing) confined to `backend/`. Repo compiles (`mvn clean install`) but has no business logic yet — only
scaffolding.

## Changes (git-verified)

- `29c1dea` Initial commit: scaffold Maven multi-module Spring Boot backend — 143 files. The 4-service reactor
  (layer-based Java packages, Flyway wired, dev/prod profiles, logback), plus the first set of project-scoped
  `.claude/` config: skills (superpowers set + java-springboot/java-junit/spring-boot-testing/springboot-patterns
  + db-migration), `reviewer`/`qa-tester` subagents, a secret-blocking hook, a `/review` command, and
  `settings.json`.
- `8f1f218` Add path-filtered CI workflow — `.github/workflows/ci.yml`: builds/tests only the service module(s)
  actually touched by a push/PR, via `dorny/paths-filter` + a dynamic matrix.
- `5626a23` Restructure into monorepo: nest backend under `backend/` — 145 files, mostly git-detected renames
  (history preserved, no force-push). Moved the whole backend + its `.claude/` config into a `backend/`
  subfolder; moved `.github/workflows/ci.yml`, `README.md`, `.gitignore`, `decuongTVUEventTicket.md` to the true
  monorepo root (required for GitHub Actions discovery and because they describe the whole system).
- `19aa762` Index repo with GitNexus for code-intelligence MCP tools — first GitNexus indexing pass. Mistakenly
  indexed the *whole monorepo* from the true root, writing `CLAUDE.md`/`AGENTS.md`/`.claude/skills/gitnexus/`
  there.
- `b16ed27` Update GitNexus index stats after re-analyze — trivial stats-only diff from a re-run.
- `7e5f01b` Confine GitNexus and all Claude Code tooling to backend/ — corrected the above mistake: removed the
  root-level GitNexus registration and files, re-indexed with `gitnexus analyze backend --skip-git --name
  TVU-Event-Ticket-backend` so the index and its generated `CLAUDE.md`/`AGENTS.md`/skills live under `backend/`
  only. Added a standing rule to `backend/CLAUDE.md` ("Working scope — backend/ only"). Also committed a
  pre-existing, previously-untracked `researcher.md` subagent file (kept per user choice, not something this
  session authored from scratch).

## Decisions & rationale

- **Layer-based Java packages, not feature-based.** Each service is already a single bounded context — the
  microservice boundary gives the same "easy to split" benefit that feature-based packaging targets inside a
  monolith. This overrides the installed `java-springboot` skill's default feature-based recommendation.
- **`backend/` as a monorepo subfolder, not its own repo root.** A teammate will add `frontend/` (React) as a
  sibling. Done via a history-preserving git move (renames detected, no force-push) rather than a fresh
  history/rewrite.
- **`.github/workflows/ci.yml` stays at the true repo root** even though the "backend-only" scope rule applies
  to everything else — GitHub Actions only discovers workflows at the repo root, not a subfolder's `.github/`.
  This is now documented as the one explicit exception to the scope rule.
- **GitNexus over CodeGraph** for code-graph MCP tooling: GitNexus's `group_sync`/`group_list` cross-service
  contract-tracking fits the 4-microservice architecture (CodeGraph has no equivalent); GitNexus was already
  connected in this environment (zero integration cost). GitNexus's PolyForm Noncommercial license was
  evaluated and judged a non-issue since this is an academic, non-commercial capstone. Accepted tradeoff:
  GitNexus's PDG/taint analysis doesn't support Java yet (TS/JS only), so it can't do source→sink security
  analysis on this codebase today.
- **GitNexus indexed with `--skip-git`, scoped to `backend/`.** Since `backend/` isn't itself a git root, this
  disables GitNexus's automatic "N commits behind" staleness detection for this index — re-running `analyze`
  after significant changes has to be done manually, there's no automatic staleness nudge.

## Open items / follow-ups

- No business logic yet: `domain/controller/service/repository` packages are empty `.gitkeep` placeholders in
  all 4 services. The two Flyway migration files are placeholders (`SELECT 1;`), not real schema.
- Custom subagents defined in `backend/.claude/agents/*.md` (`reviewer`, `qa-tester`, `researcher`,
  `session-summarizer`) are **not currently dispatchable** via the `Agent` tool in this session/environment —
  confirmed by testing `session-summarizer` (tried both unprefixed and `backend:`-prefixed names; only the
  fixed built-in agent types resolve). Unclear whether this needs a session/harness restart or isn't supported
  in this environment at all. `reviewer`/`qa-tester` were never actually dispatch-tested before this.
- GitNexus's backend-scoped index needs manual re-running (`npx gitnexus analyze . --skip-git --name
  TVU-Event-Ticket-backend`, run from `backend/`) after future significant changes, since staleness detection
  is disabled for this index.
- CI's "real build" path (matrix actually building a changed module, not just skipping) has only been exercised
  by the monorepo-restructure commit, which touched all 4 modules at once via renames — not yet exercised by an
  ordinary single-module code change.
