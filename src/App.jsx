import './App.css';
import { useState, useEffect } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import Sidebar from './components/Sidebar/Sidebar';
import CloudPane from './components/CloudPane/CloudPane';
import { getUserProfile } from './api/graphService';
import { initGoogleAuth, loginGoogle, logoutGoogle } from './auth/googleAuthService';
import { getGoogleUserProfile } from './api/googleDriveService';

export default function App() {
  const { instance, inProgress } = useMsal();
  const isOneDriveAuth = useIsAuthenticated();

  // Google Auth State
  const [googleToken, setGoogleToken] = useState(sessionStorage.getItem('google_token'));
  const [googleProfile, setGoogleProfile] = useState(null);
  const [msProfile, setMsProfile] = useState(null);

  // Initialize Google Auth on mount
  useEffect(() => {
    initGoogleAuth((token) => {
      setGoogleToken(token);
      sessionStorage.setItem('google_token', token);
    });
  }, []);

  // Fetch Profiles
  useEffect(() => {
    if (isOneDriveAuth) {
      getUserProfile(instance).then(setMsProfile).catch(() => {});
    } else {
      setMsProfile(null);
    }
  }, [isOneDriveAuth, instance]);

  useEffect(() => {
    if (googleToken) {
      getGoogleUserProfile(googleToken).then(setGoogleProfile).catch(() => {
        setGoogleToken(null);
        sessionStorage.removeItem('google_token');
      });
    } else {
      setGoogleProfile(null);
    }
  }, [googleToken]);

  const handleLogoutOneDrive = () => {
    instance.logoutRedirect();
  };

  const handleLogoutGoogle = () => {
    logoutGoogle(googleToken);
    setGoogleToken(null);
    sessionStorage.removeItem('google_token');
    setGoogleProfile(null);
  };

  // Loading states
  if (inProgress === InteractionStatus.Startup || inProgress === InteractionStatus.HandleRedirect) {
    return (
      <div className="loading-screen">
        <div className="loader"></div>
        <p>Initializing Multi-Cloud Explorer...</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        userProfile={msProfile}
        googleProfile={googleProfile}
        onLogoutOneDrive={handleLogoutOneDrive}
        onLogoutGoogle={handleLogoutGoogle}
      />
      
      {/* Left Pane: OneDrive */}
      <CloudPane
        type="onedrive"
        title="OneDrive"
        isAuthenticated={isOneDriveAuth}
        onLogin={() => instance.loginRedirect()}
      />

      {/* Right Pane: Google Drive */}
      <CloudPane
        type="google"
        title="Google Drive"
        isAuthenticated={!!googleToken}
        accessToken={googleToken}
        onLogin={loginGoogle}
      />
    </div>
  );
}
