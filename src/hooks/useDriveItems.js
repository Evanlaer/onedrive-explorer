import { useState, useEffect, useCallback, useRef } from 'react';
import { getOneDriveItemsPage, sortItems } from '../api/graphService';

function mergeUniqueSorted(prev, incoming) {
  const byId = new Map();
  for (const item of prev) byId.set(item.id, item);
  for (const item of incoming) byId.set(item.id, item);
  return sortItems(Array.from(byId.values()));
}

/**
 * Fetches and paginates items (files + folders) for a OneDrive folder ID
 * using a specific OneDrive account context `{ msalInstance, accountId }`.
 * Follows `@odata.nextLink` seamlessly via `loadMore()` and `loadAll()`.
 */
export function useDriveItems(oneDriveAuth, folderId, refreshKey = 0) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextLink, setNextLink] = useState(null);
  const [error, setError] = useState(null);
  const [loadMoreError, setLoadMoreError] = useState(null);

  const msalInstance = oneDriveAuth?.msalInstance || null;
  const accountId = oneDriveAuth?.accountId || '';

  const requestVersionRef = useRef(0);
  const nextLinkRef = useRef(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    requestVersionRef.current += 1;
    const version = requestVersionRef.current;
    nextLinkRef.current = null;
    loadingMoreRef.current = false;

    if (!msalInstance || !accountId || folderId === 'DISABLED') {
      setItems([]);
      setNextLink(null);
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      setLoadMoreError(null);
      return;
    }

    setItems([]);
    setNextLink(null);
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setLoadMoreError(null);

    const ctx = { msalInstance, accountId };

    (async () => {
      try {
        const page = await getOneDriveItemsPage(ctx, folderId, null);
        if (requestVersionRef.current !== version) return;
        setItems(sortItems(page.items));
        setNextLink(page.nextLink);
        nextLinkRef.current = page.nextLink;
      } catch (err) {
        if (requestVersionRef.current !== version) return;
        setError(err.message || 'Failed to load files');
      } finally {
        if (requestVersionRef.current === version) {
          setLoading(false);
        }
      }
    })();
  }, [msalInstance, accountId, folderId, refreshKey]);

  const loadMore = useCallback(async () => {
    if (!msalInstance || !accountId || folderId === 'DISABLED') return;
    if (!nextLinkRef.current || loadingMoreRef.current) return;

    const version = requestVersionRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);

    const ctx = { msalInstance, accountId };

    try {
      const page = await getOneDriveItemsPage(ctx, folderId, nextLinkRef.current);
      if (requestVersionRef.current !== version) return;
      setItems((prev) => mergeUniqueSorted(prev, page.items));
      setNextLink(page.nextLink);
      nextLinkRef.current = page.nextLink;
    } catch (err) {
      if (requestVersionRef.current !== version) return;
      setLoadMoreError(err.message || 'Failed to load more files');
    } finally {
      if (requestVersionRef.current === version) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [msalInstance, accountId, folderId]);

  const loadAll = useCallback(async () => {
    if (!msalInstance || !accountId || folderId === 'DISABLED') return;
    if (!nextLinkRef.current || loadingMoreRef.current) return;

    const version = requestVersionRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);

    const ctx = { msalInstance, accountId };

    try {
      let cursor = nextLinkRef.current;
      let pagesFetched = 0;
      while (cursor && pagesFetched < 200) {
        const page = await getOneDriveItemsPage(ctx, folderId, cursor);
        if (requestVersionRef.current !== version) return;
        setItems((prev) => mergeUniqueSorted(prev, page.items));
        cursor = page.nextLink;
        setNextLink(cursor);
        nextLinkRef.current = cursor;
        pagesFetched += 1;
      }
    } catch (err) {
      if (requestVersionRef.current !== version) return;
      setLoadMoreError(err.message || 'Failed to load remaining files');
    } finally {
      if (requestVersionRef.current === version) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [msalInstance, accountId, folderId]);

  return {
    items,
    loading,
    loadingMore,
    hasMore: Boolean(nextLink),
    loadMore,
    loadAll,
    error,
    loadMoreError,
  };
}
