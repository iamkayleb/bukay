#!/usr/bin/env node

/**
 * Resolve the first *working* GitHub token from an ordered candidate list.
 *
 * Why this exists: token selection like
 *   `${{ secrets.owner_pr_pat || secrets.service_bot_pat || github.token }}`
 * picks the first NON-EMPTY secret. A present-but-expired PAT is still a
 * non-empty string, so it gets selected and the call hard-fails with
 * `401 Bad credentials` — the `|| github.token` fallback never triggers.
 *
 * This resolver probes each candidate against the GitHub API and picks the
 * first that actually authenticates, so an expired OWNER_PR_PAT falls through
 * to SERVICE_BOT_PAT (and, last resort, the Actions token) instead of wedging
 * the workflow.
 *
 * Pure core (`pickWorkingToken`) is dependency-injected for unit tests.
 *
 * CLI: reads candidate tokens from env and probes `GET /repos/$GITHUB_REPOSITORY`.
 *   Env in (all optional):
 *     CAND_OWNER_PR_PAT, CAND_SERVICE_BOT_PAT, CAND_GITHUB_TOKEN
 *     GITHUB_REPOSITORY (owner/repo), GITHUB_API_URL (default https://api.github.com)
 *   Writes:
 *     BRIDGE_TOKEN=<token>        -> $GITHUB_ENV     (value is a secret; auto-masked)
 *     source=<name>              -> $GITHUB_OUTPUT
 *     downstream_safe=true|false -> $GITHUB_OUTPUT   (false = fell back to the
 *                                   Actions token, which cannot trigger
 *                                   downstream workflows)
 *   Exits non-zero (loud) if NO candidate authenticates.
 */

/**
 * @param {Array<{name:string, token:string, downstreamSafe:boolean}>} candidates
 * @param {(token:string)=>Promise<boolean>} probe returns true if the token authenticates
 * @returns {Promise<{name:string, token:string, downstreamSafe:boolean}|null>}
 */
async function pickWorkingToken(candidates, probe) {
  for (const candidate of candidates || []) {
    if (!candidate || !candidate.token) {
      continue;
    }
    let ok = false;
    try {
      ok = await probe(candidate.token);
    } catch (_) {
      ok = false;
    }
    if (ok) {
      return candidate;
    }
  }
  return null;
}

function buildCandidates(env) {
  return [
    { name: 'owner_pr_pat', token: env.CAND_OWNER_PR_PAT || '', downstreamSafe: true },
    { name: 'service_bot_pat', token: env.CAND_SERVICE_BOT_PAT || '', downstreamSafe: true },
    { name: 'github_token', token: env.CAND_GITHUB_TOKEN || '', downstreamSafe: false },
  ];
}

function httpsProbe(apiUrl, repo) {
  const https = require('https');
  const url = `${apiUrl.replace(/\/$/, '')}/repos/${repo}`;
  return (token) =>
    new Promise((resolve) => {
      const req = https.request(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: `token ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'resolve-working-token',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          timeout: 15000,
        },
        (res) => {
          // Drain and discard the body.
          res.on('data', () => {});
          res.on('end', () => resolve(res.statusCode === 200));
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
}

async function main() {
  const fs = require('fs');
  const env = process.env;
  const repo = env.GITHUB_REPOSITORY;
  const apiUrl = env.GITHUB_API_URL || 'https://api.github.com';
  if (!repo) {
    console.error('::error::GITHUB_REPOSITORY not set; cannot probe tokens');
    process.exit(1);
  }

  const candidates = buildCandidates(env);
  const probe = httpsProbe(apiUrl, repo);

  // Warn about present-but-invalid PATs so the failure is visible, not silent.
  for (const candidate of candidates) {
    if (candidate.name === 'github_token' || !candidate.token) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const ok = await probe(candidate.token);
    if (!ok) {
      console.log(
        `::warning::${candidate.name} is set but failed authentication ` +
          `(expired/revoked?) — falling through to the next credential.`
      );
    }
  }

  const winner = await pickWorkingToken(candidates, probe);
  if (!winner) {
    console.error(
      '::error::No working bridge token found. Refresh OWNER_PR_PAT / ' +
        'SERVICE_BOT_PAT in repo secrets (see health-47-pat-check).'
    );
    process.exit(1);
  }

  if (env.GITHUB_ENV) {
    fs.appendFileSync(env.GITHUB_ENV, `BRIDGE_TOKEN=${winner.token}\n`);
  }
  if (env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      env.GITHUB_OUTPUT,
      `source=${winner.name}\ndownstream_safe=${winner.downstreamSafe}\n`
    );
  }
  console.log(`Resolved bridge token: ${winner.name}`);
  if (!winner.downstreamSafe) {
    console.log(
      '::warning::Falling back to the Actions token (GITHUB_TOKEN). The PR ' +
        'will be created, but GitHub will NOT trigger downstream workflows ' +
        '(keepalive/gate) from it. Refresh a bot PAT to restore automation.'
    );
  }
}

module.exports = { pickWorkingToken, buildCandidates, httpsProbe };

if (require.main === module) {
  main().catch((error) => {
    console.error(`::error::resolve_working_token failed: ${error.message}`);
    process.exit(1);
  });
}
