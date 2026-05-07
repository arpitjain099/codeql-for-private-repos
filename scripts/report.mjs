#!/usr/bin/env node
// CodeQL SARIF reporter for codeql-for-private-repos.
//
// Reads a SARIF file produced by `codeql database analyze` (or
// `github/codeql-action/analyze@v3` with `upload: never`) and fans out the
// findings to multiple channels: GitHub Actions annotations, run summary,
// tracking issue, PR review comments, and Slack.
//
// All inputs come from environment variables (set by the composite action).
// Stdlib-only — no `npm install` step required in the runner.

import fs from 'node:fs';
import path from 'node:path';

// ---------- Inputs ----------

const inputs = {
  sarifFile:       process.env.INPUT_SARIF_FILE       || 'results.sarif',
  language:        process.env.INPUT_LANGUAGE        || '',
  failOn:          process.env.INPUT_FAIL_ON         || 'error',
  createIssue:     process.env.INPUT_CREATE_ISSUE    || 'auto',
  issueLabel:      process.env.INPUT_ISSUE_LABEL     || 'codeql-scan',
  issueTitle:      process.env.INPUT_ISSUE_TITLE     || 'CodeQL Scan Results',
  prComments:      process.env.INPUT_PR_COMMENTS     || 'auto',
  stepSummary:    (process.env.INPUT_STEP_SUMMARY    || 'true') === 'true',
  annotations:    (process.env.INPUT_ANNOTATIONS     || 'true') === 'true',
  diffOnly:       (process.env.INPUT_DIFF_ONLY       || 'false') === 'true',
  baselinePath:    process.env.INPUT_BASELINE_PATH   || '',
  slackWebhook:    process.env.INPUT_SLACK_WEBHOOK_URL || '',
  slackMinSev:     process.env.INPUT_SLACK_MIN_SEVERITY || 'error',
  slackOnClean:   (process.env.INPUT_SLACK_ON_CLEAN  || 'false') === 'true',
};

const ctx = {
  token:     process.env.GITHUB_TOKEN     || '',
  repo:      process.env.GITHUB_REPOSITORY || '',
  sha:       process.env.GITHUB_SHA        || '',
  ref:       process.env.GITHUB_REF        || '',
  eventName: process.env.GITHUB_EVENT_NAME || '',
  eventPath: process.env.GITHUB_EVENT_PATH || '',
  serverUrl: process.env.GITHUB_SERVER_URL || 'https://github.com',
  apiUrl:    process.env.GITHUB_API_URL    || 'https://api.github.com',
  runId:     process.env.GITHUB_RUN_ID     || '',
  runNumber: process.env.GITHUB_RUN_NUMBER || '',
  workflow:  process.env.GITHUB_WORKFLOW   || '',
  workspace: process.env.GITHUB_WORKSPACE  || process.cwd(),
};
const [owner, repoName] = ctx.repo.split('/');
const isPr = ctx.eventName === 'pull_request' || ctx.eventName === 'pull_request_target';

// ---------- Main ----------

async function main() {
  if (!fs.existsSync(inputs.sarifFile)) {
    console.error(`SARIF file not found: ${inputs.sarifFile}`);
    process.exit(1);
  }
  const sarif = JSON.parse(fs.readFileSync(inputs.sarifFile, 'utf8'));
  let findings = extractFindings(sarif);
  console.log(`Parsed ${findings.length} raw finding(s).`);

  if (inputs.baselinePath && fs.existsSync(inputs.baselinePath)) {
    const before = findings.length;
    findings = applyBaseline(findings, inputs.baselinePath);
    console.log(`Baseline filter: ${before} → ${findings.length}`);
  }

  if (inputs.diffOnly && isPr) {
    const before = findings.length;
    findings = await applyDiffFilter(findings);
    console.log(`Diff-only filter: ${before} → ${findings.length}`);
  }

  findings.sort((a, b) => b.score - a.score);

  if (inputs.annotations) emitAnnotations(findings);
  if (inputs.stepSummary) writeStepSummary(findings);

  const wantIssue = inputs.createIssue === 'true' || (inputs.createIssue === 'auto' && !isPr);
  const wantPrReview = inputs.prComments === 'true' || (inputs.prComments === 'auto' && isPr);

  if (wantIssue && ctx.token) {
    try { await postIssue(findings); }
    catch (e) { console.error(`Issue post failed: ${e.message}`); }
  }
  if (wantPrReview && ctx.token && isPr) {
    try { await postPrReview(findings); }
    catch (e) { console.error(`PR review post failed: ${e.message}`); }
  }
  if (inputs.slackWebhook) {
    try { await postSlack(findings); }
    catch (e) { console.error(`Slack post failed: ${e.message}`); }
  }

  const threshold = parseThreshold(inputs.failOn);
  const failing = threshold === Infinity ? [] : findings.filter(f => f.score >= threshold);
  if (failing.length > 0) {
    console.error(`\n✖ ${failing.length} finding(s) at or above threshold (${inputs.failOn}). Failing the job.`);
    process.exit(1);
  }
  console.log('\n✓ Reporting complete.');
}

