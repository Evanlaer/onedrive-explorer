import './App.css';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import Sidebar from './components/Sidebar/Sidebar';
import CloudPane from './components/CloudPane/CloudPane';
import TransferToast from './components/TransferToast/TransferToast';
import ConfirmModal from './components/ConfirmModal/ConfirmModal';
import RenameModal from './components/RenameModal/RenameModal';
import SettingsModal from './components/SettingsModal/SettingsModal';
import { login, logout } from './auth/authService';
import { getUserProfile } from './api/graphService';
import {
  fetchGoogleAuthStatus,
  loginGoogleWithCode,
  loginGoogleWithToken,
  refreshGoogleAccessToken,
  logoutGoogle,
} from './auth/googleAuthService';
import { getGoogleUserProfile } from './api/googleDriveService';
import {
  transferItem,
  deleteCloudItem,
  renameCloudItem,
  isItemFolder,
} from './api/transferService';
import {
  loadSettings,
  saveSettings,
  resetAllSettings,
  getEffectiveGoogleConfig,
  loadGoogleSession,
  saveGoogleSession,
  clearGoogleSession,
  clearMsalLocalCache,
  isAccessTokenFresh,
} from './utils/settingsStorage';

const BATCH_CONCURRENCY = 2;
const DELETE_CONCURRENCY = 3;
const GOOGLE_REFRESH_LEAD_MS = 3 * 60 * 1000; // Refresh 3 minutes before expiry

