# hacker-rank-queue agent instructions

Slack bot that queues reviewers for HackerRank assessments. Uses Google Sheets as its database (see `src/database/`).

## Commands

- Verify (run before considering any task done): `pnpm verify` — lint, format check, type-check, build, test
- All tests: `pnpm test`
- Single test: `pnpm test -- <pattern>` — **do not** run `jest`/`npx jest` directly; the suite is timezone-sensitive and only passes under `TZ=America/Chicago`, which the `test` script sets.
- Type-check only: `pnpm compile`

## Rules

- `pnpm verify` must pass before a task is complete. Don't claim done without it.
- Squash-merge only. Don't worry about conventional commits on feature-branch commits — name the **PR** per the Conventional Commits types (see README.md "Workflow"). The squash commit title comes from the PR title.

## Do not touch

- `dist/` — build output from tsup.
