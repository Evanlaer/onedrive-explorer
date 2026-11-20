import './FileList.css';
import FileItem from '../FileItem/FileItem';
import { FiFolder, FiCheck, FiMinus } from 'react-icons/fi';

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
  error,
  cloudType,
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
    dragState && dragState.sourceCloud === cloudType
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
        <span className="filelist-header-name">Name</span>
        <span className="filelist-header-date">Modified</span>
      </div>
      <div className="filelist-items">
        {items.map((item) => (
          <FileItem
            key={item.id}
            item={item}
            cloudType={cloudType}
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
      </div>
    </div>
  );
}
