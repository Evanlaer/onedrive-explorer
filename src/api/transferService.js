import { getAccessToken } from '../auth/authService';
import {
  getFolderChildren,
  getOneDriveDownloadDescriptor,
  downloadOneDriveFile,
  uploadOneDriveFile,
  createOneDriveFolder,
  renameOneDriveItem,
  deleteOneDriveItem,
} from './graphService';
import {
  getDriveItems,
  getGoogleDriveDownloadDescriptor,
  downloadGoogleDriveFile,
  uploadGoogleDriveFile,
  createGoogleDriveFolder,
  renameGoogleDriveItem,
  deleteGoogleDriveItem,
} from './googleDriveService';

const MAX_RECURSION_DEPTH = 20;

/**
 * Unified helper to check whether an item from either OneDrive or Google Drive is a folder.
 */
export function isItemFolder(item) {
  return Boolean(item?.folder || item?.mimeType === 'application/vnd.google-apps.folder');
}

async function listFolder(endpoint, folderId) {
  if (endpoint.provider === 'onedrive') {
    return getFolderChildren(endpoint.oneDriveAuth, folderId);
  }
  return getDriveItems(endpoint.accessToken, folderId || 'root');
}

async function getDownloadDescriptor(endpoint, item) {
  if (endpoint.provider === 'onedrive') {
    return getOneDriveDownloadDescriptor(endpoint.oneDriveAuth, item);
  }
  return getGoogleDriveDownloadDescriptor(endpoint.accessToken, item);
}

async function downloadFileInBrowser(endpoint, item) {
  if (endpoint.provider === 'onedrive') {
    return downloadOneDriveFile(endpoint.oneDriveAuth, item);
  }
  return downloadGoogleDriveFile(endpoint.accessToken, item);
}

async function uploadFileInBrowser(
  endpoint,
  parentFolderId,
  fileName,
  blob,
  mimeType,
  onChunkProgress
) {
  if (endpoint.provider === 'onedrive') {
    return uploadOneDriveFile(
      endpoint.oneDriveAuth,
      parentFolderId,
      fileName,
      blob,
      mimeType,
      onChunkProgress
    );
  }
  return uploadGoogleDriveFile(
    endpoint.accessToken,
    parentFolderId || 'root',
    fileName,
    blob,
    mimeType,
    onChunkProgress
  );
}

async function createFolder(endpoint, parentFolderId, folderName) {
  if (endpoint.provider === 'onedrive') {
    return createOneDriveFolder(endpoint.oneDriveAuth, parentFolderId, folderName);
  }
  return createGoogleDriveFolder(endpoint.accessToken, parentFolderId || 'root', folderName);
}

async function deleteItem(endpoint, itemId) {
  if (endpoint.provider === 'onedrive') {
    return deleteOneDriveItem(endpoint.oneDriveAuth, itemId);
  }
  return deleteGoogleDriveItem(endpoint.accessToken, itemId);
}

/**
 * Deletes a single file or folder in OneDrive (Recycle Bin) or Google Drive (Trash).
 */
export async function deleteCloudItem({ item, endpoint }) {
  await deleteItem(endpoint, item.id);
}

/**
 * Renames a single file or folder in OneDrive or Google Drive.
 */
export async function renameCloudItem({ item, endpoint, newName }) {
  if (endpoint.provider === 'onedrive') {
    return renameOneDriveItem(endpoint.oneDriveAuth, item.id, newName);
  }
  return renameGoogleDriveItem(endpoint.accessToken, item.id, newName);
}

/**
 * Streams a single file directly cloud-to-cloud via the streaming relay (/api/transfer-file),
 * supporting OneDrive <-> Google Drive, OneDrive <-> OneDrive, and Google Drive <-> Google Drive.
 * Falls back to direct browser download+upload if the relay endpoint is unavailable.
 */
