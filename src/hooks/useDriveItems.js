import { useState, useEffect } from 'react';
import { getRootItems, getFolderChildren } from '../api/graphService';

/**
 * Fetches and returns the items (files + folders) for a given OneDrive folder ID
 * using a specific OneDrive account context `{ msalInstance, accountId }`.
 * Pass null/undefined folderId to load the OneDrive root.
 */
export function useDriveItems(oneDriveAuth, folderId, refreshKey = 0) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const msalInstance = oneDriveAuth?.msalInstance || null;
  const accountId = oneDriveAuth?.accountId || '';

  useEffect(() => {
    if (!msalInstance || !accountId || folderId === 'DISABLED') {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const ctx = { msalInstance, accountId };

    const fetchItems = async () => {
      try {
        const data = folderId
          ? await getFolderChildren(ctx, folderId)
          : await getRootItems(ctx);
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load files');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchItems();
    return () => {
      cancelled = true;
    };
  }, [msalInstance, accountId, folderId, refreshKey]);

  return { items, loading, error };
}
