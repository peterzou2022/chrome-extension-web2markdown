import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const logoPath = join(rootDir, 'docs', 'logo.png');
const publicDir = join(rootDir, 'chrome-extension', 'public');

if (!existsSync(logoPath)) {
  console.warn('docs/logo.png not found, skip copying icons.');
  process.exit(0);
}

copyFileSync(logoPath, join(publicDir, 'icon-128.png'));
copyFileSync(logoPath, join(publicDir, 'icon-34.png'));
console.log('Extension icons updated from docs/logo.png');
