import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { copyFileCandidates } from "../../src/main/utils/copyFileCandidates";
import { collectStickerSourcePaths } from "../../src/common/utils/stickerSource";

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lite-tools-local-stickers-"));
  try {
    const sourceDir = path.join(tempRoot, "qq-cache");
    const targetDir = path.join(tempRoot, "packs", "new-pack");
    fs.mkdirSync(sourceDir, { recursive: true });
    const sourcePath = path.join(sourceDir, "example.jpg");
    fs.writeFileSync(sourcePath, "image");

    // 原图已被 QQ 清理时，候选顺序应为：sourcePath -> thumb 0/720/198 -> 其余缩略图
    const sourcePaths = collectStickerSourcePaths({
      sourcePath: path.join(sourceDir, "missing-source.jpg"),
      thumbPath: new Map([
        [198, path.join(sourceDir, "missing-198.jpg")],
        [720, sourcePath],
        [0, path.join(sourceDir, "missing-0.jpg")],
      ]),
    });
    assert.deepEqual(sourcePaths, [
      path.join(sourceDir, "missing-source.jpg"),
      path.join(sourceDir, "missing-0.jpg"),
      sourcePath,
      path.join(sourceDir, "missing-198.jpg"),
    ]);

    // 目标贴纸包目录不存在时应自动创建
    const copiedPath = await copyFileCandidates(sourcePaths, targetDir);
    assert.equal(copiedPath, path.join(targetDir, "example.jpg"));
    assert.equal(fs.readFileSync(copiedPath, "utf8"), "image");

    // 全部候选都失效时应给出包含候选路径的错误，而不是原生 ENOENT
    await assert.rejects(
      () => copyFileCandidates([path.join(sourceDir, "missing-only.jpg")], targetDir),
      /源文件不存在/,
    );

    console.log(JSON.stringify({ passed: true, copiedFromThumbFallback: true, missingSourceRejected: true }));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
