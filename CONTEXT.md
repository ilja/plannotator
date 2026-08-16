# Plannotator annotation context

This context describes the domain language used when users review agent messages and record feedback in Plannotator.

## Decisions

**Choice question**:
A prompt in an agent message that presents named options and asks the user to choose one.
_Avoid_: Choice widget, option prompt

**Decision record**:
Feedback that records the user's selected option together with the question identity and enough option text to understand the choice later.
_Avoid_: Temporary selection, UI state

**Selected option**:
The one option chosen for a choice question. Choosing the same option again clears the decision, and choosing another option replaces it.
_Avoid_: Multi-select choice, toggle state

**Recommendation**:
A presentation hint that identifies an option as preferred without selecting it or changing the user's decision.
_Avoid_: Default selection, automatic choice

**Invalid decision**:
A decision record whose question text or ordered option labels and text changed, so Plannotator must discard it instead of sending it as feedback. A recommendation-only change does not invalidate the decision, and invalid decisions are removed as soon as the edited source is parsed.
_Avoid_: Unattached decision, stale selection

**Decision validity**:
A decision is valid only when its question and ordered options still match the source after line-ending normalization. Missing validation evidence and ambiguous duplicate questions make a decision invalid.
_Avoid_: Fuzzy match, best-effort reattachment
