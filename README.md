
# CodeQL for Private Repos

> Bring GitHub's powerful CodeQL security analysis to your **private repositories**, without needing GitHub Enterprise.

This project provides GitHub Actions workflows that let you scan private repositories using **CodeQL CLI**, using GitHub Actions. GitHub currently restricts native CodeQL functionality for private repos to Enterprise accounts, so this project fills that gap.

---

## Table of Contents

- [Supported Languages](#supported-languages)
- [Why This Exists](#why-this-exists)
- [How to Use](#how-to-use)
  - [1. Choose Your Language](#1-choose-your-language)
  - [2. Configure Workflow](#2-configure-workflow-optional)
  - [3. Run the Workflow](#3-run-the-workflow)
- [What the Workflow Does](#what-the-workflow-does)
- [Example: Python Workflow Trigger](#example-python-workflow-trigger)
- [Viewing CodeQL Alerts as GitHub Issues](#viewing-codeql-alerts-as-github-issues)
- [Example Output](#example-output-posted-as-github-issue)
- [Contributing](#contributing)
- [License](#license)

---

## Supported Languages

- Python – [`python-codeql-action.yml`](.github/workflows/python-codeql-action.yml)
- JavaScript – [`javascript-codeql-action.yml`](.github/workflows/javascript-codeql-action.yml)
- Go – [`go-codeql-action.yml`](.github/workflows/go-codeql-action.yml)
- Typescript – [`typescript-codeql-action.yml`](.github/workflows/typescript-codeql-action.yml)

Each workflow is fully standalone and customizable.

---

## Why This Exists

GitHub’s native CodeQL integration:

- Free for **public** repositories
- Restricted for **private** repositories unless you have **GitHub Advanced Security (GHAS)**

This project enables:

- Security scanning using official CodeQL CLI
- Full control via GitHub Actions
- SARIF output + GitHub Issues reporting
- **No GHAS or enterprise plan required**

---

## How to Use

### 1. Choose Your Language

Copy one of the following workflow files into your repository:

- `.github/workflows/python-codeql-action.yml`
- `.github/workflows/javascript-codeql-action.yml`
- `.github/workflows/go-codeql-action.yml`
- `.github/workflows/typescript-codeql-action.yml`

### 2. Configure Workflow (Optional)

Each workflow supports:

- Manual triggers (with branch input)
- Scheduled scans (daily)
- Scans on push or pull request to `main`

You can customize:

- Default branch
- Schedule frequency
- Issue behavior

### 3. Run the Workflow

- Go to the **"Actions" tab** in your repo
- Select the workflow, click **"Run workflow"**
- Optionally specify a branch to scan

---

## What the Workflow Does

The analysis steps include:

- Download and unpack the latest CodeQL CLI bundle
- Run CodeQL on the selected branch
- Upload `results.sarif` for inspection
- Post a summary to an issue labeled `codeql-scan`

---

## Example: Python Workflow Trigger

```yaml
on:
  workflow_dispatch:
	inputs:
	  branch:
		description: "Branch to run the scan on"
		required: false
		default: "main"
  push:
	branches: [main]
  pull_request:
	branches: [main]
  schedule:
	- cron: "0 8 * * *"
```

This setup:

- Triggers manually (from Actions tab)
- Runs on pushes and PRs to `main`
- Schedules a scan every day at 08:00 UTC

---

## Viewing CodeQL Alerts as GitHub Issues

Each scan automatically generates a **human-readable summary** of findings and posts it as a GitHub issue. Here's how it works:

- The issue includes:
  - Number of issues found
  - File and line number
  - Code flow summary
  - Related locations

- If an open issue with the label `codeql-scan` already exists, it updates it.
- If no such issue exists, it creates a new one.

This gives you a clear, **issue-tracked** history of vulnerabilities without needing GitHub’s built-in CodeQL alerts.

---

## Example Output (Posted as GitHub Issue)

**Title:** `CodeQL Scan Results`

**Body:**

```
### CodeQL Scan Results Summary

Found **2** issue(s):

1. [py/insecure-tempfile]
- Message: Insecure use of tempfile
- Location: File: app/core/temp.py, Line: 42, Columns: 5–15
- Code Flow: app/core/temp.py at line 42 – Possible misuse of tempfile without delete=False

...
```

---

## Contributing

We welcome contributions!

- Add support for more languages (e.g. Java, C++)
- Improve alert formatting
- Add GitHub Security Dashboard integration (optional for GHAS users)

To contribute:

1. Fork the repo
2. Create a feature branch
3. Submit a PR!

---

## License

Licensed under the [Apache License 2.0](LICENSE).
