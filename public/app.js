const $ = (id) => document.getElementById(id);

let current = null; // parsed event object

$('image').addEventListener('change', (e) => {
  const file = e.target.files[0];
  $('file-name').textContent = file ? `Image attached: ${file.name}` : '+ Attach an invitation image (optional)';
});

$('parse-btn').addEventListener('click', async () => {
  const status = $('status');
  const text = $('text').value.trim();
  const file = $('image').files[0];
  if (!text && !file) {
    status.textContent = 'Paste some text or attach an image first.';
    status.className = 'status err';
    return;
  }

  status.textContent = '';
  const btn = $('parse-btn');
  btn.disabled = true;
  $('parse-spinner').classList.remove('hidden');

  const form = new FormData();
  if (text) form.append('text', text);
  if (file) form.append('image', file);

  try {
    const res = await fetch('/api/parse', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Parse failed');
    current = normalize(data);
    render();
  } catch (err) {
    status.textContent = err.message;
    status.className = 'status err';
  } finally {
    btn.disabled = false;
    $('parse-spinner').classList.add('hidden');
  }
});

function normalize(p) {
  const e = {
    title: p.title || '',
    start: p.startDate || '',
    startTime: p.startTime || '12:00',
    end: p.endDate || p.startDate || '',
    endTime: p.endTime || '',
    location: p.location || '',
    note: p.note || '',
    allDay: !p.startTime,
  };
  if (!e.endTime && !e.allDay) e.endTime = addHour(e.startTime);
  if (e.end === e.start && e.allDay) e.end = '';
  return e;
}

function addHour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2020, 0, 1, h + 1, m);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fieldRow(label, prop, type, hidden = false) {
  if (hidden) return '';
  const value = (current[prop] || '').replace(/"/g, '&quot;');
  const isText = type === 'textarea' || type === 'text';
  return `
    <div class="row">
      <div class="label">${label}</div>
      <div class="value">
        ${isText
          ? `<textarea id="f-${prop}" rows="1" oninput="autoGrow(this)">${value}</textarea>`
          : `<input id="f-${prop}" type="${type}" value="${value}" />`}
      </div>
    </div>`;
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight + 2) + 'px';
}

function render() {
  $('event-fields').innerHTML =
    fieldRow('Title', 'title', 'text') +
    fieldRow('Date', 'start', 'date') +
    fieldRow('Start time', 'startTime', 'time') +
    fieldRow('End date', 'end', 'date', !current.end) +
    fieldRow('End time', 'endTime', 'time', !current.endTime) +
    fieldRow('Location', 'location', 'textarea') +
    fieldRow('Note', 'note', 'textarea');
  $('result').classList.remove('hidden');
  $('status').textContent = '';
  document.querySelectorAll('#event-fields textarea').forEach((t) => autoGrow(t));
}

function readForm() {
  for (const key of ['title', 'start', 'startTime', 'end', 'endTime', 'location', 'note']) {
    const el = $(`f-${key}`);
    if (el) current[key] = el.value;
  }
  current.allDay = !current.startTime;
  return current;
}

$('add-google').addEventListener('click', async () => {
  const el = $('google-status');
  const event = readForm();
  el.textContent = '';
  const btn = $('add-google');
  btn.disabled = true;
  $('google-spinner').classList.remove('hidden');
  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error && data.error.includes('not connected')) {
        el.textContent = 'Google not connected. Opening connection…';
        window.location.href = '/google/connect';
        return;
      }
      throw new Error(data.error || 'Failed');
    }
    el.textContent = 'Added to Google Calendar ✓';
    el.className = 'status ok';
  } catch (err) {
    el.textContent = err.message;
    el.className = 'status err';
  } finally {
    btn.disabled = false;
    $('google-spinner').classList.add('hidden');
  }
});

$('apple-download').addEventListener('click', async () => {
  $('apple-instructions').hidden = !$('apple-instructions').hidden;
  $('google-status').textContent = '';
});

$('open-ics').addEventListener('click', async () => {
  const event = readForm();
  const payload = {
    title: event.title,
    start: event.start,
    startTime: event.startTime,
    end: event.end || event.start,
    endTime: event.endTime,
    location: event.location,
    note: event.note,
    allDay: !!event.allDay,
  };
  try {
    const res = await fetch('/api/ics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: payload }),
    });
    if (!res.ok) throw new Error('Could not create the .ics file.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(event.title || 'event').replace(/[^\w]+/g, '-')}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    $('google-status').textContent = 'Downloaded. Open it on your iPhone to add to Apple Calendar.';
    $('google-status').className = 'status ok';
  } catch (err) {
    $('google-status').textContent = err.message;
    $('google-status').className = 'status err';
  }
});
