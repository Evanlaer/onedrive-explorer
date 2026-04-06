import './Sidebar.css';
import { useMsal } from '@azure/msal-react';
import { logout } from '../../auth/authService';
import { useDriveItems } from '../../hooks/useDriveItems';
import {
  FiFolder, FiLogOut, FiCloud, FiHardDrive,
} from 'react-icons/fi';

export default function Sidebar({ activeFolderId, onFolderClick, userProfile }) {
  const { instance } = useMsal();
  const { items: rootFolders } = useDriveItems(null);

  const topFolders = rootFolders.filter((i) => i.folder);

  const initials = userProfile?.displayName
    ? userProfile.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <aside className="sidebar" aria-label="Drive navigation">
      {/* Logo */}
      <div className="sidebar-logo">
        <FiCloud className="sidebar-logo-icon" />
        <span className="sidebar-logo-text">OneDrive Explorer</span>
      </div>

      {/* User info */}
      {userProfile && (
        <div className="sidebar-user">
          <div className="sidebar-user-avatar" aria-hidden="true">{initials}</div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{userProfile.displayName}</span>
            <span className="sidebar-user-email">{userProfile.mail || userProfile.userPrincipalName}</span>
          </div>
        </div>
      )}

      {/* My Drive root link */}
      <nav className="sidebar-nav">
        <p className="sidebar-nav-label">My Drive</p>

        <button
          className={`sidebar-item ${!activeFolderId ? 'active' : ''}`}
          onClick={() => onFolderClick(null, 'My Drive')}
          id="sidebar-root"
        >
          <FiHardDrive className="sidebar-item-icon" />
          <span>Root</span>
        </button>

        {topFolders.map((folder) => (
          <button
            key={folder.id}
            className={`sidebar-item ${activeFolderId === folder.id ? 'active' : ''}`}
            onClick={() => onFolderClick(folder.id, folder.name)}
            id={`sidebar-folder-${folder.id}`}
          >
            <FiFolder className="sidebar-item-icon" />
            <span>{folder.name}</span>
          </button>
        ))}
      </nav>

      {/* Sign out */}
      <button
        className="sidebar-signout"
        onClick={() => logout(instance)}
        id="btn-sign-out"
      >
        <FiLogOut />
        Sign Out
      </button>
    </aside>
  );
}
