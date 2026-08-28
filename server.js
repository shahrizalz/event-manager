const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const config = require('./config');
const { parseInvite } = require('./lib/parser');
const google = require('./lib/google');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '10mb' }));

// -------- Session (simple cookie-backed, in-memory store) --------
const sessions = new Map(); // sessionId -> { google: bool }

function getSession(req, res) {
  let id = req.cookies ? req.cookies.session : undefined;
  if (!id || !sessions.has(id)) {
    id = crypto.randomBytes(16).toString('hex');
    sessions.set(id, {});
    res.cookie('session', id, { httpOnly: true, sameSite: 'lax' });
  }
  return id;
}

// Minimal cookie parse
app.use((req, res, next) => {
  req.cookies = {};
  const header = req.headers.cookie;
  if (header) {
    for (const part of header.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k) req.cookies[k] = decodeURIComponent(v.join('='));
    }
  }
  next();
});

// -------- Parse: LLM extraction from text + optional image --------
app.post('/api/parse', upload.single('image'), async (req, res) => {
  try {
    const text = (req.body && req.body.text) || '';
    let imageBase64 = null;
    if (req.file) imageBase64 = req.file.buffer.toString('base64');

    if (!text && !imageBase64) {
      return res.status(400).json({ error: 'Provide text and/or an image.' });
    }

    const parsed = await parseInvite(text, imageBase64);
    if (parsed.error) return res.status(422).json({ error: parsed.error });
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Parsing failed: ${err.message}` });
  }
});

// -------- Google Calendar OAuth --------
app.get('/google/connect', (req, res) => {
  if (!google.isConfigured()) {
    return res.status(400).send('Google OAuth is not configured. Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env');
  }
  const sessionId = getSession(req, res);
  res.redirect(google.authUrl(sessionId));
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const sessionId = req.query.state;
    if (!sessions.has(sessionId)) {
      return res.status(400).send('Session not found. Please refresh and reconnect.');
    }
    await google.handleCallback(req.query.code, sessionId);
    sessions.get(sessionId).google = true;
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Google connect failed.');
  }
});

app.get('/api/google/status', (req, res) => {
  getSession(req, res);
  res.json({ connected: false, configured: google.isConfigured() });
});

// -------- Create Google Calendar event from a parsed event --------
app.post('/api/events', async (req, res) => {
  const sessionId = getSession(req, res);
  const { event } = req.body;
  if (!event || !event.title || !event.start) {
    return res.status(400).json({ error: 'Event with title and start is required.' });
  }
  if (!google.isConnected(sessionId)) {
    return res.status(403).json({ error: 'Google Calendar not connected for this session.' });
  }
  try {
    const created = await google.createEvent(sessionId, event);
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Google create failed: ${err.message}` });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

function toIcsDateTime(date, time) {
  const t = time || '09:00';
  const [h, m] = t.split(':');
  return `${date.replace(/-/g, '')}T${h}${m}00`;
}

function escapeIcs(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function buildIcs(event) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//InviteToCalendar//EN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@invitetocalendar`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
  ];
  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${event.start.replace(/-/g, '')}`);
    if (event.end) lines.push(`DTEND;VALUE=DATE:${event.end.replace(/-/g, '')}`);
  } else {
    lines.push(`DTSTART:${toIcsDateTime(event.start, event.startTime)}`);
    lines.push(`DTEND:${toIcsDateTime(event.end || event.start, event.endTime || event.startTime)}`);
  }
  lines.push(`SUMMARY:${escapeIcs(event.title)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
  if (event.note) lines.push(`DESCRIPTION:${escapeIcs(event.note)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

app.post('/api/ics', express.json(), (req, res) => {
  const event = req.body && req.body.event;
  if (!event || !event.title || !event.start) {
    return res.status(400).json({ error: 'Event with title and start is required.' });
  }
  const ics = buildIcs(event);
  const filename = `${(event.title || 'event').replace(/[^\w]+/g, '-')}.ics`;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(ics);
});

app.listen(config.port, () => {
  console.log(`Event Manager running at ${config.baseUrl}`);
  console.log(`LLM provider: ${config.llm.provider}`);
});
