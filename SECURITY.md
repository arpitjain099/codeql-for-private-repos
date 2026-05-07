# Security policy

## Reporting a vulnerability

If you've found a vulnerability in this project — for example, a flaw that lets a malicious workflow exfiltrate the repo's `GITHUB_TOKEN`, leak SARIF contents, or escalate the action's permissions — **please don't open a public issue**.

Instead, report it privately via [GitHub's private vulnerability reporting](https://github.com/arpitjain099/codeql-for-private-repos/security/advisories/new) on this repo. I'll acknowledge within 7 days and aim to ship a fix within 30.

## Scope

In scope:

- The composite action ([`action.yml`](action.yml)) and its scripts
- The reusable workflow ([`.github/workflows/scan.yml`](.github/workflows/scan.yml))
- Any helper scripts under [`scripts/`](scripts/)

Out of scope:

- Vulnerabilities in CodeQL itself — report those to [GitHub Security Lab](https://securitylab.github.com/).
- Vulnerabilities in `github/codeql-action`, `actions/checkout`, etc. — report upstream.
- Findings *produced by* CodeQL on someone's code (those are the point of the tool).

## Hardening notes for users

- The action requires `issues: write` (for the tracking issue) and `pull-requests: write` (for review comments). If you don't want either, set `create-issue: false` and `pr-comments: false` and drop the corresponding permissions.
- Slack webhook URLs are secrets — pass them via `secrets:` in the workflow call, never hardcode.
- On `pull_request_target` events the action runs with full repo permissions on a base-branch checkout. Be careful: if you switch the trigger to `pull_request_target`, audit anything that runs PR-attacker-controlled code (build commands, install scripts, etc.) before merging.
