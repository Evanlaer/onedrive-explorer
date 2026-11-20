import { getAccessToken } from '../auth/authService';
import {
  getFolderChildren,
  getOneDriveDownloadDescriptor,
  downloadOneDriveFile,
  uploadOneDriveFile,
  createOneDriveFolder,
  deleteOneDriveItem,
} from './graphService';
import {
  getDriveItems,
  getGoogleDriveDownloadDescriptor,
  downloadGoogleDriveFile,
  uploadGoogleDriveFile,
  createGoogleDriveFolder,
  deleteGoogleDriveItem,
} from './googleDriveService';

const MAX_RECURSION_DEPTH = 20;

/**
 * Unified helper to check whether an item from either OneDrive or Google Drive is a folder.
 */
export function isItemFolder(item) {
  return Boolean(item?.folder || item?.mimeType === 'application/vnd.google-apps.folder');
}

async function listFolder(cloud, folderId, msalInstance, googleToken) {
  if (cloud === 'onedrive') {
    return getFolderChildren(msalInstance, folderId);
  }
  return getDriveItems(googleToken, folderId || 'root');
}

async function getDownloadDescriptor(cloud, item, msalInstance, googleToken) {
  if (cloud === 'onedrive') {
    return getOneDriveDownloadDescriptor(msalInstance, item);
  }
  return getGoogleDriveDownloadDescriptor(googleToken, item);
}

async function downloadFileInBrowser(cloud, item, msalInstance, googleToken) {
  if (cloud === 'onedrive') {
    return downloadOneDriveFile(msalInstance, item);
  }
  return downloadGoogleDriveFile(googleToken, item);
}

async function uploadFileInBrowser(
  cloud,
  parentFolderId,
  fileName,
  blob,
  mimeType,
  msalInstance,
  googleToken,
  onChunkProgress
) {
  if (cloud === 'onedrive') {
    return uploadOneDriveFile(msalInstance, parentFolderId, fileName, blob, mimeType, onChunkProgress);
  }
  return uploadGoogleDriveFile(googleToken, parentFolderId || 'root', fileName, blob, mimeType, onChunkProgress);
}

async function createFolder(cloud, parentFolderId, folderName, msalInstance, googleToken) {
  if (cloud === 'onedrive') {
    return createOneDriveFolder(msalInstance, parentFolderId, folderName);
  }
  return createGoogleDriveFolder(googleToken, parentFolderId || 'root', folderName);
}

async function deleteItem(cloud, itemId, msalInstance, googleToken) {
  if (cloud === 'onedrive') {
    return deleteOneDriveItem(msalInstance, itemId);
  }
  return deleteGoogleDriveItem(googleToken, itemId);
}

/**
 * Streams a single file directly cloud-to-cloud via the local Vite relay (/api/transfer-file),
 * avoiding browser CORS restrictions and ~10 MB response body caps.
 * Falls back to direct browser download+upload if the relay endpoint is unavailable (e.g. static host).
 */
async function transferSingleFile({
  item,
  sourceCloud,
  targetCloud,
  targetFolderId,
  msalInstance,
  googleToken,
  onStageProgress,
}) {
  const descriptor = await getDownloadDescriptor(sourceCloud, item, msalInstance, googleToken);
  const targetAccessToken =
    targetCloud === 'onedrive' ? await getAccessToken(msalInstance) : googleToken;

  // Try local Node transfer relay first (handles large files & CORS cleanly)
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
          cloud: targetCloud,
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

  // Fallback for static hosting without Vite relay: direct browser download -> upload
  onStageProgress?.('downloading', 15, descriptor.fileName);
  const { blob, fileName, mimeType } = await downloadFileInBrowser(
    sourceCloud,
    item,
    msalInstance,
    googleToken
  );

  onStageProgress?.('uploading', 0, fileName);
  const uploaded = await uploadFileInBrowser(
    targetCloud,
    targetFolderId,
    fileName,
    blob,
    mimeType,
    msalInstance,
    googleToken,
    (upPct) => onStageProgress?.('uploading', upPct, fileName)
  );

  return { fileName, item: uploaded };
}

/**
 * Recursively scans a source folder so we know the exact total file count up front.
 */
async function scanFolderTree(cloud, folderItem, msalInstance, googleToken, depth = 0) {
  if (depth >= MAX_RECURSION_DEPTH) {
    return { item: folderItem, files: [], folders: [], fileCount: 0, truncated: true };
  }

  const children = await listFolder(cloud, folderItem.id, msalInstance, googleToken);
  const files = [];
  const folders = [];
  let fileCount = 0;

  for (const child of children) {
    if (isItemFolder(child)) {
      const subTree = await scanFolderTree(cloud, child, msalInstance, googleToken, depth + 1);
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
 * Transfers a single file or a folder (recursively) between OneDrive and Google Drive.
 */
export async function transferItem({
  item,
  sourceCloud,
  targetCloud,
  targetFolderId,
  mode = 'copy',
  msalInstance,
  googleToken,
  onProgress,
}) {
  if (sourceCloud === targetCloud) {
    throw new Error('Source and destination clouds must be different.');
  }

  const normalizedTargetFolder = targetCloud === 'google' ? targetFolderId || 'root' : targetFolderId || null;

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
      sourceCloud,
      targetCloud,
      targetFolderId: normalizedTargetFolder,
      msalInstance,
      googleToken,
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
        detail: `Removing original from ${sourceCloud === 'onedrive' ? 'OneDrive' : 'Google Drive'}…`,
      });
      try {
        await deleteItem(sourceCloud, item.id, msalInstance, googleToken);
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

  const tree = await scanFolderTree(sourceCloud, item, msalInstance, googleToken);
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

    const createdFolder = await createFolder(
      targetCloud,
      destParentId,
      node.item.name,
      msalInstance,
      googleToken
    );

    for (const file of node.files) {
      try {
        await transferSingleFile({
          item: file,
          sourceCloud,
          targetCloud,
          targetFolderId: createdFolder.id,
          msalInstance,
          googleToken,
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
      await deleteItem(sourceCloud, item.id, msalInstance, googleToken);
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
