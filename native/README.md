# Isolated Android posting diagnostic

These scripts reproduce the source refresh, package isolation and two-line native
candidate fix for one local Android development-client diagnostic. They do not
install an APK or publish anything. This is WIP diagnostic tooling, not a phone-test
or release build workflow. The scoped posting results below do not establish
all-state native acceptance or a universal navigation fix.

## Identities and boundaries

- Preserved original application: `com.mrcjshy.skillmatch`.
- Separate diagnostic application: `com.mrcjshy.skillmatch.uiv3qa`.
- Visible label: **SkillMatch UI-V3 QA**.
- Diagnostic schemes: `skillmatchuiv3qa` and `exp+skillmatch-mobile-uiv3qa`.
- The Android namespace remains the original namespace so generated class names
  continue to match. Package isolation is the changed `applicationId`.
- Build target: debug, `x86_64`, existing architecture/dependency versions, offline.
- Original EAS signing keys and installed packages are never inputs or targets.

The QA app omits the Google Services Gradle plugin and `googleServicesFile`
configuration because the public Firebase client configuration belongs to the
original package/certificate. No hosted Firebase/EAS configuration is changed.
FCM/push verification for this QA package is **BLOCKED** until separately approved
package/certificate registration exists. This omission does not establish push
support. Check the merged manifest and built APK for package ID, labels, schemes,
provider authorities, ABI and signing identity before any authorized installation.

## Preconditions

Use a separately approved existing generated native workspace. Its `android/`
project must already exist, and `node_modules/react-native-screens` must be a real
private copy, not the candidate's/shared RC junction. Other native dependency
copies and the existing locked graph/toolchain must already be provisioned. The
scripts do not install dependencies, upgrade Expo, create keys, fetch EAS
credentials, regenerate native projects or change architecture. They are not a
clean-machine bootstrap recipe.

The candidate is the reviewed current UI-V3 source. Its `src/`, selected root
configuration and assets are copied into the supplied workspace; extra workspace
source paths fail closed rather than being deleted. The existing workspace is
backed up beneath the private evidence directory before source changes. Keep all
original repositories, indexes, installed clients, account sessions and shared
RC dependencies intact.

Required existing tooling: Python with `Path.is_junction()` support, the workspace
Gradle wrapper/cache, the approved JDK and Android SDK/NDK/CMake/build tools, and
all project-declared offline artifacts. This recipe does not authorize missing
artifact downloads or another native build beyond the explicitly approved run.

## Exact native candidate fix

Installed `react-native-screens` is pinned to **4.26.2**; no version bump is made.
The reviewed input is:

`node_modules/react-native-screens/android/src/main/java/com/swmansion/rnscreens/ScreenStackHeaderConfig.kt`

Input SHA-256:
`1c94acaeff477b7e9009b5c6009e8dd5445a4c393a4a2949b749da276a91a3db`

