import './CloudPane.css';
import { useState, useMemo, useEffect } from 'react';
import {
  FiRefreshCw,
  FiCopy,
  FiMove,
  FiX,
  FiTrash2,
  FiEdit2,
  FiSettings,
  FiCloud,
  FiHardDrive,
} from 'react-icons/fi';
import Header from '../Header/Header';
import FileList from '../FileList/FileList';
import { useDriveItems } from '../../hooks/useDriveItems';
import { useGoogleDriveItems } from '../../hooks/useGoogleDriveItems';

/**
 * Creates a clean floating badge used as the custom OS drag ghost when dragging multiple items.
 */
function createMultiDragBadge(count) {
  const el = document.createElement('div');
  el.textContent = `${count} items`;
  Object.assign(el.style, {
    position: 'fixed',
    top: '-1000px',
    left: '-1000px',
    padding: '7px 14px',
    borderRadius: '999px',
    background: '#0078d4',
    color: '#ffffff',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '12px',
    fontWeight: '700',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
    pointerEvents: 'none',
    zIndex: '9999',
  });
  document.body.appendChild(el);
  return el;
}

function ConnectionPicker({ paneId, connection, connections, onSelectConnection }) {
  const oneDrives = connections.filter((c) => c.provider === 'onedrive');
  const googleDrives = connections.filter((c) => c.provider === 'google');
  const isGoogle = connection?.provider === 'google';

  const formatOptionLabel = (conn) => {
    const statusDot = conn.isConnected ? '● ' : '○ ';
    const sub = conn.email ? ` — ${conn.email}` : '';
    return `${statusDot}${conn.name}${sub}`;
  };

  return (
    <div className="pane-picker-wrap">
      <span
        className={`pane-picker-badge ${
          isGoogle ? 'pane-picker-badge--google' : 'pane-picker-badge--ms'
        }`}
        aria-hidden="true"
      >
        {isGoogle ? <FiHardDrive size={12} /> : <FiCloud size={12} />}
      </span>
      <select
        className="pane-picker-select"
        aria-label={`${paneId === 'left' ? 'Left' : 'Right'} pane cloud connection`}
        value={connection?.id || ''}
        onChange={(e) => onSelectConnection?.(e.target.value)}
      >
        {oneDrives.length > 0 && (
          <optgroup label="OneDrive">
            {oneDrives.map((c) => (
              <option key={c.id} value={c.id}>
                {formatOptionLabel(c)}
              </option>
            ))}
          </optgroup>
        )}
        {googleDrives.length > 0 && (
          <optgroup label="Google Drive">
            {googleDrives.map((c) => (
              <option key={c.id} value={c.id}>
                {formatOptionLabel(c)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

/**
 * CloudPane — A flexible explorer pane that can display any saved OneDrive or Google Drive
 * connection via its top pick list, with multi-select and cross-account drag-and-drop Copy/Move.
 */
export default function CloudPane({
  paneId,
  connection,
  connections = [],
  onSelectConnection,
  isAuthenticated,
  isConnecting = false,
  authNotice = null,
  oneDriveAuth = null,
  accessToken = null,
  onLogin,
  onOpenSettings,
  refreshKey = 0,
  onRefresh,
  canTransfer = false,
  dragState = null,
  transferMode = 'copy',
  onDragStartItems,
  onDragEndItems,
  onDropItems,
  onRequestDelete,
  onRequestRename,
  onAuthExpired,
}) {
  const type = connection?.provider || 'onedrive';
  const title = connection?.name || (type === 'google' ? 'Google Drive' : 'OneDrive');
  const connectionId = connection?.id || '';

  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [lastSelectedId, setLastSelectedId] = useState(null);
  const [isPaneDropOver, setIsPaneDropOver] = useState(false);
  const [hoveredFolderName, setHoveredFolderName] = useState(null);
  const [shiftHeld, setShiftHeld] = useState(false);

  // Use the appropriate hook based on the selected connection's provider
  const oneDriveData = useDriveItems(
    type === 'onedrive' && isAuthenticated ? oneDriveAuth : null,
    type === 'onedrive' && isAuthenticated ? currentFolderId : 'DISABLED',
    refreshKey
  );
  const googleDriveData = useGoogleDriveItems(
    type === 'google' && isAuthenticated ? accessToken : null,
    currentFolderId || 'root',
    refreshKey,
    onAuthExpired
  );

  const { items, loading, error } = type === 'onedrive' ? oneDriveData : googleDriveData;

  // Keep only IDs that actually exist in the current directory listing
  const activeSelectedIds = useMemo(() => {
    if (selectedIds.size === 0 || items.length === 0) return new Set();
    const validIds = new Set(items.map((it) => it.id));
    const filtered = new Set();
    selectedIds.forEach((id) => {
      if (validIds.has(id)) filtered.add(id);
    });
    return filtered;
  }, [selectedIds, items]);

  const selectedCount = activeSelectedIds.size;

  // Clear selection on Escape key
  useEffect(() => {
    if (selectedCount === 0) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setLastSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedCount]);

  const isValidDropPane =
    isAuthenticated &&
    canTransfer &&
    dragState &&
    dragState.sourcePaneId !== paneId &&
    dragState.sourceConnectionId !== connectionId;

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

  const clearSelection = () => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  };

  const handleFolderClick = (id, name) => {
    clearSelection();
    setCurrentFolderId(id);
    setBreadcrumbs((prev) => [...prev, { id, name }]);
  };

  const handleBreadcrumbClick = (index) => {
    clearSelection();
    if (index === 0) {
      setCurrentFolderId(null);
      setBreadcrumbs([]);
    } else {
      const crumb = breadcrumbs[index - 1];
      setCurrentFolderId(crumb.id);
      setBreadcrumbs((prev) => prev.slice(0, index));
    }
  };

  const selectRangeTo = (targetId) => {
    const startIdx = items.findIndex((it) => it.id === lastSelectedId);
    const endIdx = items.findIndex((it) => it.id === targetId);
    if (startIdx === -1 || endIdx === -1) {
      setSelectedIds(new Set([targetId]));
      setLastSelectedId(targetId);
      return;
    }
    const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
    const next = new Set(activeSelectedIds);
    for (let i = lo; i <= hi; i += 1) {
      next.add(items[i].id);
    }
    setSelectedIds(next);
  };

  const handleToggleSelect = (item, e) => {
    if (e?.shiftKey && lastSelectedId) {
      selectRangeTo(item.id);
      return;
    }
    const next = new Set(activeSelectedIds);
    if (next.has(item.id)) {
      next.delete(item.id);
    } else {
      next.add(item.id);
    }
    setSelectedIds(next);
    setLastSelectedId(item.id);
  };

  const handleRowSelect = (item, e) => {
    if (e?.shiftKey && lastSelectedId) {
      selectRangeTo(item.id);
      return;
    }
    if (e?.ctrlKey || e?.metaKey) {
      handleToggleSelect(item, e);
      return;
    }
    if (activeSelectedIds.size === 1 && activeSelectedIds.has(item.id)) {
      clearSelection();
    } else {
      setSelectedIds(new Set([item.id]));
      setLastSelectedId(item.id);
    }
  };

  const handleToggleSelectAll = () => {
    if (items.length === 0) return;
    if (activeSelectedIds.size === items.length) {
      clearSelection();
    } else {
      setSelectedIds(new Set(items.map((it) => it.id)));
      setLastSelectedId(items[0].id);
    }
  };

  const handleDragStartItem = (item, e) => {
    const itemsToDrag = activeSelectedIds.has(item.id)
      ? items.filter((it) => activeSelectedIds.has(it.id))
      : [item];

    const dragPayload = {
      sourcePaneId: paneId,
      sourceConnectionId: connectionId,
      sourceCloud: type,
      items: itemsToDrag,
    };

    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('application/x-multicloud-items', JSON.stringify(dragPayload));
    e.dataTransfer.setData('text/plain', itemsToDrag.map((it) => it.name).join(', '));

    if (itemsToDrag.length > 1) {
      const badge = createMultiDragBadge(itemsToDrag.length);
      e.dataTransfer.setDragImage(badge, 14, 14);
      requestAnimationFrame(() => badge.remove());
    }

    onDragStartItems?.(dragPayload, clearSelection);
  };

  const handleDragEndItem = () => {
    onDragEndItems?.();
  };

  const extractDragPayload = (dataTransfer) => {
    if (dragState) return dragState;
    try {
      const raw = dataTransfer?.getData('application/x-multicloud-items');
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

    if (
      !payload ||
      payload.sourceConnectionId === connectionId ||
      !payload.items?.length
    ) {
      return;
    }

    const mode = e.shiftKey
      ? transferMode === 'copy'
        ? 'move'
        : 'copy'
      : transferMode;

    onDropItems?.({
      sourceConnectionId: payload.sourceConnectionId,
      items: payload.items,
      targetConnectionId: connectionId,
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

    if (
      !payload ||
      payload.sourceConnectionId === connectionId ||
      !payload.items?.length
    ) {
      return;
    }

    const mode = isShiftKey
      ? transferMode === 'copy'
        ? 'move'
        : 'copy'
      : transferMode;

    onDropItems?.({
      sourceConnectionId: payload.sourceConnectionId,
      items: payload.items,
      targetConnectionId: connectionId,
      targetFolderId: targetFolder.id,
      targetFolderName: targetFolder.name,
      mode,
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="cloud-pane cloud-pane--locked-shell">
        <div className="pane-header-wrap pane-header-wrap--locked">
          <div className="pane-title-row pane-title-row--locked">
            <ConnectionPicker
              paneId={paneId}
              connection={connection}
              connections={connections}
              onSelectConnection={onSelectConnection}
            />
          </div>
        </div>

        <div className="cloud-pane--locked">
          <div className="pane-auth-card">
            <h3>{title}</h3>
            {isConnecting ? (
              <>
                <div className="pane-auth-connecting">
                  <FiRefreshCw className="pane-spin" size={16} />
                  <span>Connecting…</span>
                </div>
                <p className="pane-auth-sub">Using your saved connection settings</p>
              </>
            ) : (
              <>
                <p>
                  Sign in to browse your {type === 'google' ? 'Google Drive' : 'OneDrive'} files
                  {connection?.savedEmail ? ` (${connection.savedEmail})` : ''}.
                </p>
                {authNotice && <p className="pane-auth-notice">{authNotice}</p>}
                <div className="pane-auth-actions">
                  <button className="login-btn-small" onClick={onLogin}>
                    Sign in
                  </button>
                  {onOpenSettings && (
                    <button
                      type="button"
                      className="pane-settings-link"
                      onClick={onOpenSettings}
                    >
                      <FiSettings size={13} />
                      <span>Connection Settings</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handleRenameClick = () => {
    if (selectedCount !== 1) return;
    const selectedItem = items.find((it) => activeSelectedIds.has(it.id));
    if (!selectedItem) return;
    onRequestRename?.({
      connectionId,
      cloud: type,
      title,
      item: selectedItem,
      clearSelection,
    });
  };

  const handleDeleteClick = () => {
    if (selectedCount === 0) return;
    const selectedItems = items.filter((it) => activeSelectedIds.has(it.id));
    onRequestDelete?.({
      connectionId,
      cloud: type,
      title,
      items: selectedItems,
      clearSelection,
    });
  };

  const handlePaneKeyDown = (e) => {
    if (e.key === 'Delete' && selectedCount > 0) {
      e.preventDefault();
      handleDeleteClick();
    } else if (e.key === 'F2' && selectedCount === 1) {
      e.preventDefault();
      handleRenameClick();
    }
  };

  const draggedItems = dragState?.items || [];
  const dragLabel =
    draggedItems.length > 1
      ? `${draggedItems.length} items`
      : draggedItems.length === 1
      ? `“${draggedItems[0].name}”`
      : 'item';

  return (
    <div
      className={`cloud-pane ${showDropActive ? 'cloud-pane--drop-active' : ''} ${
        showDropActive && effectiveMode === 'move' ? 'cloud-pane--drop-move' : ''
      }`}
      onKeyDown={handlePaneKeyDown}
      onDragOver={handlePaneDragOver}
      onDragLeave={handlePaneDragLeave}
      onDrop={handlePaneDrop}
    >
      <div className="pane-header-wrap">
        <div className="pane-title-row">
          <div className="pane-title-group">
            <ConnectionPicker
              paneId={paneId}
              connection={connection}
              connections={connections}
              onSelectConnection={onSelectConnection}
            />
            {selectedCount > 0 && (
              <div className="pane-selection-pill" aria-live="polite">
                <span>{selectedCount} selected</span>
                <button
                  type="button"
                  className="pane-selection-clear"
                  onClick={clearSelection}
                  title="Clear selection (Esc)"
                  aria-label="Clear selection"
                >
                  <FiX size={12} />
                </button>
              </div>
            )}
          </div>
          <div className="pane-actions">
            {selectedCount === 1 && (
              <button
                type="button"
                className="pane-rename-btn"
                onClick={handleRenameClick}
                title="Rename selected item (F2)"
                aria-label={`Rename selected item in ${title}`}
              >
                <FiEdit2 size={13} />
                <span>Rename</span>
              </button>
            )}
            {selectedCount > 0 && (
              <button
                type="button"
                className="pane-delete-btn"
                onClick={handleDeleteClick}
                title={`Delete selected ${selectedCount === 1 ? 'item' : 'items'} (Del)`}
                aria-label={`Delete ${selectedCount} selected item${selectedCount === 1 ? '' : 's'} from ${title}`}
              >
                <FiTrash2 size={13} />
                <span>Delete</span>
              </button>
            )}
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
          paneId={paneId}
          connectionId={connectionId}
          canTransfer={canTransfer}
          dragState={dragState}
          selectedIds={activeSelectedIds}
          onToggleSelect={handleToggleSelect}
          onRowSelect={handleRowSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onFolderClick={handleFolderClick}
          onDragStartItem={handleDragStartItem}
          onDragEndItem={handleDragEndItem}
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
              {dragLabel} &rarr; {title}
              {activeHoveredFolder
                ? ` / ${activeHoveredFolder}`
                : breadcrumbs.length > 0
                ? ` / ${currentFolderLabel}`
                : ''}
            </span>
            <span className="pane-drop-hint">
              {activeShiftHeld
                ? 'Shift active'
                : `Hold Shift to ${transferMode === 'copy' ? 'Move' : 'Copy'}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
