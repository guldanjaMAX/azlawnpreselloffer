export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request.' }, 400); }

  const name  = (body.name  || '').trim();
  const email = (body.email || '').trim();
  const date  = (body.date  || '').trim();
  const time  = (body.time  || '').trim();

  if (!name || !email || !date || !time) return json({ error: 'All fields are required.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Invalid email address.' }, 400);

  const ZOOM        = 'https://us06web.zoom.us/j/5422970326?pwd=ThcDfaqEZpeg7y7XJCGLIsh9XGPaan.1';
  const RESEND_KEY  = env.RESEND_KEY;
  const FROM        = 'AMS Landscaping <onboarding@resend.dev>';
  const REPLY_TO    = 'james@jamesguldan.com';

  if (!RESEND_KEY) return json({ error: 'Email service not configured. Please call 602.944.0421.' }, 500);

  const dtStart  = mstToUtc(date, time);
  const dtEnd    = utcAdd(dtStart, 30);
  const uid      = `ams-${Date.now()}-${Math.random().toString(36).slice(2)}@azlawns.com`;
  const dtstamp  = nowUtc();
  const readable = toReadable(date);

  const ics    = buildICS({ dtStart, dtEnd, dtstamp, uid, name, email, time, readable, zoom: ZOOM });
  const icsB64 = icsToBase64(ics);
  const attach = [{ filename: 'interview.ics', content: icsB64 }];

  const hostSubj = `Interview Booked: ${name} — ${readable} at ${time} MST`;
  const candSubj = `Your Interview is Confirmed — ${readable} at ${time} MST`;

  const results = await Promise.allSettled([
    send(RESEND_KEY, { from: FROM, reply_to: REPLY_TO, to: ['james@jamesguldan.com'], subject: hostSubj, html: hostMail(name, email, readable, time, ZOOM), attachments: attach }),
    send(RESEND_KEY, { from: FROM, reply_to: REPLY_TO, to: ['eli@azlawns.com'],        subject: hostSubj, html: hostMail(name, email, readable, time, ZOOM), attachments: attach }),
    send(RESEND_KEY, { from: FROM, reply_to: REPLY_TO, to: [email],                    subject: candSubj, html: candMail(name, readable, time, ZOOM),         attachments: attach }),
  ]);

  if (results.every(r => r.status === 'rejected')) {
    const msg = results[0].reason?.message || 'Email delivery failed.';
    return json({ error: msg }, 502);
  }

  return json({ success: true });
}

// ── Utilities ──────────────────────────────────────────────────────────────────

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

function mstToUtc(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const m = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  let h = +m[1], min = +m[2];
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  // Phoenix MST = UTC-7 year-round (no DST)
  let uh = h + 7, ud = d, umo = mo, uy = y;
  if (uh >= 24) {
    uh -= 24;
    const n = new Date(Date.UTC(y, mo - 1, d + 1));
    uy = n.getUTCFullYear(); umo = n.getUTCMonth() + 1; ud = n.getUTCDate();
  }
  const p = n => String(n).padStart(2, '0');
  return `${uy}${p(umo)}${p(ud)}T${p(uh)}${p(min)}00Z`;
}

