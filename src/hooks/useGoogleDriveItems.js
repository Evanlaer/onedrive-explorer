import { useState, useEffect } from 'react';
import { getDriveItems } from '../api/googleDriveService';

/**
 * Hook to fetch and manage files/folders for Google Drive.
 * Requires a valid Google access token.
 */
export function useGoogleDriveItems(accessToken, folderId = 'root') {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accessToken) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetch = async () => {
      try {
        const data = await getDriveItems(accessToken, folderId);
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load files from Google Drive');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [accessToken, folderId]);

  return { items, loading, error };
}
