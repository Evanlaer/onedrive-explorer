// Maps file extensions to icon styles
// Each entry: { icon: react-icons component name, color: hex }
// We export a function that components call to get the right icon config

export function getFileIconConfig(item) {
  if (item.folder) {
    return { type: 'folder', color: '#F5A623', label: 'Folder' };
  }

  const ext = item.name?.split('.').pop()?.toLowerCase() || '';

  const map = {
    // Documents
    pdf:  { type: 'pdf',   color: '#E53935', label: 'PDF' },
    doc:  { type: 'word',  color: '#1565C0', label: 'Word' },
    docx: { type: 'word',  color: '#1565C0', label: 'Word' },
    xls:  { type: 'excel', color: '#2E7D32', label: 'Excel' },
    xlsx: { type: 'excel', color: '#2E7D32', label: 'Excel' },
    csv:  { type: 'excel', color: '#2E7D32', label: 'CSV' },
    ppt:  { type: 'ppt',   color: '#E65100', label: 'PowerPoint' },
    pptx: { type: 'ppt',   color: '#E65100', label: 'PowerPoint' },
    txt:  { type: 'text',  color: '#78909C', label: 'Text' },
    md:   { type: 'text',  color: '#78909C', label: 'Markdown' },

    // Images
    jpg:  { type: 'image', color: '#7B1FA2', label: 'Image' },
    jpeg: { type: 'image', color: '#7B1FA2', label: 'Image' },
    png:  { type: 'image', color: '#7B1FA2', label: 'Image' },
    gif:  { type: 'image', color: '#7B1FA2', label: 'GIF' },
    svg:  { type: 'image', color: '#7B1FA2', label: 'SVG' },
    webp: { type: 'image', color: '#7B1FA2', label: 'Image' },
    heic: { type: 'image', color: '#7B1FA2', label: 'Image' },

    // Video
    mp4:  { type: 'video', color: '#EF6C00', label: 'Video' },
    mov:  { type: 'video', color: '#EF6C00', label: 'Video' },
    avi:  { type: 'video', color: '#EF6C00', label: 'Video' },
    mkv:  { type: 'video', color: '#EF6C00', label: 'Video' },

    // Audio
    mp3:  { type: 'audio', color: '#00838F', label: 'Audio' },
    wav:  { type: 'audio', color: '#00838F', label: 'Audio' },
    m4a:  { type: 'audio', color: '#00838F', label: 'Audio' },

    // Code
    js:   { type: 'code', color: '#F9A825', label: 'JavaScript' },
    ts:   { type: 'code', color: '#1976D2', label: 'TypeScript' },
    py:   { type: 'code', color: '#00695C', label: 'Python' },
    html: { type: 'code', color: '#BF360C', label: 'HTML' },
    css:  { type: 'code', color: '#6A1B9A', label: 'CSS' },
    json: { type: 'code', color: '#F9A825', label: 'JSON' },

    // Archives
    zip:  { type: 'archive', color: '#5D4037', label: 'ZIP' },
    rar:  { type: 'archive', color: '#5D4037', label: 'RAR' },
    '7z': { type: 'archive', color: '#5D4037', label: '7-Zip' },
  };

  return map[ext] || { type: 'generic', color: '#546E7A', label: ext.toUpperCase() || 'File' };
}
