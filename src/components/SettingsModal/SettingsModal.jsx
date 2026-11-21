import './SettingsModal.css';
import { useState, useEffect } from 'react';
import {
  FiSettings,
  FiX,
  FiCloud,
  FiHardDrive,
  FiCheckCircle,
  FiAlertCircle,
  FiEye,
  FiEyeOff,
  FiCopy,
  FiMove,
  FiRotateCcw,
  FiLogIn,
  FiLogOut,
  FiRefreshCw,
} from 'react-icons/fi';
import {
  ALLOWED_MS_AUTHORITIES,
  getEnvDefaults,
} from '../../utils/settingsStorage';

function maskId(value) {
  if (!value) return '';
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function SettingsDialogContent({
  settings,
  isOneDriveAuth,
  oneDriveConnecting,
  oneDriveAuthNotice,
  msProfile,
  isGoogleAuth,
  googleProfile,
  googleHasRefreshToken,
  googleAuthStatus,
  googleConnecting,
  googleAuthNotice,
  onSave,
  onReset,
  onClose,
  onConnectOneDrive,
  onDisconnectOneDrive,
  onConnectGoogle,
  onDisconnectGoogle,
}) {
  const envDefaults = getEnvDefaults();

  const [draft, setDraft] = useState(() => ({
    onedrive: { ...settings.onedrive },
    google: { ...settings.google },
    general: { ...settings.general },
  }));
  const [showGoogleSecret, setShowGoogleSecret] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const oneDriveNeedsReload =
    draft.onedrive.autoConnect !== settings.onedrive.autoConnect ||
    draft.onedrive.clientIdOverride.trim() !== settings.onedrive.clientIdOverride.trim() ||
    draft.onedrive.authority !== settings.onedrive.authority;

  const hasRefreshSecret =
    googleAuthStatus.hasServerClientSecret ||
    Boolean(draft.google.clientSecretOverride.trim());

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(draft, { reloadForOneDrive: oneDriveNeedsReload });
  };

  const handleResetClick = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    onReset();
  };

  const msAccountLabel =
    msProfile?.displayName ||
    msProfile?.mail ||
    msProfile?.userPrincipalName ||
    settings.onedrive.savedDisplayName ||
    settings.onedrive.savedEmail;

  const googleAccountLabel =
    googleProfile?.displayName ||
    googleProfile?.emailAddress ||
    settings.google.savedDisplayName ||
    settings.google.savedEmail;

  return (
    <div
      className="settings-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={onClose}
    >
      <form
        className="settings-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        {/* Header */}
        <div className="settings-header">
          <div className="settings-icon-wrap" aria-hidden="true">
            <FiSettings size={18} />
          </div>
          <div className="settings-title-wrap">
            <h2 id="settings-modal-title" className="settings-title">
              Connection Settings
            </h2>
            <p className="settings-subtitle">
              Save your OneDrive &amp; Google Drive parameters to reconnect automatically on startup.
            </p>
          </div>
          <button
            type="button"
            className="settings-close-btn"
            onClick={onClose}
            aria-label="Close settings"
          >
            <FiX size={17} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="settings-body">
          {/* ── OneDrive Card ── */}
          <section className="settings-panel">
            <div className="settings-panel-header">
              <div className="settings-panel-title-group">
                <span className="settings-provider-dot settings-provider-dot--ms">
                  <FiCloud size={14} />
                </span>
                <div>
                  <h3 className="settings-panel-title">OneDrive (Microsoft)</h3>
                  <div className="settings-status-row">
                    {isOneDriveAuth ? (
                      <span className="settings-badge settings-badge--connected">
                        <FiCheckCircle size={12} />
                        Connected{msAccountLabel ? ` · ${msAccountLabel}` : ''}
                      </span>
                    ) : oneDriveConnecting ? (
                      <span className="settings-badge settings-badge--saved">
                        <FiRefreshCw size={12} className="settings-spin" />
                        Connecting…
                      </span>
                    ) : settings.onedrive.savedEmail && settings.onedrive.autoConnect ? (
                      <span className="settings-badge settings-badge--saved">
                        Saved · {settings.onedrive.savedEmail}
                      </span>
                    ) : (
                      <span className="settings-badge settings-badge--idle">Not connected</span>
                    )}
                  </div>
                </div>
              </div>

              {isOneDriveAuth ? (
                <button
                  type="button"
                  className="settings-action-btn settings-action-btn--danger"
                  onClick={onDisconnectOneDrive}
                >
                  <FiLogOut size={13} />
                  <span>Disconnect</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="settings-action-btn settings-action-btn--primary"
                  onClick={onConnectOneDrive}
                  disabled={oneDriveConnecting}
                >
                  <FiLogIn size={13} />
                  <span>{oneDriveConnecting ? 'Connecting…' : 'Connect'}</span>
                </button>
              )}
            </div>

            {oneDriveAuthNotice && (
              <div className="settings-banner settings-banner--warn">
                <FiAlertCircle size={14} className="settings-banner-icon" />
                <span>{oneDriveAuthNotice}</span>
              </div>
            )}

            <label className="settings-toggle-row">
              <div className="settings-toggle-copy">
                <span className="settings-toggle-label">Auto-connect on startup</span>
                <span className="settings-toggle-desc">
                  Store Microsoft session in persistent browser storage so OneDrive connects automatically next time you launch.
                </span>
              </div>
              <input
                type="checkbox"
                className="settings-checkbox"
                checked={draft.onedrive.autoConnect}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    onedrive: { ...prev.onedrive, autoConnect: e.target.checked },
                  }))
                }
              />
            </label>

            <div className="settings-fields-grid">
              <div className="settings-field">
                <label htmlFor="ms-client-id" className="settings-label">
                  Azure Client ID <span className="settings-optional">(optional override)</span>
                </label>
                <input
                  id="ms-client-id"
                  type="text"
                  className="settings-input"
                  value={draft.onedrive.clientIdOverride}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      onedrive: { ...prev.onedrive, clientIdOverride: e.target.value },
                    }))
                  }
                  placeholder={
                    envDefaults.oneDriveClientId
                      ? `Using .env default (${maskId(envDefaults.oneDriveClientId)})`
                      : 'Enter Azure Application (Client) ID'
                  }
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="ms-authority" className="settings-label">
                  Microsoft Account Type
                </label>
                <select
                  id="ms-authority"
                  className="settings-select"
                  value={draft.onedrive.authority}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      onedrive: { ...prev.onedrive, authority: e.target.value },
                    }))
                  }
                >
                  {ALLOWED_MS_AUTHORITIES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {oneDriveNeedsReload && (
              <p className="settings-inline-note">
                Saving changes to OneDrive settings will reload the page to apply the updated Microsoft auth configuration.
              </p>
            )}
          </section>

          {/* ── Google Drive Card ── */}
          <section className="settings-panel">
            <div className="settings-panel-header">
              <div className="settings-panel-title-group">
                <span className="settings-provider-dot settings-provider-dot--google">
                  <FiHardDrive size={14} />
                </span>
                <div>
                  <h3 className="settings-panel-title">Google Drive</h3>
                  <div className="settings-status-row">
                    {isGoogleAuth ? (
                      <span className="settings-badge settings-badge--connected">
                        <FiCheckCircle size={12} />
                        Connected{googleAccountLabel ? ` · ${googleAccountLabel}` : ''}
                      </span>
                    ) : googleConnecting ? (
                      <span className="settings-badge settings-badge--saved">
                        <FiRefreshCw size={12} className="settings-spin" />
                        Reconnecting…
                      </span>
                    ) : (
                      <span className="settings-badge settings-badge--idle">Not connected</span>
                    )}

                    {googleHasRefreshToken && (
                      <span className="settings-badge settings-badge--refresh">
                        Refresh Token Saved
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isGoogleAuth ? (
                <button
                  type="button"
                  className="settings-action-btn settings-action-btn--danger"
                  onClick={onDisconnectGoogle}
                >
                  <FiLogOut size={13} />
                  <span>Disconnect</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="settings-action-btn settings-action-btn--primary"
                  onClick={() =>
                    onConnectGoogle({
                      autoConnect: draft.google.autoConnect,
                      clientIdOverride: draft.google.clientIdOverride.trim(),
                      clientSecretOverride: draft.google.clientSecretOverride.trim(),
                    })
                  }
                  disabled={googleConnecting}
                >
                  <FiLogIn size={13} />
                  <span>{googleConnecting ? 'Connecting…' : 'Connect'}</span>
                </button>
              )}
            </div>

            <label className="settings-toggle-row">
              <div className="settings-toggle-copy">
                <span className="settings-toggle-label">Auto-connect on startup</span>
                <span className="settings-toggle-desc">
                  Store a Google OAuth refresh token via <code>/api/google-auth</code> so Google Drive silently reconnects without popups.
                </span>
              </div>
              <input
                type="checkbox"
                className="settings-checkbox"
                checked={draft.google.autoConnect}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    google: { ...prev.google, autoConnect: e.target.checked },
                  }))
                }
              />
            </label>

            {googleAuthNotice && (
              <div className="settings-banner settings-banner--warn">
                <FiAlertCircle size={14} className="settings-banner-icon" />
                <span>{googleAuthNotice}</span>
              </div>
            )}

            {/* Backend refresh capability banner */}
            {draft.google.autoConnect && (
              <div
                className={`settings-banner ${
                  hasRefreshSecret ? 'settings-banner--ok' : 'settings-banner--warn'
                }`}
              >
                {hasRefreshSecret ? (
                  <>
                    <FiCheckCircle size={14} className="settings-banner-icon" />
                    <span>
                      {googleAuthStatus.hasServerClientSecret
                        ? 'Silent refresh ready: GOOGLE_CLIENT_SECRET is configured on the server.'
                        : 'Silent refresh ready using your saved Client Secret override.'}
                      {isGoogleAuth && !googleHasRefreshToken
                        ? ' Disconnect and reconnect Google Drive once to save a long-lived refresh token.'
                        : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <FiAlertCircle size={14} className="settings-banner-icon" />
                    <span>
                      Add <code>GOOGLE_CLIENT_SECRET</code> to your <code>.env</code> / Vercel Environment Variables (recommended) or enter it below to enable silent reconnection after 1 hour.
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="settings-fields-grid">
              <div className="settings-field">
                <label htmlFor="google-client-id" className="settings-label">
                  Google Client ID <span className="settings-optional">(optional override)</span>
                </label>
                <input
                  id="google-client-id"
                  type="text"
                  className="settings-input"
                  value={draft.google.clientIdOverride}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      google: { ...prev.google, clientIdOverride: e.target.value },
                    }))
                  }
                  placeholder={
                    envDefaults.googleClientId
                      ? `Using .env default (${maskId(envDefaults.googleClientId)})`
                      : 'Enter Google OAuth 2.0 Client ID'
                  }
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="google-client-secret" className="settings-label">
                  Google Client Secret{' '}
                  <span className="settings-optional">
                    ({googleAuthStatus.hasServerClientSecret ? 'server configured' : 'optional override'})
                  </span>
                </label>
                <div className="settings-secret-wrap">
                  <input
                    id="google-client-secret"
                    type={showGoogleSecret ? 'text' : 'password'}
                    className="settings-input settings-input--secret"
                    value={draft.google.clientSecretOverride}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        google: { ...prev.google, clientSecretOverride: e.target.value },
                      }))
                    }
                    placeholder={
                      googleAuthStatus.hasServerClientSecret
                        ? 'Managed securely via server GOOGLE_CLIENT_SECRET'
                        : 'GOCSPX-… (or set GOOGLE_CLIENT_SECRET in .env)'
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="settings-secret-toggle"
                    onClick={() => setShowGoogleSecret((s) => !s)}
                    aria-label={showGoogleSecret ? 'Hide secret' : 'Show secret'}
                  >
                    {showGoogleSecret ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                  </button>
                </div>
                <span className="settings-field-hint">
                  Tip: Setting <code>GOOGLE_CLIENT_SECRET</code> in <code>.env</code> or Vercel keeps the secret out of browser storage.
                </span>
              </div>
            </div>
          </section>

          {/* ── General Preferences ── */}
          <section className="settings-panel">
            <div className="settings-panel-header settings-panel-header--compact">
              <h3 className="settings-panel-title">General Preferences</h3>
            </div>

            <div className="settings-pref-row">
              <div>
                <span className="settings-toggle-label">Default Drag &amp; Drop Mode</span>
                <span className="settings-toggle-desc">
                  Remembered across restarts (hold Shift on drop to switch temporarily).
                </span>
              </div>
              <div className="settings-mode-group" role="radiogroup" aria-label="Default transfer mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={draft.general.defaultTransferMode === 'copy'}
                  className={`settings-mode-btn ${
                    draft.general.defaultTransferMode === 'copy'
                      ? 'settings-mode-btn--copy'
                      : ''
                  }`}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      general: { ...prev.general, defaultTransferMode: 'copy' },
                    }))
                  }
                >
                  <FiCopy size={13} />
                  <span>Copy</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={draft.general.defaultTransferMode === 'move'}
                  className={`settings-mode-btn ${
                    draft.general.defaultTransferMode === 'move'
                      ? 'settings-mode-btn--move'
                      : ''
                  }`}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      general: { ...prev.general, defaultTransferMode: 'move' },
                    }))
                  }
                >
                  <FiMove size={13} />
                  <span>Move</span>
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <button
            type="button"
            className={`settings-reset-btn ${confirmReset ? 'settings-reset-btn--armed' : ''}`}
            onClick={handleResetClick}
          >
            <FiRotateCcw size={13} />
            <span>{confirmReset ? 'Click again to clear all settings' : 'Reset Defaults'}</span>
          </button>

          <div className="settings-footer-actions">
            <button
              type="button"
              className="settings-btn settings-btn--cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="settings-btn settings-btn--primary">
              {oneDriveNeedsReload ? 'Save & Reload' : 'Save Settings'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function SettingsModal({ isOpen, ...props }) {
  if (!isOpen) return null;
  return <SettingsDialogContent {...props} />;
}
