/**
 * Google Drive API v3 Service — Authenticated REST requests.
 */

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const MULTIPART_UPLOAD_LIMIT = 5 * 1024 * 1024; // 5 MB
const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGINATION_PAGES = 200;

/**
 * Automatic Office export mapping for Google Workspace native files.
 */
export const GOOGLE_EXPORT_MAP = {
  'application/vnd.google-apps.document': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: '.docx',
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: '.xlsx',
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ext: '.pptx',
  },
  'application/vnd.google-apps.drawing': {
    mimeType: 'image/png',
    ext: '.png',
  },
};

/**
 * Formats a helpful error message from a failed Google Drive API response.
 */
async function buildGoogleError(response, action) {
  let details = response.statusText;
  try {
    const body = await response.json();
    if (body?.error?.message) details = body.error.message;
  } catch {
    // ignore non-JSON body
  }
  if (response.status === 401) {
    const err = new Error(
      'Your Google Drive session expired (tokens last 1 hour). Please sign in again.'
    );
    err.code = 'AUTH_EXPIRED';
    return err;
  }
  if (response.status === 403) {
    return new Error(
      `Google Drive permission denied while ${action}. Please sign out of Google Drive and sign back in to grant read/write access.`
    );
  }
  return new Error(`Google Drive error (${response.status}) while ${action}: ${details}`);
}

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
    throw await buildGoogleError(response, 'reading files');
  }

  return response.json();
}

/**
 * Fetches the currently authenticated user's profile info.
 */
export async function getGoogleUserProfile(accessToken) {
  const data = await driveGet(accessToken, '/about', { fields: 'user' });
  return data.user;
}

/**
 * Fetches a single page of items in a Google Drive folder (`folderId = 'root'` for Drive root).
 * Requests `nextPageToken` so folders with > 200 items can be paginated completely.
 */
export async function getGoogleDriveItemsPage(
  accessToken,
  folderId = 'root',
  pageToken = null,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const params = {
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, iconLink)',
    orderBy: 'folder,name',
    pageSize: String(pageSize),
  };
  if (pageToken) {
    params.pageToken = pageToken;
  }

  const data = await driveGet(accessToken, '/files', params);
  return {
    items: data.files || [],
    nextPageToken: data.nextPageToken || null,
  };
}

/**
 * Fetches ALL items in a Google Drive folder across every `nextPageToken` page.
 * Used by recursive folder transfers so folders with > 200 items are never truncated.
 */
export async function getDriveItems(accessToken, folderId = 'root') {
  const all = [];
  const seenIds = new Set();
  let pageToken = null;
  let pageCount = 0;

  do {
    const page = await getGoogleDriveItemsPage(accessToken, folderId, pageToken, 1000);
    for (const item of page.items) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        all.push(item);
      }
    }
    pageToken = page.nextPageToken;
    pageCount += 1;
  } while (pageToken && pageCount < MAX_PAGINATION_PAGES);

  return sortDriveItems(all);
}

/**
 * Resolves the source download/export descriptor for a Google Drive file.
 * Google Workspace native files (Docs, Sheets, Slides, Drawings) are automatically mapped
 * to their corresponding Office/PNG export endpoints.
 */
export function getGoogleDriveDownloadDescriptor(accessToken, item) {
  const mime = item.mimeType || '';
  const isGoogleNative = mime.startsWith('application/vnd.google-apps.');

  if (isGoogleNative) {
    const exportCfg = GOOGLE_EXPORT_MAP[mime];
    if (!exportCfg) {
      throw new Error(
        `"${item.name}" is a Google-native item (${mime}) that cannot be exported as a file.`
      );
    }

    const url = new URL(`${DRIVE_BASE}/files/${item.id}/export`);
    url.searchParams.set('mimeType', exportCfg.mimeType);
    const hasExt = item.name.toLowerCase().endsWith(exportCfg.ext);

    return {
      url: url.toString(),
      authHeader: `Bearer ${accessToken}`,
      fileName: hasExt ? item.name : `${item.name}${exportCfg.ext}`,
      mimeType: exportCfg.mimeType,
    };
  }

  return {
    url: `${DRIVE_BASE}/files/${item.id}?alt=media`,
    authHeader: `Bearer ${accessToken}`,
    fileName: item.name,
    mimeType: mime || 'application/octet-stream',
  };
}

