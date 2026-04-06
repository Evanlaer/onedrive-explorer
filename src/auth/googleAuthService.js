/**
 * Google Identity Services — Authentication Service
 * Handles requesting OAuth 2.0 access tokens for Google Drive API.
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

let tokenClient;

/**
 * Initializes the GIS (Google Identity Services) token client.
 * Should be called once after the script is loaded.
 */
export function initGoogleAuth(onTokenReceived) {
  if (typeof google === 'undefined') {
    console.error('Google GIS script not loaded');
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: (response) => {
      if (response.error) {
        console.error('Google Auth Error:', response.error);
        return;
      }
      // Access token received!
      onTokenReceived(response.access_token, response.expires_in);
    },
  });
}

/**
 * Initiates the interactive Google login/consent flow.
 */
export function loginGoogle() {
  if (!tokenClient) {
    console.error('Google Auth not initialized or Client ID missing');
    return;
  }
  // This will trigger the popup consent window
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
 * "Logout" for Google Drive in SPA context usually means clearing the local token.
 * We can also revoke the token if needed.
 */
export function logoutGoogle(accessToken) {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {
      console.log('Google token revoked');
    });
  }
}
