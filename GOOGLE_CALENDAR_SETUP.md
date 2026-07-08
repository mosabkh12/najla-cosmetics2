# Google Calendar Sync — Setup

One-way sync: **Najla's Supabase database → Google Calendar**. Google Calendar is
never read from — this app's `appointments` table is always the source of truth.

## 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project (or reuse an existing one).
2. In **APIs & Services → Library**, search for **Google Calendar API** and click **Enable**.

## 2. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** (or **Internal** if you're on a Google Workspace domain).
3. Fill in the app name, support email, developer email. No sensitive/restricted scopes needed to request review for personal use — this app only requests the Calendar scope below.
4. Add your own Google account as a **test user** if the app stays in "Testing" publishing status (fine for a single-admin setup like this).

## 3. Create OAuth 2.0 credentials

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Add an **Authorized redirect URI**. You won't actually deploy a callback route for this (see §4), but Google requires a redirect URI to be registered to issue a refresh token via the flow below — any URL you control works, e.g.:
   - Local: `http://localhost:5173/oauth2callback`
   - Production: `https://<your-vercel-domain>/oauth2callback`
4. Save the generated **Client ID** and **Client Secret**.

## 4. Get a refresh token (one-time, manual)

This app authenticates as **one fixed admin Google account** via a long-lived refresh
token — there's no in-app "Connect" button or OAuth callback route to build or maintain.
Generate the refresh token once, using Google's [OAuth 2.0 Playground](https://developers.google.com/oauthplayground):

1. Open the playground, click the gear icon (top right), check **"Use your own OAuth credentials"**, and paste your Client ID/Secret from §3.
2. In the left panel, under a custom scope field, enter: `https://www.googleapis.com/auth/calendar.events`
3. Click **Authorize APIs**, sign in with the Google account whose calendar should receive appointments, and approve.
4. Click **Exchange authorization code for tokens**.
5. Copy the **Refresh token** shown — this is your `GOOGLE_REFRESH_TOKEN`.

The scope is deliberately narrow (`calendar.events`, not full `calendar`) — this app
only ever creates/updates individual events, never touches calendar settings.

## 5. Find your Calendar ID

- To sync into your main calendar, use `primary`.
- To sync into a separate calendar instead, create one in Google Calendar, then open
  **Settings → [that calendar] → Integrate calendar** and copy its **Calendar ID**
  (looks like `xxxxx@group.calendar.google.com`).

## 6. Environment variables

Set these **server-side only** — never prefix with `VITE_`, never expose to the browser:

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | From §3 |
| `GOOGLE_CLIENT_SECRET` | From §3 |
| `GOOGLE_REDIRECT_URI` | The exact redirect URI registered in §3 (only used to construct the OAuth client; never actually hit at runtime) |
| `GOOGLE_CALENDAR_ID` | From §5 (`primary` or a calendar ID) |
| `GOOGLE_REFRESH_TOKEN` | From §4 |

Add these in **Vercel → Project → Settings → Environment Variables** (Production and
Preview), and in your local `.env` for local development. All 5 must be set together —
if any is missing, sync silently no-ops (bookings/status changes/reschedules still work
normally, they just don't sync to Google).

## 7. How it works

- Every appointment write (create, reschedule, status change, cancel) triggers a
  best-effort sync in the background. It never blocks or fails the booking/update
  itself — a Google API error is caught, logged server-side, and recorded on the
  appointment row (`google_calendar_sync_error`), while the app's own database write
  already succeeded.
- The admin **Appointments** page shows a **Google Calendar** column per row:
  **Synced** / **Sync failed** / **Not synced yet**, with a retry button for the
  latter two.
- Cancelled appointments are **not deleted** from Google Calendar — the existing event
  is updated to show `[Cancelled] ...` in its title. This avoids losing the
  `google_event_id` link (which would risk a duplicate event if the cancellation is
  later reverted) and preserves anything the admin may have added to the event
  directly in Google Calendar.

## 8. Test checklist (after deploying with all 5 env vars set)

1. **Create**: book a new appointment as a customer → confirm a new event appears in
   the connected Google Calendar within a few seconds, titled
   `[Confirmed] <Service> — <Customer>`, with the right date/time/duration in
   Asia/Jerusalem time.
2. **Reschedule**: reschedule that appointment to a different date/time → confirm the
   *same* Google event moves (not a duplicate) — check the admin Appointments page
   shows **Synced**.
3. **Status change**: in the admin dashboard, mark the appointment **Completed** →
   confirm the Google event's title updates to `[Completed] ...`.
4. **Cancel**: cancel an appointment (as the customer, from their profile) → confirm
   the Google event's title updates to `[Cancelled] ...` rather than disappearing.
5. **Failure handling**: temporarily set `GOOGLE_REFRESH_TOKEN` to an invalid value,
   redeploy, create an appointment → confirm the booking still succeeds normally, and
   the admin Appointments page shows **Sync failed** for that row with a working
   **Retry** button. Restore the correct token and click Retry → confirm it flips to
   **Synced**.
6. **Not configured**: with any of the 5 env vars unset, confirm booking, rescheduling,
   status changes, and cancellation all still work exactly as before (Google column
   just shows **Not synced yet** indefinitely).
