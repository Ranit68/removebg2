import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules', '@imgly', 'background-removal-data', 'dist');
const target = resolve(root, 'public', 'background-removal');

if (existsSync(source)) {
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
  console.log('Copied IMG.LY background-removal assets.');
} else {
  console.warn('IMG.LY background-removal-data assets were not found.');
}
