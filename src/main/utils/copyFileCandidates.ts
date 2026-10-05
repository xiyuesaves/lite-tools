import fsPromises from "node:fs/promises";
import path from "node:path";

export type CopyFileSource = string | string[];

/** 选择第一个仍存在的源文件，并确保目标贴纸目录存在后复制。 */
export async function copyFileCandidates(source: CopyFileSource, targetPath: string): Promise<string> {
  const candidates = (Array.isArray(source) ? source : [source]).filter(
    (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
  );

  let sourcePath: string | undefined;
  for (const candidate of candidates) {
    try {
      if ((await fsPromises.stat(candidate)).isFile()) {
        sourcePath = candidate;
        break;
      }
    } catch {
      // QQ may remove sourcePath while leaving a thumbnail path available.
    }
  }

  if (!sourcePath) {
    throw new Error(`源文件不存在: ${candidates.join(", ") || "未提供路径"}`);
  }

  await fsPromises.mkdir(targetPath, { recursive: true });
  const finalPath = path.join(targetPath, path.basename(sourcePath));
  await fsPromises.copyFile(sourcePath, finalPath);
  return finalPath;
}
