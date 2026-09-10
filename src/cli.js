import { readFileSync } from 'node:fs';
import { validate } from './validate.js';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const errors = validate(input);
  for (const error of errors) console.error(error);
  if (errors.length) process.exitCode = 1;
} catch {
  console.error('Provide a JSON object with title and body on standard input.');
  process.exitCode = 1;
}
