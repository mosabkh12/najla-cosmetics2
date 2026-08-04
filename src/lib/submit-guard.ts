// A synchronous "am I already submitting?" guard — stronger than React
// state (disabled/busy) alone, since state updates are not synchronous
// and can't block a second click/Enter that lands in the gap before a
// disabled button has actually re-rendered. Shared by BookingDialog and
// RescheduleDialog (checkout.tsx keeps its own pre-existing inline copy
// of the same one-line pattern, unrelated to this phase).
export interface SubmitGuard {
  // Returns true and marks the guard as held if it was free; returns
  // false without side effects if something is already in flight.
  tryAcquire(): boolean;
  // Always safe to call, including when not currently held — callers
  // release unconditionally from a `finally` block.
  release(): void;
}

export function createSubmitGuard(): SubmitGuard {
  let submitting = false;
  return {
    tryAcquire() {
      if (submitting) return false;
      submitting = true;
      return true;
    },
    release() {
      submitting = false;
    },
  };
}
