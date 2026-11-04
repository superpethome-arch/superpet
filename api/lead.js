// api/lead.js — Vercel Serverless Function
//
// Called by payment.html as soon as the page loads.
// Sends a "pending lead" email via Resend so the team always has
// the customer's info, even if they abandon the payment page.

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

  const data = req.body || {};
  const customerName = data['Owner Name'] || data.customerName || 'Unknown';
  const petName      = data['Pet Name']   || data.petName      || '';
  const customerEmail = data['email']     || data.customerEmail || '';

  const rows = Object.entries(data)
    .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">${k}</td><td style="padding:6px 12px;font-size:13px;font-weight:500">${v || 'N/A'}</td></tr>`)
    .join('');

  try {
    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: 'Super Pet <booking@superpethome.com>',
      to:   'superpethome@gmail.com',
      subject: `[PENDING] New Lead - ${customerName}${petName ? ` (${petName})` : ''}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <div style="background:#92400e;padding:20px 24px;border-radius:10px 10px 0 0">
            <h1 style="color:#fff;margin:0;font-size:20px">New Pending Lead</h1>
            <p style="color:#fde68a;margin:4px 0 0;font-size:14px">Super Pet Grooming Salon</p>
          </div>
          <div style="background:#f9fafb;padding:20px 24px;border:1px solid #e5e7eb;border-top:none">
            <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:20px">
              <strong style="color:#92400e">Cliente na pagina de pagamento</strong><br/>
              <span style="color:#92400e;font-size:13px">Aguardando deposito de $50.00. Se nao chegar email [PAID], o cliente abandonou.</span>
            </div>
            <table style="width:100%;border-collapse:collapse">
              <tr style="background:#e5e7eb"><td colspan="2" style="padding:8px 12px;font-weight:600;font-size:12px;text-transform:uppercase;color:#374151">Booking Details</td></tr>
              ${rows}
            </table>
            <p style="margin:16px 0 0;font-size:13px;color:#6b7280">Se nao receber o email [PAID] em breve, entre em contato com o cliente para concluir o agendamento.</p>
          </div>
          <div style="background:#fff;padding:12px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;text-align:center">
            <p style="color:#9ca3af;font-size:12px;margin:0">Super Pet Grooming Salon &middot; 122 Teaticket Hwy, East Falmouth, MA</p>
          </div>
        </div>`,
    });
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Resend lead notification failed:', err);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({ error: 'Failed to send notification' });
  }
}
