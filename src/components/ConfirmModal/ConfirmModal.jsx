import './ConfirmModal.css';
import { useEffect } from 'react';
import { FiTrash2, FiFolder, FiFile, FiX } from 'react-icons/fi';
import { isItemFolder } from '../../api/transferService';

export default function ConfirmModal({ pendingDelete, onCancel, onConfirm }) {
  useEffect(() => {
    if (!pendingDelete) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingDelete, onCancel]);

  if (!pendingDelete) return null;

  const { cloud, title, items } = pendingDelete;
  const count = items.length;
  const destinationBin = cloud === 'onedrive' ? 'OneDrive Recycle Bin' : 'Google Drive Trash';
  const heading =
    count === 1
      ? `Delete “${items[0].name}”?`
      : `Delete ${count} items from ${title}?`;

  const previewItems = items.slice(0, 6);
  const extraCount = count - previewItems.length;

  return (
    <div
      className="confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
      onClick={onCancel}
    >
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-header">
          <div className="confirm-icon-wrap" aria-hidden="true">
            <FiTrash2 size={18} />
          </div>
          <h3 id="confirm-delete-title" className="confirm-title">
            {heading}
          </h3>
          <button
            type="button"
            className="confirm-close-btn"
            onClick={onCancel}
            aria-label="Cancel"
          >
            <FiX size={16} />
          </button>
        </div>

        <p className="confirm-subtitle">
          {count === 1 ? 'This item' : `These ${count} items`} will be moved to your{' '}
          <strong>{destinationBin}</strong>.
        </p>

        <ul className="confirm-item-list">
          {previewItems.map((it) => (
            <li key={it.id} className="confirm-item-row">
              {isItemFolder(it) ? (
                <FiFolder size={14} className="confirm-item-icon confirm-item-icon--folder" />
              ) : (
                <FiFile size={14} className="confirm-item-icon" />
              )}
              <span className="confirm-item-name" title={it.name}>
                {it.name}
              </span>
            </li>
          ))}
          {extraCount > 0 && (
            <li className="confirm-item-more">
              …and {extraCount} more item{extraCount === 1 ? '' : 's'}
            </li>
          )}
        </ul>

        <div className="confirm-actions">
          <button type="button" className="confirm-btn confirm-btn--cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="confirm-btn confirm-btn--danger" onClick={onConfirm}>
            <FiTrash2 size={14} />
            <span>Delete{count > 1 ? ` (${count})` : ''}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
