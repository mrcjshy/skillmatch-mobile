// Reuse the established installed TesterArmy pins; no package installation.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const root = process.env.SKILLMATCH_TESTERARMY_ROOT;
if (!root) throw new Error('SKILLMATCH_TESTERARMY_ROOT is required');
for (const [name, expected] of [['e2e', '0.16.0'], ['@e2e-dev/mobile', '0.9.1'], ['agent-device', '0.21.18']]) {
  const actual = JSON.parse(readFileSync(path.join(root, name, 'package.json'), 'utf8')).version;
  if (actual !== expected) throw new Error(`${name}: expected established pin ${expected}, found ${actual}`);
}
export const pinnedImport = name => import(pathToFileURL(path.join(root, name)).href);
export const { test, expect } = await pinnedImport('e2e/dist/index.js');
export const { mobile } = await pinnedImport('@e2e-dev/mobile/dist/index.js');
