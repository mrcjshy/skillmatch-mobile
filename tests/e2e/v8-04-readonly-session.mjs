// Test-only host for deterministic, existing-session Android assertions.
// No model, screenshots, reports, app restart, or destructive session teardown.
// Close ends TesterArmy's host attempt; the borrowed daemon session/app stays alive
// to preserve the Client's memory-only draft. Exit this host before Argent use.
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { pinnedImport, expect } from './runtime-tools.mjs';
const { resolveConfig } = await pinnedImport('e2e/dist/config/resolve.js');
const { openStandaloneAttempt } = await pinnedImport('e2e/dist/run/standalone.js');
const { buildEngine } = await pinnedImport('@e2e-dev/mobile/dist/engine.js');
const { AgentDeviceSurface } = await pinnedImport('@e2e-dev/mobile/dist/surface.js');
const { createAgentDeviceClient } = await pinnedImport('agent-device/dist/src/index.js');
const role = process.argv[2];
const target = { client: ['emulator-5558', 'client'], worker: ['emulator-5560', 'admin'], admin: ['emulator-5556', 'v804-admin'] }[role];
if (!target) throw new Error('Explicit verified role required');
const previousKeyboard = execFileSync('adb', ['-s', target[0], 'shell', 'settings', 'get', 'secure', 'default_input_method'], { timeout: 15000, encoding: 'utf8' }).trim();
const client = createAgentDeviceClient({ session: target[1] });
const borrowed = { ...client, sessions: { ...client.sessions, close: async () => undefined } };
const surface = new AgentDeviceSurface({ platform: 'android', device: target[0], session: target[1], settle: 200 }, () => borrowed);
const config = resolveConfig({ targets: [{ name: role, engine: buildEngine(surface), app: { bundleId: 'com.mrcjshy.skillmatch' } }],
  workers: 1, retries: 0, timeout: 180000, launchTimeout: 60000, actionTimeout: 20000,
  assertionTimeout: 12000, cleanupTimeout: 15000, cache: { mode: 'off' }, video: 'off', trace: 'off',
}, { projectRoot: process.cwd(), env: process.env });
const attempt = await openStandaloneAttempt({ config, target: config.targets[0], headed: true,
  env: process.env, signal: new AbortController().signal, timeoutMs: 7200000,
  notice: (_target, message) => console.log('NOTICE', message),
});
const { screen, device } = attempt.fixtures;
// Inspection stays in memory. Callers print only non-sensitive labels or booleans.
const snapshot = () => client.capture.snapshot();
const state = {};
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
console.log('READY', role, target[0]);
try {
  for await (const line of readline.createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (line.trim() === 'exit') break;
    if (!line.trim()) continue;
    const input = JSON.parse(line);
    try {
      await new AsyncFunction('screen', 'device', 'expect', 'snapshot', 'state', input.code)(screen, device, expect, snapshot, state);
      console.log('PASS', input.name);
    } catch (error) {
      console.log('FAIL', input.name, error.code ?? error.name, String(error.message).slice(0,800));
    }
  }
} finally {
  await surface.settleInflight(new AbortController().signal);
  console.log('CLEANUP', JSON.stringify(await attempt.close()));
  // The accessibility instrumentation otherwise survives the host and blocks
  // Argent/uiautomator. Its target is the helper itself, never SkillMatch.
  execFileSync('adb', ['-s', target[0], 'shell', 'am', 'force-stop', 'com.callstack.agentdevice.snapshothelper'], { timeout: 15000 });
  if (previousKeyboard && previousKeyboard !== 'null') {
    execFileSync('adb', ['-s', target[0], 'shell', 'ime', 'set', previousKeyboard], { timeout: 15000 });
  }
  console.log('RELEASED', target[0], 'host and accessibility controller ended; existing app/session retained');
}
