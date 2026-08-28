'use strict';

const config = require('../config');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You extract event details from a wedding, party, meeting, or any other event invitation.
Return ONLY valid JSON with exactly these fields:
{
  "title": string,            // e.g. "Sarah & James Wedding", "Annual Conference"
  "startDate": "YYYY-MM-DD",  // the calendar date of the event
  "startTime": "HH:MM",       // 24-hour local time, or null if not stated
  "endDate": "YYYY-MM-DD",    // null if unknown
  "endTime": "HH:MM",         // null if unknown
  "location": string or null, // venue name/address if stated
  "note": string or null      // any other details (dress code, RSVP, etc.)
}
Rules:
- Infer the current year when the year is not stated (if the date already passed this year, use next year).
- The current date is ${new Date().toISOString().slice(0, 10)}.
- If nothing meaningful was found, return {"error":"Could not detect an event."}
- Do not wrap the JSON in markdown. Output raw JSON only.`;

function defaultModelFor(provider) {
  if (config.llm.model) return config.llm.model;
  switch (provider) {
    case 'openai': return 'gpt-4o';
    case 'anthropic': return 'claude-sonnet-4-20250514';
    case 'ollama': return 'llama3.2:latest';
    default: return '';
  }
}

/** Parse text (+ optional base64 image) into a structured event. */
async function parseInvite(text, imageBase64 = null) {
  const provider = config.llm.provider;
  switch (provider) {
    case 'openai': return parseOpenAPICompat(text, imageBase64, 'https://api.openai.com/v1', config.llm.openaiKey);
    case 'openai-compat': {
      if (!config.llm.openaiBase || !config.llm.openaiKey) {
        throw new Error('LLM_API_BASE and LLM_API_KEY must be set (NanoGPT / OpenAI-compatible endpoint)');
      }
      return parseOpenAPICompat(text, imageBase64, config.llm.openaiBase, config.llm.openaiKey);
    }
    case 'anthropic': return parseAnthropic(text, imageBase64);
    case 'ollama': return parseOllama(text, imageBase64);
    default: throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

function cleanJson(raw) {
  const cleaned = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found in LLM output');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function parseOpenAPICompat(text, imageBase64, baseURL, apiKey) {
  const client = new OpenAI({ apiKey, baseURL });
  const content = [];
  if (imageBase64) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
    });
  }
  content.push({ type: 'text', text });
  const res = await client.chat.completions.create({
    model: defaultModelFor('openai-compat') || 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    temperature: 0,
  });
  return cleanJson(res.choices[0].message.content);
}

async function parseAnthropic(text, imageBase64) {
  const client = new Anthropic({ apiKey: config.llm.anthropicKey });
  const content = [];
  if (imageBase64) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: imageBase64,
      },
    });
  }
  content.push({ type: 'text', text });
  const res = await client.messages.create({
    model: defaultModelFor('anthropic'),
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  });
  const raw = res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  return cleanJson(raw);
}

async function parseOllama(text, imageBase64) {
  const payload = { model: defaultModelFor('ollama'), stream: false, format: 'json', messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: imageBase64 ? `${text}\n\n[attached image in base64: ${imageBase64.slice(0, 50)}...]` : text },
  ] };
  const res = await fetch(`${config.llm.ollamaBase}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const data = await res.json();
  return cleanJson(data.message.content);
}

module.exports = { parseInvite, cleanJson };
