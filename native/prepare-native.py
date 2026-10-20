"""Prepare an existing, dependency-isolated native workspace; never install or publish.

Only the supplied workspace is written. Shared candidate dependencies are read-only.
Signing credentials must be supplied privately to Gradle, never to this recipe.
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import shutil
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--candidate', type=pathlib.Path, required=True)
parser.add_argument('--workspace', type=pathlib.Path, required=True)
parser.add_argument('--evidence', type=pathlib.Path, required=True)
args = parser.parse_args()
candidate, workspace, evidence = (p.resolve() for p in (args.candidate, args.workspace, args.evidence))
if candidate == workspace or candidate in workspace.parents or workspace in candidate.parents:
    raise RuntimeError('Candidate and workspace must be separate trees')
if not (workspace/'android/app/build.gradle').is_file():
    raise RuntimeError('An existing generated native workspace is required')
evidence.mkdir(parents=True, exist_ok=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
tree = lambda base: {p.relative_to(base).as_posix(): sha(p) for p in sorted(base.rglob('*')) if p.is_file()}
app = json.loads((candidate/'app.json').read_text())['expo']
original_id = app['android']['package']
if original_id != 'com.mrcjshy.skillmatch':
    raise RuntimeError('Original package identity changed; review required')
qa_id = original_id + '.uiv3qa'
native_rel = pathlib.Path('android/src/main/java/com/swmansion/rnscreens/ScreenStackHeaderConfig.kt')
shared = candidate/'node_modules/react-native-screens'
private = workspace/'node_modules/react-native-screens'
if private.is_junction() or private.resolve() == shared.resolve():
    raise RuntimeError('Native dependency is not a private copy')
if json.loads((private/'package.json').read_text())['version'] != '4.26.2':
    raise RuntimeError('This patch is pinned to react-native-screens 4.26.2')
source = shared/native_rel
target = private/native_rel
expected = '1c94acaeff477b7e9009b5c6009e8dd5445a4c393a4a2949b749da276a91a3db'
if sha(source) != expected:
    raise RuntimeError('Shared native source does not match reviewed baseline')
before = source.read_text(encoding='utf-8')
old = 'val stack = screenStack\n        val isTop = stack == null || stack.topScreen == parent'
new = 'val stack = screenStack ?: return\n        val isTop = stack.topScreen == parent'
if before.count(old) != 1:
    raise RuntimeError('Native patch anchor changed')
patched = before.replace(old, new)
if target.read_text(encoding='utf-8') not in (before, patched):
    raise RuntimeError('Unexpected private native changes; do not stack patches')
source_manifest = tree(candidate/'src')
workspace_manifest = tree(workspace/'src')
if set(workspace_manifest)-set(source_manifest):
    raise RuntimeError('Workspace has extra source files; preserve and review before syncing')
backup = evidence/'workspace-before.zip'
if not backup.exists():
    with zipfile.ZipFile(backup, 'w', zipfile.ZIP_DEFLATED) as archive:
        for rel in workspace_manifest: archive.write(workspace/'src'/rel, 'src/'+rel)
        for rel in ['app.json', 'app.config.js', 'android/app/src/main/AndroidManifest.xml', 'android/app/src/main/res/values/strings.xml']:
            archive.write(workspace/rel, rel)
        # build.gradle contains local signing setup; retain only its digest in public evidence.
changed = []
for rel, digest in source_manifest.items():
    if workspace_manifest.get(rel) != digest:
        dest = workspace/'src'/rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(candidate/'src'/rel, dest)
        changed.append('src/'+rel)
for rel in ['package.json', 'package-lock.json', 'app.config.js', 'tsconfig.json', 'expo-env.d.ts', 'tamagui.config.ts']:
    shutil.copy2(candidate/rel, workspace/rel)
for p in sorted((candidate/'assets').rglob('*')):
    if p.is_file():
        dest = workspace/'assets'/p.relative_to(candidate/'assets')
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists() or sha(dest) != sha(p): shutil.copy2(p, dest)
target.write_text(patched, encoding='utf-8', newline='\n')
config = json.loads((candidate/'app.json').read_text())
config['expo']['name'] = 'SkillMatch UI-V3 QA'
config['expo']['slug'] = 'skillmatch-mobile-uiv3qa'
config['expo']['scheme'] = 'skillmatchuiv3qa'
config['expo']['android']['package'] = qa_id
config['expo']['android'].pop('googleServicesFile', None)
# A package/certificate-bound provider is intentionally unconfigured in this QA-only app.
# No hosted Firebase/EAS configuration is modified or substituted.
(workspace/'app.json').write_text(json.dumps(config, indent=2)+'\n')
gradle_path = workspace/'android/app/build.gradle'
gradle = gradle_path.read_text()
gradle_before_hash = sha(gradle_path)
gradle = gradle.replace("applicationId '"+original_id+"'", "applicationId '"+qa_id+"'")
gradle = gradle.replace("apply plugin: 'com.google.gms.google-services'", '// QA-only: Firebase package/certificate configuration is intentionally unavailable.')
start = gradle.index('    signingConfigs {')
end = gradle.index('    buildTypes {', start)
gradle = gradle[:start] + '''    signingConfigs {
        debug {
            storeFile file(System.getenv('UIV3_QA_KEYSTORE'))
            storePassword System.getenv('UIV3_QA_STORE_PASSWORD')
            keyAlias System.getenv('UIV3_QA_KEY_ALIAS')
            keyPassword System.getenv('UIV3_QA_KEY_PASSWORD')
        }
    }
''' + gradle[end:]
if "applicationId '"+qa_id+"'" not in gradle or "applicationId '"+original_id+"'" in gradle:
    raise RuntimeError('Application ID isolation failed')
gradle_path.write_text(gradle)
manifest_path = workspace/'android/app/src/main/AndroidManifest.xml'
manifest = manifest_path.read_text().replace('android:scheme="skillmatchmobile"', 'android:scheme="skillmatchuiv3qa"').replace('android:scheme="exp+skillmatch-mobile"', 'android:scheme="exp+skillmatch-mobile-uiv3qa"')
manifest_path.write_text(manifest)
strings_path = workspace/'android/app/src/main/res/values/strings.xml'
strings = strings_path.read_text().replace('<string name="app_name">SkillMatch</string>', '<string name="app_name">SkillMatch UI-V3 QA</string>')
strings_path.write_text(strings)
if tree(workspace/'src') != source_manifest: raise RuntimeError('Source synchronization mismatch')
if sha(source) != expected: raise RuntimeError('Shared native input was modified')
record = {
    'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'candidate': str(candidate), 'workspace': str(workspace),
    'originalApplicationId': original_id, 'applicationId': qa_id,
    'label': 'SkillMatch UI-V3 QA', 'scheme': 'skillmatchuiv3qa',
    'sourceFiles': {'src/'+rel: digest for rel,digest in source_manifest.items()},
    'sourceTreeSha256': hashlib.sha256(json.dumps(source_manifest,sort_keys=True).encode()).hexdigest(),
    'refreshedSourcePaths': changed,
    'packageLockSha256': sha(candidate/'package-lock.json'),
    'nativeVersion': '4.26.2', 'sharedNativeSha256': sha(source), 'privateNativeSha256': sha(target),
    'gradleBeforeSha256': gradle_before_hash, 'gradleAfterSha256': sha(gradle_path),
    'mainManifestSha256': sha(manifest_path),
    'firebaseConfigured': False, 'firebasePushVerification': 'BLOCKED: QA application has no approved Firebase package/certificate registration',
    'architectureChanged': False, 'dependenciesUpgraded': False,
    'manifestVerified': False,
}
(evidence/'prepared-source.json').write_text(json.dumps(record,indent=2))
print(json.dumps({key:value for key,value in record.items() if key != 'sourceFiles'},indent=2))
