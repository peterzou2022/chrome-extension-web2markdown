const getSubdir = async (
  rootHandle: FileSystemDirectoryHandle,
  pathSegment: string,
): Promise<FileSystemDirectoryHandle> => {
  const segments = pathSegment.split('/').filter(Boolean);
  let current = rootHandle;
  for (const seg of segments) {
    current = await current.getDirectoryHandle(seg, { create: true });
  }
  return current;
};

/**
 * Return a filename that does not yet exist in the given path; append HHmmss if conflict.
 */
export const ensureUniqueFilename = async (
  rootHandle: FileSystemDirectoryHandle,
  pathSegment: string,
  baseFilename: string,
  date: Date = new Date(),
): Promise<string> => {
  const dir = await getSubdir(rootHandle, pathSegment);
  try {
    await dir.getFileHandle(baseFilename);
  } catch {
    return baseFilename;
  }
  const base = baseFilename.replace(/\.md$/i, '');
  const h = date.getHours();
  const m = date.getMinutes();
  const s = date.getSeconds();
  const suffix = `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}${String(s).padStart(2, '0')}`;
  return `${base}-${suffix}.md`;
};

/**
 * Write a text file into a subdirectory of the given directory handle.
 * Uses File System Access API (Chromium).
 */
export const writeFileToKnowledgeDir = async (
  rootHandle: FileSystemDirectoryHandle,
  pathSegment: string,
  filename: string,
  content: string,
): Promise<void> => {
  const dir = await getSubdir(rootHandle, pathSegment);
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
};
