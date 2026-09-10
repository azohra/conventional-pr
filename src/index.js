import { readFileSync } from 'node:fs';
import { validate } from './validate.js';

try {
  if (!process.env.GITHUB_EVENT_PATH) throw new Error('A pull request event is required.');
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (!event.pull_request) throw new Error('A pull request event is required.');
  const errors = validate(event.pull_request);
  for (const error of errors) {
    // Workflow-command escaping; PR text is never evaluated or emitted as code.
    const message = error.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.error(`::error title=Conventional PR::${message}`);
  }
  if (errors.length) process.exitCode = 1;
} catch {
  console.error('::error title=Conventional PR::Could not read a valid pull request event.');
  process.exitCode = 1;
}
