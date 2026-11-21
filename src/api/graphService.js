import { getAccessToken } from '../auth/authService';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024; // 4 MB
const CHUNK_SIZE = 320 * 1024 * 16; // 5 MiB (must be a multiple of 320 KiB)
const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGINATION_PAGES = 200;

/**
 * Sanitizes characters forbidden in OneDrive item names.
 */
function sanitizeOneDriveName(name) {
  return (name || 'untitled').replace(/[\\/:*?"<>|]/g, '_').trim() || 'untitled';
}

/**
 * Formats a clear error message from a failed Microsoft Graph response.
 */
async function buildGraphError(response, action) {
  let details = response.statusText;
  try {
    const body = await response.json();
    if (body?.error?.message) details = body.error.message;
  } catch {
    // ignore non-JSON body
  }
  if (response.status === 403 || response.status === 401) {
    return new Error(
      `OneDrive permission denied while ${action}. Please sign out of OneDrive and sign back in to grant read/write access.`
    );
  }
  return new Error(`OneDrive error (${response.status}) while ${action}: ${details}`);
}

/**
 * Makes an authenticated GET request to the Microsoft Graph API.
 * Accepts either a relative Graph path (e.g. '/me/drive/root/children')
 * or an absolute @odata.nextLink URL on graph.microsoft.com.
 */
async function graphGet(msalInstance, endpointOrUrl) {
  const token = await getAccessToken(msalInstance);
  let targetUrl;
  if (endpointOrUrl.startsWith('https://')) {
    const parsed = new URL(endpointOrUrl);
    if (parsed.hostname.toLowerCase() !== 'graph.microsoft.com') {
      throw new Error(`Unexpected OneDrive pagination host: ${parsed.hostname}`);
    }
    targetUrl = parsed.toString();
  } else {
    targetUrl = `${GRAPH_BASE}${endpointOrUrl}`;
  }

  const response = await fetch(targetUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await buildGraphError(response, 'reading files');
  }
  return response.json();
}

/**
 * Fetches the current user's profile (name, email, avatar).
 */
export async function getUserProfile(msalInstance) {
  return graphGet(msalInstance, '/me?$select=displayName,mail,userPrincipalName');
}

/**
 * Fetches a single page of items for the OneDrive root (folderId = null) or a subfolder.
 * Pass `nextLink` (from `@odata.nextLink`) to fetch the next page.
 */
export async function getOneDriveItemsPage(
  msalInstance,
  folderId = null,
  nextLink = null,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const endpoint =
    nextLink ||
    (folderId
      ? `/me/drive/items/${folderId}/children?$select=id,name,folder,file,size,lastModifiedDateTime&$orderby=name&$top=${pageSize}`
      : `/me/drive/root/children?$select=id,name,folder,file,size,lastModifiedDateTime&$orderby=name&$top=${pageSize}`);

  const data = await graphGet(msalInstance, endpoint);
  return {
    items: data.value || [],
    nextLink: data['@odata.nextLink'] || null,
  };
}

/**
 * Fetches ALL items across every @odata.nextLink page for a folder (or root when folderId is null).
 * Used by recursive folder transfers so folders with > 200 items are never truncated.
 */
async function getAllOneDriveItems(msalInstance, folderId = null) {
  const all = [];
  const seenIds = new Set();
  let nextLink = null;
  let pageCount = 0;

  do {
    const page = await getOneDriveItemsPage(msalInstance, folderId, nextLink, 500);
    for (const item of page.items) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        all.push(item);
      }
    }
    nextLink = page.nextLink;
    pageCount += 1;
  } while (nextLink && pageCount < MAX_PAGINATION_PAGES);

  return sortItems(all);
}

/**
 * Fetches all items in the OneDrive root folder (folders first, then files, alphabetically).
 */
export async function getRootItems(msalInstance) {
  return getAllOneDriveItems(msalInstance, null);
}

/**
 * Fetches all items inside a specific folder by its ID (following all pagination links).
 */
export async function getFolderChildren(msalInstance, folderId) {
  return getAllOneDriveItems(msalInstance, folderId);
}

/**
 * Fetches only top-level folders for the sidebar.
 */
export async function getRootFolders(msalInstance) {
  const items = await getRootItems(msalInstance);
  return items.filter((item) => item.folder);
}

/**
 * Resolves the source download descriptor for a OneDrive file so it can be
 * streamed directly by the local transfer relay without passing large blobs through the browser.
 */
export async function getOneDriveDownloadDescriptor(msalInstance, item) {
  let downloadUrl = item['@microsoft.graph.downloadUrl'];

  if (!downloadUrl) {
    const freshItem = await graphGet(msalInstance, `/me/drive/items/${item.id}`);
    downloadUrl = freshItem['@microsoft.graph.downloadUrl'];
  }

  const mimeType = item.file?.mimeType || 'application/octet-stream';

  if (downloadUrl) {
    return {
      url: downloadUrl,
      authHeader: null,
      fileName: item.name,
      mimeType,
    };
  }

  const token = await getAccessToken(msalInstance);
  return {
    url: `${GRAPH_BASE}/me/drive/items/${item.id}/content`,
    authHeader: `Bearer ${token}`,
    fileName: item.name,
    mimeType,
  };
}

