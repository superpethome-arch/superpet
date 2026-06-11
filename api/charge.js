// api/charge.js — Vercel Serverless Function
//
// Receives a one-time card token (sourceId) from the Square Web Payments SDK
// running in the browser, and uses the server-only SQUARE_ACCESS_TOKEN to
// create a real payment via the Square Payments API.
//
// On success, also notifies Web3Forms so the team gets a lead email tagged
// [PAID] with the Square payment ID and receipt URL.

import crypto from 'crypto';

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
      return jsonError(res, 400, detail);
    }
  } catch (err) {
    console.error('Square fetch failed:', err);
    return jsonError(res, 502, "Couldn't reach payment processor");
  }

  const payment = squareData.payment;

  // Notify Web3Forms (best-effort — do not block success on this)
  const web3formsKey = process.env.WEB3FORMS_KEY;
  if (web3formsKey) {
    const notification = {
      access_key:   web3formsKey,
      subject:      `New Lead [PAID] - ${customerName}${petName ? ` (${petName})` : ''}`,
      from_name:    'Super Pet Website',
      ...(customerEmail ? { email: customerEmail } : {}),
      ...(appointmentSummary && typeof appointmentSummary === 'object' ? appointmentSummary : {}),
      'Payment Status': 'Paid',
      'Payment Amount': '$25.00 USD',
      'Square Payment ID':  payment.id,
      'Square Receipt':     payment.receipt_url || 'n/a',
      'Square Environment': squareEnv,
    };
    try {
      await fetch('https://api.web3forms.com/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify(notification),
      });
    } catch (err) {
      console.error('Web3Forms notification failed (non-fatal):', err);
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
