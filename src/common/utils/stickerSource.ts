type StickerImageElement = {
  sourcePath?: unknown;
  thumbPath?: unknown;
};

function addPath(paths: string[], value: unknown) {
  if (typeof value !== "string" || !value.trim() || paths.includes(value)) return;
  paths.push(value);
}

function getThumbEntries(thumbPath: unknown): [string, unknown][] {
  if (thumbPath instanceof Map) {
    return Array.from(thumbPath.entries()).map(([key, value]) => [String(key), value]);
  }
  if (Array.isArray(thumbPath)) {
    return thumbPath.map((value, index) => [String(index), value]);
  }
  if (thumbPath && typeof thumbPath === "object") {
    return Object.entries(thumbPath);
  }
  return [];
}

/** 按原图、常见缩略图尺寸、其余缩略图的顺序收集可供复制的本地路径。 */
export function collectStickerSourcePaths(picElement: StickerImageElement | null | undefined): string[] {
  const paths: string[] = [];
  if (!picElement) return paths;

  addPath(paths, picElement.sourcePath);

  const thumbEntries = getThumbEntries(picElement.thumbPath);
  const thumbByKey = new Map(thumbEntries);
  for (const key of ["0", "720", "198"]) {
    addPath(paths, thumbByKey.get(key));
  }
  for (const [, value] of thumbEntries) {
    addPath(paths, value);
  }

  return paths;
}

export type { StickerImageElement };