// ---------- SARIF extraction ----------

function extractFindings(sarif) {
  const out = [];
  for (const run of sarif.runs || []) {
    const driver = (run.tool && run.tool.driver) || {};
    const rules = driver.rules || [];
    const rulesById = {};
    rules.forEach((r, i) => {
      if (r.id) rulesById[r.id] = r;
      rulesById[String(i)] = r;
    });
    for (const r of run.results || []) {
      const rule = (r.ruleId && rulesById[r.ruleId])
        || (r.ruleIndex != null && rules[r.ruleIndex])
        || {};
      const ruleId = r.ruleId || (rule && rule.id) || 'unknown';
      const level = r.level
        || (rule.defaultConfiguration && rule.defaultConfiguration.level)
        || 'warning';
      const sevStr = (rule.properties && rule.properties['security-severity']) || '';
      const securityScore = sevStr === '' ? null : parseFloat(sevStr);
      const score = (securityScore != null && !Number.isNaN(securityScore))
        ? securityScore
        : levelToScore(level);

      const loc = (r.locations && r.locations[0] && r.locations[0].physicalLocation) || {};
      const file = (loc.artifactLocation && loc.artifactLocation.uri) || '';
      const region = loc.region || {};

      out.push({
        ruleId,
        ruleName: rule.name || ruleId,
        level,
        score,
        severity: scoreToSeverity(score),
        file,
        startLine:   region.startLine   || 1,
        endLine:     region.endLine     || region.startLine || 1,
        startColumn: region.startColumn || 1,
        endColumn:   region.endColumn   || (region.startColumn ? region.startColumn + 1 : 2),
        message:    (r.message && (r.message.text || r.message.markdown)) || '',
        shortDesc:  (rule.shortDescription && rule.shortDescription.text) || '',
        fullDesc:   (rule.fullDescription  && rule.fullDescription.text)  || '',
        helpUri:     rule.helpUri || '',
        tags:       (rule.properties && rule.properties.tags) || [],
        codeFlows:   r.codeFlows || [],
        relatedLocations: r.relatedLocations || [],
        partialFingerprints: r.partialFingerprints || {},
      });
    }
  }
  return out;
}

function levelToScore(level) {
  switch (level) {
    case 'error':   return 8.0;
    case 'warning': return 5.0;
    case 'note':    return 2.0;
    case 'none':    return 0.0;
    default:        return 5.0;
  }
}

function scoreToSeverity(score) {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score >= 0.1) return 'low';
  return 'info';
}

function parseThreshold(s) {
  if (!s || s === 'none') return Infinity;
  if (s.startsWith('severity:')) {
    const n = parseFloat(s.slice('severity:'.length));
    return Number.isNaN(n) ? Infinity : n;
  }
  return levelToScore(s);
}

// ---------- Filters ----------

function applyBaseline(findings, baselinePath) {
  const raw = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const arr = Array.isArray(raw) ? raw : (raw.findings || []);
  const set = new Set(arr.map(fingerprint));
  return findings.filter(f => !set.has(fingerprint(f)));
}

function fingerprint(f) {
  if (f.partialFingerprints) {
    const fp = f.partialFingerprints.primaryLocationLineHash
            || f.partialFingerprints['primaryLocationLineHash/v1'];
    if (fp) return `${f.ruleId}|${fp}`;
  }
  return `${f.ruleId}|${f.file}|${(f.message || '').slice(0, 80)}`;
}

