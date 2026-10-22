import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveStickerPackLabel } from "../../src/main/utils/stickerPackLabel";

async function main() {
  const BS = String.fromCharCode(92);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lite-tools-local-stickers-"));
  try {
    fs.mkdirSync(tempRoot, { recursive: true });

    // 目录改名同步：只看 sticker.json 里记录的目录名，不看时间戳
    // 首次记录：只写基线，不动用户手写的标签
    assert.deepEqual(
      resolveStickerPackLabel("原神表情包/小伊爱诺表情包", undefined, "原神表情包/伊宝爱诺表情包"),
      { label: "原神表情包/小伊爱诺表情包", dirName: "原神表情包/伊宝爱诺表情包", changed: true },
    );
    // 首次记录：标签末段还是系统默认名，说明是自动带上来的，跟随当前目录名
    assert.deepEqual(
      resolveStickerPackLabel("绝区零表情包/新建文件夹", undefined, "绝区零表情包/菲小妹表情包"),
      { label: "绝区零表情包/菲小妹表情包", dirName: "绝区零表情包/菲小妹表情包", changed: true },
    );
    // 带序号的默认名同样认得出
    assert.deepEqual(
      resolveStickerPackLabel("崩三表情包/新建文件夹 (2)", undefined, "崩三表情包/薇薇表情包"),
      { label: "崩三表情包/薇薇表情包", dirName: "崩三表情包/薇薇表情包", changed: true },
    );
    // 目录本身仍叫默认名时不乱动，只补基线
    assert.deepEqual(
      resolveStickerPackLabel("绝区零表情包/新建文件夹", undefined, "绝区零表情包/新建文件夹"),
      { label: "绝区零表情包/新建文件夹", dirName: "绝区零表情包/新建文件夹", changed: true },
    );
    // 目录被改名：标签跟随新的相对路径
    assert.deepEqual(
      resolveStickerPackLabel("崩铁表情包/真珠表情包", "崩铁表情包/真珠表情包", "崩铁表情包/珠珠表情包"),
      { label: "崩铁表情包/珠珠表情包", dirName: "崩铁表情包/珠珠表情包", changed: true },
    );
    // 目录没改名：用户自己写的短名保留
    assert.deepEqual(
      resolveStickerPackLabel("少潮-能代", "少潮-能代表情包", "少潮-能代表情包"),
      { label: "少潮-能代", dirName: "少潮-能代表情包", changed: false },
    );
    // 改名完成后用户又改了名字，基线已跟上，保持不动
    assert.deepEqual(
      resolveStickerPackLabel("我的自定义名", "崩铁表情包/珠珠表情包", "崩铁表情包/珠珠表情包"),
      { label: "我的自定义名", dirName: "崩铁表情包/珠珠表情包", changed: false },
    );
    // 分隔符与多余斜杠先归一化再比较，避免误判成改名
    assert.deepEqual(
      resolveStickerPackLabel("崩铁表情包/珠珠表情包", "崩铁表情包//珠珠表情包" + BS, "崩铁表情包/珠珠表情包"),
      { label: "崩铁表情包/珠珠表情包", dirName: "崩铁表情包/珠珠表情包", changed: false },
    );

    console.log(JSON.stringify({ passed: true, renameSync: true }));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
