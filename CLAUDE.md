# Jira Summary — Project Guide

## Overview
Vietnamese-language Node.js CLI tool that collects Jira activity (created issues, status transitions, comments, worklogs) by user per day/week, summarizes via LMX LLM, and outputs PDF reports + FChat messages.

## Commands

```bash
# Run for today (all enabled projects)
node src/index.js

# Run for a specific date
node src/index.js --date 2026-03-20

# Run for a specific project
node src/index.js --project FCHAT

# Run multiple projects
node src/index.js --project FCHAT,FPLACE

# Run all projects (including disabled)
node src/index.js --project all

# Weekly report (current week)
node src/index.js --weekly

# Weekly report for specific date range
node src/index.js --weekly --date 2026-03-17

# Skip LMX summarization (use local fallback)
node src/index.js --skip-xlm

# Output as JSON
node src/index.js --json

# Specify workdays for attendance check (1=Sun...7=Sat)
node src/index.js --weekly --workdays 2,3,4,5,6
```

## Config
- `config.yaml` — main config file (YAML, multi-project)
- `PROJECTS_CONFIG` env var — override config file path
- `DEFAULT_PROJECT` env var — default project if not specified

Config structure: `defaults` (shared settings) + `projects` (per-project overrides via deep merge).

## Architecture Pipeline
```
CLI args → loadRootConfig → resolveProjectIds → loadProjectConfig
→ computeDayRange / computeWeeklyRange
→ collectActionsForRange (Jira API)
→ groupActionsByActor
→ applyUserFilters (match against config users list)
→ summarizeWithXlm (LMX LLM) or buildLocalSummary (fallback)
→ writePdfReport → sendFchatReport
```

## Key Source Files
| File | Role |
|------|------|
| `src/index.js` | Main orchestrator |
| `src/cli.js` | CLI arg parser |
| `src/config.js` | YAML config loader with deep merge |
| `src/jira-client.js` | Jira API wrapper (jira.js v5) |
| `src/jira-actions.js` | Extracts 4 action types from Jira |
| `src/lmx-client.js` | LMX summarization with local fallback |
| `src/fchat-client.js` | FChat sender |
| `src/summary-builder.js` | Human-readable local summaries |
| `src/pdf-writer.js` | PDF generation (pdfkit, Noto Sans) |
| `src/time.js` | Date/timezone utilities (luxon) |
| `src/render.js` | Human/JSON console output |
| `src/group-actions.js` | Group actions by actor |
| `src/user-filter.js` | Filter actors by config users list |
| `src/action-history.js` | Track last action per user (incremental state) |
| `src/utils.js` | Shared helpers (buildIssueSearchUrl, etc.) |
| `src/logger.js` | Logging |

## Output Files
- `output/summary-<PROJECT>-<DATE>.pdf` — PDF report
- `output/actors-<PROJECT>.txt` — all actors seen in Jira
- `output/prompt-<user>.txt` — LMX prompt debug
- `output/last-actions.json` — incremental state (last action per user)

## Tech Stack
- Node.js ES modules (`"type": "module"`)
- `luxon` — timezone-aware dates (default Asia/Ho_Chi_Minh, GMT+7)
- `jira.js` v5.2.2 — Jira REST API
- `pdfkit` — PDF generation with custom Noto Sans fonts
- `fchat-bot-api` — FChat messaging
- `yaml` — config parsing
- `p-limit` — concurrency control

## Conventions
- All source files are ES modules (`import`/`export`)
- Dates use `luxon` DateTime; default timezone is `Asia/Ho_Chi_Minh`
- Jira actions are collected in UTC, converted to local timezone for display
- LMX summarization is optional; tool falls back to `buildLocalSummary` if unavailable
- No tests currently; validate syntax with `npm run lint`

## Lint
```bash
npm run lint  # runs node --check on all src/*.js files
```
