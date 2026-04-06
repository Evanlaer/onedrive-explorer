import { getAccessToken } from '../auth/authService';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * Makes an authenticated GET request to the Microsoft Graph API.
 */
async function graphGet(msalInstance, endpoint) {
  const token = await getAccessToken(msalInstance);
  const response = await fetch(`${GRAPH_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Graph API error: ${response.status} ${response.statusText}`);
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
 * Fetches the items in the OneDrive root folder.
 * Returns folders first, then files, alphabetically sorted.
 */
export async function getRootItems(msalInstance) {
  const data = await graphGet(
    msalInstance,
    '/me/drive/root/children?$select=id,name,folder,file,size,lastModifiedDateTime,@microsoft.graph.downloadUrl&$orderby=name&$top=200'
  );
  return sortItems(data.value || []);
}

/**
 * Fetches the items inside a specific folder by its ID.
 */
export async function getFolderChildren(msalInstance, folderId) {
  const data = await graphGet(
    msalInstance,
    `/me/drive/items/${folderId}/children?$select=id,name,folder,file,size,lastModifiedDateTime,@microsoft.graph.downloadUrl&$orderby=name&$top=200`
  );
  return sortItems(data.value || []);
}

/**
 * Fetches only top-level folders for the sidebar.
 */
export async function getRootFolders(msalInstance) {
  const items = await getRootItems(msalInstance);
  return items.filter((item) => item.folder);
}

/**
 * Sorts items: folders first, then files, both alphabetically.
 */
function sortItems(items) {
  return [...items].sort((a, b) => {
    const aIsFolder = !!a.folder;
    const bIsFolder = !!b.folder;
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return a.name.localeCompare(b.name);
  });
}
