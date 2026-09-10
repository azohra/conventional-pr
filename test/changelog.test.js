import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const message = `fix(parser)!: reject obsolete input

Keep **formatting** and explain the change.

- Preserve the first outcome.
- Preserve the second outcome.

\`\`\`sh
printf 'example'
\`\`\`

BREAKING CHANGE: Use the replacement input.
Security: Reject the unsafe form.
Deprecated: Use the new spelling.
Fixes #123`;

function cliff(...args) {
  return execFileSync('git-cliff', [
    '--offline', '--config', 'cliff.toml', 'HEAD..HEAD',
    '--with-commit', message, ...args,
  ], { encoding: 'utf8' });
}

test('notes preserve explanations and visible footers without duplicating migration instructions', () => {
  const notes = cliff();
  assert.match(notes, /<details>[\s\S]*Keep \*\*formatting\*\*[\s\S]*<\/details>/);
  assert.match(notes, /- Preserve the first outcome\./);
  assert.match(notes, /`{3,}sh\nprintf 'example'/);
  const visible = notes.slice(0, notes.indexOf('<details>'));
  assert.match(visible, /\*\*Security:\*\* Reject the unsafe form\./);
  assert.match(visible, /\*\*Deprecated:\*\* Use the new spelling\./);
  assert.match(visible, /\*\*Fixes:\*\* \\?#123/);
  assert.equal(notes.split('Use the replacement input.').length - 1, 1);
});

test('structured output retains the body and every footer', () => {
  const commits = JSON.parse(cliff('--context')).flatMap(release => release.commits);
  const record = commits.find(commit => commit.scope === 'parser');
  assert.ok(record.body.includes('**formatting**'));
  assert.deepEqual(record.footers.map(footer => footer.token), [
    'BREAKING CHANGE', 'Security', 'Deprecated', 'Fixes',
  ]);
});

test('the first release links to its tag instead of an empty comparison base', () => {
  const notes = cliff('--tag', 'v1.0.0');
  assert.match(notes, /\/releases\/tag\/v1\.0\.0/);
  assert.doesNotMatch(notes, /\/compare\//);
});

test('an empty range has no release heading', () => {
  const notes = execFileSync('git-cliff', [
    '--offline', '--config', 'cliff.toml', 'HEAD..HEAD',
  ], { encoding: 'utf8' });
  assert.equal(notes.trim(), '');
});

test('the first calculated version matches the supported tag format', () => {
  assert.equal(cliff('--bumped-version').trim(), 'v0.1.0');
});
