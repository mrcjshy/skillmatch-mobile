"""Read and validate a built diagnostic APK before any installation."""
import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
prepared = json.loads((root/'evidence/prepared-source.json').read_text())
result = json.loads((root/'evidence/build-result.json').read_text())
if result['exitCode'] != 0: raise RuntimeError('No successful diagnostic build')
workspace = pathlib.Path(prepared['workspace'])
sdk = pathlib.Path(os.environ['UIV3_ANDROID_SDK'])
apk = workspace/'android/app/build/outputs/apk/debug/app-debug.apk'
env = dict(os.environ)
env['JAVA_HOME'] = os.environ['UIV3_JAVA_HOME']
def run(command):
    return subprocess.check_output([str(p) for p in command],env=env,text=True,encoding='utf-8',errors='replace',stderr=subprocess.STDOUT)
signature = run([sdk/'build-tools/36.0.0/apksigner.bat','verify','--print-certs',apk])
fingerprint = re.search(r'Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9]+)',signature)
if not fingerprint: raise RuntimeError('Signing certificate unavailable')
fingerprint = fingerprint.group(1).lower()
if fingerprint == '6776c9b521e623d689d7b2c8409874c7950824ec4c51000f8a66d6df01156933':
    raise RuntimeError('Diagnostic must use a separate local test signing identity')
xml = run([sdk/'cmdline-tools/latest/bin/apkanalyzer.bat','manifest','print',apk])
(root/'evidence/apk-manifest.xml').write_text(xml)
manifest = ET.fromstring(xml)
ns = '{http://schemas.android.com/apk/res/android}'
application_id = manifest.attrib.get('package')
if application_id != 'com.mrcjshy.skillmatch.uiv3qa': raise RuntimeError('Wrong APK package')
application = manifest.find('application')
if application.attrib.get(ns+'debuggable') != 'true': raise RuntimeError('Expected diagnostic debug APK')
if manifest.attrib.get(ns+'sharedUserId'): raise RuntimeError('Shared UID is prohibited')
providers = [x.attrib.get(ns+'authorities','') for x in manifest.iter('provider')]
if any(not x.startswith(application_id+'.') for x in providers): raise RuntimeError('Provider authority requires review')
main = next(x for x in manifest.iter('activity') if x.attrib.get(ns+'name') == 'com.mrcjshy.skillmatch.MainActivity')
schemes = sorted({x.attrib[ns+'scheme'] for x in main.iter('data') if ns+'scheme' in x.attrib})
if schemes != ['exp+skillmatch-mobile-uiv3qa','skillmatchuiv3qa']: raise RuntimeError('Application deep-link isolation mismatch')
with zipfile.ZipFile(apk) as archive:
    abis = sorted({p.split('/')[1] for p in archive.namelist() if p.startswith('lib/') and p.endswith('.so')})
if abis != ['x86_64']: raise RuntimeError('Unexpected diagnostic ABIs')
native = workspace/'node_modules/react-native-screens/android/src/main/java/com/swmansion/rnscreens/ScreenStackHeaderConfig.kt'
if hashlib.sha256(native.read_bytes()).hexdigest() != prepared['privateNativeSha256']: raise RuntimeError('Native source drift')
for rel,digest in prepared['sourceFiles'].items():
    if hashlib.sha256((workspace/rel).read_bytes()).hexdigest() != digest: raise RuntimeError('Application source drift: '+rel)
badging = run([sdk/'build-tools/36.0.0/aapt.exe','dump','badging',apk])
label = re.search(r"application-label:'([^']+)'",badging)
if not label or label.group(1) != 'SkillMatch UI-V3 QA': raise RuntimeError('QA launcher label mismatch')
resources = run([sdk/'build-tools/36.0.0/aapt.exe','dump','resources',apk])
firebase_resources = {name: bool(re.search(r'\b'+name+r'\b',resources)) for name in ['google_app_id','google_api_key','gcm_defaultSenderId']}
if any(firebase_resources.values()): raise RuntimeError('Unexpected package-bound Firebase resources; review before installing')
record = {'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'applicationId':application_id,'label':label.group(1),'manifestVerified':True,
          'apkPath':str(apk),'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'apkBytes':apk.stat().st_size,
          'signingCertificateSha256':fingerprint,'abis':abis,'applicationSchemes':schemes,
          'providerAuthorities':providers,'sourceTreeSha256':prepared['sourceTreeSha256'],
          'nativeVersion':prepared['nativeVersion'],'privateNativeSha256':prepared['privateNativeSha256'],
          'firebaseResources':firebase_resources,'releaseAcceptance':False,'metroPort':8086,
          'genericExpoLauncherSchemeRestriction':'Use explicit QA package/component; framework scheme is shared by Expo apps'}
(root/'evidence/apk-identity.json').write_text(json.dumps(record,indent=2))
print(json.dumps(record,indent=2))
