'use strict';

const config = require('../config');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const TOKEN_STORE = new Map(); // sessionId -> tokens (session cookie value)

const oauth2Client = new google.auth.OAuth2(
  config.google.clientId,
  config.google.clientSecret,
  `${config.baseUrl}/auth/google/callback`
);

function isConfigured() {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

/** Return the Google login URL to redirect the user to. */
function authUrl(sessionId) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: sessionId,
  });
}

/** Exchange an OAuth code for tokens and stash them for this session. */
async function handleCallback(code, sessionId) {
  const { tokens } = await oauth2Client.getToken(code);
  TOKEN_STORE.set(sessionId, tokens);
  return tokens;
}

/** Whether this session has Google connected. */
function isConnected(sessionId) {
  return TOKEN_STORE.has(sessionId);
}

function tokensFor(sessionId) {
  const tokens = TOKEN_STORE.get(sessionId);
  if (!tokens) throw new Error('Google not connected for this session');
  return tokens;
}

/** Insert a Google Calendar event. */
async function createEvent(sessionId, event) {
  const tokens = tokensFor(sessionId);
  oauth2Client.setCredentials(tokens);

  const body = {
    summary: event.title,
    location: event.location || undefined,
    description: event.note || undefined,
  };
  if (event.allDay) {
    body.start = { date: event.start };
    body.end = { date: addDays(event.start, 1) };
  } else {
    body.start = { dateTime: toDateTime(event.start, event.startTime), timeZone: 'UTC' };
    body.end = {
      dateTime: toDateTime(event.end || event.start, event.endTime || addMinutes(event.startTime)),
      timeZone: 'UTC',
    };
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const res = await calendar.events.insert({ calendarId: 'primary', requestBody: body });
  return { id: res.data.id, htmlLink: res.data.htmlLink };
}

function toDateTime(date, time) {
  const t = time || '09:00';
  return `${date}T${t}:00`;
}

function addMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const date = new Date(2020, 0, 1, h, m + 60);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = { isConfigured, authUrl, handleCallback, isConnected, createEvent };
