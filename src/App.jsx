import './App.css';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import Sidebar from './components/Sidebar/Sidebar';
import CloudPane from './components/CloudPane/CloudPane';
import TransferToast from './components/TransferToast/TransferToast';
import ConfirmModal from './components/ConfirmModal/ConfirmModal';
import RenameModal from './components/RenameModal/RenameModal';
import { login } from './auth/authService';
import { getUserProfile } from './api/graphService';
import { initGoogleAuth, loginGoogle, logoutGoogle } from './auth/googleAuthService';
import { getGoogleUserProfile } from './api/googleDriveService';
import {
  transferItem,
  deleteCloudItem,
  renameCloudItem,
  isItemFolder,
} from './api/transferService';

const BATCH_CONCURRENCY = 2;
const DELETE_CONCURRENCY = 3;

export default function App() {
  const { instance, inProgress } = useMsal();
  const isOneDriveAuth = useIsAuthenticated();

  // Google Auth State
  const [googleToken, setGoogleToken] = useState(sessionStorage.getItem('google_token'));
  const [googleProfile, setGoogleProfile] = useState(null);
  const [msProfile, setMsProfile] = useState(null);

  // Cross-Cloud Transfer & Delete State
  const [transferMode, setTransferMode] = useState('copy'); // 'copy' | 'move'
  const [dragState, setDragState] = useState(null); // { sourceCloud, items } | null
  const clearSourceSelectionRef = useRef(null);
  const [transfers, setTransfers] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null); // { cloud, title, items, clearSelection } | null
  const [pendingRename, setPendingRename] = useState(null); // { cloud, title, item, clearSelection } | null
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

  const handleGoogleAuthExpired = useCallback(() => {
    setGoogleToken(null);
    sessionStorage.removeItem('google_token');
    setGoogleProfile(null);
  }, []);

  const refreshCloud = useCallback((cloud) => {
    if (cloud === 'onedrive') {
      setOneDriveRefreshKey((k) => k + 1);
    } else if (cloud === 'google') {
      setGoogleRefreshKey((k) => k + 1);
    }
  }, []);

  const handleDragStartItems = useCallback((sourceCloud, items, clearSelectionFn) => {
    clearSourceSelectionRef.current = clearSelectionFn || null;
    setDragState({ sourceCloud, items });
  }, []);

  const handleDragEndItems = useCallback(() => {
    setDragState(null);
  }, []);

  const updateTransfer = useCallback((id, patch) => {
    setTransfers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
  }, []);

  const handleDropItems = useCallback(
    async ({ sourceCloud, items, targetCloud, targetFolderId, targetFolderName, mode }) => {
      setDragState(null);
      clearSourceSelectionRef.current?.();
      clearSourceSelectionRef.current = null;

      if (!isOneDriveAuth || !googleToken) return;
      if (sourceCloud === targetCloud || !items?.length) return;

      const jobs = items.map((item, idx) => ({
        transferId: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
        item,
      }));

      const entries = jobs.map(({ transferId, item }) => ({
        id: transferId,
        itemName: item.name,
        isFolder: isItemFolder(item),
        sourceCloud,
        targetCloud,
        targetFolderName: targetFolderName || '',
        mode,
        status: 'queued',
        percent: 0,
        detail: 'Queued…',
        warnings: [],
        error: null,
      }));

      setTransfers((prev) => [...entries, ...prev]);

      let nextIndex = 0;
      let anyTransferred = false;
      let anySourceDeleted = false;

      const runWorker = async () => {
        while (nextIndex < jobs.length) {
          const current = jobs[nextIndex];
          nextIndex += 1;

          const { transferId, item } = current;
          updateTransfer(transferId, {
            status: 'active',
            percent: 5,
            detail: 'Preparing transfer…',
          });

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

            anyTransferred = true;
            if (result.sourceDeleted) {
              anySourceDeleted = true;
            }

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
          } catch (err) {
            updateTransfer(transferId, {
              status: 'error',
              percent: 100,
              detail: 'Transfer failed',
              error: err.message || 'An unexpected error occurred during transfer.',
            });
          }
        }
      };

      const workerCount = Math.min(BATCH_CONCURRENCY, jobs.length);
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

      // Refresh destination pane once the batch completes, and source pane if any originals were moved
      if (anyTransferred) {
        refreshCloud(targetCloud);
      }
      if (anySourceDeleted) {
        refreshCloud(sourceCloud);
      }
    },
    [isOneDriveAuth, googleToken, instance, updateTransfer, refreshCloud]
  );

  const handleRequestDelete = useCallback((request) => {
    if (!request?.items?.length) return;
    setPendingDelete(request);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setPendingDelete(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    const request = pendingDelete;
    setPendingDelete(null);
    if (!request?.items?.length) return;

    const { cloud, items, clearSelection } = request;
    clearSelection?.();

    const jobs = items.map((item, idx) => ({
      transferId: `del-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      item,
    }));

    const entries = jobs.map(({ transferId, item }) => ({
      id: transferId,
      itemName: item.name,
      isFolder: isItemFolder(item),
      sourceCloud: cloud,
      targetCloud: cloud,
      targetFolderName: '',
      mode: 'delete',
      status: 'queued',
      percent: 0,
      detail: 'Queued…',
      warnings: [],
      error: null,
    }));

    setTransfers((prev) => [...entries, ...prev]);

    let nextIndex = 0;
    let anyDeleted = false;
    const binLabel = cloud === 'onedrive' ? 'Moved to Recycle Bin' : 'Moved to Trash';

    const runWorker = async () => {
      while (nextIndex < jobs.length) {
        const current = jobs[nextIndex];
        nextIndex += 1;

        const { transferId, item } = current;
        updateTransfer(transferId, {
          status: 'active',
          percent: 45,
          detail: `Deleting ${item.name}…`,
        });

        try {
          await deleteCloudItem({
            item,
            cloud,
            msalInstance: instance,
            googleToken,
          });
          anyDeleted = true;
          updateTransfer(transferId, {
            status: 'success',
            percent: 100,
            detail: binLabel,
          });
        } catch (err) {
          updateTransfer(transferId, {
            status: 'error',
            percent: 100,
            detail: 'Delete failed',
            error: err.message || 'Could not delete item.',
          });
        }
      }
    };

    const workerCount = Math.min(DELETE_CONCURRENCY, jobs.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    if (anyDeleted) {
      refreshCloud(cloud);
    }
  }, [pendingDelete, instance, googleToken, updateTransfer, refreshCloud]);

  const handleRequestRename = useCallback((request) => {
    if (!request?.item) return;
    setPendingRename(request);
  }, []);

  const handleCancelRename = useCallback(() => {
    setPendingRename(null);
  }, []);

  const handleSubmitRename = useCallback(
    async (newName) => {
      if (!pendingRename?.item) return;
      const { cloud, item, clearSelection } = pendingRename;

      await renameCloudItem({
        item,
        cloud,
        newName,
        msalInstance: instance,
        googleToken,
      });

      setPendingRename(null);
      clearSelection?.();
      refreshCloud(cloud);

      const entry = {
        id: `ren-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        itemName: newName,
        isFolder: isItemFolder(item),
        sourceCloud: cloud,
        targetCloud: cloud,
        targetFolderName: '',
        mode: 'rename',
        status: 'success',
        percent: 100,
        detail: `Renamed from “${item.name}”`,
        warnings: [],
        error: null,
      };
      setTransfers((prev) => [entry, ...prev]);
    },
    [pendingRename, instance, googleToken, refreshCloud]
  );

  const handleDismissTransfer = useCallback((id) => {
    setTransfers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleClearCompleted = useCallback(() => {
    setTransfers((prev) =>
      prev.filter((t) => t.status === 'active' || t.status === 'queued')
    );
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
        onDragStartItems={handleDragStartItems}
        onDragEndItems={handleDragEndItems}
        onDropItems={handleDropItems}
        onRequestDelete={handleRequestDelete}
        onRequestRename={handleRequestRename}
      />

      {/* Right Pane: Google Drive */}
      <CloudPane
        key={`google-${googleToken ? 'auth' : 'locked'}`}
        type="google"
        title="Google Drive"
        isAuthenticated={!!googleToken}
        accessToken={googleToken}
        onLogin={() => loginGoogle()}
        refreshKey={googleRefreshKey}
        onRefresh={() => refreshCloud('google')}
        canTransfer={canTransfer}
        dragState={dragState}
        transferMode={transferMode}
        onDragStartItems={handleDragStartItems}
        onDragEndItems={handleDragEndItems}
        onDropItems={handleDropItems}
        onRequestDelete={handleRequestDelete}
        onRequestRename={handleRequestRename}
        onAuthExpired={handleGoogleAuthExpired}
      />

      <TransferToast
        transfers={transfers}
        onDismiss={handleDismissTransfer}
        onClearCompleted={handleClearCompleted}
      />

      <ConfirmModal
        pendingDelete={pendingDelete}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />

      <RenameModal
        pendingRename={pendingRename}
        onCancel={handleCancelRename}
        onSubmit={handleSubmitRename}
      />
    </div>
  );
}
