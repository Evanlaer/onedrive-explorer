import './Sidebar.css';
import { useMsal } from '@azure/msal-react';
import { logout } from '../../auth/authService';
import { useDriveItems } from '../../hooks/useDriveItems';
import {
  FiFolder, FiLogOut, FiCloud, FiHardDrive,
} from 'react-icons/fi';

export default function Sidebar({ 
  userProfile, 
  googleProfile, 
  onLogoutOneDrive, 
  onLogoutGoogle 
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
        {userProfile && (
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
        )}
      </div>

      {/* Google Drive Section */}
      <div className="sidebar-section">
        <p className="sidebar-nav-label">Google Drive</p>
        {googleProfile && (
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
        )}
      </div>

      <div className="sidebar-footer">
        <p>© 2026 Premium Explorer</p>
      </div>
    </aside>
  );
}
