// Microsoft Authentication Library (MSAL) Configuration
// Uses OAuth 2.0 Authorization Code flow with PKCE — no secrets in the browser

import { getEffectiveOneDriveConfig } from '../utils/settingsStorage';

export function buildMsalConfigForConnection(connection) {
  const effective = getEffectiveOneDriveConfig(connection);

  return {
    auth: {
      clientId: effective.clientId,
      authority: effective.authorityUrl,
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
      navigateToLoginRequestUrl: false,
    },
    cache: {
      // localStorage persists sessions & refresh tokens across browser restarts when autoConnect is enabled
      cacheLocation: effective.cacheLocation,
      storeAuthStateInCookie: false,
    },
    system: {
      popupBridgeTimeout: 120000,
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          if (containsPii) return;
          if (import.meta.env.DEV) console.log('[MSAL]', message);
        },
        logLevel: 3, // Warning level
      },
    },
  };
}

// Scopes: User.Read for profile info, Files.ReadWrite for OneDrive browsing and cross-cloud transfers
export const loginRequest = {
  scopes: ['User.Read', 'Files.ReadWrite'],
};

export const graphConfig = {
  graphMeEndpoint: 'https://graph.microsoft.com/v1.0/me',
  graphDriveEndpoint: 'https://graph.microsoft.com/v1.0/me/drive',
};
