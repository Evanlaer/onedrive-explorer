import { Buffer } from 'node:buffer';
import process from 'node:process';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

async function readRequestJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.length > 0) {
    return JSON.parse(req.body);
  }
  if (Buffer.isBuffer(req.body)) {
    return JSON.parse(req.body.toString('utf8'));
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function resolveEnv(envOverride) {
  return {
    ...(process.env || {}),
    ...(envOverride || {}),
  };
}

/**
 * Handles /api/google-auth requests for both Vite middleware (dev/preview)
 * and Vercel Serverless Functions.
 *
 * - GET: returns whether server-side Google OAuth credentials are configured
 * - POST { action: 'exchange', code, clientId?, clientSecret? }
 * - POST { action: 'refresh', refreshToken, clientId?, clientSecret? }
 * - POST { action: 'revoke', token }
 */
export async function handleGoogleAuthRequest(req, res, envOverride = {}) {
  const env = resolveEnv(envOverride);
  const serverClientId = (env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const serverClientSecret = (env.GOOGLE_CLIENT_SECRET || '').trim();

  if (req.method === 'GET') {
    return sendJson(res, 200, {
      configured: Boolean(serverClientId && serverClientSecret),
      hasServerClientId: Boolean(serverClientId),
      hasServerClientSecret: Boolean(serverClientSecret),
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  let body;
  try {
    body = await readRequestJson(req);
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON request body.' });
  }

  const { action } = body || {};

  if (action === 'revoke') {
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) {
      return sendJson(res, 400, { error: 'Missing token to revoke.' });
    }
    try {
      const form = new URLSearchParams({ token });
      await fetch(GOOGLE_REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      return sendJson(res, 200, { revoked: true });
    } catch (err) {
      return sendJson(res, 502, {
        error: err?.message || 'Failed to reach Google revocation endpoint.',
      });
    }
  }

  if (action !== 'exchange' && action !== 'refresh') {
    return sendJson(res, 400, {
      error: 'Unsupported action. Expected "exchange", "refresh", or "revoke".',
    });
  }

  const clientId = (
    (typeof body.clientId === 'string' ? body.clientId.trim() : '') || serverClientId
  ).trim();

  // Server-side secret takes precedence when using the default Client ID;
  // if a custom clientSecret override was explicitly provided alongside a custom Client ID, allow it.
  const overrideSecret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : '';
  const usingCustomClientId =
    Boolean(body.clientId && body.clientId.trim()) &&
    body.clientId.trim() !== serverClientId;
  const clientSecret = usingCustomClientId
    ? overrideSecret || serverClientSecret
    : serverClientSecret || overrideSecret;

  if (!clientId) {
    return sendJson(res, 400, {
      error: 'Google Client ID is missing. Configure VITE_GOOGLE_CLIENT_ID or set it in Settings.',
    });
  }

  if (!clientSecret) {
    return sendJson(res, 400, {
      error:
        'Google Client Secret is not configured. Add GOOGLE_CLIENT_SECRET to .env / Vercel or enter it in Settings.',
      code: 'MISSING_CLIENT_SECRET',
    });
  }

  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
  });

  if (action === 'exchange') {
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!code) {
      return sendJson(res, 400, { error: 'Missing authorization code.' });
    }
    form.set('code', code);
    form.set('redirect_uri', 'postmessage');
    form.set('grant_type', 'authorization_code');
  } else {
    const refreshToken =
      typeof body.refreshToken === 'string' ? body.refreshToken.trim() : '';
    if (!refreshToken) {
      return sendJson(res, 400, { error: 'Missing refresh token.' });
    }
    form.set('refresh_token', refreshToken);
    form.set('grant_type', 'refresh_token');
  }

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    const data = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok) {
      return sendJson(res, tokenRes.status, {
        error: data.error_description || data.error || 'Google token request failed.',
        code: data.error || 'TOKEN_ERROR',
      });
    }

    return sendJson(res, 200, {
      access_token: data.access_token,
      expires_in: Number(data.expires_in) || 3600,
      refresh_token: data.refresh_token || null,
      token_type: data.token_type || 'Bearer',
      scope: data.scope || '',
    });
  } catch (err) {
    return sendJson(res, 502, {
      error: err?.message || 'Unable to reach Google OAuth token endpoint.',
    });
  }
}
