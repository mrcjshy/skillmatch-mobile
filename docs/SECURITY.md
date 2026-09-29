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
