/**
 * Persistent Multi-Connection Settings & Session Storage (v2)
 * Stores an arbitrary number of OneDrive & Google Drive connections and
 * per-connection OAuth sessions in localStorage / sessionStorage.
 *
 * Automatically migrates legacy v1 settings & Google sessions on first load.
 */

const SETTINGS_V2_KEY = 'mce_settings_v2';
const LEGACY_SETTINGS_V1_KEY = 'mce_settings_v1';

const GOOGLE_SESSIONS_V2_KEY = 'mce_google_sessions_v2';
const LEGACY_GOOGLE_SESSION_V1_KEY = 'mce_google_session_v1';
const LEGACY_GOOGLE_TOKEN_KEY = 'google_token';

export const DEFAULT_ONEDRIVE_ID = 'od-default';
export const DEFAULT_GOOGLE_ID = 'gd-default';

export const ALLOWED_MS_AUTHORITIES = [
  {
    value: 'consumers',
    label: 'Personal Microsoft Accounts (consumers)',
  },
  {
    value: 'common',
    label: 'Personal + Work / School (common)',
  },
  {
    value: 'organizations',
    label: 'Work / School Accounts only (organizations)',
  },
];

const VALID_AUTHORITIES = new Set(ALLOWED_MS_AUTHORITIES.map((a) => a.value));

export function createDefaultConnections() {
  return [
    {
      id: DEFAULT_ONEDRIVE_ID,
      provider: 'onedrive',
      name: 'OneDrive',
      autoConnect: true,
      clientIdOverride: '',
      authority: 'consumers',
      savedAccountId: '',
      savedEmail: '',
      savedDisplayName: '',
    },
    {
      id: DEFAULT_GOOGLE_ID,
      provider: 'google',
      name: 'Google Drive',
      autoConnect: true,
      clientIdOverride: '',
      clientSecretOverride: '',
      savedEmail: '',
      savedDisplayName: '',
    },
  ];
}

