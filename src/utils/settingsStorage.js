/**
 * Persistent Connection Settings & Session Storage
 * Stores OneDrive & Google Drive connection parameters and preferences in localStorage.
 */

const SETTINGS_KEY = 'mce_settings_v1';
const GOOGLE_SESSION_KEY = 'mce_google_session_v1';
const LEGACY_GOOGLE_TOKEN_KEY = 'google_token';

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

export const DEFAULT_SETTINGS = {
  onedrive: {
    autoConnect: true,
    clientIdOverride: '',
    authority: 'consumers',
    savedEmail: '',
    savedDisplayName: '',
  },
  google: {
    autoConnect: true,
    clientIdOverride: '',
    clientSecretOverride: '',
    savedEmail: '',
    savedDisplayName: '',
  },
  general: {
    defaultTransferMode: 'copy',
  },
};

function mergeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const validAuthorities = new Set(ALLOWED_MS_AUTHORITIES.map((a) => a.value));
  const authority = validAuthorities.has(src.onedrive?.authority)
    ? src.onedrive.authority
    : DEFAULT_SETTINGS.onedrive.authority;

  return {
    onedrive: {
      autoConnect:
        typeof src.onedrive?.autoConnect === 'boolean'
          ? src.onedrive.autoConnect
          : DEFAULT_SETTINGS.onedrive.autoConnect,
      clientIdOverride:
        typeof src.onedrive?.clientIdOverride === 'string'
          ? src.onedrive.clientIdOverride.trim()
          : '',
      authority,
      savedEmail:
        typeof src.onedrive?.savedEmail === 'string'
          ? src.onedrive.savedEmail.trim()
          : '',
      savedDisplayName:
        typeof src.onedrive?.savedDisplayName === 'string'
          ? src.onedrive.savedDisplayName.trim()
          : '',
    },
    google: {
      autoConnect:
        typeof src.google?.autoConnect === 'boolean'
          ? src.google.autoConnect
          : DEFAULT_SETTINGS.google.autoConnect,
      clientIdOverride:
        typeof src.google?.clientIdOverride === 'string'
          ? src.google.clientIdOverride.trim()
          : '',
      clientSecretOverride:
        typeof src.google?.clientSecretOverride === 'string'
          ? src.google.clientSecretOverride.trim()
          : '',
      savedEmail:
        typeof src.google?.savedEmail === 'string'
          ? src.google.savedEmail.trim()
          : '',
      savedDisplayName:
        typeof src.google?.savedDisplayName === 'string'
          ? src.google.savedDisplayName.trim()
          : '',
    },
    general: {
      defaultTransferMode:
        src.general?.defaultTransferMode === 'move' ? 'move' : 'copy',
    },
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return mergeSettings(null);
    return mergeSettings(JSON.parse(raw));
  } catch {
    return mergeSettings(null);
  }
}

export function saveSettings(nextSettings) {
  const normalized = mergeSettings(nextSettings);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.warn('[Settings] Failed to persist settings:', err);
  }
  return normalized;
}

export function updateSettings(updater) {
  const current = loadSettings();
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  return saveSettings(next);
}

export function resetAllSettings() {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    // ignore storage errors
  }
  clearGoogleSession();
  clearMsalLocalCache();
  return mergeSettings(null);
}

export function getEnvDefaults() {
  return {
    oneDriveClientId: (import.meta.env.VITE_CLIENT_ID || '').trim(),
    googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim(),
  };
}

export function getEffectiveOneDriveConfig(settings = loadSettings()) {
  const env = getEnvDefaults();
  const clientId =
    settings.onedrive.clientIdOverride || env.oneDriveClientId || 'YOUR_CLIENT_ID_HERE';
  const authority = settings.onedrive.authority || 'consumers';
  return {
    clientId,
    authority,
    authorityUrl: `https://login.microsoftonline.com/${authority}`,
    cacheLocation: settings.onedrive.autoConnect ? 'localStorage' : 'sessionStorage',
    usingOverride: Boolean(settings.onedrive.clientIdOverride),
  };
}

export function getEffectiveGoogleConfig(settings = loadSettings()) {
  const env = getEnvDefaults();
  const clientId = settings.google.clientIdOverride || env.googleClientId || '';
  return {
    clientId,
    clientSecretOverride: settings.google.clientSecretOverride || '',
    usingOverride: Boolean(settings.google.clientIdOverride),
  };
}

// ── Google Session Storage ──

export function loadGoogleSession() {
  const storages = [localStorage, sessionStorage];
  for (const store of storages) {
    try {
      const raw = store.getItem(GOOGLE_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.accessToken || parsed.refreshToken)) {
          return {
            accessToken: parsed.accessToken || null,
            expiresAt: Number(parsed.expiresAt) || 0,
            refreshToken: parsed.refreshToken || null,
            storage: store === localStorage ? 'local' : 'session',
          };
        }
      }
    } catch {
      // ignore corrupted entry
    }
  }

  // Backward compatibility with v1.3 sessionStorage key
  try {
    const legacy = sessionStorage.getItem(LEGACY_GOOGLE_TOKEN_KEY);
    if (legacy) {
      return {
        accessToken: legacy,
        expiresAt: 0,
        refreshToken: null,
        storage: 'session',
      };
    }
  } catch {
    // ignore
  }

  return null;
}

export function saveGoogleSession(session, persist = true) {
  const payload = {
    accessToken: session.accessToken || null,
    expiresAt: Number(session.expiresAt) || 0,
    refreshToken: persist ? session.refreshToken || null : null,
  };

  try {
    sessionStorage.removeItem(LEGACY_GOOGLE_TOKEN_KEY);
    if (persist) {
      sessionStorage.removeItem(GOOGLE_SESSION_KEY);
      localStorage.setItem(GOOGLE_SESSION_KEY, JSON.stringify(payload));
    } else {
      localStorage.removeItem(GOOGLE_SESSION_KEY);
      sessionStorage.setItem(GOOGLE_SESSION_KEY, JSON.stringify(payload));
    }
  } catch (err) {
    console.warn('[Settings] Failed to persist Google session:', err);
  }
}

export function clearGoogleSession() {
  try {
    localStorage.removeItem(GOOGLE_SESSION_KEY);
    sessionStorage.removeItem(GOOGLE_SESSION_KEY);
    sessionStorage.removeItem(LEGACY_GOOGLE_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function isAccessTokenFresh(session, bufferMs = 60_000) {
  if (!session?.accessToken) return false;
  if (!session.expiresAt) return true; // legacy token without expiry; validated via API
  return session.expiresAt > Date.now() + bufferMs;
}

/**
 * Removes MSAL entries from localStorage when switching off persistent OneDrive sessions.
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
