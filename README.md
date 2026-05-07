<h1 align="center">CodeQL for Private Repos</h1>

<p align="center">
  <b>Run GitHub's CodeQL security analysis on your private repos.</b><br/>
  No GitHub Advanced Security. No external dashboards. No infrastructure.
  Your code and SARIF results stay in your repo.
</p>

<p align="center">
  <a href="https://github.com/arpitjain099/codeql-for-private-repos/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/arpitjain099/codeql-for-private-repos/scan.yml?label=ci"></a>
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
    uses: arpitjain099/codeql-for-private-repos/.github/workflows/scan.yml@main
    with:
      languages: 'auto'
      fail-on: 'error'
```

That's it. Languages get detected from your source tree, scans run on push/PR/daily, findings are posted as PR review comments, surfaced in the Actions run summary, and tracked in a GitHub issue. The raw SARIF is uploaded as a workflow artifact.

More patterns — strict PR gating, Slack notifications, self-hosted runners, manual builds — live in [`examples/workflows/`](examples/workflows/).

## What it does

| Output | When | What you see |
|---|---|---|
| **PR review comments** | On `pull_request` events | Inline comments on changed lines with severity, rule, message, and link to the rule's docs. |
| **Annotations** | Every run | Findings appear as red/yellow markers in the PR "Files changed" view. |
| **Run summary** | Every run | A markdown table of findings on the Actions run page (no clicking into logs). |
| **Tracking issue** | On non-PR events | A single issue labeled `codeql-scan` is created or updated with the latest findings. |
| **Slack** | Configurable | Threshold-gated notifications via incoming webhook. |
| **SARIF artifact** | Every run | Raw SARIF available for download or upload to other tools. |
| **Job exit code** | Every run | The job fails when findings exceed your `fail-on` threshold — wire it into branch protection. |

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

Every input is optional except `languages`. Defaults are sensible.

| Input | Default | Description |
|---|---|---|
| `languages` | `auto` | Comma-separated list, or `auto` to detect from source tree. Aliases like `javascript`/`typescript` map to the canonical CodeQL language IDs. |
| `query-suite` | `security-extended` | Query pack (`security-extended`, `security-and-quality`, `code-scanning`) or path to a `.qls` file. |
| `build-mode` | `autobuild` | `autobuild`, `none`, or `manual`. Use `manual` with `build-command` for compiled languages with custom builds. |
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

Secrets:

| Secret | Purpose |
|---|---|
| `slack-webhook-url` | Slack incoming webhook URL. Optional. |

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
