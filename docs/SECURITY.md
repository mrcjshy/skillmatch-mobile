# FT-06C location display amendment — 2026-09-29

Josh's FT-06C dispatch supersedes the FT-06A requirement that native reverse
geocoding and foreground permission succeed before manual pin confirmation.
The exact selected Job coordinate remains authoritative. The existing backend
Santa Ana polygon, caller, ownership, and lifecycle checks remain authoritative.

Reverse-geocoded address text is best-effort, read-only display metadata. When
native geocoding throws or returns no usable address, the same valid settled pin
may be confirmed with `Selected Job location — Santa Ana, Pateros` and a
non-blocking explanation. No street, house number, landmark, or public coordinate
text is invented. Generation checks prevent old success or failure responses
from replacing a newer selection. Successful derived addresses remain intact;
historical Jobs are not rewritten.

Manual selection requires no device-location permission. Only the optional
Use Current Location action may request foreground permission and obtain a
one-shot device position; denial or unavailability preserves manual selection.
No background location, Worker device location, tracking, movement history,
coordinate Broadcast, new geocoder, API key, schema, or migration is introduced.

V4-LOC access, eligibility revocation, private location storage, matching,
open-Job editing, terminal suppression, and the service-area polygon are unchanged.
This amendment records the Mobile contract; runtime closure is separate evidence.
The existing Privacy Policy/consent reconciliation remains required before real
participant/community use. V7, DFD, and ERD are unchanged.

# FT-03 B1 local AI classification and Maps integration — 2026-10-06

This isolated implementation extends the existing `skillmatch-ai` service with
explicit Job skill suggestions. Post Job sends only its description and, when
explicitly selected, one current draft photo normalized to a bounded PNG. Names,
contact details, exact addresses, coordinates, payment, Booking, rating and other
profile fields are not separate request fields. The UI explains this transfer
before the action and asks Clients to omit those details from the description.
Catalog IDs remain authoritative: the native parser accepts at most two unique
current IDs, displays catalog names, and requires reviewed Apply. Apply updates
only the draft's Primary/Secondary skills through its existing owner. Suggest,
Retry and Apply never submit a Job, run matching or automatically select a skill.
The existing FAQ, Resume, Skill Gap, manual picker and Job submission flows remain.

Suggestion state is memory-only and bound to the Client owner, draft epoch,
session lifetime/revision, description, photo array, catalog and monotonic input/
manual authority. Real description, photo, manual-picker and wizard handlers
invalidate authority synchronously before draft changes. Blur, background,
session replacement and unmount invalidate pending preparation/results. Retained
callbacks cannot apply a successor request or retarget a replacement account;
stale completion cannot unlock newer image preparation. Ordinary same-authority
rerenders preserve valid results. Owner rejection cannot report applied skills.

Image input reuses installed Expo Image, Expo FileSystem, Expo Crypto and the
existing Job-photo byte validation; no package/native configuration changed.
Only an explicitly selected actual member of the current draft is accepted.
JPEG/PNG/WebP sources retain the existing 5 MiB limit. A decoded ImageRef is
encoded under a unique cache key, bounded to 320 pixels per edge and 512 KiB,
then structurally validated. All ancillary PNG metadata is stripped; only
IHDR/IDAT/IEND and canonical base64 enter the request. The exact owned derivative
must be deleted and deletion verified before success. Original files, unrelated
cache files and directories are never cleanup targets. There is no original-byte
fallback or silent conversion of a selected-image failure into a text request.
The Client may explicitly deselect the image and request description-only help.
Image choice is cleared on owner, session-lifetime or draft-epoch replacement,
even if successor draft photos have the same URI. Native encoder availability,
format and cleanup proof remain a separate Android fixture gate; source/unit
evidence does not establish iPhone/release support or provider/model quality.

The server implementation uses existing server-only Gemini credentials,
`gemini-3.5-flash-lite`, structured catalog-bound output, `store=false`, minimal
thinking, bounded output and one provider call per explicit action. Tools,
grounding and prior-interaction chains are absent. The local private quota
migration contains only minimum throttle/lease metadata, with no prompts,
images or responses and no direct anon/authenticated access. Per-account
3/minute and 20/Manila-day limits, global safety ceilings and an in-flight lease
are enforced server-side. This Mobile change does not apply that migration or
deploy the Edge Function. Hosted activation, paid-tier verification and real
participant/community provider proof remain held behind the owner's later gate;
the authorized $5 ceiling is not a billing modification or proof of entitlement.

FT-06C remains authoritative for manual pins: picker entry requests no location
permission, and only explicit Use My Location can request foreground access.
Denial preserves search, pan, manual selection and valid-pin confirmation. A
reverse-geocoder failure preserves the selected coordinates/map and permits
confirmation with clearly labelled general-area display metadata. The Post Job
row labels that fallback General area, rather than a confirmed street address.
No background permission, new geocoder, coordinate migration or map replacement
was introduced.

Confirmed recents are local AsyncStorage entries under a validated Client UUID
namespace, limited to five newest entries, with near-identical deduplication and
a 30-day TTL. They retain coordinates, display text and timestamp, with no
Supabase synchronization/table. Exact legacy unscoped-key deletion is attempted
best effort; legacy entries are never read, shown, attributed or imported to the
current Client even if deletion fails. Captured scope, serialized key access
and immutable account/lifetime/epoch/focus guards prevent delayed writes or clear
actions from targeting a successor account. Same-account recents may remain
across logout; visible memory clears with lost authority. Clear recent locations
is available in the picker. Persistence failure does not undo confirmed draft
location; clear failure is recoverable and does not claim deletion succeeded.

Client and eligible Worker disclosures now state current eligibility-based
pre-accept exact-location access and its removal when eligibility changes.
Protected eligibility revalidation, stale-response suppression, confirmed
Booking access, private precise-location architecture, geofence and deterministic
Skill 50 / Location 30 / Rating 20 matching remain unchanged. The older Web
FT-06A canonical-address/permission wording conflict is recorded for later
documentation synchronization; this local Mobile record does not edit Web
DECISIONS or claim that deferred synchronization is complete.

The integration retains all existing screen tests and adds behavioral RED/GREEN
panel/screen tests plus focused unchanged draft/submission/protected-location
regressions. Full repository gates and bounded synthetic native proof are
separate coordinator evidence. No hosted business mutation, hosted deployment,
hosted migration apply, real provider call or billing change occurred here.
