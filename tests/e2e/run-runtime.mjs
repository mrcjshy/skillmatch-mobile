// TesterArmy's real standalone fixture graph keeps results inline without report.json.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pinnedImport } from './runtime-tools.mjs';
import raw from '../../e2e.runtime.config.mjs';
const { resolveConfig } = await pinnedImport('e2e/dist/config/resolve.js');
const { collectModule } = await pinnedImport('e2e/dist/collect/registry.js');
const { openStandaloneAttempt } = await pinnedImport('e2e/dist/run/standalone.js');
const config = resolveConfig(raw, { projectRoot: process.cwd(), env: process.env });
const target = config.targets.find(item => item.name === (process.env.SKILLMATCH_RUNTIME_TARGET ?? 'client-runtime01'));
const moduleFile = path.resolve(process.argv[2]);
const registration = await collectModule(() => import(pathToFileURL(moduleFile).href), moduleFile);
let attempt;
try {
  attempt = await openStandaloneAttempt({ config, target, headed: true, env: process.env,
    signal: new AbortController().signal, timeoutMs: Number(process.env.SKILLMATCH_RUNTIME_TIMEOUT ?? 300000),
    notice: (target, message) => console.log('NOTICE', target, message),
    onProgress: progress => console.log('STEP', progress.kind, progress.label ?? progress.api ?? '') });
  if (process.env.SKILLMATCH_RUNTIME_CONNECT !== '0') {
    if (process.env.SKILLMATCH_RUNTIME_PERMISSION_RESET === '1') await attempt.fixtures.device.setPermission('location', 'reset');
    await attempt.fixtures.device.closeApp();
    await attempt.fixtures.device.openLink('skillmatchmobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081');
  }
  for (const entry of registration.tests) {
    if (process.env.SKILLMATCH_RUNTIME_TEST_MATCH && !entry.title.includes(process.env.SKILLMATCH_RUNTIME_TEST_MATCH)) continue;
    console.log('TEST', entry.title);
    await entry.fn(attempt.fixtures);
    console.log('PASS', entry.title);
  }
} catch (error) {
  console.log('FAIL', error.code ?? error.name, error.message);
  if (error.details) console.log('DETAIL', JSON.stringify(error.details));
  if (attempt) {
    try { console.log('SCREENSHOT', await attempt.fixtures.app.screenshot('runtime-failure')); } catch (capture) { console.log('CAPTURE', capture.message); }
    try {
      const observation = await attempt.session.observe({ signal: attempt.budget.signal, timeoutMs: 15000,
        runId: attempt.runId, attemptId: attempt.attemptId, origin: 'test' });
      const concise = (value) => {
        if (!value || typeof value !== 'object') return;
        if (value.role || value.name) console.log('NODE', JSON.stringify({ role: value.role, name: value.name, states: value.states }));
        for (const child of Object.values(value)) {
          if (Array.isArray(child)) child.forEach(concise);
          else if (child && typeof child === 'object') concise(child);
        }
      };
      concise(observation);
    } catch (capture) { console.log('OBSERVATION_ERROR', capture.message); }
  }
  process.exitCode = 1;
} finally {
  if (attempt) console.log('CLEANUP', JSON.stringify(await attempt.close()));
}