[Upstream PR #4498](https://github.com/software-mansion/react-native-screens/pull/4498)
explains the detached-screen header path: the old header check admits a missing
stack and later reaches a fragment assertion. The local two-line equivalent
returns immediately when no stack exists, then compares the actual top screen.
This is a targeted candidate fix, not a claim that every navigation failure has
the same cause or that compilation proves native behavior.

`prepare-native.py` verifies the pinned version, exact input hash, a unique patch
anchor and an unmodified/already-matching private target before applying the
change. It verifies the shared input remains unchanged. The adjacent `.patch`
records the same diff for review; do not apply it to shared candidate/RC
`node_modules`. The prepared record contains the resulting private-source hash.

## Reproducible application and build

Run from the directory containing `native/` so `evidence/` stays private. Replace
paths below with the existing reviewed local paths. Do not use original checkouts
as `--workspace`, and do not print private environment values.

```powershell
python ./native/prepare-native.py `
  --candidate '<reviewed-ui-v3-candidate>' `
  --workspace '<existing-private-native-workspace>' `
  --evidence './evidence'
```

Review `evidence/prepared-source.json` against the selected candidate manifest.
Verify every prepared `src/` hash, lockfile/native hashes and the QA identity
before the build. The complete core-candidate manifest also covers config,
assets, tests and docs; the prepared `sourceTreeSha256` covers only `src/`.
They use different scopes and must not be substituted for each other.

Provide these process environment inputs through the approved private local
setup, not a committed `.env`, command-line credential or echoed terminal value:

| Input | Meaning |
|---|---|
| `UIV3_QA_WORKSPACE` | Exact prepared private workspace path |
| `UIV3_QA_SIGNING_FILE` | Private JSON containing `storeFile`, `storePassword`, `keyAlias`, `keyPassword` for the separate local test key |
| `UIV3_LOCAL_KEYS` | Private local-stack JSON with `API_URL` and `ANON_KEY`; URL must be `http://127.0.0.1:54321` |
| `UIV3_JAVA_HOME` | Existing approved JDK directory |
| `UIV3_ANDROID_SDK` | Existing approved Android SDK directory |
| `UIV3_QA_GRADLE_HOME` | Optional existing private Gradle cache at a short Windows path; defaults to the workspace's `gradle-cache` |

```powershell
python ./native/build-diagnostic.py
```

The wrapper launches exactly `:app:assembleDebug` with
`-PreactNativeArchitectures=x86_64 --offline --no-daemon --max-workers=2
--console=plain`. It passes the separate local signing input to Gradle privately,
sets local-only Expo configuration and writes plan/result/log files under
`evidence/`. It does not install anything, clear logs/storage, stop services or
change Metro. The build's source provenance must match the prepared record.

The same authorized diagnostic build required three tooling executions. First,
Windows Ninja rejected long paths. A non-destructive cache copy at a shorter path
then exposed six generated `.ninja_deps` files retaining 2,423 old cache paths.
Those six private generated files were preserved and renamed before the resumed
build succeeded. No app source, native fix, dependency version or architecture
was changed between these attempts. The failed evidence stays private. The
optional Gradle-cache input supports the existing-cache workaround; do not delete
or repurpose another workflow's cache. Build success is not native runtime proof.

## Inspect the built diagnostic before installation

```powershell
python ./native/inspect-apk.py
```

This read-only inspection requires the successful build/prepared records and
existing `UIV3_ANDROID_SDK` / `UIV3_JAVA_HOME`. It verifies APK signing, QA package,
debug label, ABI, app-specific schemes, provider-authority prefixes, absence of
shared UID, source/native hashes and absence of the original Firebase resource
configuration. It refuses the original package's signing fingerprint. Compare
the reported signer with the separately approved local test-key certificate;
being different from the original certificate alone is not sufficient provenance.
The generated manifest and complete APK identity remain private evidence; only
sanitized identity/hashes and the inspection result enter public provenance.
This script never installs the APK or operates a device.

## Separate diagnostic Metro

After checking runtime ownership, use the same private `UIV3_LOCAL_KEYS` setup:

```powershell
node ./native/serve-diagnostic.mjs
```

This recipe reads the prepared workspace record, verifies the QA package/scheme
and local backend, and refuses an occupied loopback port 8086. It starts only the
QA workspace's Expo development-client Metro with production-mode JavaScript.
The existing candidate Metro 8084 is left untouched. The process record is
private evidence under `evidence/metro-process.json`; its project path and source
hashes must be checked before testing. Runtime output is private under `runtime/`.
The QA-only Metro configuration keeps Expo defaults, uses two workers and skips
the workspace Gradle cache plus selected Android generated outputs. It is written
only in the private QA workspace and is not a candidate configuration change.

The private-copy layout initially produced duplicate physical JavaScript copies
of native runtime/view-registry packages. QA startup failed before sign-in with
`Unsupported top level event type topInsetsChange`; that failed evidence is
retained. The diagnostic-only resolver now directs `react`, `react-native`,
`react-native-safe-area-context` and `@react-native/virtualized-lists` (including
their subpaths) to the workspace's canonical `node_modules`. No package version,
native code, APK or candidate source was changed by this resolver correction.
The inspected source map changed from 3,394 to 2,921 modules, with duplicate
physical React Native/safe-area/virtualized-list modules removed. The app then
reached its first Expo welcome screen. Subsequent normal Client/Worker sign-in
and three baseline native posting retests passed within their recorded scopes.
This graph correction alone does not prove the posting guard works.

The diagnostic client uses its own SkillMatch scheme. Expo's generic development
launcher scheme can exist in other Expo applications, so automation must target
the explicit QA package/component as well. Inspect generated and merged manifests
for the QA-only non-exported provider authorities and absence of shared UID;
neither the scripts nor successful compilation substitute for APK inspection.

Keep the APK, signing files/keys/passwords, local environment JSON, raw logs,
workspace backups and device/fixture evidence private. Never stage the complete
`evidence/` or generated workspace. A successful build still requires APK
identity/certificate/ABI inspection and three consecutive native posts, each with
one backend creation and a usable direct waiting map. Worker acceptance and the
Client's in-place confirmed transition follow only after those posts pass.

The QA package must explicitly open the intended candidate Metro bundle through
its own development-client scheme. Verify port-to-source ownership and keep the
original Metro/app routing identifiable; do not infer source identity from an
open app window. The remaining state matrix, warnings and provider limitations
must be reported independently of build success.

## Later JavaScript-only fixes and served-source epochs

The APK's native build provenance remains the original 417-file prepared source
tree `6cbd912317a2550b73b5070518c5ebf70e10b957834ad94862a05062aa5ff72c`.
Three consecutive actual posting journeys passed on that APK and its original
diagnostic bundle. Each created one open Job, displayed a real Job ID without a
Booking ID and allowed timed sheet swipes without the native posting exception.
The Client's later in-place acceptance presentation remained stuck in one base
run. These are bounded results; they do not establish complete native acceptance.

Two subsequent candidate JavaScript corrections cover a memoized sheet callback
that retained old reduced-motion settings and a mounted job-details read canceled
by a duplicate active-state event. Their source regressions pass, while the native
acceptance symptom's precise event sequence remains unproven. A later no-overlay
R2 native retest passed real Worker acceptance and same-process Client confirmation
with unchanged expanded-sheet bounds; this result retains its separate epoch.
No additional native APK or dependency change is needed to serve this reviewed JavaScript delta in the existing diagnostic client.

```powershell
python ./native/sync-qa-source.py
python ./native/record-served-bundle.py --epoch '<unique-reviewed-epoch>'
```

The sync recipe is pinned to this run's explicit local candidate/workspace paths
and exactly four component/test paths. Review those constants before executing;
it is not a general copy or native rebuild command. It verifies the preserved
build source baseline and QA package, rejects unexpected files/deltas or redirected
source paths, backs up the old bytes and bundle record, copies only the reviewed
JavaScript files, then verifies the complete resulting source tree. It refuses
an already-diverged workspace rather than silently applying another delta.

The bundle recorder reads only the existing loopback 8086 response, records its
hash/size and the workspace source-tree hash in a new immutable epoch file, then
updates the private active pointer. It does not archive environment-bearing bundle
text, install an APK or touch original Metro 8084. Its optional overlay label
records a test epoch's scope; it does not itself apply an overlay. Any overlay or
source change must be reported and cannot be counted as unchanged production
source. Keep the build source, current candidate, served JavaScript and APK hashes
distinct. Current no-overlay served-source identity is recorded in provenance.

## Exact map-sheet preference across protected route re-entry

The next bounded UI correction adds one optional collapsed/expanded map-sheet
preference to the existing single-destination session continuation. It requires
the exact owner, live session lifetime, role, path and sanitized UUID parameters;
the UI cannot introduce a destination or write the preference while access is
pending. A changed route or existing terminal access condition clears it. No
account/Auth/root authorization gate or provider is changed. Candidate SECURITY
wording is synchronized to describe this non-sensitive UI preference.

```powershell
python ./native/sync-continuation-source.py
```

This one-time recipe copies only the six reviewed existing component/library/test
paths after verifying the prior four-path JavaScript snapshot, the reviewed new
source manifest, QA package and absence of transport-overlay drift. It backs up
the previous bytes, rejects redirected/concurrently changed paths, verifies the
result and records both source hashes. It does not copy credentials or rebuild an
APK. Restore private map/auth transport test overlays before attempting this
copy; those overlays are not candidate or checkpoint source.

The root pending-unmount/dispatcher-remount regression failed before the fix and
passed after it; the current full source suite has150 files /2,731 passing tests.
Native same-session token-refresh proof for this latest preference fix remains
BLOCKED: the managed SDK host failed with `CDP_OPEN_FAILED` during role
identification before any explicit SDK refresh. No waiting/confirmed/Chat refresh
result or unsupported-Hermes conclusion is inferred. Earlier native in-place
acceptance passed on the preceding
no-overlay JavaScript epoch; motion, permission and adverse-map observations on
private transport-overlay epochs retain those exact source labels. A current
map-overlay bundle is never evidence that the plain candidate was served.


## Latest bounded native status: BLOCKED / WIP

The one inspected APK remains debug/x86_64,
`com.mrcjshy.skillmatch.uiv3qa`, SHA-256
`ce692f2dba8f9c1f351f7a236d2f62cded47bfce0501c1641c25430bfc95c5f4`.
Its native build source remains `6cbd9123...`; no additional APK was built for
the later JavaScript corrections. Current candidate SRC 417 is
`a344b10aebfa32f99b057181a88227179b74b88fdad2ebc99d864907867b1b4f`;
the separate complete 480-file source manifest is recorded in provenance.

At 2026-10-20T15:39:55Z, an actual complete HTTP 200 response from QA Metro 8086
measured the plain candidate with no transport overlay: SHA-256
`3455a96e27af00fc8907018304c48d2feb0069aafab75a0161cb4d58cc963311`,
15,039,339bytes. Private map/Auth overlays and the refresh hook were restored,
the hook JavaScript lifetime ended, and the owned Auth proxy/reverse were removed.
Original candidate Metro 8084 remained untouched. This measured final bundle does
not inherit passes from earlier map/Auth-overlay test epochs.

| Observed scope | Result and limit |
|---|---|
| Three fresh baseline native posts | PASS: one open Job each, no Booking before acceptance, direct waiting map and timed sheet swipes, zero observed native posting exceptions. Retained uniform underlay-region flags showed visible controls; no entirely blank frame observed. |
| Worker acceptance and Client in-place confirmation | PASS on no-overlay R2: real booking details/ID, same Client process and expanded bounds, waiting carousel absent. Initial stuck confirmation FAIL remains retained. |
| Latest continuation-map states | Scoped PASS for fresh posting/Cancel, both overlapping HTTP outcomes and both persistent ordered native cancellation/acceptance outcomes. Simultaneous SQL-lock timing and native loser RPC instrumentation are not proven. |
| Strict cold map fallback/recovery | Client cold02 and Worker cold03 PASS on disclosed QA-relay map epoch, with usable fallback controls, normal route-remount geography and exact QA cache/STOP restoration. No direct-provider/AVD-DNS recovery claim. |
| Display, permissions and Admin | Scoped native PASS for the separately identified permission-denial/recovery, normal/reduced frames, 130% waiting and confirmed controls/resume, and read-only Admin smoke. Prior failures/timeouts remain retained; precise confirmed-animation timing is unverified. |
| Adverse Auth transport | Three scoped native PASSes on the disclosed private Auth epoch: natural stored-session outage/retry, real pending account GET with protected tree absent, and account-read socket error/retry. They do not establish inactive/verification-pending roles, legal consent, account switching, global Sign out or explicit SDK refresh. |
| Waiting/confirmed sheet and Chat SDK refresh | BLOCKED after managed-host `CDP_OPEN_FAILED` during role identification before any explicit SDK refresh. The attempted host FAIL is retained. No further SDK attempts or unsupported-Hermes conclusion. Source pending-unmount/remount regressions pass separately. |
| Current complete sharing/Stop case | FAIL at final profile check; observed substeps and restoration are retained under separate review. Earlier evidence is not converted into a full current PASS. Payment/completion/rating remain NOT RUN in this diagnostic epoch beyond pending-payment observations. |
| Final repetitions and identity/preservation | PASS within three cold/no-input QA Home observations per role, latest QA identity/Home, ordinary original saved-role readbacks, and the final read-only original-package semantic comparison. This bounded non-reproduction does not close historical crash/unexpected-navigation concerns. |
| Final runtime audit | Eighteen read-only capture commands succeeded. The initial CRLF versionName parser failure remains retained; the appended LF-normalized semantic comparison passed on the same captured bytes. The audit retains 69 Reanimated headers, zero newly observed headers, two fatal starts and OPEN follow-ups; no clean-runtime claim. |

The final exact sampled QA PID logs each contain zero fatal starts, RNJS error
candidate starts, Reanimated headers and Map503 headers. They also retain two
nonfatal DevLoading BadToken popup exception headers per device, recurring RN
window-focus soft exceptions and other Android warnings marked REVIEW_REQUIRED.
Across retained epochs, seven RNJS candidate starts and102 Map503 headers are
not all automatically classified as controlled faults. Sampling does not prove
post-sample liveness or a clean runtime.

Two separately tracked runtime issues remain OPEN. A bounded audit retained 69 unexplained nonfatal
Reanimated missing-Surface warning blocks. [Upstream PR #10435](https://github.com/software-mansion/react-native-reanimated/pull/10435)
corrects a matching stale-view pathway, but the SkillMatch originating view,
local performance impact and introduction by V3 are unproven. No Reanimated
patch, warning suppression, dependency upgrade or further native build was made.
Separately, the original package retained a Worker
`CxxInspectorPackagerConnection` WebSocketDelegate NullPointerException at 14:32:56Z.
Its cause and any V3 relationship are unresolved. Later unchanged crash buffers
do not erase this fatal, and original storage/session preservation does not prove
runtime crash freedom. Unknown warning/error signatures remain
REVIEW_REQUIRED; they are not inferred harmless from the supported journey passes.

Provider/QR Ph and QA Firebase/FCM coverage remain BLOCKED by separate approved
access/package-registration requirements. Argent, NativeBloom and TesterArmy MCP
tools were not exposed in this session; the pinned local TesterArmy SDK was the
actual driver. Raw evidence,
APK, signing/environment/account/session inputs, private overlays/proxies/hooks,
controllers and caches are excluded from public artifacts. The original apps
were not uninstalled, cleared, overwritten or re-signed. Final ordinary original
saved-role checks and captured public-package comparisons passed within their
recorded scope; private session contents were not copied or inspected. Actual QA
Home screenshots were reviewed after hiding only the QA Tools preference, with
the Bell unobstructed and both controllers released. The original inspector
fatal remains unresolved despite the saved-role checks.

The overall status is BLOCKED/WIP. This recipe and checkpoint are not full native,
clean-runtime, owner visual, physical-phone APK or release acceptance. They do
not claim all possible bugs have been eliminated. Required blocked/failed states
and unresolved runtime defects keep the final phone-test APK gate closed.
