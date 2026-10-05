import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMTP_HOST = 'smtp-relay.brevo.com', SMTP_PORT = '2525', SMTP_USER, SMTP_PASS, MAIL_FROM, SITE_URL, ALLOWED_ORIGIN, PORT = 3000 } = process.env;
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const mailer = nodemailer.createTransport({ host: SMTP_HOST, port: +SMTP_PORT, secure: false, auth: { user: SMTP_USER, pass: SMTP_PASS } });
const app = express();
app.use(cors({ origin: (ALLOWED_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean) }));
app.use(express.json());

const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = t => { const [h, m] = t.split(':'); return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page(title, intro, ev) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:20px">
  <h2 style="color:#0a5a5e">${esc(title)}</h2><p>${esc(intro)}</p>
  <p><b>${esc(ev.title)}</b><br>${fmtDate(ev.event_date)}, ${fmtTime(ev.start_time)} to ${fmtTime(ev.end_time)}<br>${esc(ev.venue)}</p>
  <p><a href="${SITE_URL}#events" style="background:#0a5a5e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">View event</a></p>
  <p style="color:#777;font-size:12px">Robokalam Technologies Private Limited</p></div>`;
}

async function send(emails, subject, html) {
  // one email per person so addresses are never shared; small pause keeps us under free-plan limits
  for (const to of emails) {
    try { await mailer.sendMail({ from: MAIL_FROM, to, subject, html }); }
    catch (e) { console.error('mail error', to, e.message); }
    await new Promise(r => setTimeout(r, 150));
  }
}

async function allMemberEmails() {
  const out = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
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

async function adminOnly(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Log in first' });
  const { data: p } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (p?.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  next();
}

const getEvent = async id => (await db.from('events').select('*').eq('id', id).single()).data;

// Admin publishes an event: every member gets an email
app.post('/api/events/:id/announce', adminOnly, async (req, res) => {
  const ev = await getEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  const emails = await allMemberEmails();
  res.json({ sending: emails.length });
  send(emails, `New event: ${ev.title}`, page('A new event is up', 'Seats are open. Registering takes one tap.', ev));
});

// Admin changes venue, date or time: people registered get an email
app.post('/api/events/:id/changed', adminOnly, async (req, res) => {
  const ev = await getEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  const what = (req.body.changes || ['details']).join(', ');
  const emails = await registrantEmails(ev.id);
  res.json({ sending: emails.length });
  send(emails, `Update: ${ev.title}`, page(`The ${what} changed`, 'Please check the new details below.', ev));
});

// Hourly: remind registered people about events starting in about 24 hours
cron.schedule('0 * * * *', async () => {
  const { data: evs } = await db.from('events').select('*').eq('status', 'published').eq('reminder_sent', false);
  for (const ev of evs ?? []) {
    const start = new Date(`${ev.event_date}T${ev.start_time}+05:30`);
    const hours = (start - Date.now()) / 36e5;
    if (hours > 0 && hours <= 24) {
      await send(await registrantEmails(ev.id), `Tomorrow: ${ev.title}`, page('See you soon', 'Your event starts within 24 hours.', ev));
      await db.from('events').update({ reminder_sent: true }).eq('id', ev.id);
    }
  }
});

app.get('/', (_, res) => res.send('Eventkalam server is running'));
app.listen(PORT, () => console.log('Listening on', PORT));