export function createConnectionTemplate(provider, existingConnections = []) {
  const isOneDrive = provider === 'onedrive';
  const sameProviderCount = existingConnections.filter((c) => c.provider === provider).length;
  const baseLabel = isOneDrive ? 'OneDrive' : 'Google Drive';
  const name = sameProviderCount === 0 ? baseLabel : `${baseLabel} ${sameProviderCount + 1}`;
  const id = `${isOneDrive ? 'od' : 'gd'}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  if (isOneDrive) {
    return {
      id,
      provider: 'onedrive',
      name,
      autoConnect: true,
      clientIdOverride: '',
      authority: 'consumers',
      savedAccountId: '',
      savedEmail: '',
      savedDisplayName: '',
    };
  }

  return {
    id,
    provider: 'google',
    name,
    autoConnect: true,
    clientIdOverride: '',
    clientSecretOverride: '',
    savedEmail: '',
    savedDisplayName: '',
  };
}

function normalizeConnection(raw, index = 0) {
  const provider = raw?.provider === 'google' ? 'google' : 'onedrive';
  const id =
    typeof raw?.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : `${provider === 'onedrive' ? 'od' : 'gd'}-${index + 1}`;
  const fallbackName = provider === 'onedrive' ? 'OneDrive' : 'Google Drive';
  const name =
    typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : fallbackName;

  if (provider === 'onedrive') {
    const authority = VALID_AUTHORITIES.has(raw?.authority) ? raw.authority : 'consumers';
    return {
      id,
      provider: 'onedrive',
      name,
      autoConnect: typeof raw?.autoConnect === 'boolean' ? raw.autoConnect : true,
      clientIdOverride:
        typeof raw?.clientIdOverride === 'string' ? raw.clientIdOverride.trim() : '',
      authority,
      savedAccountId:
        typeof raw?.savedAccountId === 'string' ? raw.savedAccountId.trim() : '',
      savedEmail: typeof raw?.savedEmail === 'string' ? raw.savedEmail.trim() : '',
      savedDisplayName:
        typeof raw?.savedDisplayName === 'string' ? raw.savedDisplayName.trim() : '',
    };
  }

  return {
    id,
    provider: 'google',
    name,
    autoConnect: typeof raw?.autoConnect === 'boolean' ? raw.autoConnect : true,
    clientIdOverride:
      typeof raw?.clientIdOverride === 'string' ? raw.clientIdOverride.trim() : '',
    clientSecretOverride:
      typeof raw?.clientSecretOverride === 'string' ? raw.clientSecretOverride.trim() : '',
    savedEmail: typeof raw?.savedEmail === 'string' ? raw.savedEmail.trim() : '',
    savedDisplayName:
      typeof raw?.savedDisplayName === 'string' ? raw.savedDisplayName.trim() : '',
  };
}

function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawConnections =
    Array.isArray(src.connections) && src.connections.length > 0
      ? src.connections
      : createDefaultConnections();

  const seenIds = new Set();
  const connections = [];
  rawConnections.forEach((c, idx) => {
    const norm = normalizeConnection(c, idx);
    if (!seenIds.has(norm.id)) {
      seenIds.add(norm.id);
      connections.push(norm);
    }
  });

  const validIds = new Set(connections.map((c) => c.id));
  const firstOneDrive = connections.find((c) => c.provider === 'onedrive')?.id || connections[0]?.id || '';
  const firstGoogle =
    connections.find((c) => c.provider === 'google')?.id ||
    connections[1]?.id ||
    connections[0]?.id ||
    '';

  const activeLeftConnectionId = validIds.has(src.activeLeftConnectionId)
    ? src.activeLeftConnectionId
    : firstOneDrive;
  const activeRightConnectionId = validIds.has(src.activeRightConnectionId)
    ? src.activeRightConnectionId
    : firstGoogle;

  return {
    version: 2,
    connections,
    activeLeftConnectionId,
    activeRightConnectionId,
    general: {
      defaultTransferMode: src.general?.defaultTransferMode === 'move' ? 'move' : 'copy',
    },
  };
}

function migrateLegacySettingsV1() {
  try {
    const rawV1 = localStorage.getItem(LEGACY_SETTINGS_V1_KEY);
    if (!rawV1) return null;
    const v1 = JSON.parse(rawV1);
    const migrated = normalizeSettings({
      version: 2,
      connections: [
        {
          id: DEFAULT_ONEDRIVE_ID,
          provider: 'onedrive',
          name: v1.onedrive?.savedDisplayName
            ? `OneDrive (${v1.onedrive.savedDisplayName})`
            : 'OneDrive',
          autoConnect:
            typeof v1.onedrive?.autoConnect === 'boolean' ? v1.onedrive.autoConnect : true,
          clientIdOverride: v1.onedrive?.clientIdOverride || '',
          authority: v1.onedrive?.authority || 'consumers',
          savedAccountId: '',
          savedEmail: v1.onedrive?.savedEmail || '',
          savedDisplayName: v1.onedrive?.savedDisplayName || '',
        },
        {
          id: DEFAULT_GOOGLE_ID,
          provider: 'google',
          name: v1.google?.savedDisplayName
            ? `Google Drive (${v1.google.savedDisplayName})`
            : 'Google Drive',
          autoConnect:
            typeof v1.google?.autoConnect === 'boolean' ? v1.google.autoConnect : true,
          clientIdOverride: v1.google?.clientIdOverride || '',
          clientSecretOverride: v1.google?.clientSecretOverride || '',
          savedEmail: v1.google?.savedEmail || '',
          savedDisplayName: v1.google?.savedDisplayName || '',
        },
      ],
      activeLeftConnectionId: DEFAULT_ONEDRIVE_ID,
      activeRightConnectionId: DEFAULT_GOOGLE_ID,
      general: {
        defaultTransferMode: v1.general?.defaultTransferMode === 'move' ? 'move' : 'copy',
      },
    });
    localStorage.setItem(SETTINGS_V2_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return null;
  }
}

export function loadSettings() {
  try {
    const rawV2 = localStorage.getItem(SETTINGS_V2_KEY);
    if (rawV2) {
      return normalizeSettings(JSON.parse(rawV2));
    }
    const migrated = migrateLegacySettingsV1();
    if (migrated) return migrated;
    return normalizeSettings(null);
  } catch {
    return normalizeSettings(null);
  }
}

export function saveSettings(nextSettings) {
  const normalized = normalizeSettings(nextSettings);
  try {
    localStorage.setItem(SETTINGS_V2_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.warn('[Settings] Failed to persist settings:', err);
  }
  return normalized;
}

export function resetAllSettings() {
  try {
    localStorage.removeItem(SETTINGS_V2_KEY);
    localStorage.removeItem(LEGACY_SETTINGS_V1_KEY);
  } catch {
    // ignore storage errors
  }
  clearAllGoogleSessions();
  clearMsalLocalCache();
  return normalizeSettings(null);
}

export function getEnvDefaults() {
  return {
    oneDriveClientId: (import.meta.env.VITE_CLIENT_ID || '').trim(),
    googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim(),
  };
}

export function getEffectiveOneDriveConfig(connection) {
  const env = getEnvDefaults();
  const clientId =
    (connection?.clientIdOverride || '').trim() || env.oneDriveClientId || 'YOUR_CLIENT_ID_HERE';
  const authority = VALID_AUTHORITIES.has(connection?.authority)
    ? connection.authority
    : 'consumers';
  const cacheLocation = connection?.autoConnect === false ? 'sessionStorage' : 'localStorage';

  return {
    clientId,
    authority,
    authorityUrl: `https://login.microsoftonline.com/${authority}`,
    cacheLocation,
    usingOverride: Boolean((connection?.clientIdOverride || '').trim()),
  };
}

export function getEffectiveGoogleConfig(connection) {
  const env = getEnvDefaults();
  const clientId = (connection?.clientIdOverride || '').trim() || env.googleClientId || '';
  return {
    clientId,
    clientSecretOverride: (connection?.clientSecretOverride || '').trim(),
    usingOverride: Boolean((connection?.clientIdOverride || '').trim()),
  };
}

