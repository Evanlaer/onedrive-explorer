import './FileList.css';
import { useEffect, useRef } from 'react';
import FileItem from '../FileItem/FileItem';
import { FiFolder, FiCheck, FiMinus, FiLoader } from 'react-icons/fi';

function LoadingSkeleton() {
  return (
    <div className="filelist-skeleton">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="filelist-skeleton-item">
          <div className="skeleton-icon" />
          <div className="skeleton-info">
            <div className="skeleton-bar skeleton-name" />
            <div className="skeleton-bar skeleton-meta" />
          </div>
          <div className="skeleton-bar skeleton-date" />
        </div>
      ))}
    </div>
  );
}

export default function FileList({
  items,
  loading,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  onLoadAll,
  error,
  loadMoreError = null,
  paneId,
  connectionId,
  canTransfer,
  dragState,
  selectedIds,
  onToggleSelect,
  onRowSelect,
  onToggleSelectAll,
  onFolderClick,
  onDragStartItem,
  onDragEndItem,
  onDropOnFolder,
  onFolderHoverChange,
}) {
  const scrollContainerRef = useRef(null);
  const sentinelRef = useRef(null);

  // Automatic infinite scroll when approaching the bottom of a paginated folder
  useEffect(() => {
    if (!hasMore || loadingMore || loadMoreError || !onLoadMore) return undefined;
    const root = scrollContainerRef.current;
    const target = sentinelRef.current;
    if (!root || !target || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore();
        }
      },
      { root, rootMargin: '240px 0px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMoreError, onLoadMore, items.length]);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="filelist-empty">
        <p className="filelist-empty-title">⚠️ Something went wrong</p>
        <p className="filelist-empty-sub">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="filelist-empty">
        <FiFolder size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
        <p className="filelist-empty-title">This folder is empty</p>
        <p className="filelist-empty-sub">
          {canTransfer
            ? 'Drop files or folders from the other cloud here.'
            : 'No files or folders found here.'}
        </p>
      </div>
    );
  }

  const selectedCount = selectedIds ? selectedIds.size : 0;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const someSelected = selectedCount > 0 && selectedCount < items.length;
  const hasAnySelection = selectedCount > 0;

  const draggedIdSet =
    dragState && dragState.sourcePaneId === paneId
      ? new Set((dragState.items || []).map((it) => it.id))
      : null;

  return (
    <div className="filelist" role="list" aria-label="Files and folders">
      <div className="filelist-header">
        <button
          type="button"
          className={`filelist-select-all ${
            allSelected || someSelected ? 'filelist-select-all--active' : ''
          }`}
          onClick={onToggleSelectAll}
          aria-label={allSelected ? 'Deselect all items' : 'Select all items'}
          title={allSelected ? 'Deselect all' : 'Select all'}
        >
          {allSelected && <FiCheck size={12} strokeWidth={3} />}
          {someSelected && <FiMinus size={12} strokeWidth={3} />}
        </button>
        <span className="filelist-header-name">
          Name
          <span className="filelist-header-count">
            ({items.length}
            {hasMore ? '+' : ''})
          </span>
        </span>
        <span className="filelist-header-date">Modified</span>
      </div>

      <div className="filelist-items" ref={scrollContainerRef}>
        {items.map((item) => (
          <FileItem
            key={item.id}
            item={item}
            paneId={paneId}
            connectionId={connectionId}
            canTransfer={canTransfer}
            dragState={dragState}
            isSelected={selectedIds ? selectedIds.has(item.id) : false}
            hasAnySelection={hasAnySelection}
            isBeingDragged={draggedIdSet ? draggedIdSet.has(item.id) : false}
            onClick={(folder) => onFolderClick(folder.id, folder.name)}
            onToggleSelect={onToggleSelect}
            onRowSelect={onRowSelect}
            onDragStartItem={onDragStartItem}
            onDragEndItem={onDragEndItem}
            onDropOnFolder={onDropOnFolder}
            onFolderHoverChange={onFolderHoverChange}
          />
        ))}

        {/* Pagination Sentinel & Footer */}
        <div className="filelist-footer" ref={sentinelRef}>
          {loadingMore ? (
            <div className="filelist-footer-loading">
              <FiLoader className="filelist-spin" size={14} />
              <span>Loading more items… ({items.length} loaded)</span>
            </div>
          ) : loadMoreError ? (
            <div className="filelist-footer-error">
              <span>{loadMoreError}</span>
              <button
                type="button"
                className="filelist-footer-btn"
                onClick={onLoadMore}
              >
                Retry
              </button>
            </div>
          ) : hasMore ? (
            <div className="filelist-footer-more">
              <span className="filelist-footer-count">
                Showing {items.length} items (more available)
              </span>
              <div className="filelist-footer-actions">
                <button
                  type="button"
                  className="filelist-footer-btn"
                  onClick={onLoadMore}
                >
                  Load more
                </button>
                <button
                  type="button"
                  className="filelist-footer-btn filelist-footer-btn--secondary"
                  onClick={onLoadAll}
                >
                  Load all
                </button>
              </div>
            </div>
          ) : (
            <span className="filelist-footer-done">
              {items.length} item{items.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
