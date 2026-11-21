import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';
import { MsalProvider } from '@azure/msal-react';
import { buildMsalConfig, loginRequest } from './auth/msalConfig';
import { loadSettings } from './utils/settingsStorage';
import App from './App';
import './index.css';

/**
 * Inspects the MSAL OAuth `state` parameter in the URL hash/query.
 * Note: Microsoft's Cross-Origin-Opener-Policy (COOP) severs `window.opener`
 * to `null` during popup sign-in, so we MUST detect popup/silent callbacks
 * from `state.meta.interactionType` rather than checking `window.opener`.
 */
function getMsalInteractionTypeFromUrl() {
  const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  const queryParams = new URLSearchParams((window.location.search || '').replace(/^\?/, ''));
  const state = hashParams.get('state') || queryParams.get('state');
  if (!state) return null;

  try {
    const encoded = state.split('|')[0].replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded));
    return parsed?.meta?.interactionType || null;
  } catch {
    return null;
  }
}

async function bootstrap() {
  // In MSAL v5, popup (loginPopup) and hidden iframe (ssoSilent) callbacks
  // broadcast the auth response back to the main window over BroadcastChannel and close.
  const interactionType = getMsalInteractionTypeFromUrl();
  if (interactionType === 'popup' || interactionType === 'silent') {
    try {
      await broadcastResponseToMainFrame();
      return;
    } catch (err) {
      console.error('[MSAL] Redirect bridge broadcast failed:', err);
    }
  }

  // Load saved connection settings before creating MSAL instance
  const initialSettings = loadSettings();
  const msalInstance = new PublicClientApplication(buildMsalConfig(initialSettings));

  await msalInstance.initialize();

  // Set active account if one exists from a previous session (persisted in localStorage when autoConnect is on)
  const cachedAccounts = msalInstance.getAllAccounts();
  if (cachedAccounts.length > 0) {
    msalInstance.setActiveAccount(cachedAccounts[0]);
  }

  // Listen for login success and set active account
  msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload?.account) {
      msalInstance.setActiveAccount(event.payload.account);
    }
  });

  try {
    const response = await msalInstance.handleRedirectPromise();
    if (response?.account) {
      msalInstance.setActiveAccount(response.account);
    } else {
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        msalInstance.setActiveAccount(accounts[0]);
      } else if (
        initialSettings.onedrive.autoConnect &&
        initialSettings.onedrive.savedEmail
      ) {
        // Attempt silent SSO using the saved Microsoft account hint when cache was cleared/expired
        try {
          const ssoResult = await msalInstance.ssoSilent({
            ...loginRequest,
            loginHint: initialSettings.onedrive.savedEmail,
          });
          if (ssoResult?.account) {
            msalInstance.setActiveAccount(ssoResult.account);
          }
        } catch (ssoErr) {
          if (import.meta.env.DEV) {
            console.info(
              '[MSAL] Silent auto-connect skipped:',
              ssoErr?.errorCode || ssoErr?.message
            );
          }
        }
      }
    }
  } catch (err) {
    console.error('[MSAL] Redirect handling failed:', err);
  }

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>
  );
}

bootstrap();
