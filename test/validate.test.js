import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { validate } from '../src/validate.js';

const pass = [
  ['short PR', { title: 'docs: correct a typo' }],
  ['null body', { title: 'fix: preserve existing records', body: null }],
  ['scope', { title: 'feat(@scope/package): support structured input' }],
  ['large Markdown body', { title: 'feat: add import and export', body: '### Import\n\n- Read JSON files.\n- Preserve Unicode.\n\n### Export\n\n| Format | Support |\n| --- | --- |\n| JSON | Yes |\n\n```js\nconst example = { name: "hello" };\n```\n\n<details><summary>Context</summary>\n\nThe previous format remains supported.\n\n</details>' }],
  ['breaking with migration', { title: 'feat(api)!: replace the legacy endpoint', body: 'Accept structured records.\n\nBREAKING CHANGE: The legacy endpoint is removed.\nUse /records instead.\nRefs: #123' }],
  ['alternate breaking token', { title: 'build!: drop an old runtime', body: 'BREAKING-CHANGE: Install the supported runtime.' }],
  ['optional enrichment', { title: 'fix(parser): reject malformed records', body: 'Return a validation error.\n\nSecurity: Invalid records no longer terminate the process.\nDeprecated: The legacy flag remains supported; use --format.\nFixes #123' }],
  ['case-insensitive optional token', { title: 'fix: reject invalid input', body: 'security: Invalid input no longer terminates the process.' }],
  ['multiline optional footer', { title: 'fix: reject invalid input', body: 'Security: Reject invalid input\nwithout terminating the process.\nRefs: #1' }],
  ['unknown footer', { title: 'docs: explain record formats', body: 'Explain the supported formats.\n\nReviewed-by: Example Contributor\nCustom-Context: Additional context.' }],
  ['optional prose is not required', { title: 'chore: update metadata', body: '' }],
  ['hash footer separator', { title: 'fix: preserve records', body: 'Security #Malformed records no longer terminate the process.' }],
  ['indented literal footers', { title: 'docs: explain annotations', body: 'Example syntax:\n\n    Security:\n    BREAKING CHANGE: example\n' }],
  ['CRLF', { title: 'fix!: replace the file format', body: 'Read the new format.\r\n\r\nBREAKING CHANGE: Convert old files.\r\nRefs: #1' }],
];
for (const [, record] of pass) {
  if (record.body && !/^(?:BREAKING[ -]CHANGE|Security|Deprecated|security)(?::| #)/.test(record.body)) {
    record.body = `## Summary\n\n${record.body}`;
  }
}
pass.push(['summary and details', { title: 'feat: add profiles', body: '## Summary\n\nSwitch profiles.\n\n## Details\n\n### Connections\n\nKeep requests running.\n\nSecurity: Logs omit credentials.' }]);
for (const [name, record] of pass) test(name, () => assert.deepEqual(validate(record), []));

const fail = [
  ['missing summary heading', { title: 'feat: add profiles', body: 'Switch profiles.' }, /## Summary/],
  ['empty summary', { title: 'feat: add profiles', body: '## Summary\n\n## Details\n\nImplementation.' }, /content/],
  ['empty details', { title: 'feat: add profiles', body: '## Summary\n\nSwitch profiles.\n\n## Details' }, /content/],
  ['duplicate summary', { title: 'feat: add profiles', body: '## Summary\n\nOne.\n\n## Summary\n\nTwo.' }, /## Summary/],
  ['reserved marker in example', { title: 'docs: explain records', body: '## Summary\n\nExample:\n\n```md\n## Details\n```' }, /content/],
  ['non-Conventional title', { title: 'Update records' }, /type\(scope\)/],
  ['blank scope', { title: 'fix( ): preserve records' }, /type\(scope\)/],
  ['missing subject', { title: 'fix: ' }, /type\(scope\)/],
  ['multiline title', { title: 'fix: records\nnew title' }, /one line/],
  ['existing type allowlist', { title: 'unknown: change records' }, /lowercase type/],
  ['existing lowercase convention', { title: 'FIX: change records' }, /lowercase type/],
  ['missing breaking explanation', { title: 'fix!: reject old records' }, /add BREAKING CHANGE/],
  ['missing title marker', { title: 'fix: reject old records', body: 'BREAKING CHANGE: Convert existing records.' }, /add !/],
  ['lowercase breaking token', { title: 'fix!: reject old records', body: 'breaking change: Convert existing records.' }, /uppercase/],
  ['empty breaking annotation', { title: 'fix!: reject old records', body: 'BREAKING CHANGE: \nRefs: #1' }, /needs an explanation/],
  ['empty optional annotation', { title: 'fix: reject invalid input', body: 'Security:' }, /needs an explanation/],
  ['empty annotation before another', { title: 'docs: describe options', body: 'Deprecated: \nRefs: #1' }, /needs an explanation/],
  ['missing annotation separator space', { title: 'fix: reject input', body: 'Security:Reject invalid input.' }, /space after/],
  ['breaking footer requires colon', { title: 'fix!: reject input', body: 'BREAKING CHANGE #Convert old records.' }, /colon and space/],
  ['unseparated footer', { title: 'fix: reject invalid input', body: 'Validate input.\nSecurity: Invalid input no longer terminates the process.' }, /blank line/],
];
for (const [name, record, expected] of fail) test(name, () => assert.match(validate(record).join('\n'), expected));

function run(entry, record, action = false) {
  const directory = mkdtempSync(join(tmpdir(), 'conventional-pr-'));
  try {
    const eventPath = join(directory, 'event.json');
    writeFileSync(eventPath, JSON.stringify(record));
    return spawnSync(process.execPath, [resolve(entry)], {
      cwd: directory,
      input: JSON.stringify(record),
      encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_PATH: action ? eventPath : '' },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('local CLI and packaged action agree on all cases outside the checkout', () => {
  for (const [, record] of [...pass, ...fail]) {
    const expected = validate(record).length ? 1 : 0;
    const local = run('src/cli.js', record);
    const action = run('dist/index.js', { pull_request: record }, true);
    assert.equal(local.status, expected, local.stderr);
    assert.equal(action.status, expected, action.stderr);
  }
});

test('packaged action rejects a missing PR event', () => {
  assert.equal(run('dist/index.js', {}, true).status, 1);
});

test('PR contents cannot inject workflow commands or execute shell text', () => {
  const record = { title: 'fix: preserve records', body: '## Summary\n\n$(exit 99)\n`exit 99`\n::error::untrusted text' };
  const result = run('dist/index.js', { pull_request: record }, true);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout + result.stderr, '');
});
