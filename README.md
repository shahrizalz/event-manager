# Invite → Calendar

Forwards a wedding / party / event invite (text or image), extracts the details with an LLM, and adds it to
**Google Calendar** and/or **Apple Calendar** — so you never miss another event.

## How it works

1. You paste the invite text (and/or attach a screenshot) — either here in the web app, or forwarded
   from WhatsApp/Telegram to the app.
2. An LLM parses out the structured event: title, date, time, location, note.
3. You review the parsed fields, then send it to Google Calendar (auto) and/or Apple Calendar (via an
   iOS Shortcut).

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure

Copy `.env.example` to `.env` and fill it in:

- **LLM**: you said you have a **NanoGPT** key.
  - `LLM_PROVIDER=openai-compat`
  - `LLM_API_KEY=<your nanogpt key>`
  - `LLM_API_BASE=https://api.nanogpt.dev/v1`
- **Google Calendar** (optional — only if you want auto-add to Google):
  1. Go to the [Google Cloud Console](https://console.cloud.google.com), create a project.
  2. Enable the **Google Calendar API**.
  3. Under **APIs & Services → Credentials → Create Credentials → OAuth client ID**,
     choose *Web application*.
  4. Add redirect URI: `YOUR_BASE_URL/auth/google/callback` (e.g. `http://localhost:3000/auth/google/callback`).
  5. Copy the Client ID / Secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### 3. Run

```bash
npm start
```

Open `http://localhost:3000`.

## Apple Calendar (iOS Shortcut)

Apple has no open web API, so the simplest reliable route is an iOS Shortcut:

1. On your iPhone, create a Shortcut with these actions:
   - **Get Clipboard** *(or "Get Text from Input")*
   - **Get Contents of URL** → URL: `YOUR_BASE_URL/api/parse`, method POST,
     request body: FormData or JSON with the invite `text` (and `image` if you want image parsing).
   - **Get Dictionary from Input** → the JSON response.
   - **Add New Event** with the parsed `title`, date, time, `location`, notes.
2. From WhatsApp/Telegram, use **Share → your Shortcut** to process and add the event straight to
   Apple Calendar on-device.
3. Alternatively, use the web app's **"Copy event for Apple Calendar"** button, then run the
   Shortcut to read the clipboard and create the event.

> The same idea works for the web app: host it (e.g. on VPS/Docker) and point the phone at its URL.

## API

- `POST /api/parse` — multipart `text` + optional `image`. Returns parsed event JSON.
- `GET /google/connect` — start Google OAuth.
- `POST /api/events` — `{ event: { title, start, startTime, end, endTime, location, note, allDay } }`
  creates the event in the connected Google Calendar.
