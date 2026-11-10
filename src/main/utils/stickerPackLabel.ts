type StickerLabelSync = {
  label: string;
  dirName: string;
  changed: boolean;
};

function normalizeLabel(value: string | undefined): string {
  return (value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

/** 系统「新建文件夹」一类默认名，带序号的形式如「新建文件夹 (2)」也要认出来 */
const DEFAULT_FOLDER_NAME = /^(?:新建文件夹|新文件夹|new\s*folder)(?:\s*[(（]\d+[)）])?$/i;

function labelLeaf(value: string | undefined): string {
  const parts = normalizeLabel(value).split("/");
  return parts[parts.length - 1] || "";
}

/**
 * 标签末段是否还是系统默认名。
 * 只看末段：允许带分组前缀（如「绝区零表情包/新建文件夹」）。
 */
function isDefaultFolderName(value: string | undefined): boolean {
  return DEFAULT_FOLDER_NAME.test(labelLeaf(value));
}

/**
 * 决定贴纸集该用的标签，并给出要写回的目录名基线。
 *
 * 判定只依赖 sticker.json 里记录的目录名（dirName），不看时间戳：
 * - 没有记录（首次）：写入基线；标签是用户手写的就不动，只有末段还是
 *   「新建文件夹」这类系统默认名时才跟随当前目录名，避免把手写名覆盖掉
 * - 记录与当前目录名一致：目录没改名，保留用户标签
 * - 记录与当前目录名不同：目录被改名，标签跟随新的相对路径
 *
 * 这样加删表情、改动表情内容都不会影响标签，只有真正的改名才会触发同步。
 */
export function resolveStickerPackLabel(
  configLabel: string | undefined,
  recordedDirName: string | undefined,
  currentRelativePath: string,
): StickerLabelSync {
  const current = normalizeLabel(currentRelativePath);
  const label = (configLabel || "").trim();
  const recorded = normalizeLabel(recordedDirName);

  if (!current) {
    return { label, dirName: recorded, changed: false };
  }

  if (!recorded) {
    const keepLabel = label !== "" && !isDefaultFolderName(label);
    return { label: keepLabel ? label : current, dirName: current, changed: true };
  }

  if (recorded !== current) {
    return { label: current, dirName: current, changed: true };
  }

  return { label: label || current, dirName: current, changed: false };
}
