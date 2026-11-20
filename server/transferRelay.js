import { Buffer } from 'node:buffer';

const ALLOWED_SOURCE_DOMAINS = [
  'graph.microsoft.com',
  'microsoftpersonalcontent.com',
  '1drv.com',
  'sharepoint.com',
  'sharepointonline.com',
  'livefilestore.com',
  'storage.live.com',
  'onedrive.com',
  'live.com',
  'windows.net',
  'msecnd.net',
  'office.net',
  'svc.ms',
  'googleapis.com',
];

const AUTH_ALLOWED_HOSTS = new Set(['graph.microsoft.com', 'www.googleapis.com']);
const ONEDRIVE_SIMPLE_LIMIT = 4 * 1024 * 1024; // 4 MiB
const ONEDRIVE_CHUNK_SIZE = 320 * 1024 * 16; // 5 MiB (multiple of 320 KiB)
const GOOGLE_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MiB (multiple of 256 KiB)

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase();
  return ALLOWED_SOURCE_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
}

function sanitizeOneDriveName(name) {
  return (name || 'untitled').replace(/[\\/:*?"<>|]/g, '_').trim() || 'untitled';
}

function writeEvent(res, payload) {
  if (!res.writableEnded) {
    res.write(`${JSON.stringify(payload)}\n`);
  }
}

async function readRequestJson(req) {
  // Vercel parses JSON bodies automatically into req.body
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.length > 0) {
    return JSON.parse(req.body);
  }
  if (Buffer.isBuffer(req.body)) {
    return JSON.parse(req.body.toString('utf8'));
  }

  // Raw Node HTTP stream (local Vite dev/preview server)
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function downloadSourceToBuffer(source, onProgress) {
  const parsed = new URL(source.url);
  if (parsed.protocol !== 'https:' || !isAllowedHost(parsed.hostname)) {
    throw new Error(`Disallowed download host: ${parsed.hostname}`);
  }

  const headers = { 'Accept-Encoding': 'identity' };
  if (source.authHeader && AUTH_ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    headers.Authorization = source.authHeader;
  }

  const upstream = await fetch(parsed.toString(), {
    headers,
    redirect: 'follow',
  });

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => upstream.statusText);
    throw new Error(`Download error (${upstream.status}): ${errText.slice(0, 200)}`);
  }

  const totalLength = Number(upstream.headers.get('content-length') || 0);
  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  const parts = [];
  let received = 0;
  let lastReportedPct = -1;

  if (upstream.body) {
    for await (const chunk of upstream.body) {
      const buf = Buffer.from(chunk);
      parts.push(buf);
      received += buf.byteLength;
      if (totalLength > 0) {
        const pct = Math.min(100, Math.round((received / totalLength) * 100));
        if (pct >= lastReportedPct + 5 || pct === 100) {
          lastReportedPct = pct;
          onProgress?.(pct, received, totalLength);
        }
      }
    }
  }

  return {
    buffer: Buffer.concat(parts),
    contentType,
  };
}

async function uploadBufferToGoogleDrive(target, buffer, mimeType, onProgress) {
  const metadata = {
    name: target.fileName,
    parents: [target.parentFolderId || 'root'],
  };
  const contentType = mimeType || 'application/octet-stream';

  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,modifiedTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${target.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType,
        'X-Upload-Content-Length': String(buffer.byteLength),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const errText = await initRes.text().catch(() => initRes.statusText);
    throw new Error(`Google Drive upload init error (${initRes.status}): ${errText.slice(0, 200)}`);
  }

  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) {
    throw new Error('Google Drive did not return a resumable upload URL.');
  }

  const totalSize = buffer.byteLength;
  if (totalSize === 0) {
    const emptyRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'Content-Length': '0' },
      body: Buffer.alloc(0),
    });
    if (!emptyRes.ok) {
      throw new Error(`Google Drive upload error (${emptyRes.status})`);
    }
    onProgress?.(100);
    return emptyRes.json();
  }

  let offset = 0;
  let uploadedItem = null;

  while (offset < totalSize) {
    const end = Math.min(offset + GOOGLE_CHUNK_SIZE, totalSize);
    const chunk = buffer.subarray(offset, end);

    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(chunk.byteLength),
        'Content-Range': `bytes ${offset}-${end - 1}/${totalSize}`,
      },
      body: chunk,
      redirect: 'manual', // Prevent undici from treating 308 Resume Incomplete as a redirect
    });

    if (chunkRes.status !== 308 && !chunkRes.ok) {
      const errText = await chunkRes.text().catch(() => chunkRes.statusText);
      throw new Error(`Google Drive chunk upload error (${chunkRes.status}): ${errText.slice(0, 200)}`);
    }

    offset = end;
    onProgress?.(Math.round((offset / totalSize) * 100));

    if (chunkRes.status === 200 || chunkRes.status === 201) {
      uploadedItem = await chunkRes.json();
    }
  }

  return uploadedItem;
}