async function applyDiffFilter(findings) {
  const pr = getPrEvent();
  if (!pr) return findings;
  const files = await fetchPrFiles(pr.number);
  const lineMaps = {};
  for (const file of files) {
    if (!file.patch) continue;
    lineMaps[file.filename] = patchToChangedLines(file.patch);
  }
  return findings.filter(f => {
    const lines = lineMaps[f.file];
    if (!lines) return false;
    for (let l = f.startLine; l <= f.endLine; l++) {
      if (lines.has(l)) return true;
    }
    return false;
  });
}

function patchToChangedLines(patch) {
  // New-file line numbers that are part of the patch (added or context).
  const lines = new Set();
  const hunkRe = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
  let curr = null;
  for (const ln of patch.split('\n')) {
    const m = hunkRe.exec(ln);
    if (m) { curr = parseInt(m[1], 10); continue; }
    if (curr == null) continue;
    if (ln.startsWith('+++') || ln.startsWith('---')) continue;
    if (ln.startsWith('+')) { lines.add(curr); curr++; }
    else if (ln.startsWith('-')) { /* deletion: new file unchanged */ }
    else if (ln.startsWith(' ')) { lines.add(curr); curr++; }
  }
  return lines;
}

// ---------- GitHub API ----------

async function ghFetch(urlPath, opts = {}) {
  const url = urlPath.startsWith('http') ? urlPath : `${ctx.apiUrl}${urlPath}`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${ctx.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'codeql-for-private-repos',
    ...(opts.headers || {}),
  };
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const resp = await fetch(url, { ...opts, headers });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${opts.method || 'GET'} ${url} → ${resp.status}: ${text.slice(0, 500)}`);
  }
  if (resp.status === 204) return null;
  const ct = resp.headers.get('content-type') || '';
  return ct.includes('json') ? resp.json() : resp.text();
}

function getPrEvent() {
  if (!isPr) return null;
  if (!ctx.eventPath || !fs.existsSync(ctx.eventPath)) return null;
  try {
    const ev = JSON.parse(fs.readFileSync(ctx.eventPath, 'utf8'));
    if (!ev.pull_request) return null;
    return {
      number: ev.pull_request.number,
      headSha: ev.pull_request.head.sha,
      baseSha: ev.pull_request.base.sha,
    };
  } catch { return null; }
}

async function fetchPrFiles(prNumber) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const data = await ghFetch(`/repos/${owner}/${repoName}/pulls/${prNumber}/files?per_page=100&page=${page}`);
    if (!Array.isArray(data) || data.length === 0) break;
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

// ---------- Output: annotations ----------

function emitAnnotations(findings) {
  for (const f of findings) {
    const cmd = (f.score >= 7.0 || f.level === 'error') ? 'error' : 'warning';
    const title = `${f.severity.toUpperCase()}: ${f.ruleId}`;
    const props = [
      `file=${f.file}`,
      `line=${f.startLine}`,
      `endLine=${f.endLine}`,
      `col=${f.startColumn}`,
      `endColumn=${f.endColumn}`,
      `title=${escAnnot(title)}`,
    ].join(',');
    const body = (f.message || f.shortDesc || f.ruleId).replace(/\n/g, '%0A');
    console.log(`::${cmd} ${props}::${body}`);
  }
}

function escAnnot(s) {
  return String(s)
    .replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
    .replace(/,/g, '%2C').replace(/:/g, '%3A');
}

// ---------- Output: step summary ----------

function writeStepSummary(findings) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  let md = `## CodeQL Scan — ${inputs.language || 'all languages'}\n\n`;
  if (findings.length === 0) {
    md += '✅ **No findings.**\n';
  } else {
    const counts = countBySeverity(findings);
    md += '**' + findings.length + ' finding(s):** ';
    md += SEVERITY_ORDER
      .filter(s => counts[s])
      .map(s => `${counts[s]} ${s}`)
      .join(' · ');
    md += '\n\n';
    md += '| Severity | Rule | Location | Message |\n|---|---|---|---|\n';
    for (const f of findings.slice(0, 50)) {
      const linkedLoc = `[\`${f.file}:${f.startLine}\`](${ctx.serverUrl}/${ctx.repo}/blob/${ctx.sha}/${f.file}#L${f.startLine}-L${f.endLine})`;
      md += `| ${sevBadge(f.severity)} | \`${f.ruleId}\` | ${linkedLoc} | ${truncTable(f.message, 120)} |\n`;
    }
    if (findings.length > 50) {
      md += `\n_…and ${findings.length - 50} more in the SARIF artifact._\n`;
    }
  }
  fs.appendFileSync(summaryPath, md);
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

function countBySeverity(findings) {
  return findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {});
}

