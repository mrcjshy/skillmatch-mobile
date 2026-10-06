/* global __dirname */
const path = require('node:path');

module.exports = {
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: { environment: 'node', setupFiles: ['./vitest.setup.cjs'] },
};
