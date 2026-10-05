import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMTP_HOST = 'smtp-relay.brevo.com', SMTP_PORT = '2525', SMTP_USER, SMTP_PASS, MAIL_FROM, SITE_URL = '', ALLOWED_ORIGIN, PORT = 3000 } = process.env;
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const mailer = nodemailer.createTransport({ host: SMTP_HOST, port: +SMTP_PORT, secure: false, auth: { user: SMTP_USER, pass: SMTP_PASS } });
const app = express();
app.use(cors({ origin: (ALLOWED_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean) }));
app.use(express.json());

// ---- email design ----
const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtTime = t => { const [h, m] = t.split(':'); return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const C = { deep: '#0d4a4e', teal: '#2fc6b8', sun: '#ffb938', pink: '#ff7a6b', ink: '#12292a', mute: '#5b7172', bg: '#eef4f4' };
const KINDS = {
  new: { label: 'NEW EVENT', bg: C.teal, fg: '#06312f' },
  update: { label: 'EVENT UPDATE', bg: C.sun, fg: '#3a2a00' },
  cancelled: { label: 'EVENT CANCELLED', bg: C.pink, fg: '#4a0f08' },
  reminder: { label: 'STARTS SOON', bg: C.sun, fg: '#3a2a00' },
  registered: { label: "YOU'RE REGISTERED", bg: C.teal, fg: '#06312f' },
};

function page({ kind, intro, ev, prev = {}, ticket, ctaLabel = 'View event' }) {
  const k = KINDS[kind];
  const site = SITE_URL.replace(/\/$/, '');
  const cancelled = kind === 'cancelled';
  const detail = (icon, label, val, was) => `<tr><td style="padding:10px 0;width:38px;font-size:20px;vertical-align:top">${icon}</td><td style="padding:10px 0;vertical-align:top"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${C.mute}">${label}</div>${was ? `<div style="font-size:14px;color:#98a9aa;text-decoration:line-through">${esc(was)}</div>` : ''}<div style="font-size:16px;font-weight:700;color:${C.ink}${cancelled ? ';text-decoration:line-through' : ''}">${esc(val)}</div></td></tr>`;
  const preheader = `${ev.title}: ${fmtDate(ev.event_date)}, ${fmtTime(ev.start_time)}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:Arial,Helvetica,sans-serif;color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:${C.deep};padding:18px 28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td><img src="${site}/logo.png" height="44" alt="" style="display:block;height:44px;width:auto;border:0"></td><td style="padding-left:12px;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-.3px">Eventkalam</td></tr></table></td></tr>
<tr><td style="height:4px;line-height:4px;font-size:0;background-color:${C.teal};background-image:linear-gradient(90deg,${C.teal},${C.sun})">&nbsp;</td></tr>
${ev.image_url ? `<tr><td><img src="${esc(ev.image_url)}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0${cancelled ? ';opacity:.55' : ''}"></td></tr>` : ''}
<tr><td style="padding:28px 28px 8px">
<span style="display:inline-block;background:${k.bg};color:${k.fg};font-size:11px;font-weight:700;letter-spacing:.1em;padding:6px 14px;border-radius:99px">${k.label}</span>
<h1 style="margin:16px 0 8px;font-size:27px;line-height:1.2;color:${C.ink}">${esc(ev.title)}</h1>
<p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:${C.mute}">${esc(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f8f7;border-radius:14px"><tr><td style="padding:6px 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${detail('📅', 'Date', fmtDate(ev.event_date), prev.date)}
${detail('🕑', 'Time', `${fmtTime(ev.start_time)} to ${fmtTime(ev.end_time)}`, prev.time)}
${detail('📍', 'Venue', ev.venue, prev.venue)}
</table></td></tr></table>
${ticket ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px"><tr><td align="center" style="border:2px dashed ${C.teal};border-radius:14px;padding:14px"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${C.mute}">Your ticket code</div><div style="font-size:26px;font-weight:800;letter-spacing:.12em;font-family:Courier New,monospace;color:${C.deep}">${esc(ticket)}</div></td></tr></table>` : ''}
</td></tr>
<tr><td align="center" style="padding:20px 28px 30px"><a href="${site}/#events" style="display:inline-block;background:${C.deep};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 34px;border-radius:99px">${esc(ctaLabel)}</a></td></tr>
<tr><td style="background:#f6fafa;padding:20px 28px;border-top:1px solid #e1ecec;font-size:12px;line-height:1.6;color:${C.mute};text-align:center">
<b style="color:${C.ink}">Eventkalam</b> by Robokalam Technologies Private Limited<br>
Warangal &middot; Hyderabad &middot; <a href="mailto:team@robokalam.com" style="color:${C.deep}">team@robokalam.com</a><br>
You are getting this email because you have an Eventkalam account.</td></tr>
</table></td></tr></table></body></html>`;
}

function textOf({ intro, ev, ticket }) {
  return `${ev.title}\n\n${intro}\n\n${fmtDate(ev.event_date)}\n${fmtTime(ev.start_time)} to ${fmtTime(ev.end_time)}\n${ev.venue}\n${ticket ? `\nTicket code: ${ticket}\n` : ''}\n${SITE_URL}\n\nRobokalam Technologies Private Limited`;
}
// ---- end email design ----

async function send(emails, subject, args) {
  const html = page(args), text = textOf(args);
  for (const to of emails) {
    try { await mailer.sendMail({ from: MAIL_FROM, to, subject, html, text }); }
    catch (e) { console.error('mail error', to, e.message); }
    await new Promise(r => setTimeout(r, 150));
  }
}

async function allMemberEmails() {
  const out = [];
  for (let pg = 1; ; pg++) {
    const { data, error } = await db.auth.admin.listUsers({ page: pg, perPage: 1000 });
    if (error || !data.users.length) break;
    out.push(...data.users.map(u => u.email).filter(Boolean));
    if (data.users.length < 1000) break;
  }
  return out;
}

async function registrantEmails(eventId) {
  const { data } = await db.from('registrations').select('user_id').eq('event_id', eventId).neq('status', 'cancelled');
  const emails = [];
  for (const r of data ?? []) {
    const { data: u } = await db.auth.admin.getUserById(r.user_id);
    if (u?.user?.email) emails.push(u.user.email);
  }
  return emails;
}

const tokenOf = req => (req.headers.authorization || '').replace('Bearer ', '');

async function adminOnly(req, res, next) {
  const { data: { user } } = await db.auth.getUser(tokenOf(req));
  if (!user) return res.status(401).json({ error: 'Log in first' });
  const { data: p } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (p?.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  next();
}

const getEvent = async id => (await db.from('events').select('*').eq('id', id).single()).data;
const okDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const okTime = t => /^\d{2}:\d{2}/.test(t || '');

// Admin publishes an event: every member gets an email
app.post('/api/events/:id/announce', adminOnly, async (req, res) => {
  const ev = await getEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  const emails = await allMemberEmails();
  res.json({ sending: emails.length });
  send(emails, `New event: ${ev.title}`, { kind: 'new', intro: 'A new event is open for registration. Seats are limited, so grab yours early.', ev });
});

// Admin changes venue, date or time: people registered get an email showing what changed
app.post('/api/events/:id/changed', adminOnly, async (req, res) => {
  const ev = await getEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  const ch = (req.body.changes || []).filter(c => ['date', 'time', 'venue'].includes(c));
  const p = req.body.prev || {}, prev = {};
  if (ch.includes('date') && okDate(p.date)) prev.date = fmtDate(p.date);
  if (ch.includes('time') && okTime(p.start) && okTime(p.end)) prev.time = `${fmtTime(p.start)} to ${fmtTime(p.end)}`;
  if (ch.includes('venue') && p.venue) prev.venue = String(p.venue).slice(0, 200);
  const what = ch.length ? ch.join(' and ') : 'details';
  const emails = await registrantEmails(ev.id);
  res.json({ sending: emails.length });
  send(emails, `Update: ${ev.title}`, { kind: 'update', intro: `The ${what} of this event changed. Please check the new details below.`, ev, prev });
});

// Admin deletes an event: people registered are told before it disappears
app.post('/api/events/:id/cancelled', adminOnly, async (req, res) => {
  const ev = await getEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  const emails = await registrantEmails(ev.id);
  res.json({ sending: emails.length });
  send(emails, `Cancelled: ${ev.title}`, { kind: 'cancelled', intro: 'We are sorry, this event has been cancelled. Your registration no longer applies. We will announce new events soon.', ev, ctaLabel: 'See other events' });
});

// A member registers: confirmation email with the ticket code (to themselves only, once a minute per event)
const lastSent = new Map();
app.post('/api/events/:id/registered', async (req, res) => {
  const { data: { user } } = await db.auth.getUser(tokenOf(req));
  if (!user) return res.status(401).json({ error: 'Log in first' });
  const key = user.id + req.params.id;
  if (Date.now() - (lastSent.get(key) || 0) < 60000) return res.json({ sending: 0 });
  const ev = await getEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  const { data: reg } = await db.from('registrations').select('ticket_code,status').eq('event_id', ev.id).eq('user_id', user.id).maybeSingle();
  if (!reg || reg.status === 'cancelled') return res.status(404).json({ error: 'No active registration found' });
  lastSent.set(key, Date.now());
  res.json({ sending: 1 });
  send([user.email], `You're registered: ${ev.title}`, {
    kind: 'registered',
    intro: ev.fee_inr > 0 ? 'Your seat is held. Payments are paused for now, so we will confirm it once they open.' : 'Your seat is confirmed. Show this ticket code at the event.',
    ev, ticket: reg.ticket_code,
  });
});

// Hourly: remind registered people about events starting in about 24 hours
cron.schedule('0 * * * *', async () => {
  const { data: evs } = await db.from('events').select('*').eq('status', 'published').eq('reminder_sent', false);
  for (const ev of evs ?? []) {
    const start = new Date(`${ev.event_date}T${ev.start_time}+05:30`);
    const hours = (start - Date.now()) / 36e5;
    if (hours > 0 && hours <= 24) {
      await send(await registrantEmails(ev.id), `Tomorrow: ${ev.title}`, { kind: 'reminder', intro: 'Your event starts within 24 hours. See you there!', ev });
      await db.from('events').update({ reminder_sent: true }).eq('id', ev.id);
    }
  }
});

app.get('/', (_, res) => res.send('Eventkalam server is running'));
app.listen(PORT, () => console.log('Listening on', PORT));
