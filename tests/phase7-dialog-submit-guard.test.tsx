// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Service } from "@/components/services/ServiceCard";

// Full component-level tests of the Phase 7A submission guard, on top of
// the real BookingDialog/RescheduleDialog components (not a
// reimplementation) — everything external (routing, auth, i18n, the
// server functions themselves) is mocked; the dialog's own state/ref
// logic is real. This is what actually proves "two rapid clicks reach
// the server exactly once," which a guard-only unit test (see
// phase7-submit-guard.test.ts) cannot show by itself.

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (k: string) => k, lang: "en", dir: "ltr" }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/api/appointments/appointments", () => ({
  getAvailableTimes: vi.fn(async () => []),
  createAppointment: vi.fn(async () => ({ success: true })),
  rescheduleAppointment: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/api/slots/slots", () => ({
  getAvailabilitySettings: vi.fn(async () => ({
    weekly_hours: {
      "0": { enabled: true, open: "09:00", close: "19:00" },
      "1": { enabled: true, open: "09:00", close: "19:00" },
      "2": { enabled: true, open: "09:00", close: "19:00" },
      "3": { enabled: true, open: "09:00", close: "19:00" },
      "4": { enabled: true, open: "09:00", close: "19:00" },
      "5": { enabled: true, open: "09:00", close: "19:00" },
      "6": { enabled: true, open: "09:00", close: "19:00" },
    },
    closed_dates: [],
  })),
}));

vi.mock("@/api/profiles/profiles", () => ({
  getProfile: vi.fn(async () => ({ full_name: "Jane Doe", phone: "0501234567" })),
}));

vi.mock("@/api/services/services", () => ({
  getServices: vi.fn(async () => [TEST_SERVICE]),
}));

function createDeferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const TEST_SERVICE: Service = {
  id: "svc-1",
  name: "Test Service",
  name_ar: null,
  name_en: "Test Service",
  description: null,
  description_ar: null,
  description_en: null,
  category: "test",
  image_url: null,
  thumbnail_url: null,
  price: 100,
  duration_minutes: 30,
};

function renderWithQueryClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// Clicks tomorrow's day cell in step 1's calendar (identified via the
// Calendar component's own `data-day` attribute, using the same
// `toLocaleDateString()` the component renders it with) — a definite,
// unambiguous new selection, always enabled given the fully-open
// weekly_hours/no-closed-dates mock above regardless of which weekday
// it lands on.
//
// Uses `fireEvent.click` (a single, synchronous dispatch) rather than
// `userEvent.click` (a realistic multi-tick hover/pointerdown/pointerup
// sequence) deliberately: the settings query resolving mid-sequence can
// cause react-day-picker to re-render between those ticks, and the
// click can land on a stale reference and never reach react-day-picker's
// onSelect at all — confirmed directly against an isolated Calendar +
// useQuery harness while diagnosing this file. fireEvent's single
// dispatch has no such gap.
async function advancePastDateStep() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const target = tomorrow.toLocaleDateString();
  // Finds AND clicks inside the same waitFor callback invocation
  // (rather than returning the element and clicking afterward) so
  // there is no gap in which a pending async state update (e.g. the
  // settings query, or BookingDialog's own getProfile() prefill) can
  // re-render and swap out the day cell's DOM node between "found it"
  // and "clicked it" — confirmed via isConnected checks while
  // diagnosing this file that such a gap does occur here.
  await waitFor(() => {
    const el = document.querySelector(`[data-day="${target}"]`) as HTMLElement | null;
    if (!el) throw new Error(`day button for ${target} not rendered yet`);
    fireEvent.click(el);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("Phase 7A — BookingDialog submission guard", () => {
  it("1. two rapid submissions trigger exactly one createAppointment call", async () => {
    const { createAppointment, getAvailableTimes } =
      await import("@/api/appointments/appointments");
    const deferred = createDeferred<{ success: true }>();
    vi.mocked(getAvailableTimes).mockResolvedValue(["10:00"]);
    vi.mocked(createAppointment).mockReturnValue(deferred.promise);

    const { BookingDialog } = await import("@/components/services/BookingDialog");
    renderWithQueryClient(
      <BookingDialog service={TEST_SERVICE} open={true} onOpenChange={() => {}} />,
    );

    await advancePastDateStep();
    const timeButton = await screen.findByRole("button", { name: "10:00" });
    fireEvent.click(timeButton);

    const confirmButton = await screen.findByRole("button", { name: /confirm_booking/i });
    expect(confirmButton).not.toBeDisabled();

    // Two rapid clicks, back to back, before createAppointment's promise
    // ever settles — the second must never reach the server function.
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(createAppointment).toHaveBeenCalledTimes(1);

    deferred.resolve({ success: true });
    await waitFor(() => expect(confirmButton).not.toBeDisabled());
  });

  it("2. the guard resets after a failed booking, allowing a later retry", async () => {
    const { createAppointment, getAvailableTimes } =
      await import("@/api/appointments/appointments");
    vi.mocked(getAvailableTimes).mockResolvedValue(["10:00"]);
    vi.mocked(createAppointment).mockRejectedValueOnce(new Error("TIME_TAKEN"));

    const { BookingDialog } = await import("@/components/services/BookingDialog");
    renderWithQueryClient(
      <BookingDialog service={TEST_SERVICE} open={true} onOpenChange={() => {}} />,
    );

    await advancePastDateStep();
    const timeButton = await screen.findByRole("button", { name: "10:00" });
    fireEvent.click(timeButton);
    const confirmButton = await screen.findByRole("button", { name: /confirm_booking/i });

    fireEvent.click(confirmButton);
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    // Loading state clears again once the failed call settles — the
    // button becomes clickable, not stuck disabled forever.
    await waitFor(() => expect(confirmButton).not.toBeDisabled());

    vi.mocked(createAppointment).mockResolvedValueOnce({ success: true });
    fireEvent.click(confirmButton);
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(2));
  });
});

describe("Phase 7A — RescheduleDialog submission guard", () => {
  const APPOINTMENT = {
    id: "appt-1",
    service_id: "svc-1",
    appointment_date: "2026-01-01",
    appointment_time: "10:00:00",
  };

  it("3. two rapid submissions trigger exactly one rescheduleAppointment call", async () => {
    const { rescheduleAppointment, getAvailableTimes } =
      await import("@/api/appointments/appointments");
    const deferred = createDeferred<{ success: true }>();
    vi.mocked(getAvailableTimes).mockResolvedValue(["14:00"]);
    vi.mocked(rescheduleAppointment).mockReturnValue(deferred.promise);

    const { RescheduleDialog } = await import("@/components/services/RescheduleDialog");
    renderWithQueryClient(
      <RescheduleDialog
        appointment={APPOINTMENT}
        open={true}
        onOpenChange={() => {}}
        onDone={() => {}}
      />,
    );

    // Step 1: service selection.
    const serviceButton = await screen.findByRole("button", { name: /Test Service/i });
    fireEvent.click(serviceButton);

    // Step 2: date.
    await advancePastDateStep();

    // Step 3: time + confirm.
    const timeButton = await screen.findByRole("button", { name: "14:00" });
    fireEvent.click(timeButton);
    const confirmButton = await screen.findByRole("button", { name: /^reschedule$/i });
    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(rescheduleAppointment).toHaveBeenCalledTimes(1);

    deferred.resolve({ success: true });
    await waitFor(() => expect(confirmButton).not.toBeDisabled());
  });

  it("4. the guard resets after a failed reschedule, allowing a later retry", async () => {
    const { rescheduleAppointment, getAvailableTimes } =
      await import("@/api/appointments/appointments");
    vi.mocked(getAvailableTimes).mockResolvedValue(["14:00"]);
    vi.mocked(rescheduleAppointment).mockRejectedValueOnce(new Error("TIME_TAKEN"));

    const { RescheduleDialog } = await import("@/components/services/RescheduleDialog");
    renderWithQueryClient(
      <RescheduleDialog
        appointment={APPOINTMENT}
        open={true}
        onOpenChange={() => {}}
        onDone={() => {}}
      />,
    );

    const serviceButton = await screen.findByRole("button", { name: /Test Service/i });
    fireEvent.click(serviceButton);
    await advancePastDateStep();
    const timeButton = await screen.findByRole("button", { name: "14:00" });
    fireEvent.click(timeButton);
    const confirmButton = await screen.findByRole("button", { name: /^reschedule$/i });

    fireEvent.click(confirmButton);
    await waitFor(() => expect(rescheduleAppointment).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(confirmButton).not.toBeDisabled());

    vi.mocked(rescheduleAppointment).mockResolvedValueOnce({ success: true });
    fireEvent.click(confirmButton);
    await waitFor(() => expect(rescheduleAppointment).toHaveBeenCalledTimes(2));
  });
});
