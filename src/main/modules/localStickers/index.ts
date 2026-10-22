import fs from "node:fs";
import path from "node:path";
import fsPromises from "node:fs/promises";
import { ipcMain } from "electron";
import chokidar from "chokidar";
import { createLogger } from "@/main/utils/createLogger";
import { globalBroadcast } from "@/main/utils/globalBroadcast";
import { stickerPacksManager } from "./stickerPacksManager";
import { tgStickerDownloader } from "./tgStickerDownloader";
import { recentStickersManager } from "./recentStickersManager";
import { createThrottledDispatcher } from "@/common/createThrottledDispatcher";
import { configManager } from "@/main/modules/configManager";
import { reportError, reportLog } from "@/main/utils/reportError";

import type { FSWatcher } from "chokidar";
import type { StickerStore, StickerPack, StickerPathItem, Sticker } from "@/common/types/localStickers";

const log = createLogger("localStickers");

class LocalStickers {
  private initializedReady = false;
  private watcher: FSWatcher | null = null;
  private currentListeningPath = "";
  private stickerStore = this.createStickerStoreResult("info", "初始化中...");

  constructor() {}

  public notifyStickerStoreUpdated = createThrottledDispatcher(() => {
    if (!this.initializedReady) return; // 避免因节流导致的 offListener 后状态被覆盖
    const stickerPacks = stickerPacksManager.getPackList(configManager.value.localStickers.sort);
    const stickerStore = this.createStickerStoreResult("success", stickerPacks);
    if (stickerStore.stickerPacks?.length) {
      // 插入常用贴纸
      if (configManager.value.localStickers.recentStickers.enabled) {
        log("插入常用贴纸集");
        const recentStickers = recentStickersManager.getRecentStickers();
        if (recentStickers.stickers.length) {
          stickerStore.stickerPacks.unshift(recentStickers);
        }
      }
      this.stickerStore = stickerStore;
    } else {
      this.stickerStore = this.createStickerStoreResult("failed", "路径下没有贴纸");
    }
    this.broadcastStickerStoreUpdated();
  }, 200);

  private broadcastStickerStoreUpdated() {
    log("通知更新", this.stickerStore);
    globalBroadcast("lite_tools.stickerStore.updated", this.stickerStore);
  }

  public setup() {
    this.bindIpcMain();
    // update 是异步的，必须显式接住异常，否则出错只会变成没人看见的 unhandledRejection
    void this.update(configManager.value).catch((err) => {
      log("初始化贴纸监听失败", err);
      reportError("本地贴纸初始化", err);
    });
    configManager.onConfigUpdate((config) => {
      void this.update(config).catch((err) => {
        log("更新贴纸监听失败", err);
        reportError("本地贴纸更新", err);
      });
    });
    log("初始化完成");
    reportLog("本地贴纸 setup 已调用");
  }