function sevBadge(s) {
  return ({
    critical: '🔴 Critical',
    high:     '🟠 High',
    medium:   '🟡 Medium',
    low:      '🔵 Low',
    info:     '⚪ Info',
  })[s] || s;
}

function truncTable(s, n) {
  s = String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---------- Output: tracking issue ----------

const ISSUE_BODY_LIMIT = 60000;

async function postIssue(findings) {
  const body = renderIssueBody(findings);
  const list = await ghFetch(
    `/repos/${owner}/${repoName}/issues?state=open&labels=${encodeURIComponent(inputs.issueLabel)}&per_page=10`
  );
  if (Array.isArray(list) && list.length > 0) {
    const num = list[0].number;
    await ghFetch(`/repos/${owner}/${repoName}/issues/${num}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: inputs.issueTitle, body }),
    });
    console.log(`Updated tracking issue #${num}.`);
  } else if (findings.length > 0) {
    const created = await ghFetch(`/repos/${owner}/${repoName}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: inputs.issueTitle,
        body,
        labels: [inputs.issueLabel],
      }),
    });
    console.log(`Created tracking issue #${created.number}.`);
  } else {
    console.log('No findings and no open issue — nothing to post.');
  }
}

function renderIssueBody(findings) {
  const branch = (ctx.ref || '').replace('refs/heads/', '');
  const runUrl = `${ctx.serverUrl}/${ctx.repo}/actions/runs/${ctx.runId}`;
  let md = '';
  md += `_Updated by [run #${ctx.runNumber}](${runUrl}) on \`${branch}\` at [\`${ctx.sha.slice(0, 7)}\`](${ctx.serverUrl}/${ctx.repo}/commit/${ctx.sha})._\n\n`;

  if (findings.length === 0) {
    md += '## ✅ No findings\n\nLatest scan is clean.\n';
    return md;
  }
  const counts = countBySeverity(findings);
  md += `## ${findings.length} finding(s)\n\n`;
  md += SEVERITY_ORDER
    .filter(s => counts[s])
    .map(s => `- ${sevBadge(s)} **${counts[s]}**`)
    .join('\n') + '\n\n';

  let bodyLen = md.length;
  let truncated = 0;
  for (let i = 0; i < findings.length; i++) {
    const block = renderFindingBlock(findings[i], i);
    if (bodyLen + block.length > ISSUE_BODY_LIMIT) {
      truncated = findings.length - i;
      break;
    }
    md += block;
    bodyLen += block.length;
  }
  if (truncated > 0) {
    md += `\n_…and ${truncated} more finding(s). Open the [SARIF artifact](${runUrl}) for the full list._\n`;
  }
  return md;
}

function renderFindingBlock(f, index) {
  const branchSha = ctx.sha;
  const fileLink = `${ctx.serverUrl}/${ctx.repo}/blob/${branchSha}/${f.file}#L${f.startLine}-L${f.endLine}`;
  let md = '';
  md += `<details>\n`;
  md += `<summary>${sevBadge(f.severity)} <code>${f.ruleId}</code> — ${escMd(f.shortDesc || truncTable(f.message, 80))}</summary>\n\n`;
  md += `**Location:** [\`${f.file}:${f.startLine}\`](${fileLink})\n\n`;
  md += `**Message:** ${f.message}\n\n`;
  if (f.helpUri) md += `**Reference:** ${f.helpUri}\n\n`;
  const flow = (f.codeFlows[0] && f.codeFlows[0].threadFlows && f.codeFlows[0].threadFlows[0]) || null;
  if (flow && Array.isArray(flow.locations) && flow.locations.length > 0) {
    md += `<b>Flow</b>\n\n`;
    for (const step of flow.locations.slice(0, 8)) {
      const phys = step.location && step.location.physicalLocation;
      if (!phys) continue;
      const sFile = phys.artifactLocation && phys.artifactLocation.uri;
      const sLine = phys.region && phys.region.startLine;
      const sMsg = (step.location.message && step.location.message.text) || '';
      md += `- \`${sFile}:${sLine}\` — ${escMd(sMsg)}\n`;
    }
    md += '\n';
  }
  md += `</details>\n\n`;
  return md;
}

function escMd(s) {
  return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- Output: PR review ----------

async function postPrReview(findings) {
  const pr = getPrEvent();
  if (!pr) return;
  const files = await fetchPrFiles(pr.number);
  const lineMaps = {};
  for (const file of files) {
    if (!file.patch) continue;
    lineMaps[file.filename] = patchToChangedLines(file.patch);
  }
  const comments = [];
  for (const f of findings) {
    const lines = lineMaps[f.file];
    if (!lines || !lines.has(f.startLine)) continue;
    comments.push({
      path: f.file,
      line: f.startLine,
      side: 'RIGHT',
      body: prCommentBody(f),
    });
  }
  if (comments.length === 0) {
    console.log('No PR comments — no findings on changed lines.');
    return;
  }

  const outsideDiff = findings.length - comments.length;
  let summary = `**CodeQL** flagged ${comments.length} issue(s) on changed lines.`;
  if (outsideDiff > 0) {
    const runUrl = `${ctx.serverUrl}/${ctx.repo}/actions/runs/${ctx.runId}`;
    summary += ` (${outsideDiff} additional finding(s) outside the diff — see the [run summary](${runUrl}).)`;
  }

  // GitHub caps a single review at 50 comments. Chunk if needed.
  const chunks = [];
  for (let i = 0; i < comments.length; i += 30) chunks.push(comments.slice(i, i + 30));
  for (let i = 0; i < chunks.length; i++) {
    await ghFetch(`/repos/${owner}/${repoName}/pulls/${pr.number}/reviews`, {
      method: 'POST',
      body: JSON.stringify({
        commit_id: pr.headSha,
        event: 'COMMENT',
        body: i === 0 ? summary : undefined,
        comments: chunks[i],
      }),
    });
  }
  console.log(`Posted PR review with ${comments.length} comment(s).`);
}

function prCommentBody(f) {
  let b = `**${sevBadge(f.severity)}** · \`${f.ruleId}\`\n\n${f.message}`;
  if (f.helpUri) b += `\n\n[Learn more](${f.helpUri})`;
  return b;
}

// ---------- Output: Slack ----------

async function postSlack(findings) {
  const minScore = parseThreshold(inputs.slackMinSev);
  const filtered = minScore === Infinity ? [] : findings.filter(f => f.score >= minScore);
  if (filtered.length === 0 && !inputs.slackOnClean) {
    console.log(`Slack: no findings ≥ threshold (${inputs.slackMinSev}). Skipping.`);
    return;
  }

  const repoUrl = `${ctx.serverUrl}/${ctx.repo}`;
  const runUrl = `${repoUrl}/actions/runs/${ctx.runId}`;
  const branch = (ctx.ref || '').replace('refs/heads/', '');
  const counts = countBySeverity(filtered);

  const headerText = filtered.length === 0
    ? `CodeQL: clean run on ${ctx.repo}`
    : `CodeQL: ${filtered.length} finding(s) in ${ctx.repo}`;

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: headerText } },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `<${runUrl}|Run #${ctx.runNumber}> · \`${branch}\` · \`${ctx.sha.slice(0, 7)}\`${inputs.language ? ` · _${inputs.language}_` : ''}`,
      }],
    },
  ];

  if (filtered.length > 0) {
    const sevLine = SEVERITY_ORDER
      .filter(s => counts[s])
      .map(s => `*${counts[s]}* ${s}`).join(' · ');
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: sevLine } });

    const top = filtered.slice(0, 5).map(f => {
      const link = `<${repoUrl}/blob/${ctx.sha}/${f.file}#L${f.startLine}|${f.file}:${f.startLine}>`;
      return `• \`${f.ruleId}\` — ${link}`;
    }).join('\n');
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: top } });

    if (filtered.length > 5) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `_…and ${filtered.length - 5} more in the <${runUrl}|run summary>._` }],
      });
    }
  }

  const payload = { text: headerText, blocks };
  const resp = await fetch(inputs.slackWebhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    throw new Error(`Slack webhook ${resp.status}: ${await resp.text()}`);
  }
  console.log('Slack notification sent.');
}

main().catch(e => { console.error(e); process.exit(1); });
