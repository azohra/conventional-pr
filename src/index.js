import { readFileSync } from 'node:fs';
import { validate } from './validate.js';

try {
  const input = process.env['INPUT_PULL-REQUEST'];
  const record = input?.trim()
    ? JSON.parse(input)
    : JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request;
  if (!record) throw new Error('A pull request record is required.');
  const errors = validate(record);
  for (const error of errors) {
    // Workflow-command escaping; PR text is never evaluated or emitted as code.
    const message = error.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.error(`::error title=Conventional PR::${message}`);
  }
  if (errors.length) process.exitCode = 1;
} catch {
  console.error('::error title=Conventional PR::Could not read a valid pull request record.');
  process.exitCode = 1;
}
