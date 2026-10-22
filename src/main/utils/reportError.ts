import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/main/utils/pluginPaths";

/**
 * 把主进程运行期的异常写到 data 目录，便于事后定位。
 * GUI 进程的 console 看不到，异步链路里的错误也不会自己冒出来。
 */
function reportError(scope: string, err: unknown) {
  try {
    const detail = err instanceof Error ? err.stack || err.message : String(err);
    const line =
      "[" + new Date().toISOString() + "] " + scope + " 失败: " + detail + "\n";
    fs.appendFileSync(path.join(DATA_DIR, "main-error.log"), line, "utf-8");
  } catch {
    // 日志写不进去也不能影响主流程
  }
}

/** 记录一条正常运行轨迹，便于在出问题时还原链路。 */
function reportLog(message: string) {
  try {
    const line = "[" + new Date().toISOString() + "] " + message + "\n";
    fs.appendFileSync(path.join(DATA_DIR, "main-error.log"), line, "utf-8");
  } catch {
    // 写不进去也不影响主流程
  }
}

export { reportError, reportLog };
