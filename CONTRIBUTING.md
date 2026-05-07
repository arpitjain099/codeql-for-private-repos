# Contributing

Thanks for considering a contribution.

## Reporting bugs and requesting features

Open a [GitHub issue](https://github.com/arpitjain099/codeql-for-private-repos/issues). For bugs, include:

- The workflow snippet that reproduces it
- The full Actions log (or a link to a public run)
- What language(s) and `query-suite` you used

For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead.

## Repo layout

```
action.yml                        Composite action — single-language scan + report
scripts/report.mjs                SARIF parser + multi-channel reporter
scripts/detect-language.mjs       Walks the workspace, picks languages
.github/workflows/scan.yml        Reusable workflow callers consume
examples/workflows/               Drop-in workflow templates
```

The reporter is intentionally stdlib-only Node so the action requires no `npm install` step. Keep it that way — no dependencies in `scripts/`.

## Running locally

The reporter can be exercised against a saved SARIF file:

```bash
INPUT_SARIF_FILE=fixtures/example.sarif \
INPUT_LANGUAGE=python \
INPUT_FAIL_ON=error \
INPUT_CREATE_ISSUE=false \
INPUT_PR_COMMENTS=false \
INPUT_ANNOTATIONS=true \
INPUT_STEP_SUMMARY=false \
GITHUB_REPOSITORY=test/test \
GITHUB_SHA=0000000000000000000000000000000000000000 \
node scripts/report.mjs
```

## Pull requests

- Keep PRs small and focused. One change per PR.
- Update [`README.md`](README.md) and [`examples/`](examples/) when behavior or inputs change.
- Don't add npm dependencies to `scripts/`.
- Be conservative with new inputs to the action — every new input becomes a permanent surface.

## License

By contributing, you agree your contributions are licensed under Apache 2.0.
