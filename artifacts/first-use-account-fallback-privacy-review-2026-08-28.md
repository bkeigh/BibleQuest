# Privacy review: First-use local-only account fallback

## Risk decision

CLEAR FOR REVIEW

## Data-flow summary

The native availability result is reduced to an account-enabled boolean and rendered as local fallback copy. Choosing the fallback advances onboarding; profile, settings, and later journey records remain in the existing device-local Zustand store and `localStorage` boundary. No prayer, reflection, note, identity, token, or private URL is added to logs, analytics, evidence, or a third party by this change. Existing Settings export and clear controls remain the retention/deletion paths.

## Findings

| Severity | Finding | Evidence | Required action |
| --- | --- | --- | --- |
| None | The revised copy accurately describes a local continuation without claiming encryption, guaranteed security, or an active account connection. | `StepAccount` branches only on the existing `accountEnabled` posture and does not collect a field or call a transport. | Keep account availability and signed-in sync verification as separate release gates. |
| None | Removing the duplicate fallback sentence changes presentation only; it does not weaken consent or legal access. | Terms and Privacy links remain directly below the primary action. | Recheck the exact native screen after export. |

## Verification required

- Focused onboarding and containment tests pass.
- Exact account-release export and artifact verifier pass after the change is committed.
- A clean native simulator shows the local-only action as the primary control with Terms and Privacy still visible.
- Physical-device and account-enabled network/isolation checks remain open; simulator evidence must not be promoted to those gates.

## Residual risk and owner

The screen depends on the production native-availability latch. The release/account-posture owner must prove both disabled and staffed-window enabled behavior on the signed candidate; this source review does not establish provider availability or physical-device isolation.
