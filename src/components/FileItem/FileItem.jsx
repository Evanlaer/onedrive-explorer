import './FileItem.css';
import { getFileIconConfig } from '../../utils/fileIcons';
import { formatBytes, formatDate } from '../../utils/formatters';
import {
  FiFolder, FiFile, FiFileText, FiImage, FiVideo, FiMusic,
  FiCode, FiArchive, FiFileMinus,
} from 'react-icons/fi';
import { BsFilePdf, BsFiletypeXlsx, BsFiletypeDocx, BsFiletypePptx } from 'react-icons/bs';

function FileIcon({ config }) {
  const style = { color: config.color, fontSize: '22px', flexShrink: 0 };
  switch (config.type) {
    case 'folder':   return <FiFolder  style={{ ...style, fontSize: '22px' }} />;
    case 'pdf':      return <BsFilePdf style={style} />;
    case 'word':     return <BsFiletypeDocx style={style} />;
    case 'excel':    return <BsFiletypeXlsx style={style} />;
    case 'ppt':      return <BsFiletypePptx style={style} />;
    case 'image':    return <FiImage   style={style} />;
    case 'video':    return <FiVideo   style={style} />;
    case 'audio':    return <FiMusic   style={style} />;
    case 'text':     return <FiFileText style={style} />;
    case 'code':     return <FiCode    style={style} />;
    case 'archive':  return <FiArchive style={style} />;
    default:         return <FiFile    style={style} />;
  }
}

export default function FileItem({ item, onClick }) {
  const config = getFileIconConfig(item);
  const isFolder = !!item.folder;

  const handleClick = () => {
    if (isFolder) onClick(item);
  };

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && isFolder) onClick(item);
  };

  return (
    <div
      className={`file-item ${isFolder ? 'file-item--folder' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={isFolder ? 'button' : 'listitem'}
      tabIndex={isFolder ? 0 : -1}
      aria-label={`${isFolder ? 'Folder' : 'File'}: ${item.name}`}
      id={`file-item-${item.id}`}
    >
      <div className="file-item-icon">
        <FileIcon config={config} />
      </div>

      <div className="file-item-info">
        <span className="file-item-name" title={item.name}>{item.name}</span>
        <div className="file-item-meta">
          <span className="file-item-type">{config.label}</span>
          {!isFolder && (
            <>
              <span className="file-item-dot">·</span>
              <span>{formatBytes(item.size)}</span>
            </>
          )}
          {isFolder && item.folder?.childCount != null && (
            <>
              <span className="file-item-dot">·</span>
              <span>{item.folder.childCount} items</span>
            </>
          )}
        </div>
      </div>

      <div className="file-item-date">{formatDate(item.lastModifiedDateTime)}</div>

      {isFolder && (
        <div className="file-item-arrow" aria-hidden="true">›</div>
      )}
    </div>
  );
}
