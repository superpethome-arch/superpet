// api/charge.js — Vercel Serverless Function
//
// Receives a one-time card token (sourceId) from the Square Web Payments SDK
// running in the browser, and uses the server-only SQUARE_ACCESS_TOKEN to
// create a real payment via the Square Payments API.
//
// On success, sends a booking notification email via Resend tagged [PAID]
// with the Square payment ID and receipt URL.

import crypto from 'crypto';
import { Resend } from 'resend';

async function sendErrorEmail(resendKey, { customerName, petName, customerEmail, reason }) {
  try {
    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: 'Super Pet <onboarding@resend.dev>',
      to:   'superpethome@gmail.com',
      subject: `[PAYMENT FAILED] ${customerName}${petName ? ` (${petName})` : ''}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <div style="background:#7f1d1d;padding:20px 24px;border-radius:10px 10px 0 0">
            <h1 style="color:#fff;margin:0;font-size:20px">Payment Failed</h1>
            <p style="color:#fca5a5;margin:4px 0 0;font-size:14px">Super Pet Grooming Salon</p>
          </div>
          <div style="background:#f9fafb;padding:20px 24px;border:1px solid #e5e7eb;border-top:none">
            <div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;margin-bottom:20px">
              <strong style="color:#7f1d1d">Deposit of $25.00 was not processed</strong><br/>
              <span style="color:#7f1d1d;font-size:13px">Reason: ${reason}</span>
            </div>
            <table style="width:100%;border-collapse:collapse">
              <tr style="background:#e5e7eb"><td colspan="2" style="padding:8px 12px;font-weight:600;font-size:12px;text-transform:uppercase;color:#374151">Customer Info</td></tr>
              <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">Name</td><td style="padding:6px 12px;font-size:13px;font-weight:500">${customerName}</td></tr>
              ${petName ? `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">Pet</td><td style="padding:6px 12px;font-size:13px;font-weight:500">${petName}</td></tr>` : ''}
              ${customerEmail ? `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">Email</td><td style="padding:6px 12px;font-size:13px;font-weight:500">${customerEmail}</td></tr>` : ''}
            </table>
            <p style="margin:16px 0 0;font-size:13px;color:#6b7280">Entre em contato com o cliente para tentar outro cartão ou forma de pagamento.</p>
          </div>
          <div style="background:#fff;padding:12px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;text-align:center">
            <p style="color:#9ca3af;font-size:12px;margin:0">Super Pet Grooming Salon &middot; 122 Teaticket Hwy, East Falmouth, MA</p>
          </div>
        </div>`,
    });
  } catch (err) {
    console.error('Resend error notification failed:', err);
  }
}

const SANDBOX_BASE    = 'https://connect.squareupsandbox.com';
const PRODUCTION_BASE = 'https://connect.squareup.com';
const SQUARE_API_VERSION   = '2024-10-17';
const DEPOSIT_AMOUNT_CENTS = 2500; // $25.00

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return jsonError(res, 405, 'Method not allowed');
  }

  const {
    sourceId,
    customerName,
    petName,
    customerEmail,
    customerPhone,
    appointmentSummary,
  } = req.body || {};

  if (!sourceId || typeof sourceId !== 'string') {
    return jsonError(res, 400, 'Missing card token (sourceId)');
  }
  if (!customerName || typeof customerName !== 'string' || customerName.length > 200) {
    return jsonError(res, 400, 'Missing or invalid customer name');
  }

  // Validate env config
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const locationId  = process.env.SQUARE_LOCATION_ID;
  const squareEnv   = (process.env.SQUARE_ENV || 'sandbox').toLowerCase();

  if (!accessToken || !locationId) {
    console.error('Missing Square env vars: SQUARE_ACCESS_TOKEN and/or SQUARE_LOCATION_ID');
    return jsonError(res, 500, 'Payment service is not configured');
  }

  const baseUrl = squareEnv === 'production' ? PRODUCTION_BASE : SANDBOX_BASE;

  // Build Square payment request
  const idempotencyKey = crypto.randomUUID();
  const note = `Super Pet deposit - ${customerName}${petName ? ` (${petName})` : ''}`.slice(0, 500);

  const paymentRequest = {
    source_id:        sourceId,
    idempotency_key:  idempotencyKey,
    amount_money:     { amount: DEPOSIT_AMOUNT_CENTS, currency: 'USD' },
    location_id:      locationId,
    note,
    autocomplete:     true,
  };
  if (customerEmail && typeof customerEmail === 'string' && customerEmail.length < 250) {
    paymentRequest.buyer_email_address = customerEmail;
  }

  // Call Square
  let squareData;
  try {
    const resp = await fetch(`${baseUrl}/v2/payments`, {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${accessToken}`,
        'Content-Type':   'application/json',
        'Square-Version': SQUARE_API_VERSION,
        'Accept':         'application/json',
      },
      body: JSON.stringify(paymentRequest),
    });
    squareData = await resp.json();
    if (!resp.ok || !squareData.payment || squareData.errors?.length) {
      const detail = squareData.errors?.[0]?.detail || squareData.errors?.[0]?.code || `HTTP ${resp.status}`;
      console.error('Square API error:', JSON.stringify(squareData));
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) await sendErrorEmail(resendKey, { customerName, petName, customerEmail, reason: detail });
      return jsonError(res, 400, detail);
    }
  } catch (err) {
    console.error('Square fetch failed:', err);
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) await sendErrorEmail(resendKey, { customerName, petName, customerEmail, reason: "Couldn't reach payment processor" });
    return jsonError(res, 502, "Couldn't reach payment processor");
  }

  const payment = squareData.payment;

  // Notify via Resend (best-effort — do not block success on this)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      const summary = appointmentSummary && typeof appointmentSummary === 'object' ? appointmentSummary : {};
      const rows = Object.entries(summary)
        .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">${k}</td><td style="padding:6px 12px;font-size:13px;font-weight:500">${v || 'N/A'}</td></tr>`)
        .join('');

      await resend.emails.send({
        from: 'Super Pet <onboarding@resend.dev>',
        to:   'superpethome@gmail.com',
        subject: `[PAID] New Booking - ${customerName}${petName ? ` (${petName})` : ''}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <div style="background:#1B2A4E;padding:20px 24px;border-radius:10px 10px 0 0">
              <h1 style="color:#fff;margin:0;font-size:20px">New Paid Booking</h1>
              <p style="color:#a5b4fc;margin:4px 0 0;font-size:14px">Super Pet Grooming Salon</p>
            </div>
            <div style="background:#f9fafb;padding:20px 24px;border:1px solid #e5e7eb;border-top:none">
              <div style="background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:12px 16px;margin-bottom:20px">
                <strong style="color:#166534">Deposit of $25.00 received</strong><br/>
                <span style="color:#166534;font-size:13px">Payment ID: ${payment.id}</span><br/>
                ${payment.receipt_url ? `<a href="${payment.receipt_url}" style="color:#166534;font-size:13px">View Square Receipt</a>` : ''}
              </div>
              <table style="width:100%;border-collapse:collapse">
                <tr style="background:#e5e7eb"><td colspan="2" style="padding:8px 12px;font-weight:600;font-size:12px;text-transform:uppercase;color:#374151">Booking Details</td></tr>
                ${rows}
              </table>
            </div>
            <div style="background:#fff;padding:12px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;text-align:center">
              <p style="color:#9ca3af;font-size:12px;margin:0">Super Pet Grooming Salon &middot; 122 Teaticket Hwy, East Falmouth, MA</p>
            </div>
          </div>`,
      });
    } catch (err) {
      console.error('Resend notification failed (non-fatal):', err);
    }
  }

  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  return res.status(200).json({
    success:    true,
    paymentId:  payment.id,
    status:     payment.status,
    receiptUrl: payment.receipt_url || null,
    amount:     DEPOSIT_AMOUNT_CENTS / 100,
    currency:   'USD',
  });
}

function jsonError(res, statusCode, message) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  return res.status(statusCode).json({ success: false, error: message });
}
