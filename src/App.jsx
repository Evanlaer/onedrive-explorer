import './App.css';
import { useState, useEffect, useCallback } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import Sidebar from './components/Sidebar/Sidebar';
import CloudPane from './components/CloudPane/CloudPane';
import TransferToast from './components/TransferToast/TransferToast';
import { login } from './auth/authService';
import { getUserProfile } from './api/graphService';
import { initGoogleAuth, loginGoogle, logoutGoogle } from './auth/googleAuthService';
import { getGoogleUserProfile } from './api/googleDriveService';
import { transferItem, isItemFolder } from './api/transferService';

export default function App() {
  const { instance, inProgress } = useMsal();
  const isOneDriveAuth = useIsAuthenticated();

  // Google Auth State
  const [googleToken, setGoogleToken] = useState(sessionStorage.getItem('google_token'));
  const [googleProfile, setGoogleProfile] = useState(null);
  const [msProfile, setMsProfile] = useState(null);

  // Cross-Cloud Transfer State
  const [transferMode, setTransferMode] = useState('copy'); // 'copy' | 'move'
  const [dragState, setDragState] = useState(null); // { sourceCloud, item } | null
  const [transfers, setTransfers] = useState([]);
  const [oneDriveRefreshKey, setOneDriveRefreshKey] = useState(0);
  const [googleRefreshKey, setGoogleRefreshKey] = useState(0);

  const canTransfer = isOneDriveAuth && !!googleToken;

  // Initialize Google Auth on mount
  useEffect(() => {
    initGoogleAuth((token) => {
      setGoogleToken(token);
      sessionStorage.setItem('google_token', token);
    });
  }, []);

  // Fetch Profiles
  useEffect(() => {
    if (!isOneDriveAuth) return;
    let cancelled = false;
    getUserProfile(instance)
      .then((profile) => {
        if (!cancelled) setMsProfile(profile);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOneDriveAuth, instance]);

  useEffect(() => {
    if (!googleToken) return;
    let cancelled = false;
    getGoogleUserProfile(googleToken)
      .then((profile) => {
        if (!cancelled) setGoogleProfile(profile);
      })
      .catch(() => {
        if (!cancelled) {
          setGoogleToken(null);
          sessionStorage.removeItem('google_token');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [googleToken]);

  const activeMsProfile = isOneDriveAuth ? msProfile : null;
  const activeGoogleProfile = googleToken ? googleProfile : null;

  const handleLogoutOneDrive = () => {
    instance.logoutRedirect();
  };

  const handleLogoutGoogle = () => {
    logoutGoogle(googleToken);
    setGoogleToken(null);
    sessionStorage.removeItem('google_token');
    setGoogleProfile(null);
  };

  const refreshCloud = useCallback((cloud) => {
    if (cloud === 'onedrive') {
      setOneDriveRefreshKey((k) => k + 1);
    } else if (cloud === 'google') {
      setGoogleRefreshKey((k) => k + 1);
    }
  }, []);

  const handleDragStartItem = useCallback((sourceCloud, item) => {
    setDragState({ sourceCloud, item });
  }, []);

  const handleDragEndItem = useCallback(() => {
    setDragState(null);
  }, []);

  const updateTransfer = useCallback((id, patch) => {
    setTransfers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
  }, []);

  const handleDropItem = useCallback(
    async ({ sourceCloud, item, targetCloud, targetFolderId, targetFolderName, mode }) => {
      setDragState(null);

      if (!isOneDriveAuth || !googleToken) return;
      if (sourceCloud === targetCloud) return;

      const transferId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const entry = {
        id: transferId,
        itemName: item.name,
        isFolder: isItemFolder(item),
        sourceCloud,
        targetCloud,
        targetFolderName: targetFolderName || '',
        mode,
        status: 'active',
        percent: 5,
        detail: 'Preparing transfer…',
        warnings: [],
        error: null,
      };

      setTransfers((prev) => [entry, ...prev]);

      try {
        const result = await transferItem({
          item,
          sourceCloud,
          targetCloud,
          targetFolderId,
          mode,
          msalInstance: instance,
          googleToken,
          onProgress: (progress) => {
            updateTransfer(transferId, {
              percent: progress.percent,
              detail: progress.detail,
            });
          },
        });

        const hasWarnings = result.warnings.length > 0;
        updateTransfer(transferId, {
          status: hasWarnings ? 'warning' : 'success',
          percent: 100,
          warnings: result.warnings,
          detail: hasWarnings
            ? `Completed with ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}`
            : mode === 'move' && result.sourceDeleted
            ? 'Moved successfully'
            : 'Copied successfully',
        });

        // Refresh destination pane, and source pane if original item was moved/removed
        refreshCloud(targetCloud);
        if (result.sourceDeleted) {
          refreshCloud(sourceCloud);
        }
      } catch (err) {
        updateTransfer(transferId, {
          status: 'error',
          percent: 100,
          detail: 'Transfer failed',
          error: err.message || 'An unexpected error occurred during transfer.',
        });
      }
    },
    [isOneDriveAuth, googleToken, instance, updateTransfer, refreshCloud]
  );

  const handleDismissTransfer = useCallback((id) => {
    setTransfers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleClearCompleted = useCallback(() => {
    setTransfers((prev) => prev.filter((t) => t.status === 'active'));
  }, []);

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
        userProfile={activeMsProfile}
        googleProfile={activeGoogleProfile}
        onLogoutOneDrive={handleLogoutOneDrive}
        onLogoutGoogle={handleLogoutGoogle}
        transferMode={transferMode}
        onTransferModeChange={setTransferMode}
        canTransfer={canTransfer}
      />

      {/* Left Pane: OneDrive */}
      <CloudPane
        key={`onedrive-${isOneDriveAuth ? 'auth' : 'locked'}`}
        type="onedrive"
        title="OneDrive"
        isAuthenticated={isOneDriveAuth}
        onLogin={() => login(instance)}
        refreshKey={oneDriveRefreshKey}
        onRefresh={() => refreshCloud('onedrive')}
        canTransfer={canTransfer}
        dragState={dragState}
        transferMode={transferMode}
        onDragStartItem={handleDragStartItem}
        onDragEndItem={handleDragEndItem}
        onDropItem={handleDropItem}
      />

      {/* Right Pane: Google Drive */}
      <CloudPane
        key={`google-${googleToken ? 'auth' : 'locked'}`}
        type="google"
        title="Google Drive"
        isAuthenticated={!!googleToken}
        accessToken={googleToken}
        onLogin={loginGoogle}
        refreshKey={googleRefreshKey}
        onRefresh={() => refreshCloud('google')}
        canTransfer={canTransfer}
        dragState={dragState}
        transferMode={transferMode}
        onDragStartItem={handleDragStartItem}
        onDragEndItem={handleDragEndItem}
        onDropItem={handleDropItem}
      />

      <TransferToast
        transfers={transfers}
        onDismiss={handleDismissTransfer}
        onClearCompleted={handleClearCompleted}
      />
    </div>
  );
}
