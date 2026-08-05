// Persists the active checkout idempotency attempt (key + a fingerprint
// of the payload it was generated for) across page reloads. Before this
// existed, checkout.tsx kept the key only in a React ref — if an order
// request succeeded but the response never reached the browser (network
// drop, tab crash) and the user reloaded, a fresh key was generated and
// resubmitting could create a second real order. The server-side
// (user_id, idempotency_key) check in create_order() already made a
// duplicate SAME-key submission safe; this module is what lets the
// browser actually keep reusing that same key across a reload in the
// first place.
//
// The fingerprint here is a client-side convenience only, used to decide
// whether a locally-remembered key still corresponds to "the same
// checkout attempt" — it is never sent to or trusted by the server.
// create_order() computes and verifies its own fingerprint independently
// (see the accompanying migration): this local check exists purely so
// the browser doesn't have to guess, not as the actual safety boundary.
//
// This module also persists a "checkout draft" (the material form
// fields themselves — name/phone/notes/delivery details). Without it,
// checkout.tsx's fields reset to empty/default on every reload, and the
// very first fingerprint computed after a reload (against that empty
// state) would not match the persisted attempt and would silently
// overwrite it — destroying the original key before the user has a
// chance to restore their real input. Restoring the draft BEFORE the
// first fingerprint computation is what keeps the attempt intact.

const STORAGE_KEY = "najla:checkout-idempotency";
const DRAFT_STORAGE_KEY = "najla:checkout-draft";

// Bumped whenever the persisted shape or the fields that make up the
// fingerprint change, so an old record left over from a previous deploy
// is never misread as valid — it fails the version check and a fresh
// key is generated instead.
const SCHEMA_VERSION = 1;

// Long enough that a brief interruption (lost response, reload, retry)
// still finds the same attempt; short enough that a cart abandoned for
// days doesn't hang onto a key indefinitely.
const EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface CheckoutPayloadForFingerprint {
  customer_name: string;
  customer_phone: string;
  notes: string | null;
  delivery_method: string;
  delivery_area_id: string | null;
  delivery_street: string | null;
  items: { product_id: string; quantity: number }[];
}

interface PersistedAttempt {
  version: number;
  key: string;
  fingerprint: string;
  createdAt: number;
}

function isPersistedAttempt(value: unknown): value is PersistedAttempt {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.version === "number" &&
    typeof v.key === "string" &&
    v.key.length > 0 &&
    typeof v.fingerprint === "string" &&
    v.fingerprint.length > 0 &&
    typeof v.createdAt === "number"
  );
}

// Deliberately excludes price/name/image_url/stock — the server never
// trusts client-supplied prices (create_order recomputes from
// products.price), and these are display-only fields never sent to
// createOrder in the first place. Cart items are merged/sorted by
// product_id so a different in-memory ordering of the same items never
// changes the fingerprint.
export async function computeCheckoutFingerprint(
  payload: CheckoutPayloadForFingerprint,
): Promise<string> {
  const itemTotals = new Map<string, number>();
  for (const item of payload.items) {
    itemTotals.set(item.product_id, (itemTotals.get(item.product_id) ?? 0) + item.quantity);
  }
  const canonical = {
    customer_name: payload.customer_name.trim(),
    customer_phone: payload.customer_phone.trim(),
    notes: payload.notes?.trim() || "",
    delivery_method: payload.delivery_method,
    delivery_area_id: payload.delivery_area_id ?? "",
    delivery_street: payload.delivery_street?.trim() || "",
    items: Array.from(itemTotals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([product_id, quantity]) => ({ product_id, quantity })),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Corrupted JSON, an unrecognized shape, an old schema version, or an
// expired record are all treated identically — safe to ignore, callers
// simply generate a fresh key.
export function loadPersistedAttempt(): { key: string; fingerprint: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPersistedAttempt(parsed)) return null;
    if (parsed.version !== SCHEMA_VERSION) return null;
    if (Date.now() - parsed.createdAt > EXPIRY_MS) return null;
    return { key: parsed.key, fingerprint: parsed.fingerprint };
  } catch {
    return null;
  }
}

export function savePersistedAttempt(key: string, fingerprint: string): void {
  const attempt: PersistedAttempt = {
    version: SCHEMA_VERSION,
    key,
    fingerprint,
    createdAt: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attempt));
  } catch (e) {
    // Storage quota exceeded, or unavailable (e.g. private browsing) —
    // the key still works for the rest of this session via component
    // state, it just won't survive a reload. Not worth surfacing to the
    // user, same reasoning as useCart's own persistence failure handling.
    console.warn("[checkout] failed to persist idempotency attempt", e);
  }
}

// Called only after a confirmed successful order, or an intentional
// checkout reset (e.g. the cart becoming empty) — never on a request
// that merely threw (network error, validation failure, stock
// conflict), so a failed attempt's key remains reusable for the retry.
export function clearPersistedAttempt(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing meaningful to recover from here; a failed removal just
    // leaves a stale (and eventually expiry-invalidated) record behind.
  }
}

// The material checkout form fields — everything the idempotency
// fingerprint is computed from except cart items, which already survive
// a reload on their own via useCart's own localStorage persistence.
// Deliberately just these fields: no payment details, no secrets.
export interface CheckoutDraft {
  customer_name: string;
  customer_phone: string;
  notes: string | null;
  delivery_method: string;
  delivery_area_id: string | null;
  delivery_street: string | null;
}

interface PersistedDraft extends CheckoutDraft {
  version: number;
  createdAt: number;
}

function isPersistedDraft(value: unknown): value is PersistedDraft {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.version === "number" &&
    typeof v.customer_name === "string" &&
    typeof v.customer_phone === "string" &&
    (v.notes === null || typeof v.notes === "string") &&
    typeof v.delivery_method === "string" &&
    (v.delivery_area_id === null || typeof v.delivery_area_id === "string") &&
    (v.delivery_street === null || typeof v.delivery_street === "string") &&
    typeof v.createdAt === "number"
  );
}

// Same corrupt/unversioned/expired handling as loadPersistedAttempt —
// callers get null and fall back to their own default (e.g. profile
// prefill) rather than a half-valid draft.
export function loadPersistedDraft(): CheckoutDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPersistedDraft(parsed)) return null;
    if (parsed.version !== SCHEMA_VERSION) return null;
    if (Date.now() - parsed.createdAt > EXPIRY_MS) return null;
    return {
      customer_name: parsed.customer_name,
      customer_phone: parsed.customer_phone,
      notes: parsed.notes,
      delivery_method: parsed.delivery_method,
      delivery_area_id: parsed.delivery_area_id,
      delivery_street: parsed.delivery_street,
    };
  } catch {
    return null;
  }
}

export function saveDraft(draft: CheckoutDraft): void {
  const persisted: PersistedDraft = { ...draft, version: SCHEMA_VERSION, createdAt: Date.now() };
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(persisted));
  } catch (e) {
    console.warn("[checkout] failed to persist checkout draft", e);
  }
}

// Called alongside clearPersistedAttempt() — confirmed success and
// intentional reset both clear the draft too, never a request that
// merely threw.
export function clearPersistedDraft(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Same reasoning as clearPersistedAttempt().
  }
}
