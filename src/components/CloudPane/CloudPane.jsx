import './CloudPane.css';
import { useState } from 'react';
import { FiRefreshCw, FiCopy, FiMove } from 'react-icons/fi';
import Header from '../Header/Header';
import FileList from '../FileList/FileList';
import { useDriveItems } from '../../hooks/useDriveItems';
import { useGoogleDriveItems } from '../../hooks/useGoogleDriveItems';

/**
 * CloudPane — A self-contained explorer pane for either OneDrive or Google Drive,
 * supporting cross-cloud drag-and-drop Copy and Move.
 */
export default function CloudPane({
  type,
  title,
  isAuthenticated,
  accessToken,
  onLogin,
  refreshKey = 0,
  onRefresh,
  canTransfer = false,
  dragState = null,
  transferMode = 'copy',
  onDragStartItem,
  onDragEndItem,
  onDropItem,
}) {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [isPaneDropOver, setIsPaneDropOver] = useState(false);
  const [hoveredFolderName, setHoveredFolderName] = useState(null);
  const [shiftHeld, setShiftHeld] = useState(false);

  // Use the appropriate hook based on drive type
  const oneDriveData = useDriveItems(
    type === 'onedrive' && isAuthenticated ? currentFolderId : 'DISABLED',
    refreshKey
  );
  const googleDriveData = useGoogleDriveItems(
    type === 'google' && isAuthenticated ? accessToken : null,
    currentFolderId || 'root',
    refreshKey
  );

  const { items, loading, error } = type === 'onedrive' ? oneDriveData : googleDriveData;

  const isValidDropPane =
    isAuthenticated && canTransfer && dragState && dragState.sourceCloud !== type;

  const showDropActive = Boolean(isValidDropPane && isPaneDropOver);
  const activeHoveredFolder = showDropActive ? hoveredFolderName : null;
  const activeShiftHeld = showDropActive ? shiftHeld : false;

  const effectiveMode = activeShiftHeld
    ? transferMode === 'copy'
      ? 'move'
      : 'copy'
    : transferMode;

  const currentFolderLabel =
    breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].name : 'Root';

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

  const extractDragPayload = (dataTransfer) => {
    if (dragState) return dragState;
    try {
      const raw = dataTransfer?.getData('application/x-multicloud-item');
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore malformed payload
    }
    return null;
  };

  const handlePaneDragOver = (e) => {
    if (!isValidDropPane) return;
    e.preventDefault();
    setShiftHeld(e.shiftKey);
    const mode = e.shiftKey
      ? transferMode === 'copy'
        ? 'move'
        : 'copy'
      : transferMode;
    e.dataTransfer.dropEffect = mode === 'move' ? 'move' : 'copy';
    if (!isPaneDropOver) setIsPaneDropOver(true);
  };

  const handlePaneDragLeave = (e) => {
    if (!isValidDropPane) return;
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsPaneDropOver(false);
      setHoveredFolderName(null);
      setShiftHeld(false);
    }
  };

  const handlePaneDrop = (e) => {
    if (!isValidDropPane) return;
    e.preventDefault();
    const payload = extractDragPayload(e.dataTransfer);
    setIsPaneDropOver(false);
    setHoveredFolderName(null);
    setShiftHeld(false);

    if (!payload || payload.sourceCloud === type) return;

    const mode = e.shiftKey
      ? transferMode === 'copy'
        ? 'move'
        : 'copy'
      : transferMode;

    onDropItem?.({
      sourceCloud: payload.sourceCloud,
      item: payload.item,
      targetCloud: type,
      targetFolderId: type === 'google' ? currentFolderId || 'root' : currentFolderId,
      targetFolderName: breadcrumbs.length > 0 ? currentFolderLabel : '',
      mode,
    });
  };

  const handleDropOnFolder = (targetFolder, isShiftKey, dataTransfer) => {
    const payload = extractDragPayload(dataTransfer);
    setIsPaneDropOver(false);
    setHoveredFolderName(null);
    setShiftHeld(false);

    if (!payload || payload.sourceCloud === type) return;

    const mode = isShiftKey
      ? transferMode === 'copy'
        ? 'move'
        : 'copy'
      : transferMode;

    onDropItem?.({
      sourceCloud: payload.sourceCloud,
      item: payload.item,
      targetCloud: type,
      targetFolderId: targetFolder.id,
      targetFolderName: targetFolder.name,
      mode,
    });
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
    <div
      className={`cloud-pane ${showDropActive ? 'cloud-pane--drop-active' : ''} ${
        showDropActive && effectiveMode === 'move' ? 'cloud-pane--drop-move' : ''
      }`}
      onDragOver={handlePaneDragOver}
      onDragLeave={handlePaneDragLeave}
      onDrop={handlePaneDrop}
    >
      <div className="pane-header-wrap">
        <div className="pane-title-row">
          <div className="pane-title">{title}</div>
          <button
            type="button"
            className="pane-refresh-btn"
            onClick={onRefresh}
            title={`Refresh ${title}`}
            aria-label={`Refresh ${title}`}
          >
            <FiRefreshCw size={13} className={loading ? 'pane-spin' : ''} />
          </button>
        </div>
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
          cloudType={type}
          canTransfer={canTransfer}
          dragState={dragState}
          onFolderClick={handleFolderClick}
          onDragStartItem={onDragStartItem}
          onDragEndItem={onDragEndItem}
          onDropOnFolder={handleDropOnFolder}
          onFolderHoverChange={setHoveredFolderName}
        />

        {showDropActive && dragState && (
          <div
            className={`pane-drop-banner pane-drop-banner--${effectiveMode}`}
            aria-hidden="true"
          >
            {effectiveMode === 'move' ? <FiMove size={15} /> : <FiCopy size={15} />}
            <span className="pane-drop-banner-text">
              <strong>{effectiveMode === 'move' ? 'Move' : 'Copy'}</strong>{' '}
              &ldquo;{dragState.item.name}&rdquo; &rarr; {title}
              {activeHoveredFolder
                ? ` / ${activeHoveredFolder}`
                : breadcrumbs.length > 0
                ? ` / ${currentFolderLabel}`
                : ''}
            </span>
            <span className="pane-drop-hint">
              {activeShiftHeld ? 'Shift active' : `Hold Shift to ${transferMode === 'copy' ? 'Move' : 'Copy'}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
