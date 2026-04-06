import './FileList.css';
import FileItem from '../FileItem/FileItem';
import { FiFolder } from 'react-icons/fi';

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

export default function FileList({ items, loading, error, onFolderClick }) {
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
        <p className="filelist-empty-sub">No files or folders found here.</p>
      </div>
    );
  }

  return (
    <div className="filelist" role="list" aria-label="Files and folders">
      <div className="filelist-header">
        <span>Name</span>
        <span />
        <span>Modified</span>
      </div>
      <div className="filelist-items">
        {items.map((item) => (
          <FileItem
            key={item.id}
            item={item}
            onClick={(folder) => onFolderClick(folder.id, folder.name)}
          />
        ))}
      </div>
    </div>
  );
}
