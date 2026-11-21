import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';
import App from './App';
import './index.css';

/**
 * Inspects the MSAL OAuth `state` parameter in the URL hash/query.
 * Note: Microsoft's Cross-Origin-Opener-Policy (COOP) severs `window.opener`
 * to `null` during popup sign-in, so we detect popup/silent callbacks
 * directly from `state.meta.interactionType`.
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

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrap();
