import { loginRequest } from './msalConfig';

let activeLoginPromise = null;
let activeTokenPromise = null;

const POPUP_BLOCKED_CODES = new Set([
  'popup_window_error',
  'empty_window_error',
  'monitor_window_timeout',
]);

/**
 * Clears any stale MSAL interaction lock left behind by an interrupted/blocked login.
 */
function clearStaleMsalInteraction() {
  for (const store of [window.sessionStorage, window.localStorage]) {
    try {
      const keys = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key && key.includes('interaction.status')) {
          keys.push(key);
        }
      }
      keys.forEach((k) => store.removeItem(k));
    } catch {
      // ignore storage access issues
    }
  }
}

/**
 * Initiates Microsoft login.
 * Prefers loginPopup (keeps the app and Google Drive session open, works in embedded
 * browser views) and falls back automatically to loginRedirect if popups are blocked.
 */
export async function login(msalInstance, { loginHint } = {}) {
  if (activeLoginPromise) {
    return activeLoginPromise;
  }

  const request = loginHint ? { ...loginRequest, loginHint } : { ...loginRequest };

  const attemptPopup = async (allowRetry = true) => {
    try {
      const result = await msalInstance.loginPopup(request);
      if (result?.account) {
        msalInstance.setActiveAccount(result.account);
      }
      return result;
    } catch (err) {
      const code = err?.errorCode || '';

      // Clear stale interaction_in_progress lock once and retry
      if (code === 'interaction_in_progress' && allowRetry) {
        clearStaleMsalInteraction();
        return attemptPopup(false);
      }

      // User simply closed the Microsoft popup
      if (code === 'user_cancelled') {
        const cancelled = new Error('Microsoft sign-in window was closed.');
        cancelled.code = 'USER_CANCELLED';
        throw cancelled;
      }

      // Fall back to full-page redirect if the browser blocked the popup
      if (POPUP_BLOCKED_CODES.has(code)) {
        clearStaleMsalInteraction();
        await msalInstance.loginRedirect(request);
        return null;
      }

      throw err;
    }
  };

  activeLoginPromise = attemptPopup().finally(() => {
    activeLoginPromise = null;
  });

  return activeLoginPromise;
}

/**
 * Logs out the current Microsoft user without wiping the Google Drive session.
 * Falls back to redirect logout if popups are blocked.
 */
export async function logout(msalInstance) {
  const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
  try {
    await msalInstance.logoutPopup({
      account,
      postLogoutRedirectUri: window.location.origin,
      mainWindowRedirectUri: window.location.origin,
    });
  } catch (err) {
    const code = err?.errorCode || '';
    if (code === 'user_cancelled') return;
    clearStaleMsalInteraction();
    await msalInstance.logoutRedirect({
      account,
      postLogoutRedirectUri: window.location.origin,
    });
  }
}

/**
 * Acquires an access token silently (no user interaction needed after first login).
 * Deduplicates concurrent calls so multiple hooks don't trigger overlapping prompts.
 */
export async function getAccessToken(msalInstance) {
  if (activeTokenPromise) {
    return activeTokenPromise;
  }

  activeTokenPromise = (async () => {
    let account = msalInstance.getActiveAccount();

    if (!account) {
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        msalInstance.setActiveAccount(accounts[0]);
        account = accounts[0];
      }
    }

    if (!account) throw new Error('No active account. Please log in.');

    try {
      const response = await msalInstance.acquireTokenSilent({
        ...loginRequest,
        account,
      });
      return response.accessToken;
    } catch (error) {
      console.warn('[Auth] Silent token acquisition failed, requesting token via popup...', error);
      try {
        const popupRes = await msalInstance.acquireTokenPopup({
          ...loginRequest,
          account,
        });
        return popupRes.accessToken;
      } catch (popupErr) {
        if (POPUP_BLOCKED_CODES.has(popupErr?.errorCode || '')) {
          await msalInstance.acquireTokenRedirect({ ...loginRequest, account });
        }
        throw popupErr;
      }
    }
  })();

  try {
    return await activeTokenPromise;
  } finally {
    activeTokenPromise = null;
  }
}
