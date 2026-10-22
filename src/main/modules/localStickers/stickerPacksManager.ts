import path from "node:path";
import fs from "node:fs";
import type { StickerPack, StickerConfig, InternalStickerPack } from "@/common/types/localStickers";
import { resolveStickerPackLabel } from "@/main/utils/stickerPackLabel";

// 定义支持的图片后缀
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

class StickerPacksManager {
  private stickerPacks: Map<string, InternalStickerPack> = new Map();

  public rootPath!: string;

  constructor() {}

  public onEvent(eventName: string, inputPath: string, stats?: fs.Stats) {
    const filePath = inputPath.replace(/\\/g, "/");
    const fileName = path.basename(filePath);
    const dirPath = path.dirname(filePath);
    const ext = path.extname(filePath).toLowerCase();
    switch (eventName) {
      case "addDir":
        this.ensurePackExists(filePath);
        break;
      case "unlinkDir":
        this.stickerPacks.delete(filePath);
        break;
      case "add":
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          this.addSticker(filePath, stats);
        }
        break;
      case "change":
        if (fileName === "sticker.json") {
          this.syncConfig(dirPath);
        }
        break;
      case "unlink":
        this.deleteSticker(filePath);
        break;
    }
  }

  private ensurePackExists(dirPath: string): InternalStickerPack {
    let pack = this.stickerPacks.get(dirPath);
    if (!pack) {
      try {
        // 先查找目录下是否有sticker.json配置文件
        const configPath = path.join(dirPath, "sticker.json");
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as StickerConfig;
          const sync = resolveStickerPackLabel(config.label, config.dirName, this.baseName(dirPath));
          pack = {
            label: sync.label || this.baseName(dirPath),
            index: config.index || 0,
            icon: config.icon || undefined,
            dirPath: dirPath,
            dirName: sync.dirName,
            stickerPaths: new Map<string, number | undefined>(),
          };
          if (sync.changed) {
            this.writeConfig(dirPath, { ...config, label: sync.label, dirName: sync.dirName });
          }
        } else {
          pack = {
            label: this.baseName(dirPath),
            index: 0,
            icon: undefined,
            dirPath: dirPath,
            dirName: this.baseName(dirPath),
            stickerPaths: new Map<string, number | undefined>(),
          };
          this.writeConfig(pack.dirPath, pack);
        }
      } catch (err) {
        pack = {
          label: this.baseName(dirPath),
          index: 0,
          icon: undefined,
          dirPath: dirPath,
          dirName: this.baseName(dirPath),
          stickerPaths: new Map<string, number | undefined>(),
        };
        this.writeConfig(pack.dirPath, pack, true);
      }

      this.stickerPacks.set(dirPath, pack);
    }
    return pack;
  }

  private baseName(stickerPath: string) {
    const relativePath = path.relative(this.rootPath, stickerPath).replace(/\\/g, "/");
    return relativePath || path.basename(stickerPath);
  }

  private writeConfig(dirPath: string, pack: StickerConfig, rewrite = false) {
    const configPath = path.join(dirPath, "sticker.json");
    const currentConfig = rewrite
      ? {}
      : fs.existsSync(configPath)
        ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
        : {};
    // dirName 是改名判定用的基线，必须写进文件，否则下次读取时永远当作「首次」，
    // 目录改名后就再也同步不到标签了
    const dirName = pack.dirName || (currentConfig as StickerConfig).dirName;
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          ...currentConfig,
          ...{
            label: pack.label,
            index: pack.index,
            icon: pack.icon,
            url: pack.url,
            ...(dirName ? { dirName } : {}),
          },
        },
        null,
        2,
      ),
    );
  }

  private syncConfig(dirPath: string) {
    const pack = this.stickerPacks.get(dirPath);
    if (!pack) return;

    const configPath = path.join(dirPath, "sticker.json");
    if (!fs.existsSync(configPath)) return;

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as StickerConfig;
    const sync = resolveStickerPackLabel(config.label, config.dirName, this.baseName(dirPath));
    this.stickerPacks.set(dirPath, {
      ...pack,
      label: sync.label || this.baseName(dirPath),
      index: config.index ?? 0,
      icon: config.icon || undefined,
      dirName: sync.dirName,
    });
    if (sync.changed) {
      this.writeConfig(dirPath, { ...config, label: sync.label, dirName: sync.dirName });
    }
  }

  private addSticker(stickerPath: string, stats?: fs.Stats) {
    const dirPath = path.dirname(stickerPath);
    const pack = this.ensurePackExists(dirPath);
    if (!pack.stickerPaths.has(stickerPath)) {
      pack.stickerPaths.set(stickerPath, stats?.birthtimeMs);
    }
  }

  private deleteSticker(stickerPath: string) {
    const dirPath = path.dirname(stickerPath);
    const pack = this.stickerPacks.get(dirPath);
    if (!pack) return;

    const hasSticker = pack.stickerPaths.has(stickerPath);

    try {
      if (fs.existsSync(stickerPath)) {
        fs.unlinkSync(stickerPath);
      }
    } catch (err) {}

    if (!hasSticker) return;

    pack.stickerPaths.delete(stickerPath);

    const baseName = path.basename(stickerPath);
    if (pack.stickerPaths.size === 0) {
      // 贴纸包如果删空了，则清空icon
      if (pack.icon !== undefined) {
        pack.icon = undefined;
        this.writeConfig(pack.dirPath, pack);
      }
    } else if (pack.icon === baseName) {
      // 贴纸没删空，且被删除的刚好是作为封面的贴纸，顺位继承下一个
      pack.icon = path.basename(pack.stickerPaths.keys().next().value!);
      this.writeConfig(pack.dirPath, pack);
    }
  }

  public getPackList(sort: Config["localStickers"]["sort"] = "default"): StickerPack[] {
    return Array.from(this.stickerPacks.values()).map((pack) => {
      const entries = Array.from(pack.stickerPaths);
      switch (sort) {
        case "fileName":
          entries.sort(([a], [b]) => path.basename(a).localeCompare(path.basename(b)));
          break;
        case "fileName-desc":
          entries.sort(([a], [b]) => path.basename(b).localeCompare(path.basename(a)));
          break;
        case "createDate":
          entries.sort(([, a], [, b]) => (a ?? 0) - (b ?? 0));
          break;
        case "createDate-desc":
          entries.sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
          break;
      }
      const stickers = entries.map(([filePath]) => ({
        label: path.basename(filePath, path.extname(filePath)),
        path: filePath,
      }));

      return {
        label: pack.label,
        dirPath: pack.dirPath,
        index: pack.index,
        icon: (pack.icon ? path.join(pack.dirPath, pack.icon) : pack.stickerPaths.keys().next().value)?.replace(
          /\\/g,
          "/",
        ),
        stickers,
      };
    });
  }

  public updatePackConfig(packPath: string, key: "index" | "label" | "icon" | "url", value: string | number) {
    if (["index", "label", "icon", "url"].includes(key)) {
      const pack = this.stickerPacks.get(packPath);
      if (!pack) return;
      (pack as any)[key] = value;
      this.writeConfig(pack.dirPath, pack);
    }
  }

  public clear() {
    this.stickerPacks.clear();
  }
}

const stickerPacksManager = new StickerPacksManager();

export { stickerPacksManager };
