import { configManager } from "@/main/modules/configManager";
import { reportError, reportLog } from "@/main/utils/reportError";
import { createLogger } from "@/main/utils/createLogger";
import { setupMessageRecordInterceptor } from "@/main/modules/messages/messageRecordInterceptor";
import { setupSendMessageInterceptor } from "@/main/modules/messages/sendMessageInterceptor";
import { setupIpcMain } from "@/main/modules/ipcRegistrar";
import { setupSideBar } from "@/main/modules/sidebarManager";
import { trackWindow } from "@/main/utils/windowTracker";
import { setupIpcInterceptor } from "@/main/modules/ipcInterceptor";
import { localStickers } from "@/main/modules/localStickers";
import { wallpaperService } from "@/main/modules/wallpaper";
import { setupDevWindow } from "@/main/modules/devWindow";
import { proxyManager } from "@/main/modules/proxyManager";
import type { BrowserWindow } from "electron";

const log = createLogger("lt_main");

log("插件启动");

const SESSION_INIT_EVENT = "nodeIKernelSessionListener/onSessionInitComplete";
let hasInitialized = false;
const unsubscribers: Array<() => void> = [];

/** 从各种形态的事件载荷里尽力取出 uid（不同通道的参数结构不一样）。 */
function extractUid(payload: any, depth = 0): string | undefined {
  if (!payload || depth > 6) return undefined;
  if (typeof payload === "string") {
    const value = payload.trim();
    // QQ 的 uid 形如 u_xxxx，只认这个形状，避免把事件名等字符串误当成 uid
    if (/^u_[A-Za-z0-9_-]{6,}$/.test(value)) return value;
    // 退而求其次：纯数字的 QQ 号；事件名之类的字符串含字母或斜杠，不会被误认
    if (/^[0-9]{5,12}$/.test(value)) return value;
    return undefined;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractUid(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof payload === "object") {
    if (typeof payload.uid === "string" && payload.uid) return payload.uid;

    for (const key of ["payload", "data", "args", "result", "detail"]) {
      const found = extractUid(payload[key], depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

function releaseSubscribers() {
  while (unsubscribers.length) {
    const off = unsubscribers.pop();
    try {
      off?.();
    } catch {
      // 注销失败不影响流程
    }
  }
}

/** 只初始化一次；无论从哪个通道拿到 uid，都走这里。 */
function initializeOnce(uid: string, source: string) {
  if (hasInitialized) return;
  hasInitialized = true;
  reportLog("开始初始化（来源：" + source + "）");
  setupMain(uid);
  releaseSubscribers();
}

function handleSessionEvent(channelLabel: string, args: any[]) {
  try {
    const uid = extractUid(args);
    if (uid) {
      initializeOnce(uid, channelLabel);
    } else {
      log("登录事件里没有取到 uid", channelLabel, args?.[2]);
      reportLog("登录事件里没有取到 uid（" + channelLabel + "）");
    }
  } catch (err) {
    log("初始化入口出错", err);
    reportError("登录事件处理", err);
  }
}

// 登录事件在不同 QQ 版本上走的通道不一样，两个方向都监听
unsubscribers.push(
  IpcInterceptor.onIpcSendEvents(SESSION_INIT_EVENT, (...args: any[]) => handleSessionEvent("send 通道", args)),
);
unsubscribers.push(
  IpcInterceptor.onIpcReceiveEvents(SESSION_INIT_EVENT, (...args: any[]) => handleSessionEvent("receive 通道", args)),
);

// 兜底：任意内核事件里只要带了 uid 就立刻初始化，避免单一事件名/通道失效导致插件全程不工作
unsubscribers.push(
  IpcInterceptor.onIpcReceive((...args: any[]) => {
    if (hasInitialized) return;
    const uid = extractUid(args);
    if (uid) initializeOnce(uid, "全局内核事件兜底");
  }),
);

// 初始化：每一步单独容错，避免某一个模块失败导致后面所有功能静默失效
function setupMain(uid: string) {
  const steps: [string, () => void][] = [
    ["配置文件", () => configManager.setup(uid)],
    ["消息记录拦截", () => setupMessageRecordInterceptor()],
    ["发送消息拦截", () => setupSendMessageInterceptor()],
    ["IPC 注册", () => setupIpcMain()],
    ["侧边栏", () => setupSideBar()],
    ["IPC 拦截", () => setupIpcInterceptor()],
    ["调试窗口", () => setupDevWindow()],
    ["背景", () => wallpaperService.setup()],
    ["本地贴纸", () => localStickers.setup()],
    ["代理", () => proxyManager.setup()],
  ];

  for (const [name, run] of steps) {
    try {
      run();
      reportLog("初始化步骤完成: " + name);
    } catch (err) {
      log("初始化步骤失败", name, err);
      reportError(name, err);
    }
  }
}


function onBrowserWindowCreated(window: BrowserWindow) {
  trackWindow(window);
}

if ("qwqnt" in globalThis) {
  qwqnt.main.hooks.whenBrowserWindowCreated.peek(onBrowserWindowCreated);
}

// 错误处理
process.on("uncaughtException", (e) => {
  log("主进程出错", e, e?.stack);
});

module.exports = { onBrowserWindowCreated };
