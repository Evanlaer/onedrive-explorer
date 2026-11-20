import './FileItem.css';
import { useState } from 'react';
import { getFileIconConfig } from '../../utils/fileIcons';
import { formatBytes, formatDate } from '../../utils/formatters';
import { isItemFolder } from '../../api/transferService';
import {
  FiFolder, FiFile, FiFileText, FiImage, FiVideo, FiMusic,
  FiCode, FiArchive,
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

export default function FileItem({
  item,
  cloudType,
  canTransfer,
  dragState,
  onClick,
  onDragStartItem,
  onDragEndItem,
  onDropOnFolder,
  onFolderHoverChange,
}) {
  const config = getFileIconConfig(item);
  const isFolder = isItemFolder(item);
  const modifiedDate = item.lastModifiedDateTime || item.modifiedTime;

  const [isDragging, setIsDragging] = useState(false);
  const [isFolderDropOver, setIsFolderDropOver] = useState(false);

  const isValidFolderDropTarget =
    isFolder && canTransfer && dragState && dragState.sourceCloud !== cloudType;

  const handleClick = () => {
    if (isFolder) onClick(item);
  };

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && isFolder) {
      e.preventDefault();
      onClick(item);
    }
  };

  const handleDragStart = (e) => {
    if (!canTransfer) {
      e.preventDefault();
      return;
    }
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData(
      'application/x-multicloud-item',
      JSON.stringify({ sourceCloud: cloudType, item })
    );
    e.dataTransfer.setData('text/plain', item.name);
    onDragStartItem?.(cloudType, item);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEndItem?.();
  };

  const handleDragOver = (e) => {
    if (!isValidFolderDropTarget) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.shiftKey ? 'move' : 'copy';
    if (!isFolderDropOver) {
      setIsFolderDropOver(true);
      onFolderHoverChange?.(item.name);
    }
  };

  const handleDragLeave = (e) => {
    if (!isValidFolderDropTarget) return;
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsFolderDropOver(false);
      onFolderHoverChange?.(null);
    }
  };

  const handleDrop = (e) => {
    if (!isValidFolderDropTarget) return;
    e.preventDefault();
    e.stopPropagation();
    setIsFolderDropOver(false);
    onFolderHoverChange?.(null);
    onDropOnFolder?.(item, e.shiftKey, e.dataTransfer);
  };

  const classes = [
    'file-item',
    isFolder ? 'file-item--folder' : '',
    canTransfer ? 'file-item--draggable' : '',
    isDragging ? 'file-item--dragging' : '',
    isFolderDropOver ? 'file-item--drop-target' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      draggable={canTransfer}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role={isFolder ? 'button' : 'listitem'}
      tabIndex={isFolder ? 0 : -1}
      aria-label={`${isFolder ? 'Folder' : 'File'}: ${item.name}`}
      id={`file-item-${cloudType}-${item.id}`}
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

      <div className="file-item-date">{formatDate(modifiedDate)}</div>

      {isFolder && (
        <div className="file-item-arrow" aria-hidden="true">›</div>
      )}
    </div>
  );
}
