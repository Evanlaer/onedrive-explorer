import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { msalConfig } from './auth/msalConfig';
import App from './App';
import './index.css';

// Initialize MSAL (singleton)
const msalInstance = new PublicClientApplication(msalConfig);

// Handle redirect response on page load
msalInstance.initialize().then(() => {
  // Set active account if one exists from a previous session
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  // Listen for login success and set active account
  msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload?.account) {
      msalInstance.setActiveAccount(event.payload.account);
    }
  });

  // Handle the redirect response (called after Microsoft redirects back)
  msalInstance.handleRedirectPromise().then((response) => {
    // If returning from a redirect login, the account is in the response
    if (response?.account) {
      msalInstance.setActiveAccount(response.account);
    } else {
      // Fallback: pick up any cached account from a previous session
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        msalInstance.setActiveAccount(accounts[0]);
      }
    }

    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <MsalProvider instance={msalInstance}>
          <App />
        </MsalProvider>
      </StrictMode>
    );
  });
});
