import { ipcMain, dialog, BrowserWindow, shell } from "electron";
import { mainWindow } from "@/main/utils/windowTracker";
import { copyFileCandidates } from "@/main/utils/copyFileCandidates";

function setupIpcMain() {
  // 返回窗口id
  ipcMain.on("lite_tools.getWebContentId", (event) => {
    event.returnValue = event.sender.id;
  });
  // 使用主进程广播
  ipcMain.on("lite_tools.broadcast", (event, channelName, payload) => {
    if (mainWindow && mainWindow?.webContents?.send) {
      mainWindow.webContents.send("lite_tools.broadcast", channelName, payload);
    }
  });
  // 通用文件选择弹窗
  ipcMain.handle("lite_tools.showOpenDialog", (event, options: Electron.OpenDialogOptions) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return dialog.showOpenDialog(win!, options);
  });
  // 通用外部打开链接
  ipcMain.on("lite_tools.openExternal", (event, url: string) => {
    shell.openExternal(url);
  });
  // 通用文件复制
  ipcMain.handle("lite_tools.copyFile", async (event, currentPath: string | string[], targetPath: string) => {
    try {
      const finalPath = await copyFileCandidates(currentPath, targetPath);

      return {
        success: true,
        data: finalPath,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Unknown file copy error",
      };
    }
  });
}

export { setupIpcMain };
