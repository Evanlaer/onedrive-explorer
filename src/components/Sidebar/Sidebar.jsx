import './Sidebar.css';
import { FiCloud, FiHardDrive, FiCopy, FiMove, FiSettings, FiPlus } from 'react-icons/fi';

function getInitials(label, fallback) {
  if (!label) return fallback;
  const parts = label.trim().split(/\s+/);
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase() || fallback;
}

function ConnectionListSection({
  title,
  provider,
  connections,
  activeLeftId,
  activeRightId,
  onConnect,
  onDisconnect,
  onSelectInPane,
}) {
  const isGoogle = provider === 'google';

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-head">
        <p className="sidebar-nav-label">{title}</p>
        <span className="sidebar-count-pill">{connections.length}</span>
      </div>

      {connections.length === 0 ? (
        <p className="sidebar-status-empty">No accounts added</p>
      ) : (
        <div className="sidebar-conn-list">
          {connections.map((conn) => {
            const initials = getInitials(
              conn.displayName || conn.name,
              isGoogle ? 'GD' : 'MS'
            );
            const inLeft = conn.id === activeLeftId;
            const inRight = conn.id === activeRightId;

            return (
              <div
                key={conn.id}
                className={`sidebar-user ${conn.isConnected ? '' : 'sidebar-user--disconnected'}`}
              >
                <div
                  className={`sidebar-user-avatar ${
                    isGoogle ? 'sidebar-user-avatar--google' : ''
                  }`}
                  title={conn.isConnected ? 'Connected' : 'Not connected'}
                >
                  {conn.isConnected ? (
                    initials
                  ) : isGoogle ? (
                    <FiHardDrive size={13} />
                  ) : (
                    <FiCloud size={13} />
                  )}
                  <span
                    className={`sidebar-conn-status-dot ${
                      conn.isConnected ? 'sidebar-conn-status-dot--on' : ''
                    }`}
                  />
                </div>

                <div className="sidebar-user-info">
                  <div className="sidebar-conn-name-row">
                    <button
                      type="button"
                      className="sidebar-user-name-btn"
                      onClick={() => onSelectInPane?.(conn.id)}
                      title={`Show ${conn.name} in explorer`}
                    >
                      {conn.name}
                    </button>
                    {inLeft && <span className="sidebar-pane-tag" title="Active in Left pane">L</span>}
                    {inRight && <span className="sidebar-pane-tag" title="Active in Right pane">R</span>}
                  </div>

                  {conn.email && (
                    <span className="sidebar-user-email" title={conn.email}>
                      {conn.email}
                    </span>
                  )}

                  {conn.isConnected ? (
                    <button
                      type="button"
                      className="sidebar-user-logout"
                      onClick={() => onDisconnect?.(conn.id)}
                    >
                      Sign Out
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="sidebar-user-connect"
                      onClick={() => onConnect?.(conn.id)}
                      disabled={conn.isConnecting}
                    >
                      {conn.isConnecting ? 'Connecting…' : 'Sign In'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  connections = [],
  activeLeftId = '',
  activeRightId = '',
  onConnectConnection,
  onDisconnectConnection,
  onQuickSelectConnection,
  transferMode = 'copy',
  onTransferModeChange,
  canTransfer = false,
  sameConnectionInBothPanes = false,
  hasAutoConnect = true,
  onOpenSettings,
}) {
  const oneDrives = connections.filter((c) => c.provider === 'onedrive');
  const googleDrives = connections.filter((c) => c.provider === 'google');

  return (
    <aside className="sidebar" aria-label="Drive navigation">
      {/* Logo */}
      <div className="sidebar-logo">
        <FiCloud className="sidebar-logo-icon" />
        <span className="sidebar-logo-text">Multi-Cloud Explorer</span>
      </div>

      {/* Scrollable Connections List */}
      <div className="sidebar-connections-scroll">
        <ConnectionListSection
          title="OneDrive"
          provider="onedrive"
          connections={oneDrives}
          activeLeftId={activeLeftId}
          activeRightId={activeRightId}
          onConnect={onConnectConnection}
          onDisconnect={onDisconnectConnection}
          onSelectInPane={onQuickSelectConnection}
        />

        <ConnectionListSection
          title="Google Drive"
          provider="google"
          connections={googleDrives}
          activeLeftId={activeLeftId}
          activeRightId={activeRightId}
          onConnect={onConnectConnection}
          onDisconnect={onDisconnectConnection}
          onSelectInPane={onQuickSelectConnection}
        />

        <div className="sidebar-add-wrap">
          <button
            type="button"
            className="sidebar-add-btn"
            onClick={onOpenSettings}
          >
            <FiPlus size={13} />
            <span>Add / Manage Accounts</span>
          </button>
        </div>
      </div>

      {/* Cross-Cloud Transfer Mode */}
      <div className="sidebar-section sidebar-transfer-section">
        <p className="sidebar-nav-label">Drag &amp; Drop Mode</p>
        <div
          className="transfer-mode-toggle"
          role="radiogroup"
          aria-label="Default drag and drop transfer mode"
        >
          <button
            type="button"
            role="radio"
            aria-checked={transferMode === 'copy'}
            className={`transfer-mode-btn ${
              transferMode === 'copy' ? 'transfer-mode-btn--active-copy' : ''
            }`}
            onClick={() => onTransferModeChange?.('copy')}
          >
            <FiCopy size={13} />
            <span>Copy</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={transferMode === 'move'}
            className={`transfer-mode-btn ${
              transferMode === 'move' ? 'transfer-mode-btn--active-move' : ''
            }`}
            onClick={() => onTransferModeChange?.('move')}
          >
            <FiMove size={13} />
            <span>Move</span>
          </button>
        </div>
        <p className="sidebar-transfer-hint">
          {canTransfer
            ? 'Drag files or folders between panes. Hold Shift while dropping to switch Copy / Move.'
            : sameConnectionInBothPanes
            ? 'Select two different connections in the Left and Right panes to drag & drop between them.'
            : 'Sign in to the selected connections in both panes to drag & drop files or folders.'}
        </p>
      </div>

      {/* Settings Trigger */}
      <div className="sidebar-settings-wrap">
        <button
          type="button"
          className="sidebar-settings-btn"
          onClick={onOpenSettings}
        >
          <FiSettings size={15} className="sidebar-settings-icon" />
          <span className="sidebar-settings-label">Connection Settings</span>
          {hasAutoConnect && (
            <span
              className="sidebar-settings-dot"
              title="Auto-connect enabled"
              aria-hidden="true"
            />
          )}
        </button>
      </div>

      <div className="sidebar-footer">
        <p>© 2026 Premium Explorer</p>
      </div>
    </aside>
  );
}
