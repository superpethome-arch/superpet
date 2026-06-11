// api/config.js — Vercel Serverless Function
//
// Exposes Square's public config (Application ID, Location ID, environment) to
// the payment page. The Access Token is NEVER returned — it stays server-side
// in process.env.SQUARE_ACCESS_TOKEN.

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    applicationId: process.env.SQUARE_APPLICATION_ID || '',
    locationId:    process.env.SQUARE_LOCATION_ID    || '',
    env:           (process.env.SQUARE_ENV || 'sandbox').toLowerCase(),
  });
}
