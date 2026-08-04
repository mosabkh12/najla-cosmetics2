import { describe, expect, it } from "vitest";
import { createSubmitGuard } from "@/lib/submit-guard";

// Pure unit tests of the synchronous double-submission guard shared by
// BookingDialog.tsx and RescheduleDialog.tsx (see submit-guard.ts) —
// this is the actual mechanism a rapid double-click/Enter is blocked by,
// tested directly rather than only indirectly through a rendered
// component.
describe("Phase 7A — createSubmitGuard", () => {
  it("1. a second synchronous acquire is blocked while the first is still held", () => {
    const guard = createSubmitGuard();
    expect(guard.tryAcquire()).toBe(true);
    expect(guard.tryAcquire()).toBe(false);
    expect(guard.tryAcquire()).toBe(false);
  });

  it("2. release() frees the guard for a subsequent acquire", () => {
    const guard = createSubmitGuard();
    expect(guard.tryAcquire()).toBe(true);
    guard.release();
    expect(guard.tryAcquire()).toBe(true);
  });

  it("3. release() is safe to call even when nothing is held", () => {
    const guard = createSubmitGuard();
    expect(() => guard.release()).not.toThrow();
    expect(guard.tryAcquire()).toBe(true);
  });

  it("4. each guard instance is independent (one dialog's guard cannot block another's)", () => {
    const guardA = createSubmitGuard();
    const guardB = createSubmitGuard();
    expect(guardA.tryAcquire()).toBe(true);
    expect(guardB.tryAcquire()).toBe(true);
  });
});
