/**
 * Google Drive API v3 Service — Authenticated REST requests.
 */

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';

/**
 * Makes an authenticated GET request to the Google Drive API.
 */
async function driveGet(accessToken, endpoint, params = {}) {
  const url = new URL(`${DRIVE_BASE}${endpoint}`);
  Object.keys(params).forEach((key) => url.searchParams.append(key, params[key]));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Google Drive API error: ${errorData.error?.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Fetches the currently authenticated user's profile info.
 * Note: Requires 'https://www.googleapis.com/auth/userinfo.profile' scope or similar.
 * Since we only have drive.readonly, we can also use 'about.get' for some info.
 */
export async function getGoogleUserProfile(accessToken) {
  const data = await driveGet(accessToken, '/about', { fields: 'user' });
  return data.user;
}

/**
 * Fetches the items in a given Google Drive folder ID.
 * Use 'root' for the initial drive root.
 * Returns folders first, then files, alphabetically.
 */
export async function getDriveItems(accessToken, folderId = 'root') {
  const data = await driveGet(accessToken, '/files', {
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size, modifiedTime, iconLink)',
    orderBy: 'folder,name', // Google supports 'folder' but usually still need client-side sorting
  });

  return sortDriveItems(data.files || []);
}

/**
 * Client-side sorting: folders first, then alphabetical.
 */
function sortDriveItems(items) {
  return [...items].sort((a, b) => {
    const aIsFolder = a.mimeType === 'application/vnd.google-apps.folder';
    const bIsFolder = b.mimeType === 'application/vnd.google-apps.folder';
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return a.name.localeCompare(b.name);
  });
}
