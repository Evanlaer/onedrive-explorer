import './App.css';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import CloudPane from './components/CloudPane/CloudPane';
import TransferToast from './components/TransferToast/TransferToast';
import ConfirmModal from './components/ConfirmModal/ConfirmModal';
import RenameModal from './components/RenameModal/RenameModal';
import SettingsModal from './components/SettingsModal/SettingsModal';
import {
  resolveOneDriveSession,
  loginOneDriveConnection,
  logoutOneDriveConnection,
} from './auth/authService';
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
  loadAllGoogleSessions,
  saveGoogleSessionForConnection,
  clearGoogleSessionForConnection,
  isAccessTokenFresh,
} from './utils/settingsStorage';

const BATCH_CONCURRENCY = 2;
const DELETE_CONCURRENCY = 3;
const GOOGLE_REFRESH_LEAD_MS = 3 * 60 * 1000; // Refresh 3 minutes before expiry

export default function App() {
  // Persisted Multi-Connection Settings
  const [settings, setSettings] = useState(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Per-connection runtime auth & profile state
  const [oneDriveAuthMap, setOneDriveAuthMap] = useState({}); // { [id]: { msalInstance, accountId, email, displayName } }
  const [googleSessionMap, setGoogleSessionMap] = useState(() => loadAllGoogleSessions());
  const [profileMap, setProfileMap] = useState({}); // { [id]: { displayName, email } }
  const [connectingMap, setConnectingMap] = useState(() => {
    const initialSettings = loadSettings();
    const initialGoogleSessions = loadAllGoogleSessions();
    const map = {};
    initialSettings.connections.forEach((c) => {
      if (c.provider === 'google') {
        const s = initialGoogleSessions[c.id];
        if (c.autoConnect && s?.refreshToken && !isAccessTokenFresh(s)) {
          map[c.id] = true;
        }
      } else if (c.provider === 'onedrive' && (c.savedAccountId || c.savedEmail)) {
        map[c.id] = true;
      }
    });
    return map;
  });
  const [authNoticeMap, setAuthNoticeMap] = useState({});
  const [googleAuthStatus, setGoogleAuthStatus] = useState({
    available: false,
    configured: false,
    hasServerClientId: false,
    hasServerClientSecret: false,
  });

  // Cross-account transfer, selection & modal state
  const [transferMode, setTransferMode] = useState(
    () => loadSettings().general.defaultTransferMode
  );
  const [dragState, setDragState] = useState(null); // { sourcePaneId, sourceConnectionId, sourceCloud, items } | null
  const clearSourceSelectionRef = useRef(null);
  const [transfers, setTransfers] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingRename, setPendingRename] = useState(null);
  const [refreshKeys, setRefreshKeys] = useState({});

  // Refs for stable async callbacks
  const settingsRef = useRef(settings);
  const oneDriveAuthRef = useRef(oneDriveAuthMap);
  const googleSessionRef = useRef(googleSessionMap);
  const googleRefreshPromisesRef = useRef(new Map());

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    oneDriveAuthRef.current = oneDriveAuthMap;
  }, [oneDriveAuthMap]);

  useEffect(() => {
    googleSessionRef.current = googleSessionMap;
  }, [googleSessionMap]);

  const setConnConnecting = useCallback((connId, value) => {
    setConnectingMap((prev) => ({ ...prev, [connId]: value }));
  }, []);

  const setConnNotice = useCallback((connId, message) => {
    setAuthNoticeMap((prev) => ({ ...prev, [connId]: message }));
  }, []);

  const refreshConnection = useCallback((connId) => {
    if (!connId) return;
    setRefreshKeys((prev) => ({ ...prev, [connId]: (prev[connId] || 0) + 1 }));
  }, []);

  const persistConnectionMeta = useCallback((connId, patch) => {
    const current = settingsRef.current;
    const target = current.connections.find((c) => c.id === connId);
    if (!target) return;

    const changed = Object.entries(patch).some(([k, v]) => target[k] !== v);
    if (!changed) return;

    const next = saveSettings({
      ...current,
      connections: current.connections.map((c) =>
        c.id === connId ? { ...c, ...patch } : c
      ),
    });
    settingsRef.current = next;
    setSettings(next);
  }, []);

  // Deduplicated silent Google token refresh per connection
  const attemptSilentGoogleRefresh = useCallback(
    async (connId, explicitRefreshToken) => {
      if (googleRefreshPromisesRef.current.has(connId)) {
        return googleRefreshPromisesRef.current.get(connId);
      }

      const conn = settingsRef.current.connections.find((c) => c.id === connId);
      const currentSession = googleSessionRef.current[connId];
      const refreshToken = explicitRefreshToken || currentSession?.refreshToken;

      if (!conn || conn.provider !== 'google' || !refreshToken || !conn.autoConnect) {
        return null;
      }

      const effective = getEffectiveGoogleConfig(conn);

      const promise = (async () => {
        try {
          const refreshed = await refreshGoogleAccessToken({
            refreshToken,
            clientId: effective.clientId,
            clientSecret: effective.clientSecretOverride,
          });
          saveGoogleSessionForConnection(connId, refreshed, true);
          setGoogleSessionMap((prev) => ({ ...prev, [connId]: refreshed }));
          setConnNotice(connId, null);
          return refreshed;
        } catch (err) {
          if (err?.code === 'invalid_grant') {
            clearGoogleSessionForConnection(connId);
            setGoogleSessionMap((prev) => {
              const next = { ...prev };
              delete next[connId];
              return next;
            });
            setProfileMap((prev) => {
              const next = { ...prev };
              delete next[connId];
              return next;
            });
            setConnNotice(
              connId,
              'Your saved Google session expired or was revoked. Sign in once to re-enable auto-connect.'
            );
          } else if (err?.code === 'MISSING_CLIENT_SECRET') {
            setConnNotice(
              connId,
              'Add GOOGLE_CLIENT_SECRET in .env / Vercel or Connection Settings to auto-reconnect Google Drive.'
            );
          } else {
            setConnNotice(connId, err?.message || 'Automatic Google reconnection failed.');
          }
          return null;
        } finally {
          googleRefreshPromisesRef.current.delete(connId);
        }
      })();

      googleRefreshPromisesRef.current.set(connId, promise);
      return promise;
    },
    [setConnNotice]
  );

  // Hydrate profile for a connected OneDrive connection
  const loadOneDriveProfile = useCallback(
    async (connId, oneDriveAuth) => {
      try {
        const profile = await getUserProfile(oneDriveAuth);
        const displayName = profile?.displayName || oneDriveAuth.displayName || '';
        const email =
          profile?.mail || profile?.userPrincipalName || oneDriveAuth.email || '';
        setProfileMap((prev) => ({ ...prev, [connId]: { displayName, email } }));
        persistConnectionMeta(connId, {
          savedAccountId: oneDriveAuth.accountId,
          savedEmail: email,
          savedDisplayName: displayName,
        });
      } catch {
        if (oneDriveAuth.email || oneDriveAuth.displayName) {
          setProfileMap((prev) => ({
            ...prev,
            [connId]: {
              displayName: oneDriveAuth.displayName || '',
              email: oneDriveAuth.email || '',
            },
          }));
        }
      }
    },
    [persistConnectionMeta]
  );

  // Hydrate profile for a connected Google Drive connection
  const loadGoogleProfile = useCallback(
    async (connId, accessToken) => {
      try {
        const profile = await getGoogleUserProfile(accessToken);
        const displayName = profile?.displayName || '';
        const email = profile?.emailAddress || '';
        setProfileMap((prev) => ({ ...prev, [connId]: { displayName, email } }));
        setConnNotice(connId, null);
        persistConnectionMeta(connId, {
          savedEmail: email,
          savedDisplayName: displayName,
        });
      } catch {
        const session = googleSessionRef.current[connId];
        const conn = settingsRef.current.connections.find((c) => c.id === connId);
        if (session?.refreshToken && conn?.autoConnect) {
          setConnConnecting(connId, true);
          const refreshed = await attemptSilentGoogleRefresh(connId, session.refreshToken);
          setConnConnecting(connId, false);
          if (refreshed?.accessToken) {
            return;
          }
        }
        clearGoogleSessionForConnection(connId);
        setGoogleSessionMap((prev) => {
          const next = { ...prev };
          delete next[connId];
          return next;
        });
        setProfileMap((prev) => {
          const next = { ...prev };
          delete next[connId];
          return next;
        });
      }
    },
    [persistConnectionMeta, setConnNotice, setConnConnecting, attemptSilentGoogleRefresh]
  );

  // Startup bootstrap: check /api/google-auth, restore all OneDrive & Google connections
  useEffect(() => {
    let cancelled = false;

    fetchGoogleAuthStatus().then((status) => {
      if (!cancelled) setGoogleAuthStatus(status);
    });

    const initialConnections = settingsRef.current.connections;
    const initialGoogleSessions = googleSessionRef.current;

    // 1. Restore OneDrive connections sequentially so each claims a distinct Microsoft account
    (async () => {
      const claimedAccountIds = new Set();
      for (const conn of initialConnections) {
        if (cancelled) break;
        if (conn.provider !== 'onedrive') continue;
        try {
          const { msalInstance, account } = await resolveOneDriveSession(
            conn,
            claimedAccountIds
          );
          if (cancelled) break;
          if (account) {
            claimedAccountIds.add(account.homeAccountId);
            const authObj = {
              msalInstance,
              accountId: account.homeAccountId,
              email: account.username || '',
              displayName: account.name || '',
            };
            setOneDriveAuthMap((prev) => ({ ...prev, [conn.id]: authObj }));
            loadOneDriveProfile(conn.id, authObj);
          }
        } catch (err) {
          console.warn(`[OneDrive] Failed to restore ${conn.name}:`, err);
        } finally {
          if (!cancelled) {
            setConnConnecting(conn.id, false);
          }
        }
      }
    })();

    // 2. Restore / refresh Google Drive connections
    initialConnections.forEach((conn) => {
      if (conn.provider !== 'google') return;
      const session = initialGoogleSessions[conn.id];
      if (!session) return;

      if (isAccessTokenFresh(session, 10_000)) {
        loadGoogleProfile(conn.id, session.accessToken);
      } else if (conn.autoConnect && session.refreshToken) {
        attemptSilentGoogleRefresh(conn.id, session.refreshToken)
          .then((refreshed) => {
            if (!cancelled && refreshed?.accessToken) {
              loadGoogleProfile(conn.id, refreshed.accessToken);
            }
          })
          .finally(() => {
            if (!cancelled) setConnConnecting(conn.id, false);
          });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [attemptSilentGoogleRefresh, loadOneDriveProfile, loadGoogleProfile, setConnConnecting]);

  // Proactive background refresh timers for ALL connected Google Drive accounts
  useEffect(() => {
    const timers = [];
    settings.connections.forEach((conn) => {
      if (conn.provider !== 'google' || !conn.autoConnect) return;
      const session = googleSessionMap[conn.id];
      if (!session?.refreshToken || !session?.expiresAt) return;

      const delayMs = Math.max(
        5_000,
        session.expiresAt - Date.now() - GOOGLE_REFRESH_LEAD_MS
      );
      const id = window.setTimeout(() => {
        attemptSilentGoogleRefresh(conn.id, session.refreshToken);
      }, delayMs);
      timers.push(id);
    });

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [settings.connections, googleSessionMap, attemptSilentGoogleRefresh]);

  // Compute unified runtime status map for all connections
  const connectionStates = useMemo(() => {
    const map = {};
    settings.connections.forEach((conn) => {
      const profile = profileMap[conn.id];
      if (conn.provider === 'onedrive') {
        const od = oneDriveAuthMap[conn.id];
        map[conn.id] = {
          isConnected: Boolean(od?.msalInstance && od?.accountId),
          isConnecting: Boolean(connectingMap[conn.id]),
          authNotice: authNoticeMap[conn.id] || null,
          oneDriveAuth: od || null,
          accessToken: null,
          hasRefreshToken: false,
          displayName: profile?.displayName || od?.displayName || conn.savedDisplayName || '',
          email: profile?.email || od?.email || conn.savedEmail || '',
        };
      } else {
        const gs = googleSessionMap[conn.id];
        const freshToken = isAccessTokenFresh(gs, 10_000) ? gs.accessToken : null;
        map[conn.id] = {
          isConnected: Boolean(freshToken),
          isConnecting: Boolean(connectingMap[conn.id]),
          authNotice: authNoticeMap[conn.id] || null,
          oneDriveAuth: null,
          accessToken: freshToken,
          hasRefreshToken: Boolean(gs?.refreshToken),
          displayName: profile?.displayName || conn.savedDisplayName || '',
          email: profile?.email || conn.savedEmail || '',
        };
      }
    });
    return map;
  }, [settings.connections, oneDriveAuthMap, googleSessionMap, profileMap, connectingMap, authNoticeMap]);

  // Enriched connections list for pick lists & Sidebar
  const enrichedConnections = useMemo(
    () =>
      settings.connections.map((conn) => {
        const st = connectionStates[conn.id] || {};
        return {
          ...conn,
          isConnected: Boolean(st.isConnected),
          isConnecting: Boolean(st.isConnecting),
          hasRefreshToken: Boolean(st.hasRefreshToken),
          displayName: st.displayName || '',
          email: st.email || '',
        };
      }),
    [settings.connections, connectionStates]
  );

  const leftConnection =
    settings.connections.find((c) => c.id === settings.activeLeftConnectionId) ||
    settings.connections[0];
  const rightConnection =
    settings.connections.find((c) => c.id === settings.activeRightConnectionId) ||
    settings.connections[1] ||
    settings.connections[0];

  const leftState = (leftConnection && connectionStates[leftConnection.id]) || {};
  const rightState = (rightConnection && connectionStates[rightConnection.id]) || {};

  const sameConnectionInBothPanes =
    Boolean(leftConnection && rightConnection) &&
    leftConnection.id === rightConnection.id;

  const canTransfer =
    Boolean(leftState.isConnected) &&
    Boolean(rightState.isConnected) &&
    !sameConnectionInBothPanes;

  const hasAnyAutoConnect = settings.connections.some((c) => c.autoConnect);

  // Pane pick-list selection handlers
  const handleSelectPaneConnection = useCallback((paneId, connectionId) => {
    const current = settingsRef.current;
    if (!current.connections.some((c) => c.id === connectionId)) return;
    const patch =
      paneId === 'left'
        ? { activeLeftConnectionId: connectionId }
        : { activeRightConnectionId: connectionId };
    const next = saveSettings({ ...current, ...patch });
    settingsRef.current = next;
    setSettings(next);
  }, []);

  const handleQuickSelectConnection = useCallback((connectionId) => {
    const current = settingsRef.current;
    if (
      current.activeLeftConnectionId === connectionId ||
      current.activeRightConnectionId === connectionId
    ) {
      return;
    }
    const target = current.connections.find((c) => c.id === connectionId);
    if (!target) return;

    // Default OneDrive clicks to Left pane and Google Drive clicks to Right pane
    const paneKey =
      target.provider === 'google'
        ? 'activeRightConnectionId'
        : 'activeLeftConnectionId';
    const next = saveSettings({ ...current, [paneKey]: connectionId });
    settingsRef.current = next;
    setSettings(next);
  }, []);

  // Save draft settings (also used before connecting newly added/edited accounts in SettingsModal)
  const persistDraftSettings = useCallback(({ connections, general }) => {
    const prev = settingsRef.current;
    const prevById = new Map(prev.connections.map((c) => [c.id, c]));

    const mergedConnections = connections.map((draft) => {
      const existing = prevById.get(draft.id);
      return {
        ...draft,
        savedAccountId: existing?.savedAccountId || draft.savedAccountId || '',
        savedEmail: existing?.savedEmail || draft.savedEmail || '',
        savedDisplayName: existing?.savedDisplayName || draft.savedDisplayName || '',
      };
    });

    const next = saveSettings({
      ...prev,
      connections: mergedConnections,
      general: general || prev.general,
    });

    const nextIds = new Set(next.connections.map((c) => c.id));

    // Clean up removed connections' Google sessions & runtime state
    prev.connections.forEach((oldConn) => {
      if (!nextIds.has(oldConn.id)) {
        if (oldConn.provider === 'google') {
          clearGoogleSessionForConnection(oldConn.id);
          setGoogleSessionMap((m) => {
            const copy = { ...m };
            delete copy[oldConn.id];
            return copy;
          });
        } else {
          setOneDriveAuthMap((m) => {
            const copy = { ...m };
            delete copy[oldConn.id];
            return copy;
          });
        }
      }
    });

    // Sync Google session persistence if autoConnect toggled on any Google connection
    next.connections.forEach((conn) => {
      if (conn.provider !== 'google') return;
      const gs = googleSessionRef.current[conn.id];
      if (!gs) return;
      if (!conn.autoConnect && gs.refreshToken) {
        const trimmed = {
          accessToken: gs.accessToken,
          expiresAt: gs.expiresAt,
          refreshToken: null,
        };
        saveGoogleSessionForConnection(conn.id, trimmed, false);
        setGoogleSessionMap((m) => ({ ...m, [conn.id]: trimmed }));
      } else {
        saveGoogleSessionForConnection(conn.id, gs, conn.autoConnect);
      }
    });

    settingsRef.current = next;
    setSettings(next);
    setTransferMode(next.general.defaultTransferMode);
    return next;
  }, []);

  // Connect any OneDrive or Google Drive connection by ID or draft object
  const handleConnectConnection = useCallback(
    async (connOrId, settingsDraft) => {
      let currentSettings = settingsRef.current;
      if (settingsDraft?.draftConnections) {
        currentSettings = persistDraftSettings({
          connections: settingsDraft.draftConnections,
          general: { defaultTransferMode: settingsDraft.defaultTransferMode },
        });
      }

      const connId = typeof connOrId === 'string' ? connOrId : connOrId?.id;
      const conn = currentSettings.connections.find((c) => c.id === connId);
      if (!conn) return;

      setConnNotice(conn.id, null);
      setConnConnecting(conn.id, true);

      try {
        if (conn.provider === 'onedrive') {
          const { msalInstance, account } = await loginOneDriveConnection(conn);
          if (account) {
            const authObj = {
              msalInstance,
              accountId: account.homeAccountId,
              email: account.username || '',
              displayName: account.name || '',
            };
            setOneDriveAuthMap((prev) => ({ ...prev, [conn.id]: authObj }));
            await loadOneDriveProfile(conn.id, authObj);
          }
        } else {
          const effective = getEffectiveGoogleConfig(conn);
          if (!effective.clientId) {
            setConnNotice(
              conn.id,
              'Google Client ID is missing. Add VITE_GOOGLE_CLIENT_ID to .env or enter it in Connection Settings.'
            );
            return;
          }

          const canUseRefreshFlow =
            conn.autoConnect &&
            (googleAuthStatus.hasServerClientSecret || Boolean(effective.clientSecretOverride));

          let nextSession;
          if (canUseRefreshFlow) {
            const result = await loginGoogleWithCode({
              clientId: effective.clientId,
              clientSecret: effective.clientSecretOverride,
              hint: conn.savedEmail,
            });
            nextSession = {
              accessToken: result.accessToken,
              expiresAt: result.expiresAt,
              refreshToken:
                result.refreshToken || googleSessionRef.current[conn.id]?.refreshToken || null,
            };
            if (!nextSession.refreshToken) {
              setConnNotice(
                conn.id,
                'Connected, but Google did not issue a refresh token. Disconnect and reconnect if auto-connect does not persist.'
              );
            }
          } else {
            nextSession = await loginGoogleWithToken({
              clientId: effective.clientId,
              hint: conn.savedEmail,
            });
          }

          saveGoogleSessionForConnection(conn.id, nextSession, conn.autoConnect);
          setGoogleSessionMap((prev) => ({ ...prev, [conn.id]: nextSession }));
          await loadGoogleProfile(conn.id, nextSession.accessToken);
        }
      } catch (err) {
        if (err?.code !== 'USER_CANCELLED' && err?.code !== 'POPUP_CLOSED') {
          console.error(`[${conn.name}] Sign-in failed:`, err);
          const errorCode = err?.errorCode || '';
          const friendlyMessage =
            errorCode === 'timed_out'
              ? 'Microsoft sign-in timed out waiting for the login window. Allow popups or open this app directly in Chrome / Edge (embedded IDE browser tabs block login.microsoftonline.com).'
              : err?.errorMessage ||
                err?.message ||
                `Sign-in failed for ${conn.name}.`;
          setConnNotice(conn.id, friendlyMessage);
        }
      } finally {
        setConnConnecting(conn.id, false);
      }
    },
    [
      persistDraftSettings,
      googleAuthStatus.hasServerClientSecret,
      setConnNotice,
      setConnConnecting,
      loadOneDriveProfile,
      loadGoogleProfile,
    ]
  );

  const handleDisconnectConnection = useCallback(
    async (connId) => {
      const conn = settingsRef.current.connections.find((c) => c.id === connId);
      if (!conn) return;

      setConnNotice(connId, null);

      if (conn.provider === 'onedrive') {
        const od = oneDriveAuthRef.current[connId];
        persistConnectionMeta(connId, {
          savedAccountId: '',
          savedEmail: '',
          savedDisplayName: '',
        });
        setOneDriveAuthMap((prev) => {
          const next = { ...prev };
          delete next[connId];
          return next;
        });
        setProfileMap((prev) => {
          const next = { ...prev };
          delete next[connId];
          return next;
        });
        try {
          await logoutOneDriveConnection(conn, od?.accountId);
        } catch (err) {
          console.error(`[${conn.name}] Sign-out failed:`, err);
        }
      } else {
        const gs = googleSessionRef.current[connId];
        logoutGoogle({
          accessToken: gs?.accessToken,
          refreshToken: gs?.refreshToken,
        });
        clearGoogleSessionForConnection(connId);
        setGoogleSessionMap((prev) => {
          const next = { ...prev };
          delete next[connId];
          return next;
        });
        setProfileMap((prev) => {
          const next = { ...prev };
          delete next[connId];
          return next;
        });
        persistConnectionMeta(connId, {
          savedEmail: '',
          savedDisplayName: '',
        });
      }
    },
    [persistConnectionMeta, setConnNotice]
  );

  const handleGoogleAuthExpired = useCallback(
    (connId) => {
      const conn = settingsRef.current.connections.find((c) => c.id === connId);
      const gs = googleSessionRef.current[connId];
      if (gs?.refreshToken && conn?.autoConnect) {
        setConnConnecting(connId, true);
        attemptSilentGoogleRefresh(connId, gs.refreshToken).finally(() => {
          setConnConnecting(connId, false);
        });
        return;
      }

      clearGoogleSessionForConnection(connId);
      setGoogleSessionMap((prev) => {
        const next = { ...prev };
        delete next[connId];
        return next;
      });
      setProfileMap((prev) => {
        const next = { ...prev };
        delete next[connId];
        return next;
      });
      setConnNotice(
        connId,
        'Your Google Drive session expired (tokens last 1 hour). Sign in again, or configure GOOGLE_CLIENT_SECRET in Connection Settings for automatic reconnection.'
      );
    },
    [attemptSilentGoogleRefresh, setConnConnecting, setConnNotice]
  );

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
    settingsRef.current = next;
    setSettings(next);
  }, []);

  const handleSaveSettings = useCallback(
    (draft) => {
      persistDraftSettings(draft);
      setSettingsOpen(false);
    },
    [persistDraftSettings]
  );

  const handleResetSettings = useCallback(() => {
    Object.values(googleSessionRef.current).forEach((gs) => {
      if (gs) {
        logoutGoogle({ accessToken: gs.accessToken, refreshToken: gs.refreshToken });
      }
    });
    resetAllSettings();
    window.location.reload();
  }, []);

  // Build transfer endpoint descriptor for any connected account
  const buildEndpoint = useCallback((connectionId) => {
    const conn = settingsRef.current.connections.find((c) => c.id === connectionId);
    if (!conn) return null;

    if (conn.provider === 'onedrive') {
      const od = oneDriveAuthRef.current[connectionId];
      if (!od?.msalInstance || !od?.accountId) return null;
      return {
        provider: 'onedrive',
        connectionId: conn.id,
        label: conn.name,
        oneDriveAuth: od,
        accessToken: null,
      };
    }

    const gs = googleSessionRef.current[connectionId];
    if (!isAccessTokenFresh(gs, 10_000)) return null;
    return {
      provider: 'google',
      connectionId: conn.id,
      label: conn.name,
      oneDriveAuth: null,
      accessToken: gs.accessToken,
    };
  }, []);

  const handleDragStartItems = useCallback((dragPayload, clearSelectionFn) => {
    clearSourceSelectionRef.current = clearSelectionFn || null;
    setDragState(dragPayload);
  }, []);

  const handleDragEndItems = useCallback(() => {
    setDragState(null);
  }, []);

  const updateTransfer = useCallback((id, patch) => {
    setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const handleDropItems = useCallback(
    async ({
      sourceConnectionId,
      items,
      targetConnectionId,
      targetFolderId,
      targetFolderName,
      mode,
    }) => {
      setDragState(null);
      clearSourceSelectionRef.current?.();
      clearSourceSelectionRef.current = null;

      if (!items?.length || sourceConnectionId === targetConnectionId) return;

      const source = buildEndpoint(sourceConnectionId);
      const target = buildEndpoint(targetConnectionId);
      if (!source || !target) return;

      const jobs = items.map((item, idx) => ({
        transferId: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
        item,
      }));

      const entries = jobs.map(({ transferId, item }) => ({
        id: transferId,
        itemName: item.name,
        isFolder: isItemFolder(item),
        sourceCloud: source.provider,
        targetCloud: target.provider,
        sourceLabel: source.label,
        targetLabel: target.label,
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
              source,
              target,
              targetFolderId,
              mode,
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
                ? `Completed with ${result.warnings.length} warning${
                    result.warnings.length === 1 ? '' : 's'
                  }`
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

      if (anyTransferred) {
        refreshConnection(target.connectionId);
      }
      if (anySourceDeleted) {
        refreshConnection(source.connectionId);
      }
    },
    [buildEndpoint, updateTransfer, refreshConnection]
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

    const { connectionId, cloud, title, items, clearSelection } = request;
    clearSelection?.();

    const endpoint = buildEndpoint(connectionId);
    if (!endpoint) return;

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
      sourceLabel: title,
      targetLabel: title,
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
          await deleteCloudItem({ item, endpoint });
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
      refreshConnection(connectionId);
    }
  }, [pendingDelete, buildEndpoint, updateTransfer, refreshConnection]);

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
      const { connectionId, cloud, title, item, clearSelection } = pendingRename;
      const endpoint = buildEndpoint(connectionId);
      if (!endpoint) throw new Error('Account is no longer connected.');

      await renameCloudItem({ item, endpoint, newName });

      setPendingRename(null);
      clearSelection?.();
      refreshConnection(connectionId);

      const entry = {
        id: `ren-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        itemName: newName,
        isFolder: isItemFolder(item),
        sourceCloud: cloud,
        targetCloud: cloud,
        sourceLabel: title,
        targetLabel: title,
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
    [pendingRename, buildEndpoint, refreshConnection]
  );

  const handleDismissTransfer = useCallback((id) => {
    setTransfers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleClearCompleted = useCallback(() => {
    setTransfers((prev) =>
      prev.filter((t) => t.status === 'active' || t.status === 'queued')
    );
  }, []);

  return (
    <div className="app-shell">
      <Sidebar
        connections={enrichedConnections}
        activeLeftId={leftConnection?.id || ''}
        activeRightId={rightConnection?.id || ''}
        onConnectConnection={(connId) => handleConnectConnection(connId)}
        onDisconnectConnection={handleDisconnectConnection}
        onQuickSelectConnection={handleQuickSelectConnection}
        transferMode={transferMode}
        onTransferModeChange={handleTransferModeChange}
        canTransfer={canTransfer}
        sameConnectionInBothPanes={sameConnectionInBothPanes}
        hasAutoConnect={hasAnyAutoConnect}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Left Pane */}
      <CloudPane
        key={`left-${leftConnection?.id || 'none'}-${leftState.isConnected ? 'auth' : 'locked'}`}
        paneId="left"
        connection={leftConnection}
        connections={enrichedConnections}
        onSelectConnection={(id) => handleSelectPaneConnection('left', id)}
        isAuthenticated={Boolean(leftState.isConnected)}
        isConnecting={Boolean(leftState.isConnecting)}
        authNotice={leftState.authNotice || null}
        oneDriveAuth={leftState.oneDriveAuth || null}
        accessToken={leftState.accessToken || null}
        onLogin={() => leftConnection && handleConnectConnection(leftConnection.id)}
        onOpenSettings={() => setSettingsOpen(true)}
        refreshKey={(leftConnection && refreshKeys[leftConnection.id]) || 0}
        onRefresh={() => leftConnection && refreshConnection(leftConnection.id)}
        canTransfer={canTransfer}
        dragState={dragState}
        transferMode={transferMode}
        onDragStartItems={handleDragStartItems}
        onDragEndItems={handleDragEndItems}
        onDropItems={handleDropItems}
        onRequestDelete={handleRequestDelete}
        onRequestRename={handleRequestRename}
        onAuthExpired={() => leftConnection && handleGoogleAuthExpired(leftConnection.id)}
      />

      {/* Right Pane */}
      <CloudPane
        key={`right-${rightConnection?.id || 'none'}-${rightState.isConnected ? 'auth' : 'locked'}`}
        paneId="right"
        connection={rightConnection}
        connections={enrichedConnections}
        onSelectConnection={(id) => handleSelectPaneConnection('right', id)}
        isAuthenticated={Boolean(rightState.isConnected)}
        isConnecting={Boolean(rightState.isConnecting)}
        authNotice={rightState.authNotice || null}
        oneDriveAuth={rightState.oneDriveAuth || null}
        accessToken={rightState.accessToken || null}
        onLogin={() => rightConnection && handleConnectConnection(rightConnection.id)}
        onOpenSettings={() => setSettingsOpen(true)}
        refreshKey={(rightConnection && refreshKeys[rightConnection.id]) || 0}
        onRefresh={() => rightConnection && refreshConnection(rightConnection.id)}
        canTransfer={canTransfer}
        dragState={dragState}
        transferMode={transferMode}
        onDragStartItems={handleDragStartItems}
        onDragEndItems={handleDragEndItems}
        onDropItems={handleDropItems}
        onRequestDelete={handleRequestDelete}
        onRequestRename={handleRequestRename}
        onAuthExpired={() => rightConnection && handleGoogleAuthExpired(rightConnection.id)}
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
        connectionStates={connectionStates}
        googleAuthStatus={googleAuthStatus}
        onSave={handleSaveSettings}
        onReset={handleResetSettings}
        onClose={() => setSettingsOpen(false)}
        onConnectConnection={handleConnectConnection}
        onDisconnectConnection={handleDisconnectConnection}
      />
    </div>
  );
}
