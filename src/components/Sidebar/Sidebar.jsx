import './Sidebar.css';
import { FiCloud, FiCopy, FiMove, FiSettings } from 'react-icons/fi';

export default function Sidebar({
  userProfile,
  googleProfile,
  onLogoutOneDrive,
  onLogoutGoogle,
  transferMode = 'copy',
  onTransferModeChange,
  canTransfer = false,
  autoConnectOneDrive = true,
  autoConnectGoogle = true,
  googleHasRefreshToken = false,
  onOpenSettings,
}) {
  const initials = userProfile?.displayName
    ? userProfile.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'MS';

  const gInitials = googleProfile?.displayName
    ? googleProfile.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'GD';

  return (
    <aside className="sidebar" aria-label="Drive navigation">
      {/* Logo */}
      <div className="sidebar-logo">
        <FiCloud className="sidebar-logo-icon" />
        <span className="sidebar-logo-text">Multi-Cloud Explorer</span>
      </div>

      {/* OneDrive Section */}
      <div className="sidebar-section">
        <p className="sidebar-nav-label">OneDrive</p>
        {userProfile ? (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{userProfile.displayName}</span>
              <button
                className="sidebar-user-logout"
                onClick={onLogoutOneDrive}
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <p className="sidebar-status-empty">Not connected</p>
        )}
      </div>

      {/* Google Drive Section */}
      <div className="sidebar-section">
        <p className="sidebar-nav-label">Google Drive</p>
        {googleProfile ? (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar sidebar-user-avatar--google">{gInitials}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{googleProfile.displayName}</span>
              <button
                className="sidebar-user-logout"
                onClick={onLogoutGoogle}
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <p className="sidebar-status-empty">Not connected</p>
        )}
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
            ? 'Drag files or folders across panes. Hold Shift while dropping to switch Copy / Move.'
            : 'Sign in to both clouds to drag & drop files or folders between them.'}
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
          {(autoConnectOneDrive || (autoConnectGoogle && googleHasRefreshToken)) && (
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
