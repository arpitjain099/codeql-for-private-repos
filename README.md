<h1 align="center">CodeQL for Private Repos</h1>

<p align="center">
  <b>Run GitHub's CodeQL security analysis on your private repos.</b><br/>
  No GitHub Advanced Security. No external dashboards. No infrastructure.
  Your code and SARIF results stay in your repo.
</p>

<p align="center">
  <a href="https://github.com/arpitjain099/codeql-for-private-repos/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/arpitjain099/codeql-for-private-repos?label=release&color=blue"></a>
  <a href="https://github.com/arpitjain099/codeql-for-private-repos/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/arpitjain099/codeql-for-private-repos/ci.yml?label=ci"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue"></a>
  <a href="https://github.com/arpitjain099/codeql-for-private-repos/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/arpitjain099/codeql-for-private-repos?style=social"></a>
</p>

---

GitHub's [CodeQL](https://codeql.github.com/) is the same engine that powers GitHub's own security alerts and the [security advisories you see across the open-source ecosystem](https://github.com/advisories). It is **free for public repositories**, but to use it on **private repositories** you normally need [GitHub Advanced Security](https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security) — an Enterprise-tier add-on.

This project closes that gap. It runs CodeQL inside your own GitHub Actions runner, keeps the results inside your repo (issues, PR reviews, run summary, optional Slack), and never calls the GHAS-restricted code-scanning upload API. The cost is the price of an Actions minute.

## Quick start (30 seconds)

Drop this into `.github/workflows/codeql.yml`:

```yaml
name: CodeQL
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
  schedule: [{ cron: '0 8 * * *' }]
  workflow_dispatch:

permissions:
  contents: read
  issues: write
  pull-requests: write
  actions: read

jobs:
  codeql:
    uses: arpitjain099/codeql-for-private-repos/.github/workflows/scan.yml@v1
    with:
      languages: 'auto'
      fail-on: 'error'
```

That's it. Languages get detected from your source tree, scans run on push/PR/daily, findings are posted as PR review comments, surfaced in the Actions run summary, and tracked in a GitHub issue. The raw SARIF is uploaded as a workflow artifact.

More patterns — strict PR gating, Slack notifications, self-hosted runners, manual builds — live in [`examples/workflows/`](examples/workflows/).

## What you'll see

Once the workflow is wired up, every push, PR, and scheduled run produces output across these channels. The examples below are synthetic but representative.

### Inline PR review comments

On `pull_request` events, findings on changed lines show up as a single CodeQL review with one comment per finding:

> **🟠 High** · `py/sql-injection`
>
> This SQL query depends on a user-provided value.
>
> [Learn more](https://codeql.github.com/codeql-query-help/python/py-sql-injection/)

The review header summarises totals and links back to the run for findings outside the diff:

> **CodeQL** flagged 2 issue(s) on changed lines. (3 additional finding(s) outside the diff — see the [run summary](https://github.com/...).)

### File annotations in the diff

The same findings show up as squiggles in the PR's "Files changed" view (CodeQL writes them via GitHub Actions annotations) — no extra setup, this is just how Actions surfaces `::error` / `::warning` commands.

### Actions run summary

Every run writes a markdown table to the run's summary page — visible right at the top of the Actions tab without clicking into logs:

> ## CodeQL Scan — python
>
> **3 finding(s):** 1 high · 2 medium
>
> | Severity | Rule | Location | Message |
> |---|---|---|---|
> | 🟠 High | `py/sql-injection` | `app/views/users.py:42` | This SQL query depends on a user-provided value. |
> | 🟡 Medium | `py/clear-text-logging-sensitive-data` | `app/auth/login.py:88` | Sensitive data returned by getPassword is logged here. |
> | 🟡 Medium | `py/insecure-tempfile` | `app/core/temp.py:15` | Insecure use of tempfile module. |

### Tracking issue

For pushes to the default branch and scheduled runs, a single issue labeled `codeql-scan` is created or updated in place — so you always have one canonical "current state" view, never a long history of stale issues:

> **Title:** CodeQL Scan Results
> **Labels:** `codeql-scan`
>
> _Updated by [run #42](https://github.com/...) on `main` at [`a7f3c2b`](https://github.com/...)._
>
> ## 3 finding(s)
>
> - 🟠 High **1**
> - 🟡 Medium **2**
>
> <details>
> <summary>🟠 High <code>py/sql-injection</code> — SQL query built from user-controlled sources</summary>
>
> **Location:** [`app/views/users.py:42`](https://github.com/...)
>
> **Message:** This SQL query depends on a user-provided value.
>
> **Reference:** https://codeql.github.com/codeql-query-help/python/py-sql-injection/
>
> **Flow**
> - `app/views/users.py:12` — user-supplied value reaches `request.GET[...]`
> - `app/views/users.py:42` — value flows into raw SQL query
> </details>

### Slack notifications

If you set `SLACK_WEBHOOK_URL`, every run that crosses your `slack-min-severity` threshold posts a Block Kit message:

```
🚨 CodeQL: 3 finding(s) in your-org/your-repo
   Run #42 · main · a7f3c2b · python

   1 high · 2 medium

   • py/sql-injection — app/views/users.py:42
   • py/clear-text-logging-sensitive-data — app/auth/login.py:88
   • py/insecure-tempfile — app/core/temp.py:15
```

Set `slack-min-severity: 'severity:7.0'` to only get pinged on serious stuff. `slack-on-clean: true` if you also want a green check-in when the scan is clean.

### SARIF artifact

The raw SARIF file is uploaded as a workflow artifact named `codeql-sarif-<language>` so you can download it, diff it across runs, or feed it into other tooling. Available on every run.

### Branch protection (failing the job)

`fail-on` controls the exit code. Wire the workflow into your required-checks list and any PR that introduces a finding above your threshold cannot merge:

```yaml
with:
  fail-on: 'severity:7.0'   # CVSS-style numeric, or: error | warning | note | none
  diff-only: true           # only count findings on lines this PR changes
```

---

## Why this exists

|                                          | GitHub Advanced Security      | This project                                       |
|------------------------------------------|-------------------------------|----------------------------------------------------|
| Works on private repos                   | ✅                            | ✅                                                 |
| Cost                                     | Per-committer Enterprise SKU  | Free — pays only for Actions minutes               |
| CodeQL engine                            | Official                      | Official (`github/codeql-action/init` & `analyze`) |
| Inline PR comments                       | ✅                            | ✅                                                 |
| Code-scanning UI tab                     | ✅                            | ❌ (results live in issues + run summary)          |
| Slack / webhook integration              | Manual                        | ✅ Built in                                        |
| Self-hosted runner support               | ✅                            | ✅                                                 |
| Data leaves your tenancy                 | Stays in GitHub               | Stays in your repo / runner                        |
| Setup time                               | Enterprise procurement        | Copy-paste a workflow                              |

This is not a replacement for GHAS — if you have it, use it. It's for the **vast majority of teams who don't**: solo devs, startups, internal tools, indie projects, anything where "buy Enterprise" isn't on the table.

## Configuration

Every input is optional except `languages`. Defaults are sensible — most users only set `languages` and `fail-on`.

<details>
<summary><b>All inputs</b> (click to expand)</summary>

| Input | Default | Description |
|---|---|---|
| `languages` | `auto` | Comma-separated list, or `auto` to detect from source tree. Aliases like `javascript`/`typescript` map to the canonical CodeQL language IDs. |
| `query-suite` | `security-extended` | Query pack (`security-extended`, `security-and-quality`, `code-scanning`) or path to a `.qls` file. |
| `build-mode` | `auto` | `auto` (picks per language: `none` for interpreted, `autobuild` for compiled), `autobuild`, `none`, or `manual`. Use `manual` with `build-command` for compiled languages with custom builds. |
| `build-command` | (empty) | Shell command to run between init and analyze when `build-mode: manual`. |
| `fail-on` | `error` | Severity threshold to fail the job: `none`, `note`, `warning`, `error`, or `severity:N.N` (e.g. `severity:7.0`). |
| `create-issue` | `auto` | `auto` (only on non-PR events), `true` (always), `false` (never). |
| `issue-label` | `codeql-scan` | Label used to find/update the tracking issue. |
| `pr-comments` | `auto` | `auto` (only on PR events), `true` (always), `false` (never). |
| `step-summary` | `true` | Write a findings table to the Actions run summary. |
| `annotations` | `true` | Emit GitHub Actions warning/error annotations per finding. |
| `diff-only` | `false` | On PRs, only report findings that touch changed lines. |
| `baseline-path` | (empty) | Path to a JSON file of pre-existing findings to ignore — see [Baselines](#baselines). |
| `slack-min-severity` | `error` | Threshold for Slack notifications (same syntax as `fail-on`). |
| `slack-on-clean` | `false` | Send a Slack message even when zero findings. |
| `runner` | `ubuntu-latest` | Runner label. Use a self-hosted label to keep code on your infra. |
| `ref` | (event ref) | Git ref to scan. |

**Secrets**

| Secret | Purpose |
|---|---|
| `slack-webhook-url` | Slack incoming webhook URL. Optional. |

</details>

## Supported languages

CodeQL itself supports them, so this project supports them: **Python, JavaScript, TypeScript, Go, Java, Kotlin, C, C++, C#, Ruby, Swift**.

`languages: 'auto'` walks the source tree and includes any language with ≥ 5 source files. Override explicitly via `languages: 'python, go'` to pin the matrix.

## Common patterns

### Strict PR gate

Block PRs that introduce findings of severity ≥ 7.0 on changed lines, without flagging the existing backlog:

```yaml
with:
  fail-on: 'severity:7.0'
  diff-only: true
```

Wire this job into branch protection's required-checks list.

### Slack notifications

Add a `SLACK_WEBHOOK_URL` repo secret, then:

```yaml
with:
  slack-min-severity: 'error'
secrets:
  slack-webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

The notification includes severity counts, the top 5 findings, and a link to the run summary.

### Self-hosted runner

```yaml
with:
  runner: 'self-hosted'
```

Source code never reaches GitHub-hosted runners. Combine with `upload-artifact: false` on the underlying action call if you don't want SARIF stored in GitHub at all.

### Baselines

If you're adopting this on a legacy repo with hundreds of pre-existing findings, generate a baseline so only **new** findings break CI:

```bash
# After one scan completes, download the SARIF artifact and convert it:
node scripts/sarif-to-baseline.mjs results.sarif > .codeql/baseline.json
git add .codeql/baseline.json && git commit
```

Then in the workflow:

```yaml
with:
  baseline-path: '.codeql/baseline.json'
```

> A `sarif-to-baseline.mjs` helper is on the roadmap — for now you can hand-author a JSON file with `[{ ruleId, file, message }]` shapes. See [`scripts/report.mjs`](scripts/report.mjs) for the matching logic.

## How it works

```
                 ┌────────────────────────────────────────────┐
push / PR ──────▶│  scan.yml (this repo's reusable workflow)  │
                 └────────────────────┬───────────────────────┘
                                      │
                                      ▼
                ┌──────────────────────────────────────┐
                │  detect-language  ─►  matrix          │
                └──────────────────────────────────────┘
                                      │
                       ┌──────────────┴──────────────┐
                       ▼                             ▼
                ┌─────────────┐             ┌──────────────┐
                │ language: A │             │ language: B  │
                └──────┬──────┘             └──────┬───────┘
                       │     init + analyze        │
                       │   (github/codeql-action,  │
                       │    upload: never)         │
                       ▼                           ▼
                ┌────────────────────────────────────────┐
                │  scripts/report.mjs                    │
                │   • annotations                        │
                │   • run summary                        │
                │   • PR review comments                 │
                │   • tracking issue                     │
                │   • Slack                              │
                │   • exit code from `fail-on`           │
                └────────────────────────────────────────┘
```

Under the hood we call the official [`github/codeql-action`](https://github.com/github/codeql-action) `init` + `analyze` actions with `upload: never`. That means we use the same engine and database setup as GHAS, but skip the API call that requires the GHAS license. The SARIF file is then handed to a stdlib-only Node script (no `npm install` step) that fans out to the various output channels.

## Roadmap

- `sarif-to-baseline` helper script
- Discord and Microsoft Teams notifiers (share the Slack formatter)
- Optional Jira / Linear ticket creation
- Trend chart in the tracking issue (findings over time)
- Additional CodeQL custom query packs maintained as siblings

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

This project gets better the more eyes are on it. Bug reports, feature ideas, and PRs are all welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the basics, and [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

## License

Apache 2.0 — see [LICENSE](LICENSE).

CodeQL itself is licensed separately by GitHub. Read GitHub's [terms for the CodeQL CLI](https://securitylab.github.com/tools/codeql/license/) before using it commercially. This project does not redistribute CodeQL; it invokes the official action which downloads the bundle from GitHub at runtime.
