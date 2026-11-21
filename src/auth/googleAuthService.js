/**
 * Google Identity Services & OAuth Refresh Service
 *
 * Supports two modes:
 * 1. Persistent Refresh-Token Mode (Recommended): uses GIS Authorization Code popup
 *    (initCodeClient) + /api/google-auth to store a refresh token and silently
 *    renew Google Drive access tokens on every app startup with zero popups.
 * 2. Standard Browser Token Mode (Fallback): uses GIS Token Client (initTokenClient)
 *    when no Google Client Secret is configured or when auto-connect is disabled.
 */

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const GOOGLE_AUTH_API = '/api/google-auth';

/**
 * Queries /api/google-auth to check whether the server already has
 * GOOGLE_CLIENT_SECRET configured via .env or Vercel environment variables.
 */
export async function fetchGoogleAuthStatus() {
  try {
    const res = await fetch(GOOGLE_AUTH_API, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) {
      return {
        available: false,
        configured: false,
        hasServerClientId: false,
        hasServerClientSecret: false,
      };
    }
    const data = await res.json();
    return {
      available: true,
      configured: Boolean(data.configured),
      hasServerClientId: Boolean(data.hasServerClientId),
      hasServerClientSecret: Boolean(data.hasServerClientSecret),
    };
  } catch {
    return {
      available: false,
      configured: false,
      hasServerClientId: false,
      hasServerClientSecret: false,
    };
  }
}

/**
 * Waits for the async Google Identity Services script (gsi/client) to load.
 */
function waitForGoogleGis(timeoutMs = 8000) {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve(window.google.accounts.oauth2);
  }

  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        window.clearInterval(timer);
        resolve(window.google.accounts.oauth2);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        reject(
          new Error(
            'Google Identity Services script did not load. Check your internet connection or ad blocker.'
          )
        );
      }
    }, 100);
  });
}

/**
 * Interactive Google sign-in using Authorization Code popup flow (GIS initCodeClient).
 * Exchanges the code via /api/google-auth to receive both an access token and a refresh token.
 */
export async function loginGoogleWithCode({ clientId, clientSecret = '', hint = '' }) {
  if (!clientId) {
    throw new Error(
      'Google Client ID is missing. Configure VITE_GOOGLE_CLIENT_ID or set it in Settings.'
    );
  }

  const oauth2 = await waitForGoogleGis();

  const authCode = await new Promise((resolve, reject) => {
    const codeClient = oauth2.initCodeClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      ux_mode: 'popup',
      hint: hint || undefined,
      callback: (response) => {
        if (response?.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        if (!response?.code) {
          reject(new Error('Google sign-in did not return an authorization code.'));
          return;
        }
        resolve(response.code);
      },
      error_callback: (err) => {
        if (err?.type === 'popup_closed') {
          const cancelled = new Error('Google sign-in window was closed.');
          cancelled.code = 'POPUP_CLOSED';
          reject(cancelled);
          return;
        }
        reject(
          new Error(
            err?.message || 'Unable to open Google sign-in popup. Please allow popups for this site.'
          )
        );
      },
    });

    codeClient.requestCode();
  });

  const res = await fetch(GOOGLE_AUTH_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'exchange',
      code: authCode,
      clientId,
      clientSecret: clientSecret || undefined,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Failed to exchange Google authorization code.');
    err.code = data.code || 'EXCHANGE_FAILED';
    throw err;
  }

  const expiresInSec = Number(data.expires_in) || 3600;
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresInSec * 1000,
    refreshToken: data.refresh_token || null,
  };
}

/**
 * Standard GIS browser Token Client sign-in (fallback when refresh-token backend is not configured
 * or when auto-connect is disabled).
 */
export async function loginGoogleWithToken({
  clientId,
  hint = '',
  forceConsent = false,
}) {
  if (!clientId) {
    throw new Error(
      'Google Client ID is missing. Configure VITE_GOOGLE_CLIENT_ID or set it in Settings.'
    );
  }

  const oauth2 = await waitForGoogleGis();

  return new Promise((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      hint: hint || undefined,
      callback: (response) => {
        if (response?.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        if (!response?.access_token) {
          reject(new Error('Google sign-in did not return an access token.'));
          return;
        }
        const expiresInSec = Number(response.expires_in) || 3600;
        resolve({
          accessToken: response.access_token,
          expiresAt: Date.now() + expiresInSec * 1000,
          refreshToken: null,
        });
      },
      error_callback: (err) => {
        if (err?.type === 'popup_closed') {
          const cancelled = new Error('Google sign-in window was closed.');
          cancelled.code = 'POPUP_CLOSED';
          reject(cancelled);
          return;
        }
        reject(
          new Error(
            err?.message || 'Unable to open Google sign-in popup. Please allow popups for this site.'
          )
        );
      },
    });

    tokenClient.requestAccessToken({ prompt: forceConsent ? 'consent' : '' });
  });
}

/**
 * Silently exchanges a stored Google refresh token for a fresh access token via /api/google-auth.
 */
export async function refreshGoogleAccessToken({
  refreshToken,
  clientId,
  clientSecret = '',
}) {
  const res = await fetch(GOOGLE_AUTH_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'refresh',
      refreshToken,
      clientId: clientId || undefined,
      clientSecret: clientSecret || undefined,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Failed to refresh Google Drive session.');
    err.code = data.code || 'REFRESH_FAILED';
    throw err;
  }

  const expiresInSec = Number(data.expires_in) || 3600;
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresInSec * 1000,
    refreshToken: data.refresh_token || refreshToken,
  };
}

/**
 * Revokes Google tokens on explicit sign-out (best effort).
 */
export async function logoutGoogle({ accessToken, refreshToken } = {}) {
  if (refreshToken) {
    fetch(GOOGLE_AUTH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', token: refreshToken }),
    }).catch(() => {});
  } else if (accessToken && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(accessToken, () => {});
    } catch {
      // ignore revoke errors
    }
  }
}