/**
 * Downloads a file from OneDrive as a Blob (browser fallback when relay is unavailable).
 */
export async function downloadOneDriveFile(msalInstance, item) {
  const descriptor = await getOneDriveDownloadDescriptor(msalInstance, item);
  const headers = descriptor.authHeader ? { Authorization: descriptor.authHeader } : undefined;
  const response = await fetch(descriptor.url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to download "${item.name}" from OneDrive (${response.status}).`);
  }

  const blob = await response.blob();
  const mimeType = descriptor.mimeType || blob.type || 'application/octet-stream';
  return { blob, fileName: descriptor.fileName, mimeType };
}

/**
 * Uploads a Blob to OneDrive under parentFolderId (null/undefined = root).
 * Uses simple PUT for files <= 4 MB and a resumable upload session for larger files.
 */
export async function uploadOneDriveFile(
  msalInstance,
  parentFolderId,
  fileName,
  blob,
  mimeType = 'application/octet-stream',
  onProgress
) {
  const token = await getAccessToken(msalInstance);
  const safeName = sanitizeOneDriveName(fileName);
  const encodedName = encodeURIComponent(safeName);
  const basePath = parentFolderId
    ? `/me/drive/items/${parentFolderId}:/${encodedName}:`
    : `/me/drive/root:/${encodedName}:`;

  if (blob.size <= SIMPLE_UPLOAD_LIMIT) {
    const response = await fetch(
      `${GRAPH_BASE}${basePath}/content?@microsoft.graph.conflictBehavior=rename`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': mimeType || 'application/octet-stream',
        },
        body: blob,
      }
    );

    if (!response.ok) {
      throw await buildGraphError(response, `uploading "${safeName}"`);
    }

    onProgress?.(100);
    return response.json();
  }

  // Large file (> 4 MB): Resumable upload session
  const sessionRes = await fetch(`${GRAPH_BASE}${basePath}/createUploadSession`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      item: {
        '@microsoft.graph.conflictBehavior': 'rename',
        name: safeName,
      },
    }),
  });

  if (!sessionRes.ok) {
    throw await buildGraphError(sessionRes, `starting upload session for "${safeName}"`);
  }

  const { uploadUrl } = await sessionRes.json();
  const totalSize = blob.size;
  let offset = 0;
  let uploadedItem = null;

  while (offset < totalSize) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize);
    const chunk = blob.slice(offset, end);

    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes ${offset}-${end - 1}/${totalSize}`,
      },
      body: chunk,
    });

    if (!chunkRes.ok && chunkRes.status !== 202) {
      throw new Error(`Chunk upload failed for "${safeName}" (${chunkRes.status}).`);
    }

    offset = end;
    onProgress?.(Math.round((offset / totalSize) * 100));

    if (chunkRes.status === 200 || chunkRes.status === 201) {
      uploadedItem = await chunkRes.json();
    }
  }

  return uploadedItem;
}

/**
 * Creates a new folder in OneDrive under parentFolderId (null/undefined = root).
 */
export async function createOneDriveFolder(msalInstance, parentFolderId, folderName) {
  const token = await getAccessToken(msalInstance);
  const safeName = sanitizeOneDriveName(folderName);
  const endpoint = parentFolderId
    ? `/me/drive/items/${parentFolderId}/children`
    : '/me/drive/root/children';

  const response = await fetch(`${GRAPH_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: safeName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename',
    }),
  });

  if (!response.ok) {
    throw await buildGraphError(response, `creating folder "${safeName}"`);
  }

  return response.json();
}

/**
 * Renames a file or folder in OneDrive.
 */
export async function renameOneDriveItem(msalInstance, itemId, newName) {
  const trimmed = (newName || '').trim();
  if (!trimmed) {
    throw new Error('Name cannot be empty.');
  }
  if (/[\\/:*?"<>|]/.test(trimmed)) {
    throw new Error('OneDrive names cannot contain \\ / : * ? " < > |');
  }

  const token = await getAccessToken(msalInstance);
  const response = await fetch(`${GRAPH_BASE}/me/drive/items/${itemId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: trimmed }),
  });

  if (!response.ok) {
    throw await buildGraphError(response, `renaming item to "${trimmed}"`);
  }

  return response.json();
}

/**
 * Deletes an item in OneDrive (moves it to OneDrive Recycle Bin).
 */
export async function deleteOneDriveItem(msalInstance, itemId) {
  const token = await getAccessToken(msalInstance);
  const response = await fetch(`${GRAPH_BASE}/me/drive/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok && response.status !== 204) {
    throw await buildGraphError(response, 'removing original item');
  }
}

/**
 * Sorts items: folders first, then files, both alphabetically.
 */
export function sortItems(items) {
  return [...items].sort((a, b) => {
    const aIsFolder = !!a.folder;
    const bIsFolder = !!b.folder;
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return a.name.localeCompare(b.name);
  });
}
