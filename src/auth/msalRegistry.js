import { PublicClientApplication } from '@azure/msal-browser';
import { buildMsalConfigForConnection } from './msalConfig';
import { getEffectiveOneDriveConfig } from '../utils/settingsStorage';

const instancePromises = new Map();
const redirectAccounts = new Map();

export function getMsalConfigKey(connection) {
  const effective = getEffectiveOneDriveConfig(connection);
  return `${effective.clientId}|${effective.authority}|${effective.cacheLocation}`;
}

/**
 * Returns an initialized PublicClientApplication for the given OneDrive connection's
 * (clientId, authority, cacheLocation) tuple. Multiple OneDrive connections sharing
 * the same config reuse one MSAL instance and isolate accounts by homeAccountId.
 */
export function getMsalInstanceForConnection(connection) {
  const key = getMsalConfigKey(connection);
  if (instancePromises.has(key)) {
    return instancePromises.get(key);
  }

  const initPromise = (async () => {
    const config = buildMsalConfigForConnection(connection);
    const pca = new PublicClientApplication(config);
    await pca.initialize();

    try {
      const redirectResponse = await pca.handleRedirectPromise();
      if (redirectResponse?.account) {
        redirectAccounts.set(key, redirectResponse.account);
      }
    } catch (err) {
      console.error('[MSAL] Redirect handling failed:', err);
    }

    return pca;
  })();

  instancePromises.set(key, initPromise);
  return initPromise;
}

export function consumeRedirectAccount(connection) {
  const key = getMsalConfigKey(connection);
  const acc = redirectAccounts.get(key) || null;
  if (acc) redirectAccounts.delete(key);
  return acc;
}