function utcAdd(dt, mins) {
  const d = new Date(Date.UTC(+dt.slice(0,4), +dt.slice(4,6)-1, +dt.slice(6,8), +dt.slice(9,11), +dt.slice(11,13)));
  d.setUTCMinutes(d.getUTCMinutes() + mins);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`;
}

function nowUtc() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function toReadable(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return `${DY[new Date(y, mo-1, d).getDay()]}, ${MO[mo-1]} ${d}`;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escICS(s) {
  return String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}

function fold(line) {
  if (line.length <= 75) return line;
  const out = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) out.push(' ' + line.slice(i, i + 74));
  return out.join('\r\n');
}

function buildICS({ dtStart, dtEnd, dtstamp, uid, name, email, time, readable, zoom }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AMS Landscaping//Setter Interview//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `DTSTAMP:${dtstamp}`,
    `UID:${uid}`,
    `SUMMARY:AMS Setter Interview - ${escICS(name)}`,
    `DESCRIPTION:Join Zoom:\\n${escICS(zoom)}\\n\\n${escICS(readable)} at ${escICS(time)} MST`,
    `LOCATION:${escICS(zoom)}`,
    'ORGANIZER;CN=AMS Landscaping:mailto:james@jamesguldan.com',
    'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=James:mailto:james@jamesguldan.com',
    'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Eli:mailto:eli@azlawns.com',
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${escICS(name)}:mailto:${email}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Interview starting soon',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

function icsToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function send(key, payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `HTTP ${r.status}`);
  }
  return r.json();
}

// ── Email Templates ────────────────────────────────────────────────────────────

function hostMail(name, email, readable, time, zoom) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f3f4f6;margin:0;padding:32px 16px}
  .card{max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)}
  .h{background:#2d7a3a;color:#fff;padding:20px 28px}
  .h-s{font-size:11px;letter-spacing:.8px;text-transform:uppercase;opacity:.75;margin-bottom:8px}
  .h-t{font-size:21px;font-weight:700;margin:0}
  .b{padding:24px 28px}
  .r{padding:14px 0;border-bottom:1px solid #f0f0f0}
  .r:last-child{border:none;padding-bottom:0}
  .l{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af;margin-bottom:5px}
  .v{font-size:15px;font-weight:600;color:#111}
  .s{font-size:13px;color:#6b7280;margin-top:2px}
  .btn{display:inline-block;margin-top:12px;padding:10px 20px;background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600}
  .ft{font-size:12px;color:#9ca3af;margin-top:20px;padding-top:16px;border-top:1px solid #f0f0f0}
</style>
</head><body><div class="card">
  <div class="h"><div class="h-s">AMS Landscaping · azlawns.com</div><div class="h-t">New Interview Booked</div></div>
  <div class="b">
    <div class="r"><div class="l">Candidate</div><div class="v">${esc(name)}</div><div class="s">${esc(email)}</div></div>
    <div class="r"><div class="l">Date &amp; Time</div><div class="v">${esc(readable)}</div><div class="s">${esc(time)} MST &middot; 30-min Zoom call</div></div>
    <div class="r"><div class="l">Zoom Link</div><div class="s" style="word-break:break-all">${esc(zoom)}</div><a class="btn" href="${esc(zoom)}">Join Meeting</a></div>
    <div class="ft">Calendar invite attached &mdash; open the .ics file to add to your calendar.</div>
  </div>
</div></body></html>`;
}

function candMail(name, readable, time, zoom) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f3f4f6;margin:0;padding:32px 16px}
  .card{max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)}
  .h{background:#2d7a3a;color:#fff;padding:20px 28px}
  .h-s{font-size:11px;letter-spacing:.8px;text-transform:uppercase;opacity:.75;margin-bottom:8px}
  .h-t{font-size:21px;font-weight:700;margin:0}
  .b{padding:24px 28px}
  .r{padding:14px 0;border-bottom:1px solid #f0f0f0}
  .r:last-child{border:none;padding-bottom:0}
  .l{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af;margin-bottom:5px}
  .v{font-size:15px;font-weight:600;color:#111}
  .s{font-size:13px;color:#6b7280;margin-top:2px}
  .btn{display:inline-block;margin-top:12px;padding:10px 20px;background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600}
  .ft{font-size:12px;color:#9ca3af;margin-top:20px;padding-top:16px;border-top:1px solid #f0f0f0}
</style>
</head><body><div class="card">
  <div class="h"><div class="h-s">AMS Landscaping · azlawns.com</div><div class="h-t">Your Interview is Confirmed</div></div>
  <div class="b">
    <p style="margin:0 0 16px;font-size:15px;color:#374151">Hi ${esc(name)}, you're all set!</p>
    <div class="r"><div class="l">Date &amp; Time</div><div class="v">${esc(readable)}</div><div class="s">${esc(time)} MST (Phoenix, AZ) &middot; 30 minutes</div></div>
    <div class="r"><div class="l">How to Join</div><div class="s">Video interview on Zoom</div><div class="s" style="word-break:break-all;margin-top:6px">${esc(zoom)}</div><a class="btn" href="${esc(zoom)}">Join Zoom Meeting</a></div>
    <div class="ft">Calendar invite attached &mdash; open the .ics file to add to your calendar.<br>Questions? Call <strong>602.944.0421</strong></div>
  </div>
</div></body></html>`;
}
