import { mobile } from './tests/e2e/runtime-tools.mjs';
export default {
  targets: [
    { name: 'client-runtime01', engine: mobile({ platform: 'android', device: 'emulator-5558', session: 'ft03-runtime01-client' }), app: { bundleId: 'com.mrcjshy.skillmatch' } },
    { name: 'worker-runtime01', engine: mobile({ platform: 'android', device: 'emulator-5556', session: 'ft03-runtime01-worker' }), app: { bundleId: 'com.mrcjshy.skillmatch' } },
  ],
  tests: ['tests/e2e/*.runtime.e2e.mjs'],
  workers: 1, retries: 0, timeout: 180000, launchTimeout: 60000,
  actionTimeout: 30000, assertionTimeout: 15000, cleanupTimeout: 20000,
  cache: { mode: 'off' }, video: 'off', trace: 'off',
};
