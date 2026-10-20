// Local-only QA Metro; never stops or replaces candidate Metro 8084.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prepared = JSON.parse(readFileSync(path.join(root, 'evidence/prepared-source.json'), 'utf8'));
const workspace = prepared.workspace;
const config = JSON.parse(readFileSync(path.join(workspace, 'app.json'), 'utf8')).expo;
if (config.android.package !== 'com.mrcjshy.skillmatch.uiv3qa' || config.scheme !== 'skillmatchuiv3qa') throw Error('QA identity mismatch');
const metroConfig = path.join(workspace, 'metro.config.cjs');
const expectedConfig = String.raw`// Diagnostic-only: skip private native build/cache outputs, preserve Expo defaults.
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.blockList = [...[config.resolver.blockList ?? []].flat(), /[/\\]gradle-cache[/\\]/, /[/\\]android[/\\](?:build|\\.cxx)[/\\]/];
// Keep one JS runtime/view registry aligned with the private native build.
const path = require('node:path');
const singletonNames = ['react', 'react-native', 'react-native-safe-area-context', '@react-native/virtualized-lists'];
const canonicalModules = path.join(__dirname, 'node_modules');
config.resolver.resolveRequest = (context, moduleName, platform) => context.resolveRequest(
  singletonNames.some(name => moduleName === name || moduleName.startsWith(name + '/'))
    ? { ...context, disableHierarchicalLookup: true, nodeModulesPaths: [canonicalModules] }
    : context, moduleName, platform);
config.maxWorkers = 2;
module.exports = config;
`;
// This workspace's diagnostic Metro config is reproducible and never written into the candidate.
writeFileSync(metroConfig, expectedConfig);
const keys = JSON.parse(readFileSync(process.env.UIV3_LOCAL_KEYS, 'utf8').replace(/^\uFEFF/, ''));
if (keys.API_URL !== 'http://127.0.0.1:54321' || !keys.ANON_KEY) throw Error('Local keys only');
const probe = net.createServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(8086, '127.0.0.1', resolve); });
await new Promise(resolve => probe.close(resolve));
const runtime = path.join(root, 'runtime'); mkdirSync(runtime, { recursive: true });
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^EXPO_|^SUPABASE_|^SB_|^E2E_|^PG|^PERF_|TOKEN|PASSWORD|API_KEY|PROXY/i.test(key)) delete env[key];
Object.assign(env, { EXPO_PUBLIC_SUPABASE_URL: keys.API_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: keys.ANON_KEY,
  EXPO_NO_DOTENV: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', DO_NOT_TRACK: '1',
  EXPO_NO_TYPESCRIPT_SETUP: '1', CI: '1', NODE_OPTIONS: '--dns-result-order=ipv4first',
  TEMP: runtime, TMP: runtime, EXPO_HOME: path.join(runtime, 'expo-home') });
const cliArgs = [path.join(workspace, 'node_modules/expo/bin/cli'), 'start', '--dev-client', '--localhost', '--port', '8086', '--no-dev', '--minify', '--max-workers', '2'];
const child = spawn(process.execPath, cliArgs, { cwd: workspace, env, detached: true, windowsHide: true,
  stdio: ['ignore', openSync(path.join(runtime, 'metro.out.log'), 'a'), openSync(path.join(runtime, 'metro.err.log'), 'a')] });
child.unref();
const record = { applicationId: config.android.package, project: workspace, port: 8086, mode: 'production-JS development client',
  metroPid: child.pid, cliArgs, startedAt: new Date().toISOString(), candidateMetro8084Touched: false };
writeFileSync(path.join(root, 'evidence/metro-process.json'), JSON.stringify(record, null, 2));
console.log(JSON.stringify(record));
