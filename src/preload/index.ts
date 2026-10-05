import { contextBridge, ipcRenderer } from "electron";
import type { RecallMsgId } from "@/common/types/preventRecall";
import type { WallpaperData } from "@/common/types/wallpaper";
import type { Toast } from "@/common/types/toastManager";
import type { StickerStore, Sticker } from "@/common/types/localStickers";

const exposeFunctions = {
  // 配置相关
  updateConfig: (config: Config) => ipcRenderer.send("lite_tools.updateConfig", config),
  getConfig: async (): Promise<Config> => ipcRenderer.invoke("lite_tools.getConfig"),
  isUserSpecific: (): boolean => ipcRenderer.sendSync("lite_tools.isUserSpecific"),
  isInitialized: (): boolean => ipcRenderer.sendSync("lite_tools.isInitialized"),
  onConfigChange: (callback: (config: Config) => void) =>
    ipcRenderer.on("lite_tools.configChanged", (_, config: Config) => callback(config)),
  getWebContentId: (): number => ipcRenderer.sendSync("lite_tools.getWebContentId"),
  showOpenDialog: (options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> =>
    ipcRenderer.invoke("lite_tools.showOpenDialog", options),
  openExternal: (url: string) => ipcRenderer.send("lite_tools.openExternal", url),

  // 本地表情相关
  onStickerStoreUpdated: (callback: (stickerStore: StickerStore) => void) => {
    const listener = (_: any, stickerStore: StickerStore) => callback(stickerStore);
    ipcRenderer.on("lite_tools.stickerStore.updated", listener);
    return () => {
      ipcRenderer.removeListener("lite_tools.stickerStore.updated", listener);
    };
  },
  getStickerStore: (): Promise<StickerStore> => ipcRenderer.invoke("lite_tools.stickerStore.get"),
  updateStickerPackConfig: (dirPath: string, key: string, value: string | number) =>
    ipcRenderer.send("lite_tools.stickerPacksManager.updatePackConfig", dirPath, key, value),
  deleteSticker: (stickerPath: string) => ipcRenderer.send("lite_tools.stickerPacksManager.deleteSticker", stickerPath),
  downloadTgSticker: (tgStickerUrl: string) =>
    ipcRenderer.send("lite_tools.stickerPacksManager.downloadTgSticker", tgStickerUrl),
  updateRecentStickers: (sticker: Sticker) => ipcRenderer.send("lite_tools.stickerStore.updateRecentStickers", sticker),

  // 通用操作接口
  copyFile: (sourceFilePath: string | string[], targetFilePath: string) =>
    ipcRenderer.invoke("lite_tools.copyFile", sourceFilePath, targetFilePath),

  // 背景相关
  onWallpaperChanged: (callback: (wallpaperData: WallpaperData) => void) =>
    ipcRenderer.on("lite_tools.wallpaperChanged", (_, wallpaperData: WallpaperData) => callback(wallpaperData)),
  getWallpaperData: () => ipcRenderer.send("lite_tools.getWallpaperData"),

  // 防撤回相关
  onRecallMessagesFound: (callback: (recallMsgIds: RecallMsgId[]) => void) =>
    ipcRenderer.on("lite_tools.recallMessagesFound", (_, recallMsgIds: RecallMsgId[]) => callback(recallMsgIds)),
  onUpdateRecallCacheSize: (callback: (size: number) => void) =>
    ipcRenderer.on("lite_tools.updateRecallCacheSize", (_, size: number) => callback(size)),
  getRecallCacheSize: (): Promise<number> => ipcRenderer.invoke("lite_tools.getRecallCacheSize"),
  clearRecallCache: () => ipcRenderer.send("lite_tools.clearRecallCache"),
  openRecallMsgList: () => ipcRenderer.send("lite_tools.openRecallMsgList"),
  openRedirectPicPath: () => ipcRenderer.send("lite_tools.openRedirectPicPath"),

  // ipc转broadcast
  onBroadcast: (callback: (channelName: any, payload: any) => void) =>
    ipcRenderer.on("lite_tools.broadcast", (_, channelName, payload) => callback(channelName, payload)),
  sendBroadcast: (channelName: any, payload: any) => ipcRenderer.send("lite_tools.broadcast", channelName, payload),

  // toast 通知
  onToast: (callback: (toast: Toast) => void) =>
    ipcRenderer.on("lite_tools.toast", (_, toast: Toast) => callback(toast)),
  clearToast: (callback: () => void) => ipcRenderer.on("lite_tools.clearToast", callback),

  // 应用代理
  checkProxy: () => ipcRenderer.send("lite_tools.proxy.check"),

  // debug
  openDevWindow: () => ipcRenderer.send("lite_tools.openDevWindow"),
  // 原生接口调用
  nativeCall: (event: any, payload: any, awaitCallback?: boolean | string | string[]) => {
    const callbackId = crypto.randomUUID();
    const webContentId = ipcRenderer.sendSync("lite_tools.getWebContentId");
    let resolve;
    if (awaitCallback) {
      resolve = new Promise((res) => {
        function onEvent(...args: any[]) {
          if (typeof awaitCallback === "boolean") {
            if (args[1]?.callbackId === callbackId) {
              ipcRenderer.off(`RM_IPCFROM_MAIN${webContentId}`, onEvent);
              res(args[2]);
            }
          } else if (Array.isArray(awaitCallback)) {
            if (awaitCallback.includes(args?.[1]?.cmdName)) {
              ipcRenderer.off(`RM_IPCFROM_MAIN${webContentId}`, onEvent);
              res(args[2]);
            }
          } else {
            if (args?.[2]?.cmdName === awaitCallback) {
              ipcRenderer.off(`RM_IPCFROM_MAIN${webContentId}`, onEvent);
              res(args[2]);
            }
          }
        }
        ipcRenderer.on(`RM_IPCFROM_MAIN${webContentId}`, onEvent);
      });
    } else {
      resolve = Promise.resolve(null);
    }
    ipcRenderer.send(
      `RM_IPCFROM_RENDERER${webContentId}`,
      {
        peerId: webContentId,
        callbackId,
        ...event,
      },
      payload,
    );
    return resolve;
  },
};

contextBridge.exposeInMainWorld("lite_tools", exposeFunctions);

export type LiteTools = typeof exposeFunctions;
