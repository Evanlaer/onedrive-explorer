import { useState, useEffect, useCallback, useRef } from 'react';
import { getGoogleDriveItemsPage, sortDriveItems } from '../api/googleDriveService';

function mergeUniqueSorted(prev, incoming) {
  const byId = new Map();
  for (const item of prev) byId.set(item.id, item);
  for (const item of incoming) byId.set(item.id, item);
  return sortDriveItems(Array.from(byId.values()));
}

/**
 * Hook to fetch and paginate files/folders for Google Drive using `nextPageToken`.
 * Exposes `loadMore()` and `loadAll()` so folders with > 200 items load smoothly.
 */
export function useGoogleDriveItems(
  accessToken,
  folderId = 'root',
  refreshKey = 0,
  onAuthExpired
) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [error, setError] = useState(null);
  const [loadMoreError, setLoadMoreError] = useState(null);

  const requestVersionRef = useRef(0);
  const nextPageTokenRef = useRef(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    requestVersionRef.current += 1;
    const version = requestVersionRef.current;
    nextPageTokenRef.current = null;
    loadingMoreRef.current = false;

    if (!accessToken) {
      setItems([]);
      setNextPageToken(null);
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      setLoadMoreError(null);
      return;
    }

    setItems([]);
    setNextPageToken(null);
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setLoadMoreError(null);

    (async () => {
      try {
        const page = await getGoogleDriveItemsPage(accessToken, folderId, null);
        if (requestVersionRef.current !== version) return;
        setItems(sortDriveItems(page.items));
        setNextPageToken(page.nextPageToken);
        nextPageTokenRef.current = page.nextPageToken;
      } catch (err) {
        if (requestVersionRef.current !== version) return;
        if (err?.code === 'AUTH_EXPIRED') {
          onAuthExpired?.();
          return;
        }
        setError(err.message || 'Failed to load files from Google Drive');
      } finally {
        if (requestVersionRef.current === version) {
          setLoading(false);
        }
      }
    })();
  }, [accessToken, folderId, refreshKey, onAuthExpired]);

  const loadMore = useCallback(async () => {
    if (!accessToken || !nextPageTokenRef.current || loadingMoreRef.current) return;

    const version = requestVersionRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const page = await getGoogleDriveItemsPage(
        accessToken,
        folderId,
        nextPageTokenRef.current
      );
      if (requestVersionRef.current !== version) return;
      setItems((prev) => mergeUniqueSorted(prev, page.items));
      setNextPageToken(page.nextPageToken);
      nextPageTokenRef.current = page.nextPageToken;
    } catch (err) {
      if (requestVersionRef.current !== version) return;
      if (err?.code === 'AUTH_EXPIRED') {
        onAuthExpired?.();
        return;
      }
      setLoadMoreError(err.message || 'Failed to load more files from Google Drive');
    } finally {
      if (requestVersionRef.current === version) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [accessToken, folderId, onAuthExpired]);

  const loadAll = useCallback(async () => {
    if (!accessToken || !nextPageTokenRef.current || loadingMoreRef.current) return;

    const version = requestVersionRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      let token = nextPageTokenRef.current;
      let pagesFetched = 0;
      while (token && pagesFetched < 200) {
        const page = await getGoogleDriveItemsPage(accessToken, folderId, token, 500);
        if (requestVersionRef.current !== version) return;
        setItems((prev) => mergeUniqueSorted(prev, page.items));
        token = page.nextPageToken;
        setNextPageToken(token);
        nextPageTokenRef.current = token;
        pagesFetched += 1;
      }
    } catch (err) {
      if (requestVersionRef.current !== version) return;
      if (err?.code === 'AUTH_EXPIRED') {
        onAuthExpired?.();
        return;
      }
      setLoadMoreError(err.message || 'Failed to load remaining files from Google Drive');
    } finally {
      if (requestVersionRef.current === version) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [accessToken, folderId, onAuthExpired]);

  return {
    items,
    loading,
    loadingMore,
    hasMore: Boolean(nextPageToken),
    loadMore,
    loadAll,
    error,
    loadMoreError,
  };
}