// ── Per-Connection Google Session Storage ──

function readSessionMap(store) {
  try {
    const raw = store.getItem(GOOGLE_SESSIONS_V2_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSessionMap(store, map) {
  try {
    if (Object.keys(map).length === 0) {
      store.removeItem(GOOGLE_SESSIONS_V2_KEY);
    } else {
      store.setItem(GOOGLE_SESSIONS_V2_KEY, JSON.stringify(map));
    }
  } catch (err) {
    console.warn('[Settings] Failed to write Google session map:', err);
  }
}

function migrateLegacyGoogleSession() {
  const stores = [localStorage, sessionStorage];
  for (const store of stores) {
    try {
      const raw = store.getItem(LEGACY_GOOGLE_SESSION_V1_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.accessToken || parsed.refreshToken)) {
          const migrated = {
            [DEFAULT_GOOGLE_ID]: {
              accessToken: parsed.accessToken || null,
              expiresAt: Number(parsed.expiresAt) || 0,
              refreshToken: store === localStorage ? parsed.refreshToken || null : null,
            },
          };
          writeSessionMap(store, migrated);
          store.removeItem(LEGACY_GOOGLE_SESSION_V1_KEY);
          return migrated;
        }
      }
    } catch {
      // ignore corrupted legacy entry
    }
  }

  try {
    const legacyToken = sessionStorage.getItem(LEGACY_GOOGLE_TOKEN_KEY);
    if (legacyToken) {
      const migrated = {
        [DEFAULT_GOOGLE_ID]: {
          accessToken: legacyToken,
          expiresAt: 0,
          refreshToken: null,
        },
      };
      writeSessionMap(sessionStorage, migrated);
      sessionStorage.removeItem(LEGACY_GOOGLE_TOKEN_KEY);
      return migrated;
    }
  } catch {
    // ignore
  }

  return null;
}

export function loadAllGoogleSessions() {
  const localMap = readSessionMap(localStorage);
  const sessionMap = readSessionMap(sessionStorage);

  if (Object.keys(localMap).length === 0 && Object.keys(sessionMap).length === 0) {
    const migrated = migrateLegacyGoogleSession();
    if (migrated) return migrated;
  }

  const combined = {};
  for (const [id, s] of Object.entries(sessionMap)) {
    if (s && (s.accessToken || s.refreshToken)) {
      combined[id] = {
        accessToken: s.accessToken || null,
        expiresAt: Number(s.expiresAt) || 0,
        refreshToken: null,
      };
    }
  }
  for (const [id, s] of Object.entries(localMap)) {
    if (s && (s.accessToken || s.refreshToken)) {
      combined[id] = {
        accessToken: s.accessToken || null,
        expiresAt: Number(s.expiresAt) || 0,
        refreshToken: s.refreshToken || null,
      };
    }
  }
  return combined;
}

export function saveGoogleSessionForConnection(connectionId, session, persist = true) {
  if (!connectionId) return;
  const payload = {
    accessToken: session?.accessToken || null,
    expiresAt: Number(session?.expiresAt) || 0,
    refreshToken: persist ? session?.refreshToken || null : null,
  };

  const localMap = readSessionMap(localStorage);
  const sessionMap = readSessionMap(sessionStorage);

  if (persist) {
    delete sessionMap[connectionId];
    localMap[connectionId] = payload;
  } else {
    delete localMap[connectionId];
    sessionMap[connectionId] = payload;
  }

  writeSessionMap(localStorage, localMap);
  writeSessionMap(sessionStorage, sessionMap);
}

export function clearGoogleSessionForConnection(connectionId) {
  if (!connectionId) return;
  const localMap = readSessionMap(localStorage);
  const sessionMap = readSessionMap(sessionStorage);
  delete localMap[connectionId];
  delete sessionMap[connectionId];
  writeSessionMap(localStorage, localMap);
  writeSessionMap(sessionStorage, sessionMap);
}

export function clearAllGoogleSessions() {
  try {
    localStorage.removeItem(GOOGLE_SESSIONS_V2_KEY);
    sessionStorage.removeItem(GOOGLE_SESSIONS_V2_KEY);
    localStorage.removeItem(LEGACY_GOOGLE_SESSION_V1_KEY);
    sessionStorage.removeItem(LEGACY_GOOGLE_SESSION_V1_KEY);
    sessionStorage.removeItem(LEGACY_GOOGLE_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function isAccessTokenFresh(session, bufferMs = 60_000) {
  if (!session?.accessToken) return false;
  if (!session.expiresAt) return true;
  return session.expiresAt > Date.now() + bufferMs;
}

/**
 * Removes MSAL entries from localStorage (used during full reset).
 */
export function clearMsalLocalCache() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith('msal.') ||
          key.includes('.msal.') ||
          key.includes('login.windows.net') ||
          key.includes('login.microsoftonline.com'))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
