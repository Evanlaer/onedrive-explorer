import './RenameModal.css';
import { useState, useEffect, useRef } from 'react';
import { FiEdit2, FiX, FiLoader } from 'react-icons/fi';
import { isItemFolder } from '../../api/transferService';

const ONEDRIVE_FORBIDDEN_RE = /[\\/:*?"<>|]/;

function RenameDialogContent({ pendingRename, onCancel, onSubmit }) {
  const { cloud, title, item } = pendingRename;
  const isFolder = isItemFolder(item);

  const [name, setName] = useState(item.name || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // For files with an extension, pre-select only the base name so the extension stays intact
    if (!isFolder) {
      const lastDot = input.value.lastIndexOf('.');
      if (lastDot > 0) {
        input.setSelectionRange(0, lastDot);
        return;
      }
    }
    input.select();
  }, [isFolder]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, submitting]);

  const trimmed = name.trim();
  const isUnchanged = trimmed === (item.name || '').trim();
  const hasInvalidChars = cloud === 'onedrive' && ONEDRIVE_FORBIDDEN_RE.test(trimmed);

  let validationMessage = null;
  if (!trimmed) {
    validationMessage = 'Name cannot be empty.';
  } else if (hasInvalidChars) {
    validationMessage = 'OneDrive names cannot contain \\ / : * ? " < > |';
  }

  const canSubmit = !submitting && !isUnchanged && !validationMessage;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(err?.message || 'Failed to rename item.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="rename-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-modal-title"
      onClick={() => !submitting && onCancel()}
    >
      <form
        className="rename-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="rename-header">
          <div className="rename-icon-wrap" aria-hidden="true">
            <FiEdit2 size={17} />
          </div>
          <div className="rename-title-wrap">
            <h3 id="rename-modal-title" className="rename-title">
              Rename {isFolder ? 'Folder' : 'File'}
            </h3>
            <span className="rename-cloud-label">{title}</span>
          </div>
          <button
            type="button"
            className="rename-close-btn"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Cancel"
          >
            <FiX size={16} />
          </button>
        </div>

        <div className="rename-field">
          <label htmlFor="rename-input" className="rename-label">
            New name
          </label>
          <input
            id="rename-input"
            ref={inputRef}
            type="text"
            className={`rename-input ${validationMessage || error ? 'rename-input--error' : ''}`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            disabled={submitting}
            autoComplete="off"
            spellCheck={false}
          />
          {validationMessage && (
            <p className="rename-error">{validationMessage}</p>
          )}
          {!validationMessage && error && (
            <p className="rename-error">{error}</p>
          )}
        </div>

        <div className="rename-actions">
          <button
            type="button"
            className="rename-btn rename-btn--cancel"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rename-btn rename-btn--primary"
            disabled={!canSubmit}
          >
            {submitting ? (
              <>
                <FiLoader className="rename-spin" size={14} />
                <span>Renaming…</span>
              </>
            ) : (
              <span>Save</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function RenameModal({ pendingRename, onCancel, onSubmit }) {
  if (!pendingRename) return null;
  return (
    <RenameDialogContent
      key={`${pendingRename.cloud}-${pendingRename.item.id}`}
      pendingRename={pendingRename}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  );
}