export default function App() {
  const { instance, inProgress } = useMsal();
  const isOneDriveAuth = useIsAuthenticated();

  // Persisted Connection Settings
  const [settings, setSettings] = useState(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Google Auth State (restored from localStorage/sessionStorage)
  const [googleSession, setGoogleSession] = useState(() => loadGoogleSession());
  const [googleAuthStatus, setGoogleAuthStatus] = useState({
    available: false,
    configured: false,
    hasServerClientId: false,
    hasServerClientSecret: false,
  });
  const [googleConnecting, setGoogleConnecting] = useState(() => {
    const initialSettings = loadSettings();
    const initialSession = loadGoogleSession();
    return Boolean(
      initialSettings.google.autoConnect &&
        initialSession?.refreshToken &&
        !isAccessTokenFresh(initialSession)
    );
  });
  const [googleAuthNotice, setGoogleAuthNotice] = useState(null);
  const [oneDriveConnecting, setOneDriveConnecting] = useState(false);
  const [oneDriveAuthNotice, setOneDriveAuthNotice] = useState(null);
  const [googleProfile, setGoogleProfile] = useState(null);
  const [msProfile, setMsProfile] = useState(null);

  const googleRefreshPromiseRef = useRef(null);
  const settingsRef = useRef(settings);
  const googleSessionRef = useRef(googleSession);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    googleSessionRef.current = googleSession;
  }, [googleSession]);

  const googleToken = isAccessTokenFresh(googleSession, 10_000)
    ? googleSession.accessToken
    : null;
  const googleHasRefreshToken = Boolean(googleSession?.refreshToken);

  // Cross-Cloud Transfer & Delete State
  const [transferMode, setTransferMode] = useState(
    () => loadSettings().general.defaultTransferMode
  );
  const [dragState, setDragState] = useState(null); // { sourceCloud, items } | null
  const clearSourceSelectionRef = useRef(null);
  const [transfers, setTransfers] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null); // { cloud, title, items, clearSelection } | null
  const [pendingRename, setPendingRename] = useState(null); // { cloud, title, item, clearSelection } | null
  const [oneDriveRefreshKey, setOneDriveRefreshKey] = useState(0);
  const [googleRefreshKey, setGoogleRefreshKey] = useState(0);

  const canTransfer = isOneDriveAuth && !!googleToken;

  // Deduplicated silent Google token refresh helper
  const attemptSilentGoogleRefresh = useCallback(async (explicitRefreshToken) => {
    if (googleRefreshPromiseRef.current) {
      return googleRefreshPromiseRef.current;
    }

    const activeSettings = settingsRef.current;
    const currentSession = googleSessionRef.current;
    const refreshToken = explicitRefreshToken || currentSession?.refreshToken;

    if (!refreshToken || !activeSettings.google.autoConnect) {
      return null;
    }

    const effective = getEffectiveGoogleConfig(activeSettings);

    const promise = (async () => {
      try {
        const refreshed = await refreshGoogleAccessToken({
          refreshToken,
          clientId: effective.clientId,
          clientSecret: effective.clientSecretOverride,
        });
        saveGoogleSession(refreshed, true);
        setGoogleSession(refreshed);
        setGoogleAuthNotice(null);
        return refreshed;
      } catch (err) {
        if (err?.code === 'invalid_grant') {
          clearGoogleSession();
          setGoogleSession(null);
          setGoogleProfile(null);
          setGoogleAuthNotice(
            'Your saved Google session expired or was revoked. Sign in once to re-enable auto-connect.'
          );
        } else if (err?.code === 'MISSING_CLIENT_SECRET') {
          setGoogleAuthNotice(
            'Add GOOGLE_CLIENT_SECRET in .env / Vercel or Connection Settings to auto-reconnect Google Drive.'
          );
        } else {
          setGoogleAuthNotice(err?.message || 'Automatic Google reconnection failed.');
        }
        return null;
      } finally {
        googleRefreshPromiseRef.current = null;
      }
    })();

    googleRefreshPromiseRef.current = promise;
    return promise;
  }, []);

  // Check server /api/google-auth status & auto-refresh Google session on mount
  useEffect(() => {
    let cancelled = false;

    fetchGoogleAuthStatus().then((status) => {
      if (!cancelled) {
        setGoogleAuthStatus(status);
      }
    });

    const initialSettings = settingsRef.current;
    const initialSession = googleSessionRef.current;
    if (
      initialSettings.google.autoConnect &&
      initialSession?.refreshToken &&
      !isAccessTokenFresh(initialSession)
    ) {
      attemptSilentGoogleRefresh(initialSession.refreshToken).finally(() => {
        if (!cancelled) {
          setGoogleConnecting(false);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [attemptSilentGoogleRefresh]);

  // Proactive background refresh before the 1-hour Google access token expires
  useEffect(() => {
    if (
      !settings.google.autoConnect ||
      !googleSession?.refreshToken ||
      !googleSession?.expiresAt
    ) {
      return undefined;
    }

    const delayMs = Math.max(
      5_000,
      googleSession.expiresAt - Date.now() - GOOGLE_REFRESH_LEAD_MS
    );

    const timerId = window.setTimeout(() => {
      attemptSilentGoogleRefresh(googleSession.refreshToken);
    }, delayMs);

    return () => window.clearTimeout(timerId);
  }, [
    settings.google.autoConnect,
    googleSession?.refreshToken,
    googleSession?.expiresAt,
    attemptSilentGoogleRefresh,
  ]);

  // Fetch OneDrive Profile & save account hint for future auto-connect
  useEffect(() => {
    if (!isOneDriveAuth) return;
    let cancelled = false;
    getUserProfile(instance)
      .then((profile) => {
        if (cancelled) return;
        setMsProfile(profile);

        const account = instance.getActiveAccount();
        const email =
          account?.username || profile?.mail || profile?.userPrincipalName || '';
        const displayName = profile?.displayName || '';
        if (
          email !== settingsRef.current.onedrive.savedEmail ||
          displayName !== settingsRef.current.onedrive.savedDisplayName
        ) {
          const next = saveSettings({
            ...settingsRef.current,
            onedrive: {
              ...settingsRef.current.onedrive,
              savedEmail: email,
              savedDisplayName: displayName,
            },
          });
          setSettings(next);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOneDriveAuth, instance]);

  // Fetch Google Profile & save account hint for future auto-connect
  useEffect(() => {
    if (!googleToken) return;
    let cancelled = false;
    getGoogleUserProfile(googleToken)
      .then((profile) => {
        if (cancelled) return;
        setGoogleProfile(profile);
        setGoogleAuthNotice(null);

        const email = profile?.emailAddress || '';
        const displayName = profile?.displayName || '';
        if (
          email !== settingsRef.current.google.savedEmail ||
          displayName !== settingsRef.current.google.savedDisplayName
        ) {
          const next = saveSettings({
            ...settingsRef.current,
            google: {
              ...settingsRef.current.google,
              savedEmail: email,
              savedDisplayName: displayName,
            },
          });
          setSettings(next);
        }
      })
      .catch(() => {
        if (cancelled) return;
        const currentSession = googleSessionRef.current;
        if (currentSession?.refreshToken && settingsRef.current.google.autoConnect) {
          setGoogleConnecting(true);
          attemptSilentGoogleRefresh(currentSession.refreshToken).finally(() => {
            if (!cancelled) setGoogleConnecting(false);
          });
        } else {
          clearGoogleSession();
          setGoogleSession(null);
          setGoogleProfile(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [googleToken, attemptSilentGoogleRefresh]);

  const activeMsProfile = isOneDriveAuth ? msProfile : null;
  const activeGoogleProfile = googleToken ? googleProfile : null;

  const handleLoginOneDrive = useCallback(async () => {
    setOneDriveAuthNotice(null);
    setOneDriveConnecting(true);
    try {
      await login(instance, {
        loginHint: settingsRef.current.onedrive.savedEmail || undefined,
      });
    } catch (err) {
      if (err?.code !== 'USER_CANCELLED') {
        console.error('[OneDrive] Sign-in failed:', err);
        const errorCode = err?.errorCode || '';
        const friendlyMessage =
          errorCode === 'timed_out'
            ? 'Microsoft sign-in timed out waiting for the login window. Allow popups or open this app directly in Chrome / Edge (embedded IDE browser tabs block login.microsoftonline.com).'
            : err?.errorMessage ||
              err?.message ||
              'OneDrive sign-in failed. Check your Azure Client ID or popup blocker.';
        setOneDriveAuthNotice(friendlyMessage);
      }
    } finally {
      setOneDriveConnecting(false);
    }
  }, [instance]);

  const handleLogoutOneDrive = useCallback(async () => {
    setOneDriveAuthNotice(null);
    const next = saveSettings({
      ...settingsRef.current,
      onedrive: {
        ...settingsRef.current.onedrive,
        savedEmail: '',
        savedDisplayName: '',
      },
    });
    setSettings(next);
    try {
      await logout(instance);
      setMsProfile(null);
    } catch (err) {
      console.error('[OneDrive] Sign-out failed:', err);
    }
  }, [instance]);

  const handleLoginGoogle = useCallback(
    async (draftGoogleOverrides) => {
      setGoogleAuthNotice(null);

      let activeSettings = settingsRef.current;
      if (
        draftGoogleOverrides &&
        typeof draftGoogleOverrides === 'object' &&
        typeof draftGoogleOverrides.autoConnect === 'boolean'
      ) {
        activeSettings = saveSettings({
          ...activeSettings,
          google: {
            ...activeSettings.google,
            autoConnect: draftGoogleOverrides.autoConnect,
            clientIdOverride: draftGoogleOverrides.clientIdOverride ?? activeSettings.google.clientIdOverride,
            clientSecretOverride:
              draftGoogleOverrides.clientSecretOverride ?? activeSettings.google.clientSecretOverride,
          },
        });
        settingsRef.current = activeSettings;
        setSettings(activeSettings);
      }

      const effective = getEffectiveGoogleConfig(activeSettings);

    if (!effective.clientId) {
      setGoogleAuthNotice(
        'Google Client ID is missing. Add VITE_GOOGLE_CLIENT_ID to .env or enter it in Connection Settings.'
      );
      return;
    }

    const canUseRefreshFlow =
      activeSettings.google.autoConnect &&
      (googleAuthStatus.hasServerClientSecret || Boolean(effective.clientSecretOverride));

    setGoogleConnecting(true);
    try {
      let nextSession;
      if (canUseRefreshFlow) {
        const result = await loginGoogleWithCode({
          clientId: effective.clientId,
          clientSecret: effective.clientSecretOverride,
          hint: activeSettings.google.savedEmail,
        });
        nextSession = {
          accessToken: result.accessToken,
          expiresAt: result.expiresAt,
          refreshToken: result.refreshToken || googleSessionRef.current?.refreshToken || null,
        };
        if (!nextSession.refreshToken) {
          setGoogleAuthNotice(
            'Connected, but Google did not issue a refresh token. Disconnect and reconnect if auto-connect does not persist.'
          );
        }
      } else {
        nextSession = await loginGoogleWithToken({
          clientId: effective.clientId,
          hint: activeSettings.google.savedEmail,
        });
      }

      saveGoogleSession(nextSession, activeSettings.google.autoConnect);
      setGoogleSession(nextSession);
    } catch (err) {
      if (err?.code !== 'POPUP_CLOSED') {
        setGoogleAuthNotice(err?.message || 'Google Drive sign-in failed.');
      }
    } finally {
      setGoogleConnecting(false);
    }
  }, [googleAuthStatus.hasServerClientSecret]);

  const handleLogoutGoogle = useCallback(() => {
    const current = googleSessionRef.current;
    logoutGoogle({
      accessToken: current?.accessToken,
      refreshToken: current?.refreshToken,
    });
    clearGoogleSession();
    setGoogleSession(null);
    setGoogleProfile(null);
    setGoogleAuthNotice(null);

    const next = saveSettings({
      ...settingsRef.current,
      google: {
        ...settingsRef.current.google,
        savedEmail: '',
        savedDisplayName: '',
      },
    });
    setSettings(next);
  }, []);

  const handleGoogleAuthExpired = useCallback(() => {
    const current = googleSessionRef.current;
    if (current?.refreshToken && settingsRef.current.google.autoConnect) {
      setGoogleConnecting(true);
      attemptSilentGoogleRefresh(current.refreshToken).finally(() => {
        setGoogleConnecting(false);
      });
      return;
    }

    clearGoogleSession();
    setGoogleSession(null);
    setGoogleProfile(null);
    setGoogleAuthNotice(
      'Your Google Drive session expired (tokens last 1 hour). Sign in again, or configure GOOGLE_CLIENT_SECRET in Connection Settings for automatic reconnection.'
    );
  }, [attemptSilentGoogleRefresh]);

  const handleTransferModeChange = useCallback((mode) => {
    const normalized = mode === 'move' ? 'move' : 'copy';
    setTransferMode(normalized);
    const next = saveSettings({
      ...settingsRef.current,
      general: {
        ...settingsRef.current.general,
        defaultTransferMode: normalized,
      },
    });
    setSettings(next);
  }, []);

  const handleSaveSettings = useCallback((draft, { reloadForOneDrive = false } = {}) => {
    const prevSettings = settingsRef.current;
    const saved = saveSettings({
      onedrive: {
        ...prevSettings.onedrive,
        autoConnect: draft.onedrive.autoConnect,
        clientIdOverride: draft.onedrive.clientIdOverride,
        authority: draft.onedrive.authority,
      },
      google: {
        ...prevSettings.google,
        autoConnect: draft.google.autoConnect,
        clientIdOverride: draft.google.clientIdOverride,
        clientSecretOverride: draft.google.clientSecretOverride,
      },
      general: {
        defaultTransferMode: draft.general.defaultTransferMode,
      },
    });

    setSettings(saved);
    setTransferMode(saved.general.defaultTransferMode);

    // Sync Google session storage with the updated auto-connect setting
    const currentGoogle = googleSessionRef.current;
    if (currentGoogle) {
      if (!saved.google.autoConnect) {
        const trimmed = {
          accessToken: currentGoogle.accessToken,
          expiresAt: currentGoogle.expiresAt,
          refreshToken: null,
        };
        saveGoogleSession(trimmed, false);
        setGoogleSession(trimmed);
      } else {
        saveGoogleSession(currentGoogle, true);
      }
    }

    // Clear persistent MSAL cache if OneDrive auto-connect was switched off
    if (!saved.onedrive.autoConnect && prevSettings.onedrive.autoConnect) {
      clearMsalLocalCache();
    }

    setSettingsOpen(false);

    if (reloadForOneDrive) {
      window.location.reload();
    }
  }, []);

  const handleResetSettings = useCallback(() => {
    const current = googleSessionRef.current;
    if (current) {
      logoutGoogle({
        accessToken: current.accessToken,
        refreshToken: current.refreshToken,
      });
    }
    resetAllSettings();
    window.location.reload();
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
        onTransferModeChange={handleTransferModeChange}
        canTransfer={canTransfer}
        autoConnectOneDrive={settings.onedrive.autoConnect}
        autoConnectGoogle={settings.google.autoConnect}
        googleHasRefreshToken={googleHasRefreshToken}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Left Pane: OneDrive */}
      <CloudPane
        key={`onedrive-${isOneDriveAuth ? 'auth' : 'locked'}`}
        type="onedrive"
        title="OneDrive"
        isAuthenticated={isOneDriveAuth}
        isConnecting={oneDriveConnecting}
        authNotice={oneDriveAuthNotice}
        onLogin={handleLoginOneDrive}
        onOpenSettings={() => setSettingsOpen(true)}
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
        isConnecting={googleConnecting}
        authNotice={googleAuthNotice}
        accessToken={googleToken}
        onLogin={handleLoginGoogle}
        onOpenSettings={() => setSettingsOpen(true)}
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

      <SettingsModal
        isOpen={settingsOpen}
        settings={settings}
        isOneDriveAuth={isOneDriveAuth}
        oneDriveConnecting={oneDriveConnecting}
        oneDriveAuthNotice={oneDriveAuthNotice}
        msProfile={activeMsProfile}
        isGoogleAuth={!!googleToken}
        googleProfile={activeGoogleProfile}
        googleHasRefreshToken={googleHasRefreshToken}
        googleAuthStatus={googleAuthStatus}
        googleConnecting={googleConnecting}
        googleAuthNotice={googleAuthNotice}
        onSave={handleSaveSettings}
        onReset={handleResetSettings}
        onClose={() => setSettingsOpen(false)}
        onConnectOneDrive={handleLoginOneDrive}
        onDisconnectOneDrive={handleLogoutOneDrive}
        onConnectGoogle={handleLoginGoogle}
        onDisconnectGoogle={handleLogoutGoogle}
      />
    </div>
  );
}
