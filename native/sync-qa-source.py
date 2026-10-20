"""Copy only the reviewed JavaScript QA delta into the existing private native workspace."""
import datetime
import hashlib
import json
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
CANDIDATE = pathlib.Path(r"C:/Users/JOSH/Documents/SkillMatch-UI-20261020/ui-v3/candidate")
WORKSPACE = pathlib.Path(r"C:/Users/JOSH/sm-v3-native-20261020")
ALLOW = {
    "src/components/booking-sheet.tsx", "src/components/booking-sheet.test.ts",
    "src/components/client-job-details.tsx", "src/components/client-job-details.test.ts",
}
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def tree(base):
    return {p.relative_to(base).as_posix(): sha(p) for p in sorted(base.rglob("*")) if p.is_file()}
def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()

prepared = json.loads((ROOT / "evidence/prepared-source.json").read_text())
if pathlib.Path(prepared["workspace"]).resolve() != WORKSPACE.resolve():
    raise RuntimeError("Wrong private workspace")
if json.loads((WORKSPACE / "app.json").read_text())["expo"]["android"]["package"] != "com.mrcjshy.skillmatch.uiv3qa":
    raise RuntimeError("QA package guard failed")
before, latest = tree(WORKSPACE / "src"), tree(CANDIDATE / "src")
baseline = {key.removeprefix("src/"): value for key, value in prepared["sourceFiles"].items()}
if before != baseline:
    raise RuntimeError("Workspace source differs from preserved build baseline; review before syncing")
if before.keys() != latest.keys():
    raise RuntimeError("Unexpected source additions/deletions")
delta = ["src/" + rel for rel in latest if latest[rel] != before[rel]]
if set(delta) != ALLOW:
    raise RuntimeError("Unexpected candidate delta: " + repr(delta))
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
archive = ROOT / "evidence" / ("served-base-before-js-fixes-" + stamp)
archive.mkdir()
shutil.copy2(ROOT / "evidence/active-bundle.json", archive / "active-bundle.json")
for relative in delta:
    target, source = WORKSPACE / relative, CANDIDATE / relative
    if target.resolve() != target.absolute() or source.resolve() != source.absolute():
        raise RuntimeError("Source must not be a redirected path")
    backup = archive / relative
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target, backup)
for relative in delta:
    target, source = WORKSPACE / relative, CANDIDATE / relative
    if sha(target) != baseline[relative.removeprefix("src/")] or sha(source) != latest[relative.removeprefix("src/")]:
        raise RuntimeError("Concurrent source modification")
    shutil.copyfile(source, target)
if tree(WORKSPACE / "src") != latest:
    raise RuntimeError("Post-copy source mismatch")
record = {"atUtc": stamp, "candidate": str(CANDIDATE), "workspace": str(WORKSPACE),
          "applicationId": "com.mrcjshy.skillmatch.uiv3qa", "changedPaths": delta,
          "baseSourceTreeSha256": digest(before), "sourceTreeSha256": digest(latest),
          "sourceFiles": {"src/" + key: value for key, value in latest.items()},
          "backup": str(archive), "nativeApkRebuilt": False, "originalMetro8084Touched": False}
(ROOT / "evidence/js-fixes-source.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({key: value for key, value in record.items() if key != "sourceFiles"}, indent=2))