async function transferSingleFile({
  item,
  source,
  target,
  targetFolderId,
  onStageProgress,
}) {
  const descriptor = await getDownloadDescriptor(source, item);
  const targetAccessToken =
    target.provider === 'onedrive'
      ? await getAccessToken(target.oneDriveAuth)
      : target.accessToken;

  // Try Node / Vercel transfer relay first (handles large files & CORS cleanly)
  let relayRes = null;
  try {
    relayRes = await fetch('/api/transfer-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: {
          url: descriptor.url,
          authHeader: descriptor.authHeader,
        },
        target: {
          cloud: target.provider,
          accessToken: targetAccessToken,
          parentFolderId: targetFolderId,
          fileName: descriptor.fileName,
          mimeType: descriptor.mimeType,
        },
      }),
    });
  } catch {
    relayRes = null;
  }

  // If relay endpoint exists and returned NDJSON stream, consume live progress events
  if (
    relayRes &&
    relayRes.ok &&
    (relayRes.headers.get('content-type') || '').includes('application/x-ndjson') &&
    relayRes.body
  ) {
    const reader = relayRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let doneItem = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const evt = JSON.parse(trimmed);
        if (evt.stage === 'error') {
          throw new Error(evt.error || 'Transfer failed');
        }
        if (evt.stage === 'downloading') {
          onStageProgress?.('downloading', evt.percent || 0, descriptor.fileName);
        } else if (evt.stage === 'uploading') {
          onStageProgress?.('uploading', evt.percent || 0, descriptor.fileName);
        } else if (evt.stage === 'done') {
          doneItem = evt.item;
        }
      }
    }

    if (buffer.trim()) {
      const evt = JSON.parse(buffer.trim());
      if (evt.stage === 'error') throw new Error(evt.error || 'Transfer failed');
      if (evt.stage === 'done') doneItem = evt.item;
    }

    return { fileName: descriptor.fileName, item: doneItem };
  }

  // Fallback for static hosting without relay: direct browser download -> upload
  onStageProgress?.('downloading', 15, descriptor.fileName);
  const { blob, fileName, mimeType } = await downloadFileInBrowser(source, item);

  onStageProgress?.('uploading', 0, fileName);
  const uploaded = await uploadFileInBrowser(
    target,
    targetFolderId,
    fileName,
    blob,
    mimeType,
    (upPct) => onStageProgress?.('uploading', upPct, fileName)
  );

  return { fileName, item: uploaded };
}

/**
 * Recursively scans a source folder so we know the exact total file count up front.
 */
async function scanFolderTree(source, folderItem, depth = 0) {
  if (depth >= MAX_RECURSION_DEPTH) {
    return { item: folderItem, files: [], folders: [], fileCount: 0, truncated: true };
  }

  const children = await listFolder(source, folderItem.id);
  const files = [];
  const folders = [];
  let fileCount = 0;

  for (const child of children) {
    if (isItemFolder(child)) {
      const subTree = await scanFolderTree(source, child, depth + 1);
      folders.push(subTree);
      fileCount += subTree.fileCount;
    } else {
      files.push(child);
      fileCount += 1;
    }
  }

  return { item: folderItem, files, folders, fileCount, truncated: false };
}

/**
 * Transfers a single file or a folder (recursively) between any two different cloud connections.
 */
