// api/event.js — Vercel Serverless Function
// Handles RSVP form submissions for the National Dog Day Free Nail Trim Event.

import { Resend } from 'resend';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const data       = req.body || {};
  const ownerName  = String(data.ownerName  || '').trim().slice(0, 200) || 'Unknown';
  const dogName    = String(data.dogName    || '').trim().slice(0, 200);
  const email      = String(data.email      || '').trim().slice(0, 250);
  const phone      = String(data.phone      || '').trim().slice(0, 50);
  const breed      = String(data.breed      || '').trim().slice(0, 200);
  const newClient  = data.newClient  ? 'Yes' : 'No';
  const rabies     = data.rabiesConfirmed ? 'Confirmed up to date' : 'Not confirmed';

  try {
    const resend = new Resend(resendKey);
    await resend.emails.send({
      from:    'Super Pet <booking@superpethome.com>',
      to:      'superpethome@gmail.com',
      replyTo: email || undefined,
      subject: `[RSVP] National Dog Day Event — ${ownerName}${dogName ? ` & ${dogName}` : ''}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <div style="background:#1B2A4E;padding:20px 24px;border-radius:10px 10px 0 0">
            <h1 style="color:#fff;margin:0;font-size:20px">New RSVP — National Dog Day Event</h1>
            <p style="color:#a5b4fc;margin:4px 0 0;font-size:14px">Free Nail Trim &middot; August 26, 2026 &middot; 1:00 PM &ndash; 3:00 PM</p>
          </div>
          <div style="background:#f9fafb;padding:20px 24px;border:1px solid #e5e7eb;border-top:none">
            <div style="background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:12px 16px;margin-bottom:20px">
              <strong style="color:#166534">Novo RSVP recebido</strong><br/>
              <span style="color:#166534;font-size:13px">Adicionar na lista de convidados do evento.</span>
            </div>
            <table style="width:100%;border-collapse:collapse">
              <tr style="background:#e5e7eb">
                <td colspan="2" style="padding:8px 12px;font-weight:600;font-size:12px;text-transform:uppercase;color:#374151">Dados do Convidado</td>
              </tr>
              <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">Owner Name</td><td style="padding:6px 12px;font-size:13px;font-weight:500">${ownerName}</td></tr>
              <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">Dog Name</td><td style="padding:6px 12px;font-size:13px;font-weight:500">${dogName || 'N/A'}</td></tr>
              <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">Breed</td><td style="padding:6px 12px;font-size:13px;font-weight:500">${breed || 'N/A'}</td></tr>
              <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">Email</td><td style="padding:6px 12px;font-size:13px;font-weight:500">${email || 'N/A'}</td></tr>
              <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">Phone</td><td style="padding:6px 12px;font-size:13px;font-weight:500">${phone || 'N/A'}</td></tr>
              <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">New Client?</td><td style="padding:6px 12px;font-size:13px;font-weight:500">${newClient}</td></tr>
              <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">Rabies Vaccination</td><td style="padding:6px 12px;font-size:13px;font-weight:500">${rabies}</td></tr>
            </table>
            <p style="margin:16px 0 0;font-size:13px;color:#6b7280">Enviar confirmacao de presenca se desejar.</p>
          </div>
          <div style="background:#fff;padding:12px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;text-align:center">
            <p style="color:#9ca3af;font-size:12px;margin:0">Super Pet Grooming Salon &middot; 122 Teaticket Hwy, East Falmouth, MA</p>
          </div>
        </div>`,
    });

    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Resend event RSVP failed:', err);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({ error: 'Failed to send RSVP' });
  }
}
