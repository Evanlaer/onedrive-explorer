/**
 * Converts bytes to a human-readable size string.
 * e.g. 1536 → "1.5 KB"
 */
export function formatBytes(bytes) {
  if (bytes == null || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Formats an ISO date string to a short, readable format.
 * e.g. "2024-10-20T14:32:00Z" → "Oct 20, 2024"
 */
export function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Extracts the file extension from a filename.
 * e.g. "budget.xlsx" → "xlsx"
 */
export function getExtension(name) {
  if (!name) return '';
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}
