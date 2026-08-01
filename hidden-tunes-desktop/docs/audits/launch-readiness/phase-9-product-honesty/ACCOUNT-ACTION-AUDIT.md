# Account Action Audit

## Follow (before)

Inline “Sign in to follow artists.” with no sign-in UI → dead end. Optimistic Follow only after session (OK when signed in).

## Follow (after)

- `resolveAccountGate('follow')` + `AccountRequiredDialog`
- No fake Following toggle when unsigned
- Dialog Escape/focus; does not stop playback
- Signed-in path unchanged (real API follow/unfollow)

## Profile chrome

Sidebar “Hidden Listener” → **Local preview**.

## Sign-in UI

Still not implemented (Phase auth later). Gate copy states that clearly.
