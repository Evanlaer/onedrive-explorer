// Microsoft Authentication Library (MSAL) Configuration
// Uses OAuth 2.0 Authorization Code flow with PKCE — no secrets in the browser

export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE',
    authority: 'https://login.microsoftonline.com/consumers',
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: 'sessionStorage', // Never localStorage — more secure
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (import.meta.env.DEV) console.log('[MSAL]', message);
      },
      logLevel: 3, // Warning level
    },
  },
};

// Scopes: User.Read for profile info, Files.Read for OneDrive browsing
export const loginRequest = {
  scopes: ['User.Read', 'Files.Read'],
};

export const graphConfig = {
  graphMeEndpoint: 'https://graph.microsoft.com/v1.0/me',
  graphDriveEndpoint: 'https://graph.microsoft.com/v1.0/me/drive',
};
