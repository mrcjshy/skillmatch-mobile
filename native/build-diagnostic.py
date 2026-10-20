"""One local, debug-only x86_64 diagnostic build. No install, credential fetch or upgrade."""
import datetime
import json
import os
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[1]
workspace = pathlib.Path(os.environ['UIV3_QA_WORKSPACE']).resolve()
prepared = json.loads((root/'evidence/prepared-source.json').read_text())
if prepared['workspace'] != str(workspace) or prepared['applicationId'] != 'com.mrcjshy.skillmatch.uiv3qa':
    raise RuntimeError('Prepared QA identity mismatch')
signing = json.loads(pathlib.Path(os.environ['UIV3_QA_SIGNING_FILE']).read_text())
keys = json.loads(pathlib.Path(os.environ['UIV3_LOCAL_KEYS']).read_text(encoding='utf-8-sig'))
if keys['API_URL'] != 'http://127.0.0.1:54321': raise RuntimeError('Local backend only')
env = dict(os.environ)
for name in list(env):
    if re.search(r'^EXPO_|^SUPABASE_|^SB_|^PG|^PERF_|TOKEN|PASSWORD|API_KEY|PROXY', name, re.I):
        del env[name]
env.update({
    'JAVA_HOME': os.environ['UIV3_JAVA_HOME'],
    'ANDROID_HOME': os.environ['UIV3_ANDROID_SDK'],
    'ANDROID_SDK_ROOT': os.environ['UIV3_ANDROID_SDK'],
    'GRADLE_USER_HOME': os.environ.get('UIV3_QA_GRADLE_HOME', str(workspace/'gradle-cache')),
    'EXPO_NO_DOTENV': '1', 'EXPO_OFFLINE': '1', 'EXPO_NO_TELEMETRY': '1',
    'EXPO_NO_TYPESCRIPT_SETUP': '1', 'DO_NOT_TRACK': '1', 'CI': '1',
    'EXPO_PUBLIC_SUPABASE_URL': keys['API_URL'],
    'EXPO_PUBLIC_SUPABASE_ANON_KEY': keys['ANON_KEY'],
    'UIV3_QA_KEYSTORE': signing['storeFile'],
    'UIV3_QA_STORE_PASSWORD': signing['storePassword'],
    'UIV3_QA_KEY_ALIAS': signing['keyAlias'],
    'UIV3_QA_KEY_PASSWORD': signing['keyPassword'],
})
command = [str(workspace/'android/gradlew.bat'), ':app:assembleDebug',
           '-PreactNativeArchitectures=x86_64', '--offline', '--no-daemon',
           '--max-workers=2', '--console=plain']
plan = {'command': command, 'cwd': str(workspace/'android'),
        'startedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'applicationId': prepared['applicationId'], 'sourceTreeSha256': prepared['sourceTreeSha256'],
        'nativeVersion': prepared['nativeVersion'], 'privateNativeSha256': prepared['privateNativeSha256'],
        'installPerformed': False, 'releaseBuild': False, 'offline': True}
(root/'evidence/build-plan.json').write_text(json.dumps(plan,indent=2))
with (root/'evidence/build.log').open('w',encoding='utf-8') as log:
    process = subprocess.Popen(command, cwd=workspace/'android', env=env,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               text=True, encoding='utf-8', errors='replace')
    plan['pid'] = process.pid
    (root/'evidence/build-plan.json').write_text(json.dumps(plan,indent=2))
    for line in process.stdout:
        for secret in [keys['ANON_KEY'], signing['storePassword'], signing['keyPassword']]:
            if len(secret) > 8: line = line.replace(secret, '<REDACTED>')
        line = re.sub(r'(?i)((?:storePassword|keyPassword)\s*[=:]\s*)\S+',r'\1<REDACTED>',line)
        log.write(line); log.flush()
    code = process.wait()
result = {**plan, 'exitCode': code, 'finishedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
(root/'evidence/build-result.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
sys.exit(code)
