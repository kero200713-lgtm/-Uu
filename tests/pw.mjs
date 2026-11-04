// Resolves Playwright from the project or from the machine's global install
// (NODE_PATH), so `npm install` pruning node_modules never breaks the tests.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pw = require('playwright');
export const { chromium, devices } = pw;
