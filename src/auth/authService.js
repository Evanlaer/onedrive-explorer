import { loginRequest } from './msalConfig';
import { getMsalInstanceForConnection, consumeRedirectAccount } from './msalRegistry';
import { DEFAULT_ONEDRIVE_ID } from '../utils/settingsStorage';

const activeLoginPromises = new Map();
const activeTokenPromises = new Map();

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
 * Matches a cached MSAL account to a specific saved OneDrive connection.
 */
export function findMsalAccount(msalInstance, connection, claimedAccountIds = new Set()) {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) return null;

  if (connection?.savedAccountId) {
    const exact = accounts.find((a) => a.homeAccountId === connection.savedAccountId);
    if (exact) return exact;
  }

  if (connection?.savedEmail) {
    const emailLower = connection.savedEmail.toLowerCase();
    const byEmail = accounts.find(
      (a) => (a.username || '').toLowerCase() === emailLower
    );
    if (byEmail) return byEmail;
  }

  // Legacy migration fallback: only auto-claim an unclaimed account for the original default OneDrive
  if (connection?.id === DEFAULT_ONEDRIVE_ID) {
    const unclaimed = accounts.find((a) => !claimedAccountIds.has(a.homeAccountId));
    if (unclaimed) return unclaimed;
  }

  return null;
}

/**
 * Attempts to restore or silently connect a saved OneDrive connection on startup.
 */
export async function resolveOneDriveSession(connection, claimedAccountIds = new Set()) {
  const msalInstance = await getMsalInstanceForConnection(connection);
  const redirectAcc = consumeRedirectAccount(connection);
  if (redirectAcc && !claimedAccountIds.has(redirectAcc.homeAccountId)) {
    return { msalInstance, account: redirectAcc };
  }

  const cached = findMsalAccount(msalInstance, connection, claimedAccountIds);
  if (cached) {
    return { msalInstance, account: cached };
  }

  if (connection?.autoConnect && connection?.savedEmail) {
    try {
      const ssoResult = await msalInstance.ssoSilent({
        ...loginRequest,
        loginHint: connection.savedEmail,
      });
      if (ssoResult?.account) {
        return { msalInstance, account: ssoResult.account };
      }
    } catch (ssoErr) {
      if (import.meta.env.DEV) {
        console.info(
          `[MSAL] Silent auto-connect skipped for ${connection.name}:`,
          ssoErr?.errorCode || ssoErr?.message
        );
      }
    }
  }

  return { msalInstance, account: null };
}

/**
 * Initiates Microsoft login for a specific OneDrive connection.
 * Uses prompt: 'select_account' when connecting a new/unlinked connection so users can
 * easily sign into multiple different Microsoft accounts.
 */
export async function loginOneDriveConnection(connection) {
  const connId = connection?.id || 'default';
  if (activeLoginPromises.has(connId)) {
    return activeLoginPromises.get(connId);
  }

  const msalInstance = await getMsalInstanceForConnection(connection);
  const request = connection?.savedEmail
    ? { ...loginRequest, loginHint: connection.savedEmail }
    : { ...loginRequest, prompt: 'select_account' };

  const attemptPopup = async (allowRetry = true) => {
    try {
      const result = await msalInstance.loginPopup(request);
      if (result?.account) {
        msalInstance.setActiveAccount(result.account);
      }
      return { msalInstance, account: result?.account || null };
    } catch (err) {
      const code = err?.errorCode || '';

      if (code === 'interaction_in_progress' && allowRetry) {
        clearStaleMsalInteraction();
        return attemptPopup(false);
      }

      if (code === 'user_cancelled') {
        const cancelled = new Error('Microsoft sign-in window was closed.');
        cancelled.code = 'USER_CANCELLED';
        throw cancelled;
      }

      if (POPUP_BLOCKED_CODES.has(code)) {
        clearStaleMsalInteraction();
        await msalInstance.loginRedirect(request);
        return { msalInstance, account: null };
      }

      throw err;
    }
  };

  const promise = attemptPopup().finally(() => {
    activeLoginPromises.delete(connId);
  });

  activeLoginPromises.set(connId, promise);
  return promise;
}

/**
 * Signs out a specific Microsoft account without disturbing other OneDrive or Google connections.
 */
export async function logoutOneDriveConnection(connection, accountId) {
  const msalInstance = await getMsalInstanceForConnection(connection);
  const accounts = msalInstance.getAllAccounts();
  const account =
    accounts.find((a) => a.homeAccountId === (accountId || connection?.savedAccountId)) ||
    findMsalAccount(msalInstance, connection);

  if (!account) return;

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
 * Acquires an access token silently for a specific Microsoft account (deduplicated per account).
 * Accepts either `{ msalInstance, accountId }` or a raw `msalInstance`.
 */
export async function getAccessToken(oneDriveCtx) {
  const msalInstance = oneDriveCtx?.msalInstance || oneDriveCtx;
  const accountId = oneDriveCtx?.accountId || '';

  if (!msalInstance || typeof msalInstance.getAllAccounts !== 'function') {
    throw new Error('OneDrive authentication is not initialized.');
  }

  const dedupeKey = accountId || 'active';
  if (activeTokenPromises.has(dedupeKey)) {
    return activeTokenPromises.get(dedupeKey);
  }

  const promise = (async () => {
    const accounts = msalInstance.getAllAccounts();
    let account = accountId
      ? accounts.find((a) => a.homeAccountId === accountId)
      : msalInstance.getActiveAccount() || accounts[0];

    if (!account) {
      throw new Error('OneDrive account is not signed in. Please connect it.');
    }

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
  })().finally(() => {
    activeTokenPromises.delete(dedupeKey);
  });

  activeTokenPromises.set(dedupeKey, promise);
  return promise;
}
