import { execFileSync } from 'node:child_process';

// Read only account-scoped recents from actual device SQLite, entirely in memory.
// No auth/profile keys are queried, and no database/evidence file is written.
export function readDeviceRecents(scope = '') {
  const bytes = execFileSync('adb', ['-s', 'emulator-5558', 'exec-out', 'run-as', 'com.mrcjshy.skillmatch', 'cat', 'databases/RKStorage'], { windowsHide: true });
  const script = `import sys,sqlite3,json,hashlib
db=sqlite3.connect(':memory:')
db.deserialize(sys.stdin.buffer.read())
groups=[(hashlib.sha256(key.encode()).hexdigest(),json.loads(value)) for key,value in db.execute("select key,value from catalystLocalStorage where key like 'skillmatch:recent-job-locations:v2:%'")]
scope=sys.argv[1]
matching=[g for g in groups if g[0]==scope] if scope else sorted(groups,key=lambda g:max([r.get('timestamp',0) for r in g[1]] or [0]),reverse=True)
print(json.dumps({'scope':matching[0][0] if matching else scope,'rows':matching[0][1] if matching else []}))`;
  return JSON.parse(execFileSync('python', ['-c', script, scope], { input: bytes, encoding: 'utf8', windowsHide: true }));
}

export async function waitForRecents(scope, predicate) {
  const deadline = Date.now() + 8000;
  let result;
  do {
    result = readDeviceRecents(scope);
    if (predicate(result.rows)) return result;
    await new Promise(resolve => setTimeout(resolve, 150));
  } while (Date.now() < deadline);
  throw new Error(`Actual AsyncStorage recents did not satisfy the assertion; count=${result.rows.length}`);
}