async function uploadBufferToOneDrive(target, buffer, mimeType, onProgress) {
  const safeName = sanitizeOneDriveName(target.fileName);
  const encodedName = encodeURIComponent(safeName);
  const basePath = target.parentFolderId
    ? `/me/drive/items/${target.parentFolderId}:/${encodedName}:`
    : `/me/drive/root:/${encodedName}:`;
  const graphBase = 'https://graph.microsoft.com/v1.0';

  if (buffer.byteLength <= ONEDRIVE_SIMPLE_LIMIT) {
    const res = await fetch(
      `${graphBase}${basePath}/content?@microsoft.graph.conflictBehavior=rename`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${target.accessToken}`,
          'Content-Type': mimeType || 'application/octet-stream',
        },
        body: buffer,
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`OneDrive upload error (${res.status}): ${errText.slice(0, 200)}`);
    }

    onProgress?.(100);
    return res.json();
  }

  const sessionRes = await fetch(`${graphBase}${basePath}/createUploadSession`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${target.accessToken}`,
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
    const errText = await sessionRes.text().catch(() => sessionRes.statusText);
    throw new Error(`OneDrive upload session error (${sessionRes.status}): ${errText.slice(0, 200)}`);
  }

  const { uploadUrl } = await sessionRes.json();
  const totalSize = buffer.byteLength;
  let offset = 0;
  let uploadedItem = null;

  while (offset < totalSize) {
    const end = Math.min(offset + ONEDRIVE_CHUNK_SIZE, totalSize);
    const chunk = buffer.subarray(offset, end);

    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.byteLength),
        'Content-Range': `bytes ${offset}-${end - 1}/${totalSize}`,
      },
      body: chunk,
    });

    if (!chunkRes.ok && chunkRes.status !== 202) {
      const errText = await chunkRes.text().catch(() => chunkRes.statusText);
      throw new Error(`OneDrive chunk upload error (${chunkRes.status}): ${errText.slice(0, 200)}`);
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
 * Shared Node HTTP handler used by both local Vite middleware and Vercel Serverless Functions.
 */
export async function handleTransferFileRequest(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end('Method Not Allowed');
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const { source, target } = await readRequestJson(req);

    writeEvent(res, { stage: 'downloading', percent: 5 });
    const { buffer, contentType } = await downloadSourceToBuffer(source, (dlPct) => {
      writeEvent(res, { stage: 'downloading', percent: dlPct });
    });

    const finalMime = target.mimeType || contentType || 'application/octet-stream';
    writeEvent(res, { stage: 'uploading', percent: 0 });

    let item;
    if (target.cloud === 'google') {
      item = await uploadBufferToGoogleDrive(target, buffer, finalMime, (upPct) => {
        writeEvent(res, { stage: 'uploading', percent: upPct });
      });
    } else if (target.cloud === 'onedrive') {
      item = await uploadBufferToOneDrive(target, buffer, finalMime, (upPct) => {
        writeEvent(res, { stage: 'uploading', percent: upPct });
      });
    } else {
      throw new Error(`Unsupported target cloud: ${target.cloud}`);
    }

    writeEvent(res, { stage: 'done', item });
  } catch (err) {
    console.error('[TransferRelay] Error:', err);
    writeEvent(res, { stage: 'error', error: err?.message || 'Transfer relay failed' });
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
}