export async function transferItem({
  item,
  source,
  target,
  targetFolderId,
  mode = 'copy',
  onProgress,
}) {
  if (source.connectionId === target.connectionId) {
    throw new Error('Source and destination connections must be different.');
  }

  const normalizedTargetFolder =
    target.provider === 'google' ? targetFolderId || 'root' : targetFolderId || null;
  const sourceLabel =
    source.label || (source.provider === 'onedrive' ? 'OneDrive' : 'Google Drive');

  // ── Case 1: Single File ──────────────────────────────────────────────────
  if (!isItemFolder(item)) {
    onProgress?.({
      stage: 'downloading',
      currentFile: item.name,
      completed: 0,
      total: 1,
      percent: 5,
      detail: `Downloading ${item.name}…`,
    });

    const { fileName } = await transferSingleFile({
      item,
      source,
      target,
      targetFolderId: normalizedTargetFolder,
      onStageProgress: (stage, pct, name) => {
        if (stage === 'downloading') {
          const overallPct = Math.max(5, Math.min(48, Math.round(5 + pct * 0.43)));
          onProgress?.({
            stage: 'downloading',
            currentFile: name,
            completed: 0,
            total: 1,
            percent: overallPct,
            detail: `Downloading ${name} (${pct}%)…`,
          });
        } else if (stage === 'uploading') {
          const overallPct = Math.max(50, Math.min(93, Math.round(50 + pct * 0.43)));
          onProgress?.({
            stage: 'uploading',
            currentFile: name,
            completed: 0,
            total: 1,
            percent: overallPct,
            detail: `Uploading ${name} (${pct}%)…`,
          });
        }
      },
    });

    let sourceDeleted = false;
    if (mode === 'move') {
      onProgress?.({
        stage: 'cleaning',
        currentFile: item.name,
        completed: 1,
        total: 1,
        percent: 96,
        detail: `Removing original from ${sourceLabel}…`,
      });
      try {
        await deleteItem(source, item.id);
        sourceDeleted = true;
      } catch (err) {
        throw new Error(`Copied to destination, but removing original failed: ${err.message}`);
      }
    }

    onProgress?.({
      stage: 'done',
      currentFile: fileName,
      completed: 1,
      total: 1,
      percent: 100,
      detail: mode === 'move' ? 'Moved successfully' : 'Copied successfully',
    });

    return { transferredCount: 1, warnings: [], sourceDeleted };
  }

  // ── Case 2: Recursive Folder Transfer ───────────────────────────────────
  onProgress?.({
    stage: 'scanning',
    currentFile: item.name,
    completed: 0,
    total: 0,
    percent: 5,
    detail: `Scanning folder "${item.name}"…`,
  });

  const tree = await scanFolderTree(source, item);
  const totalFiles = tree.fileCount;
  const warnings = [];
  let completedFiles = 0;

  const computePercent = (subFraction = 0) => {
    if (totalFiles === 0) return 85;
    return Math.min(92, Math.round(10 + ((completedFiles + subFraction) / totalFiles) * 82));
  };

  async function processNode(node, destParentId) {
    if (node.truncated) {
      warnings.push(`Skipped deeply nested folder "${node.item.name}" (max depth reached).`);
      return;
    }

    onProgress?.({
      stage: 'creating_folder',
      currentFile: node.item.name,
      completed: completedFiles,
      total: totalFiles,
      percent: computePercent(),
      detail: `Creating folder "${node.item.name}"…`,
    });

    const createdFolder = await createFolder(target, destParentId, node.item.name);

    for (const file of node.files) {
      try {
        await transferSingleFile({
          item: file,
          source,
          target,
          targetFolderId: createdFolder.id,
          onStageProgress: (stage, pct, name) => {
            const subFrac = stage === 'downloading' ? (pct / 100) * 0.5 : 0.5 + (pct / 100) * 0.5;
            onProgress?.({
              stage,
              currentFile: name,
              completed: completedFiles,
              total: totalFiles,
              percent: computePercent(subFrac),
              detail: `${stage === 'uploading' ? 'Uploading' : 'Downloading'} ${
                completedFiles + 1
              }/${totalFiles}: ${name} (${pct}%)`,
            });
          },
        });

        completedFiles += 1;
      } catch (err) {
        warnings.push(`${file.name}: ${err.message}`);
      }
    }

    for (const subFolder of node.folders) {
      await processNode(subFolder, createdFolder.id);
    }
  }

  await processNode(tree, normalizedTargetFolder);

  let sourceDeleted = false;
  if (mode === 'move') {
    if (warnings.length === 0) {
      onProgress?.({
        stage: 'cleaning',
        currentFile: item.name,
        completed: completedFiles,
        total: totalFiles,
        percent: 96,
        detail: `Removing original folder "${item.name}"…`,
      });
      await deleteItem(source, item.id);
      sourceDeleted = true;
    } else {
      warnings.push(
        `Original folder "${item.name}" was kept because ${warnings.length} item(s) could not be transferred.`
      );
    }
  }

  const summaryDetail =
    totalFiles === 0
      ? mode === 'move' && sourceDeleted
        ? 'Empty folder moved'
        : 'Empty folder copied'
      : `${completedFiles}/${totalFiles} file${totalFiles === 1 ? '' : 's'} ${
          mode === 'move' && sourceDeleted ? 'moved' : 'copied'
        }`;

  onProgress?.({
    stage: 'done',
    currentFile: item.name,
    completed: completedFiles,
    total: totalFiles,
    percent: 100,
    detail: summaryDetail,
  });

  return { transferredCount: completedFiles, warnings, sourceDeleted };
}
