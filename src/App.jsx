import './App.css';
import { useState, useEffect } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import LoginPage from './components/LoginPage/LoginPage';
import Sidebar from './components/Sidebar/Sidebar';
import Header from './components/Header/Header';
import FileList from './components/FileList/FileList';
import { useDriveItems } from './hooks/useDriveItems';
import { getUserProfile } from './api/graphService';

function ExplorerApp() {
  const { instance, inProgress } = useMsal();
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]); // [{id, name}]
  const [userProfile, setUserProfile] = useState(null);
  const { items, loading, error } = useDriveItems(currentFolderId);

  // Load user profile once on mount
  useEffect(() => {
    getUserProfile(instance)
      .then(setUserProfile)
      .catch(() => { }); // non-critical
  }, [instance]);

  // Navigate INTO a folder (appends to breadcrumb)
  const handleFolderClick = (folderId, folderName) => {
    if (folderId === null) {
      // Go to root
      setCurrentFolderId(null);
      setBreadcrumbs([]);
    } else {
      setCurrentFolderId(folderId);
      setBreadcrumbs((prev) => [...prev, { id: folderId, name: folderName }]);
    }
  };

  // Navigate via breadcrumb (truncates trail)
  const handleBreadcrumbClick = (index) => {
    if (index === 0) {
      // Clicked "My Drive" home
      setCurrentFolderId(null);
      setBreadcrumbs([]);
    } else {
      const crumb = breadcrumbs[index - 1];
      setCurrentFolderId(crumb.id);
      setBreadcrumbs((prev) => prev.slice(0, index));
    }
  };

  if (inProgress !== InteractionStatus.None) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>
        <p>Signing in…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        activeFolderId={currentFolderId}
        onFolderClick={handleFolderClick}
        userProfile={userProfile}
      />
      <Header
        breadcrumbs={breadcrumbs}
        onBreadcrumbClick={handleBreadcrumbClick}
      />
      <main
        style={{
          gridArea: 'main',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface-default)',
        }}
      >
        <FileList
          items={items}
          loading={loading}
          error={error}
          onFolderClick={handleFolderClick}
        />
      </main>
    </div>
  );
}

export default function App() {
  const isAuthenticated = useIsAuthenticated();
  const { inProgress } = useMsal();

  // Show nothing while MSAL loads (handles redirect callback)
  if (inProgress === InteractionStatus.Startup || inProgress === InteractionStatus.HandleRedirect) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>
        <p>Loading…</p>
      </div>
    );
  }

  return isAuthenticated ? <ExplorerApp /> : <LoginPage />;
}
