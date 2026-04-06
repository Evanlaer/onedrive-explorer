import './CloudPane.css';
import { useState, useEffect } from 'react';
import Header from '../Header/Header';
import FileList from '../FileList/FileList';
import { useDriveItems } from '../../hooks/useDriveItems';
import { useGoogleDriveItems } from '../../hooks/useGoogleDriveItems';

/**
 * CloudPane — A self-contained explorer pane for either OneDrive or Google Drive.
 */
export default function CloudPane({ type, title, isAuthenticated, accessToken, onLogin }) {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);

  // Use the appropriate hook based on drive type
  const oneDriveData = useDriveItems(type === 'onedrive' && isAuthenticated ? currentFolderId : 'DISABLED');
  const googleDriveData = useGoogleDriveItems(type === 'google' && isAuthenticated ? accessToken : null, currentFolderId || 'root');

  const { items, loading, error } = type === 'onedrive' ? oneDriveData : googleDriveData;

  // Reset navigation when type or auth changes
  useEffect(() => {
    setCurrentFolderId(null);
    setBreadcrumbs([]);
  }, [type, isAuthenticated]);

  const handleFolderClick = (id, name) => {
    setCurrentFolderId(id);
    setBreadcrumbs((prev) => [...prev, { id, name }]);
  };

  const handleBreadcrumbClick = (index) => {
    if (index === 0) {
      setCurrentFolderId(null);
      setBreadcrumbs([]);
    } else {
      const crumb = breadcrumbs[index - 1];
      setCurrentFolderId(crumb.id);
      setBreadcrumbs((prev) => prev.slice(0, index));
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="cloud-pane cloud-pane--locked">
        <div className="pane-auth-card">
          <h3>{title}</h3>
          <p>Login to browse your {title} files.</p>
          <button className="login-btn-small" onClick={onLogin}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cloud-pane">
      <div className="pane-header-wrap">
        <div className="pane-title">{title}</div>
        <Header
          breadcrumbs={breadcrumbs}
          onBreadcrumbClick={handleBreadcrumbClick}
        />
      </div>
      <div className="pane-content">
        <FileList
          items={items}
          loading={loading}
          error={error}
          onFolderClick={handleFolderClick}
        />
      </div>
    </div>
  );
}
