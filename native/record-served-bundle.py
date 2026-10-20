"""Record a real QA Metro response, without archiving its environment-bearing JavaScript."""
import argparse
import datetime
import hashlib
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORKSPACE = pathlib.Path(r"C:/Users/JOSH/sm-v3-native-20261020")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--epoch", required=True)
parser.add_argument("--overlay", choices=("map", "auth"))
args = parser.parse_args()
if not args.epoch.replace("-", "").isalnum():
    raise RuntimeError("Safe unique epoch label required")
output = ROOT / "evidence" / ("active-bundle-" + args.epoch + ".json")
if output.exists():
    raise RuntimeError("Retained epoch must not be overwritten")
before = json.loads((ROOT / "evidence/active-bundle.json").read_text())
if before["port"] != 8086 or before["applicationId"] != "com.mrcjshy.skillmatch.uiv3qa":
    raise RuntimeError("Wrong QA Metro identity")
url = before["launchAssetUrl"]
if not url.startswith("http://127.0.0.1:8086/"):
    raise RuntimeError("Wrong QA bundle origin")
with urllib.request.urlopen(url, timeout=180) as response:
    data, status = response.read(), response.status
if status != 200 or len(data) < 1_000_000:
    raise RuntimeError("No complete QA JavaScript response")
manifest = {p.relative_to(WORKSPACE / "src").as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((WORKSPACE / "src").rglob("*")) if p.is_file()}
record = {**before, "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "epoch": args.epoch, "bundleStatus": status, "bundleBytes": len(data),
          "bundleSha256": hashlib.sha256(data).hexdigest(),
          "workspaceSourceTreeSha256": hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest(),
          "sourceOverlay": args.overlay, "nativeApkRebuilt": False, "originalMetro8084Touched": False}
output.write_text(json.dumps(record, indent=2) + "\n")
(ROOT / "evidence/active-bundle.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps(record, indent=2))
