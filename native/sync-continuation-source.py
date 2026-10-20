"""Apply only the reviewed map-sheet continuation source delta to private QA Metro."""
import datetime
import hashlib
import json
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
CANDIDATE = pathlib.Path(r"C:/Users/JOSH/Documents/SkillMatch-UI-20261020/ui-v3/candidate")
WORKSPACE = pathlib.Path(r"C:/Users/JOSH/sm-v3-native-20261020")
ALLOW = {
    "src/components/booking-details.test.ts", "src/components/booking-details.tsx",
    "src/components/client-job-details.test.ts", "src/components/client-job-details.tsx",
    "src/lib/session-route-continuation.test.ts", "src/lib/session-route-continuation.ts",
}
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def tree(root):
    return {"src/" + p.relative_to(root / "src").as_posix(): sha(p)
            for p in sorted((root / "src").rglob("*")) if p.is_file()}

previous = json.loads((ROOT / "evidence/js-fixes-source.json").read_text())
reviewed = json.loads((ROOT / "evidence/continuation-candidate-source.json").read_text())
if json.loads((WORKSPACE / "app.json").read_text())["expo"]["android"]["package"] != "com.mrcjshy.skillmatch.uiv3qa":
    raise RuntimeError("Private QA identity mismatch")
before, latest = tree(WORKSPACE), tree(CANDIDATE)
if before != previous["sourceFiles"]:
    raise RuntimeError("Restore test transport overlays and review private source drift before copying")
if latest != reviewed["sourceFiles"] or set(before) != set(latest):
    raise RuntimeError("Reviewed candidate source changed")
delta = [relative for relative in latest if latest[relative] != before[relative]]
if set(delta) != ALLOW:
    raise RuntimeError("Unexpected continuation source delta")
archive = ROOT / "evidence" / ("source-before-continuation-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
archive.mkdir()
shutil.copy2(ROOT / "evidence/active-bundle.json", archive / "last-served-bundle.json")
for relative in delta:
    target, source = WORKSPACE / relative, CANDIDATE / relative
    if target.resolve() != target.absolute() or source.resolve() != source.absolute():
        raise RuntimeError("Refusing redirected source path")
    backup = archive / relative
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target, backup)
for relative in delta:
    target, source = WORKSPACE / relative, CANDIDATE / relative
    if sha(target) != before[relative] or sha(source) != latest[relative]:
        raise RuntimeError("Concurrent source modification")
    shutil.copyfile(source, target)
if tree(WORKSPACE) != latest:
    raise RuntimeError("Private source verification failed")
record = {"atUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "candidate": str(CANDIDATE), "workspace": str(WORKSPACE), "changedPaths": delta,
          "priorSourceTreeSha256": previous["sourceTreeSha256"], "sourceTreeSha256": reviewed["sourceTreeSha256"],
          "backup": str(archive), "nativeApkRebuilt": False, "originalMetro8084Touched": False}
(ROOT / "evidence/continuation-private-source.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps(record, indent=2))
