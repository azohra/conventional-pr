import { CommitParser } from 'conventional-commits-parser';

const types = new Set([
  'build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor',
  'revert', 'style', 'test',
]);

// Keep the normal and breaking headers on the same correspondence. Do not use
// breakingHeaderPattern: its synthetic note would hide a missing footer.
const options = {
  headerPattern: /^([a-z]+)(?:\(([^()\r\n]+)\))?(!)?: (\S[^\r\n]*)$/i,
  headerCorrespondence: ['type', 'scope', 'breaking', 'subject'],
  noteKeywords: ['BREAKING CHANGE', 'BREAKING-CHANGE', 'Security', 'Deprecated'],
  notesPattern: keywords => new RegExp(`^(${keywords})(?::(?:[ \\t]+|(?=$))| #)(.*)$`, 'i'),
  fieldPattern: /(?!)/,
};

export function validate({ title, body = '' } = {}) {
  if (typeof title !== 'string' || !title.trim()) {
    return ['Provide a Conventional PR title, for example: fix(parser): reject invalid input.'];
  }
  if (body === null) body = '';
  if (typeof body !== 'string') return ['PR body must be text or null.'];
  if (/[\r\n]/.test(title)) return ['Keep the PR title on one line.'];

  const parser = new CommitParser(options);
  const commit = parser.parse(`${title}\n\n${body}`);
  const errors = [];
  if (!commit.type || !commit.subject?.trim() || (commit.scope !== null && !commit.scope.trim())) {
    errors.push('Use type(scope): description, with an optional scope and ! immediately before the colon.');
  } else if (!types.has(commit.type)) {
    errors.push(`Use a lowercase type: ${[...types].join(', ')}.`);
  }

  for (const line of body.split(/\r?\n/)) {
    if (/^(?:BREAKING[ -]CHANGE|Security|Deprecated):\S/i.test(line)) {
      errors.push('Put a space after the annotation colon, for example: Security: explanation.');
    }
    if (/^BREAKING[ -]CHANGE #/i.test(line)) {
      errors.push('Use a colon and space for a breaking footer: BREAKING CHANGE: explanation.');
    }
  }

  const explanation = commit.body?.replace(/\r\n/g, '\n').trim();
  if (explanation) {
    const headings = explanation.match(/^## .*$/gm) ?? [];
    if (!explanation.startsWith('## Summary\n\n') ||
        !['## Summary', '## Summary|## Details'].includes(headings.join('|'))) {
      errors.push('Start the explanation with ## Summary, then optionally ## Details. Use ### for subsections; indent literal examples of these reserved headings.');
    } else {
      const sections = explanation.replace(/^## Summary\n\n/, '').split('\n\n## Details\n\n');
      if (sections.some(section => !section.trim()) ||
          (headings.length === 2 && sections.length !== 2)) {
        errors.push('Give each section content and separate its heading with blank lines. Omit Details when there is nothing to add.');
      }
    }
  }

  const breaking = commit.notes.filter(note => /^BREAKING[ -]CHANGE$/i.test(note.title));
  if (commit.breaking && !breaking.length) {
    errors.push('The title has !; add BREAKING CHANGE: explaining the affected contract and migration.');
  }
  if (breaking.length && !commit.breaking) {
    errors.push('The body declares a breaking change; add ! immediately before the title colon.');
  }
  for (const note of commit.notes) {
    if (/^BREAKING[ -]CHANGE$/i.test(note.title) && note.title !== note.title.toUpperCase()) {
      errors.push('Write the breaking footer token in uppercase: BREAKING CHANGE: or BREAKING-CHANGE:.');
    }
    if (!note.text?.trim()) {
      errors.push(`${note.title}: needs an explanation; remove an optional annotation when it does not apply.`);
    }
  }

  // The parser accepts a footer directly after prose. Our record contract
  // requires the separating blank line so the boundary is deliberate.
  if (commit.footer) {
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    const first = commit.footer.split('\n')[0];
    const start = lines.indexOf(first);
    if (start > 0 && lines[start - 1].trim()) {
      errors.push('Separate the footer section from the explanation with a blank line.');
    }
  }
  return [...new Set(errors)];
}
