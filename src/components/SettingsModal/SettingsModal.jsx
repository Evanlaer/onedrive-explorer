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
  FiPlus,
  FiTrash2,
  FiChevronDown,
  FiChevronUp,
} from 'react-icons/fi';
import {
  ALLOWED_MS_AUTHORITIES,
  createConnectionTemplate,
  getEnvDefaults,
} from '../../utils/settingsStorage';

function maskId(value) {
  if (!value) return '';
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function SettingsDialogContent({
  settings,
  connectionStates,
  googleAuthStatus,
  onSave,
  onReset,
  onClose,
  onConnectConnection,
  onDisconnectConnection,
}) {
  const envDefaults = getEnvDefaults();

  const [draftConnections, setDraftConnections] = useState(() =>
    settings.connections.map((c) => ({ ...c }))
  );
  const [defaultTransferMode, setDefaultTransferMode] = useState(
    settings.general.defaultTransferMode
  );
  const [expandedIds, setExpandedIds] = useState(() => {
    // Expand the first two connections by default when there are only 1-2 connections
    if (settings.connections.length <= 2) {
      return new Set(settings.connections.map((c) => c.id));
    }
    return new Set();
  });
  const [visibleSecrets, setVisibleSecrets] = useState(() => new Set());
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

  const updateConn = (id, patch) => {
    setDraftConnections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  };

  const handleAddConnection = (provider) => {
    const created = createConnectionTemplate(provider, draftConnections);
    setDraftConnections((prev) => [...prev, created]);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(created.id);
      return next;
    });
  };

  const handleRemoveConnection = (id) => {
    if (draftConnections.length <= 1) return;
    setDraftConnections((prev) => prev.filter((c) => c.id !== id));
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSecretVisibility = (id) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      connections: draftConnections,
      general: { defaultTransferMode },
    });
  };

  const handleResetClick = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    onReset();
  };

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
              Add and configure multiple OneDrive &amp; Google Drive accounts for automatic reconnection.
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
          {/* Add Connection Toolbar */}
          <div className="settings-toolbar">
            <div className="settings-toolbar-label">
              <span>Cloud Accounts</span>
              <span className="settings-toolbar-count">{draftConnections.length}</span>
            </div>
            <div className="settings-add-actions">
              <button
                type="button"
                className="settings-add-btn settings-add-btn--ms"
                onClick={() => handleAddConnection('onedrive')}
              >
                <FiPlus size={13} />
                <span>Add OneDrive</span>
              </button>
              <button
                type="button"
                className="settings-add-btn settings-add-btn--google"
                onClick={() => handleAddConnection('google')}
              >
                <FiPlus size={13} />
                <span>Add Google Drive</span>
              </button>
            </div>
          </div>

          {/* Connection Cards */}
          {draftConnections.map((conn) => {
            const isGoogle = conn.provider === 'google';
            const runtime = connectionStates[conn.id] || {};
            const isConnected = Boolean(runtime.isConnected);
            const isConnecting = Boolean(runtime.isConnecting);
            const hasRefreshToken = Boolean(runtime.hasRefreshToken);
            const authNotice = runtime.authNotice || null;
            const accountLabel =
              runtime.displayName ||
              runtime.email ||
              conn.savedDisplayName ||
              conn.savedEmail;
            const isExpanded = expandedIds.has(conn.id);
            const showSecret = visibleSecrets.has(conn.id);
            const hasRefreshSecret =
              googleAuthStatus.hasServerClientSecret ||
              Boolean((conn.clientSecretOverride || '').trim());

            return (
              <section key={conn.id} className="settings-panel">
                <div className="settings-panel-header">
                  <div className="settings-panel-title-group">
                    <span
                      className={`settings-provider-dot ${
                        isGoogle
                          ? 'settings-provider-dot--google'
                          : 'settings-provider-dot--ms'
                      }`}
                    >
                      {isGoogle ? <FiHardDrive size={14} /> : <FiCloud size={14} />}
                    </span>

                    <div className="settings-conn-heading">
                      <input
                        type="text"
                        className="settings-conn-name-input"
                        value={conn.name}
                        onChange={(e) => updateConn(conn.id, { name: e.target.value })}
                        placeholder={isGoogle ? 'Google Drive name' : 'OneDrive name'}
                        aria-label="Connection name"
                        spellCheck={false}
                      />

                      <div className="settings-status-row">
                        <span className="settings-provider-tag">
                          {isGoogle ? 'Google Drive' : 'OneDrive'}
                        </span>
                        {isConnected ? (
                          <span className="settings-badge settings-badge--connected">
                            <FiCheckCircle size={11} />
                            Connected{accountLabel ? ` · ${accountLabel}` : ''}
                          </span>
                        ) : isConnecting ? (
                          <span className="settings-badge settings-badge--saved">
                            <FiRefreshCw size={11} className="settings-spin" />
                            Connecting…
                          </span>
                        ) : conn.savedEmail && conn.autoConnect ? (
                          <span className="settings-badge settings-badge--saved">
                            Saved · {conn.savedEmail}
                          </span>
                        ) : (
                          <span className="settings-badge settings-badge--idle">
                            Not connected
                          </span>
                        )}

                        {isGoogle && hasRefreshToken && (
                          <span className="settings-badge settings-badge--refresh">
                            Refresh Token Saved
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="settings-card-controls">
                    {isConnected ? (
                      <button
                        type="button"
                        className="settings-action-btn settings-action-btn--danger"
                        onClick={() => onDisconnectConnection(conn.id)}
                      >
                        <FiLogOut size={12} />
                        <span>Disconnect</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="settings-action-btn settings-action-btn--primary"
                        onClick={() =>
                          onConnectConnection(conn, {
                            draftConnections,
                            defaultTransferMode,
                          })
                        }
                        disabled={isConnecting}
                      >
                        <FiLogIn size={12} />
                        <span>{isConnecting ? 'Connecting…' : 'Connect'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="settings-icon-btn"
                      onClick={() => toggleExpanded(conn.id)}
                      title={isExpanded ? 'Hide parameters' : 'Edit parameters'}
                      aria-label={isExpanded ? 'Hide parameters' : 'Edit parameters'}
                    >
                      {isExpanded ? <FiChevronUp size={15} /> : <FiChevronDown size={15} />}
                    </button>

                    <button
                      type="button"
                      className="settings-icon-btn settings-icon-btn--delete"
                      onClick={() => handleRemoveConnection(conn.id)}
                      disabled={draftConnections.length <= 1}
                      title={
                        draftConnections.length <= 1
                          ? 'Keep at least one connection'
                          : `Remove ${conn.name}`
                      }
                      aria-label={`Remove ${conn.name}`}
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>

                {authNotice && (
                  <div className="settings-banner settings-banner--warn">
                    <FiAlertCircle size={14} className="settings-banner-icon" />
                    <span>{authNotice}</span>
                  </div>
                )}

                {isExpanded && (
                  <div className="settings-conn-details">
                    <label className="settings-toggle-row">
                      <div className="settings-toggle-copy">
                        <span className="settings-toggle-label">Auto-connect on startup</span>
                        <span className="settings-toggle-desc">
                          {isGoogle
                            ? 'Save an OAuth refresh token via /api/google-auth to reconnect automatically with zero popups.'
                            : 'Persist Microsoft session in browser storage so this OneDrive account reconnects automatically.'}
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        className="settings-checkbox"
                        checked={conn.autoConnect}
                        onChange={(e) =>
                          updateConn(conn.id, { autoConnect: e.target.checked })
                        }
                      />
                    </label>

                    {isGoogle && conn.autoConnect && (
                      <div
                        className={`settings-banner ${
                          hasRefreshSecret ? 'settings-banner--ok' : 'settings-banner--warn'
                        }`}
                      >
                        {hasRefreshSecret ? (
                          <>
                            <FiCheckCircle size={14} className="settings-banner-icon" />
                            <span>
                              {googleAuthStatus.hasServerClientSecret &&
                              !(conn.clientSecretOverride || '').trim()
                                ? 'Silent refresh ready: GOOGLE_CLIENT_SECRET is configured on the server.'
                                : 'Silent refresh ready using this connection’s Client Secret override.'}
                              {isConnected && !hasRefreshToken
                                ? ' Disconnect and reconnect once to save a refresh token.'
                                : ''}
                            </span>
                          </>
                        ) : (
                          <>
                            <FiAlertCircle size={14} className="settings-banner-icon" />
                            <span>
                              Add <code>GOOGLE_CLIENT_SECRET</code> to <code>.env</code> / Vercel or enter it below to enable silent reconnection after 1 hour.
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {isGoogle ? (
                      <div className="settings-fields-grid">
                        <div className="settings-field">
                          <label htmlFor={`gd-id-${conn.id}`} className="settings-label">
                            Google Client ID{' '}
                            <span className="settings-optional">(optional override)</span>
                          </label>
                          <input
                            id={`gd-id-${conn.id}`}
                            type="text"
                            className="settings-input"
                            value={conn.clientIdOverride || ''}
                            onChange={(e) =>
                              updateConn(conn.id, { clientIdOverride: e.target.value })
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
                          <label htmlFor={`gd-sec-${conn.id}`} className="settings-label">
                            Google Client Secret{' '}
                            <span className="settings-optional">
                              (
                              {googleAuthStatus.hasServerClientSecret
                                ? 'server configured'
                                : 'optional override'}
                              )
                            </span>
                          </label>
                          <div className="settings-secret-wrap">
                            <input
                              id={`gd-sec-${conn.id}`}
                              type={showSecret ? 'text' : 'password'}
                              className="settings-input settings-input--secret"
                              value={conn.clientSecretOverride || ''}
                              onChange={(e) =>
                                updateConn(conn.id, {
                                  clientSecretOverride: e.target.value,
                                })
                              }
                              placeholder={
                                googleAuthStatus.hasServerClientSecret
                                  ? 'Managed via server GOOGLE_CLIENT_SECRET'
                                  : 'GOCSPX-… (or set GOOGLE_CLIENT_SECRET in .env)'
                              }
                              autoComplete="off"
                              spellCheck={false}
                            />
                            <button
                              type="button"
                              className="settings-secret-toggle"
                              onClick={() => toggleSecretVisibility(conn.id)}
                              aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                            >
                              {showSecret ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="settings-fields-grid">
                        <div className="settings-field">
                          <label htmlFor={`ms-id-${conn.id}`} className="settings-label">
                            Azure Client ID{' '}
                            <span className="settings-optional">(optional override)</span>
                          </label>
                          <input
                            id={`ms-id-${conn.id}`}
                            type="text"
                            className="settings-input"
                            value={conn.clientIdOverride || ''}
                            onChange={(e) =>
                              updateConn(conn.id, { clientIdOverride: e.target.value })
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
                          <label htmlFor={`ms-auth-${conn.id}`} className="settings-label">
                            Microsoft Account Type
                          </label>
                          <select
                            id={`ms-auth-${conn.id}`}
                            className="settings-select"
                            value={conn.authority || 'consumers'}
                            onChange={(e) =>
                              updateConn(conn.id, { authority: e.target.value })
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
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {/* General Preferences */}
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
              <div
                className="settings-mode-group"
                role="radiogroup"
                aria-label="Default transfer mode"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={defaultTransferMode === 'copy'}
                  className={`settings-mode-btn ${
                    defaultTransferMode === 'copy' ? 'settings-mode-btn--copy' : ''
                  }`}
                  onClick={() => setDefaultTransferMode('copy')}
                >
                  <FiCopy size={13} />
                  <span>Copy</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={defaultTransferMode === 'move'}
                  className={`settings-mode-btn ${
                    defaultTransferMode === 'move' ? 'settings-mode-btn--move' : ''
                  }`}
                  onClick={() => setDefaultTransferMode('move')}
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
              Save Settings
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
