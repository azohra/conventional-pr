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
  assert.match(notes, /Keep \*\*formatting\*\*/);
  assert.match(notes, /- Preserve the first outcome\./);
  assert.match(notes, /`{3,}sh\n[ \t]*printf 'example'/);
  const visible = notes.replace(/<details(?: open)?>[\s\S]*?<\/details>/g, '');
  assert.match(visible, /\*\*Security:\*\*[\s\S]*Reject the unsafe form\./);
  assert.match(visible, /\*\*Deprecated:\*\*[\s\S]*Use the new spelling\./);
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

test('notes classify outcomes and escape HTML in titles', () => {
  const notes = cliff('--with-commit', 'feat: handle <input> & "quoted" values\n\nExplain **why**.');
  assert.match(notes, /handle \\<input\\> & "quoted" values/);
  assert.ok(notes.indexOf('Added') < notes.indexOf('Fixed'));
  assert.ok(notes.indexOf('Breaking:') < notes.indexOf('Added'));
  assert.doesNotMatch(notes, /### .*Documentation/);
  assert.doesNotMatch(notes, /\[\]\(/);
});

test('the Summary expands into Details without losing Markdown or footer notices', () => {
  const notes = cliff('--with-commit', 'feat: add profiles\n\n## Summary\n\nSwitch profiles without restarting.\n\n- Preserve connections.\n- Keep settings.\n\n## Details\n\nImplementation **rationale**.');
  const visible = notes.replace(/<details>\s*(<summary>[\s\S]*?<\/summary>)[\s\S]*?<\/details>/g, '$1');
  assert.match(visible, /Switch profiles without restarting/);
  assert.match(visible, /- Preserve connections/);
  assert.doesNotMatch(visible, /Implementation/);
  assert.match(notes, /<details>[\s\S]*Implementation \*\*rationale\*\*/);
  assert.equal(notes.split('Switch profiles without restarting.').length - 1, 1);
  assert.ok(visible.includes('Keep **formatting**')); // Historical unstructured records remain intact.
  assert.doesNotMatch(notes, /## Summary|## Details|Change details/);
});

test('CRLF section markers render the same disclosure', () => {
  const notes = cliff('--with-commit', 'feat: add workspaces\r\n\r\n## Summary\r\n\r\nSwitch workspaces.\r\n\r\n## Details\r\n\r\nRetain connections.');
  assert.match(notes, /<summary>[\s\S]*Switch workspaces/);
  assert.match(notes, /<\/summary>[\s\S]*Retain connections/);
});