/**
 * Downloads a file from Google Drive as a Blob (browser fallback when relay is unavailable).
 */
export async function downloadGoogleDriveFile(accessToken, item) {
  const descriptor = getGoogleDriveDownloadDescriptor(accessToken, item);
  const response = await fetch(descriptor.url, {
    headers: { Authorization: descriptor.authHeader },
  });

  if (!response.ok) {
    throw await buildGoogleError(response, `downloading "${item.name}"`);
  }

  const blob = await response.blob();
  return {
    blob,
    fileName: descriptor.fileName,
    mimeType: descriptor.mimeType || blob.type || 'application/octet-stream',
  };
}

/**
 * Uploads a Blob to Google Drive inside parentFolderId (defaults to 'root').
 * Uses multipart upload for <= 5 MB and resumable chunked upload for larger files.
 */
export async function uploadGoogleDriveFile(
  accessToken,
  parentFolderId = 'root',
  fileName,
  blob,
  mimeType = 'application/octet-stream',
  onProgress
) {
  const metadata = {
    name: fileName,
    parents: [parentFolderId || 'root'],
  };
  const contentType = mimeType || 'application/octet-stream';

  if (blob.size <= MULTIPART_UPLOAD_LIMIT) {
    const boundary = `multicloud_boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartBody = new Blob([
      delimiter,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      delimiter,
      `Content-Type: ${contentType}\r\n\r\n`,
      blob,
      closeDelimiter,
    ]);

    const response = await fetch(
      `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );

    if (!response.ok) {
      throw await buildGoogleError(response, `uploading "${fileName}"`);
    }

    onProgress?.(100);
    return response.json();
  }

  // Large file (> 5 MB): Single-PUT Resumable upload via XHR
  // (avoids browser fetch() CORS/redirect failures on HTTP 308 Resume Incomplete
  // and provides smooth live upload progress)
  const initRes = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=resumable&fields=id,name,mimeType,size,modifiedTime`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType,
        'X-Upload-Content-Length': String(blob.size),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    throw await buildGoogleError(initRes, `starting resumable upload for "${fileName}"`);
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) {
    throw new Error(`Google Drive did not return a resumable upload URL for "${fileName}".`);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ name: fileName });
        }
      } else {
        reject(
          new Error(
            `Google Drive upload error (${xhr.status}) for "${fileName}": ${xhr.statusText || xhr.responseText}`
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error(`Network error while uploading "${fileName}" to Google Drive.`));
    };

    xhr.send(blob);
  });
}

/**
 * Creates a folder in Google Drive inside parentFolderId (defaults to 'root').
 */
export async function createGoogleDriveFolder(accessToken, parentFolderId = 'root', folderName) {
  const response = await fetch(`${DRIVE_BASE}/files?fields=id,name,mimeType`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId || 'root'],
    }),
  });

  if (!response.ok) {
    throw await buildGoogleError(response, `creating folder "${folderName}"`);
  }

  return response.json();
}

/**
 * Renames a file or folder in Google Drive.
 */
export async function renameGoogleDriveItem(accessToken, itemId, newName) {
  const trimmed = (newName || '').trim();
  if (!trimmed) {
    throw new Error('Name cannot be empty.');
  }

  const response = await fetch(
    `${DRIVE_BASE}/files/${itemId}?fields=id,name,mimeType,size,modifiedTime`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: trimmed }),
    }
  );

  if (!response.ok) {
    throw await buildGoogleError(response, `renaming item to "${trimmed}"`);
  }

  return response.json();
}

/**
 * Moves a Google Drive item to Trash (safe, recoverable delete for Move transfers).
 */
export async function deleteGoogleDriveItem(accessToken, itemId) {
  const response = await fetch(`${DRIVE_BASE}/files/${itemId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trashed: true }),
  });

  if (!response.ok) {
    throw await buildGoogleError(response, 'moving original item to Trash');
  }
}

/**
 * Client-side sorting: folders first, then alphabetical.
 */
export function sortDriveItems(items) {
  return [...items].sort((a, b) => {
    const aIsFolder = a.mimeType === 'application/vnd.google-apps.folder';
    const bIsFolder = b.mimeType === 'application/vnd.google-apps.folder';
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return a.name.localeCompare(b.name);
  });
}
