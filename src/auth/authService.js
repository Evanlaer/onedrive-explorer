import { loginRequest } from './msalConfig';

let activeTokenPromise = null;
let redirectInitiated = false;

/**
 * Initiates a redirect-based Microsoft login flow.
 * Uses redirect (not popup) to avoid browser popup blockers.
 */
export async function login(msalInstance) {
  if (redirectInitiated) return;
  redirectInitiated = true;
  try {
    await msalInstance.loginRedirect(loginRequest);
  } catch (err) {
    redirectInitiated = false;
    throw err;
  }
}

/**
 * Logs out the current user and clears the session.
 */
export async function logout(msalInstance) {
  const account = msalInstance.getActiveAccount();
  await msalInstance.logoutRedirect({
    account,
    postLogoutRedirectUri: window.location.origin,
  });
}

/**
 * Acquires an access token silently (no user interaction needed after first login).
 * Deduplicates concurrent calls so multiple hooks don't trigger overlapping redirects.
 */
export async function getAccessToken(msalInstance) {
  if (activeTokenPromise) {
    return activeTokenPromise;
  }

  activeTokenPromise = (async () => {
    let account = msalInstance.getActiveAccount();

    // Fallback: if no active account is set, try to pick one from the cache
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
      // Silent acquisition failed — user needs to consent again
      if (!redirectInitiated) {
        redirectInitiated = true;
        console.warn('[Auth] Silent token acquisition failed, redirecting...', error);
        await msalInstance.acquireTokenRedirect({ ...loginRequest, account });
      }
      throw error;
    }
  })();

  try {
    return await activeTokenPromise;
  } finally {
    activeTokenPromise = null;
  }
}
