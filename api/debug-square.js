// api/debug-square.js — DIAGNÓSTICO TEMPORÁRIO (remover após uso)
// Verifica se o SQUARE_ACCESS_TOKEN tem acesso às locations configuradas.

export default async function handler(req, res) {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const locationId  = process.env.SQUARE_LOCATION_ID;
  const squareEnv   = (process.env.SQUARE_ENV || 'sandbox').toLowerCase();
  const appId       = process.env.SQUARE_APPLICATION_ID || '';

  const base = squareEnv === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';

  const config = {
    env: squareEnv,
    applicationId: appId,
    locationId,
    base,
    tokenPrefix: accessToken ? accessToken.slice(0, 10) + '...' : 'NOT SET',
  };

  if (!accessToken) {
    return res.status(500).json({ error: 'SQUARE_ACCESS_TOKEN not set', config });
  }

  try {
    const resp = await fetch(`${base}/v2/locations`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Square-Version': '2024-10-17',
        'Accept': 'application/json',
      },
    });
    const data = await resp.json();

    const locations = (data.locations || []).map(l => ({
      id: l.id,
      name: l.name,
      status: l.status,
      country: l.country,
      currency: l.currency,
    }));

    const targetFound = locations.find(l => l.id === locationId);

    return res.status(200).json({
      config,
      squareHttpStatus: resp.status,
      locationsFound: locations.length,
      locations,
      targetLocationId: locationId,
      targetFound: targetFound || null,
      errors: data.errors || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, config });
  }
}