  /**
   * 不依赖 chokidar 的兜底扫描：直接把目录里的贴纸文件喂给管理器，
   * 避免监听器在某些环境下不触发初始扫描时，贴纸集一个都登记不上。
   */
  private async scanDirectoryOnce(rootPath: string) {
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 10) return;
      let entries;
      try {
        entries = await fsPromises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
          continue;
        }
        try {
          const stats = await fsPromises.stat(fullPath);
          stickerPacksManager.onEvent("add", fullPath, stats);
        } catch {
          // 单个文件读取失败不影响整体扫描
        }
      }
    };
    await walk(rootPath, 0);
    log("兜底扫描完成");
    reportLog("贴纸兜底扫描完成");
  }

  private bindIpcMain() {
    ipcMain.handle("lite_tools.stickerStore.get", async (): Promise<StickerStore> => {
      return this.stickerStore;
    });
    ipcMain.on("lite_tools.stickerPacksManager.updatePackConfig", (_, path, key, value) => {
      stickerPacksManager.updatePackConfig(path, key, value);
      this.notifyStickerStoreUpdated();
    });
    ipcMain.on("lite_tools.stickerPacksManager.deleteSticker", (_, stickerPath) => {
      recentStickersManager.deleteSticker(stickerPath);
      stickerPacksManager.onEvent("unlink", stickerPath);
      this.notifyStickerStoreUpdated();
    });
    ipcMain.on("lite_tools.stickerPacksManager.downloadTgSticker", (_, tgStickerUrl: string) => {
      tgStickerDownloader.getTgSticker(tgStickerUrl);
    });
    ipcMain.on("lite_tools.stickerStore.updateRecentStickers", (_, sticker: Sticker) => {
      recentStickersManager.updateRecentStickers(sticker);
      this.notifyStickerStoreUpdated();
    });
  }

  private async update(config: Config) {
    if (config.localStickers.enabled) {
      await this.addListener(config.localStickers.path);
      const some: Set<ConfigPath> = new Set([
        "localStickers.recentStickers.enabled",
        "localStickers.recentStickers.limit",
        "localStickers.stickersPerRow",
        "localStickers.sort",
      ]);
      if (configManager.lastUpdatedConfigs.some((key) => some.has(key))) {
        this.notifyStickerStoreUpdated();
      }
    } else {
      await this.offListener();
      this.stickerStore = this.createStickerStoreResult("failed", "功能未启用");
      this.broadcastStickerStoreUpdated();
    }
  }

  private async addListener(targetPath: string) {
    // 如果路径没变且正在监听，则跳过
    if (this.watcher && this.currentListeningPath === targetPath) {
      return;
    }

    log("更新监听目录:", targetPath);
    reportLog("贴纸监听目录: " + targetPath);

    // 重置状态
    this.initializedReady = false;
    await this.offListener();

    // 更新 rootPath
    stickerPacksManager.rootPath = targetPath;

    if (!targetPath) {
      this.stickerStore = this.createStickerStoreResult("failed", "请选择目录");
      this.broadcastStickerStoreUpdated();
      this.currentListeningPath = "";
      return;
    }

    try {
      // 必须使用异步的 stat 防止阻塞主进程
      const stat = await fs.promises.stat(targetPath);
      if (!stat.isDirectory()) {
        this.stickerStore = this.createStickerStoreResult("failed", "路径无效");
        this.broadcastStickerStoreUpdated();
        this.currentListeningPath = "";
        return;
      }

      recentStickersManager.setRootPath(targetPath);

      this.currentListeningPath = targetPath;
      this.stickerStore = this.createStickerStoreResult("info", "扫描表情中...");
      this.broadcastStickerStoreUpdated();

      this.watcher = chokidar.watch(targetPath, {
        ignoreInitial: false,
        alwaysStat: true,
        depth: 10, // 限制目录深度，防止过度扫描子目录导致性能问题
      });

      // 并行做一次兜底扫描，保证初始登记不依赖监听器
      void this.scanDirectoryOnce(targetPath).catch((err) => {
        log("兜底扫描失败", err);
        reportError("贴纸目录兜底扫描", err);
      });

      // 监听 ready 事件来放行 IPC
      this.watcher.on("ready", () => {
        log("首次扫描完成");
        reportLog("贴纸首次扫描完成");
        this.initializedReady = true;
        this.notifyStickerStoreUpdated();
      });

      this.watcher.on("all", (event, path, stats) => {
        // 初始扫描时避免疯狂日志刷屏卡顿
        if (this.initializedReady) {
          log("文件变化", event, path);
        }

        stickerPacksManager.onEvent(event, path, stats);

        if (event === "unlink") {
          recentStickersManager.deleteSticker(path);
        }

        if (this.initializedReady) {
          this.notifyStickerStoreUpdated();
        }
      });

      this.watcher.on("error", async (err: any) => {
        log("监听失败", err);
        reportError("贴纸目录监听", err);
        await this.offListener();
        this.stickerStore = this.createStickerStoreResult("failed", `监听文件夹失败: ${err.message}`);
        this.currentListeningPath = "";
        this.broadcastStickerStoreUpdated();
      });
    } catch (err: any) {
      log("监听失败", err);
      reportError("贴纸目录监听(初始化)", err);
      await this.offListener();
      this.stickerStore = this.createStickerStoreResult("failed", `监听文件夹失败: ${err.message}`);
      this.currentListeningPath = "";
      this.broadcastStickerStoreUpdated();
    }
  }

  private async offListener() {
    // if (!this.watcher) return;
    // log("关闭监听");
    this.initializedReady = false;
    const oldWatcher = this.watcher;
    this.watcher = null;
    this.currentListeningPath = ""; // 清空路径状态

    // 重置 stickerStore
    this.stickerStore = this.createStickerStoreResult("failed", "监听已关闭");
    stickerPacksManager.clear();

    await oldWatcher?.close();
  }

  private createStickerStoreResult(status: "success", stickerPacks: StickerPack[]): StickerStore;
  private createStickerStoreResult(status: "info" | "failed", msg: string): StickerStore;
  private createStickerStoreResult(status: "success" | "info" | "failed", arg: StickerPack[] | string): StickerStore {
    log("创建 stickerStore", status, arg);
    return {
      status,
      ...(status === "success" ? { stickerPacks: arg } : { msg: arg }),
    } as StickerStore;
  }
}

const localStickers = new LocalStickers();

export { localStickers };
