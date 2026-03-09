import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const defaults = { CLI_CEB_DEV: 'false', CLI_CEB_FIREFOX: 'false' };

const args = process.argv.slice(2);
for (const arg of args) {
  const eq = arg.indexOf('=');
  if (eq > 0) {
    const key = arg.slice(0, eq);
    const value = arg.slice(eq + 1);
    if (key.startsWith('CLI_CEB_')) defaults[key] = value;
  }
}

const envPath = join(rootDir, '.env');
let cebLines = [];
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  cebLines = content.split('\n').filter((line) => /^CEB_/.test(line.trim().split('=')[0]));
}

const out = [
  '# THOSE VALUES ARE EDITABLE ONLY VIA CLI',
  `CLI_CEB_DEV=${defaults.CLI_CEB_DEV}`,
  `CLI_CEB_FIREFOX=${defaults.CLI_CEB_FIREFOX}`,
  '',
  '# THOSE VALUES ARE EDITABLE',
  ...cebLines,
].join('\n');

writeFileSync(envPath, out);
