import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const directory = 'dist';
const license = await readFile('node_modules/conventional-commits-parser/LICENSE.md', 'utf8');
const result = await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  write: false,
  banner: { js: `/*! conventional-commits-parser — MIT\n${license}\n*/` },
});
const output = result.outputFiles[0].text;
if (process.argv.includes('--check')) {
  if (await readFile(`${directory}/index.js`, 'utf8') !== output) {
    console.error('The action bundle is stale. Run mise run build and commit the result.');
    process.exitCode = 1;
  }
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/index.js`, output);
}
