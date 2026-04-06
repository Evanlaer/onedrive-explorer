import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { getRootItems, getFolderChildren } from '../api/graphService';

/**
 * Fetches and returns the items (files + folders) for a given folder ID.
 * Pass null or undefined to load the OneDrive root.
 */
export function useDriveItems(folderId) {
  const { instance } = useMsal();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetch = async () => {
      if (folderId === 'DISABLED') {
        setItems([]);
        setLoading(false);
        return;
      }
      try {
        const data = folderId
          ? await getFolderChildren(instance, folderId)
          : await getRootItems(instance);
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load files');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [folderId, instance]);

  return { items, loading, error };
}
