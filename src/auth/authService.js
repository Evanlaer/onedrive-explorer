import { loginRequest } from './msalConfig';

/**
 * Initiates a redirect-based Microsoft login flow.
 * Uses redirect (not popup) to avoid browser popup blockers.
 */
export async function login(msalInstance) {
  await msalInstance.loginRedirect(loginRequest);
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
 * Falls back to interactive redirect if silent acquisition fails.
 */
export async function getAccessToken(msalInstance) {
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
    console.warn('[Auth] Silent token acquisition failed, redirecting...', error);
    await msalInstance.acquireTokenRedirect({ ...loginRequest, account });
  }
}
