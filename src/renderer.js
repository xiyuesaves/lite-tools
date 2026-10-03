/**
 * @author xiyuesaves
 * @date 2024-01-22
 */
import "./render_modules/hookVue3.js";
import { options, updateOptions } from "./render_modules/options.js";
import { first } from "./render_modules/first.js";
/**
 * 根据页面哈希决定加载页面模块
 * @return {void}
 */
async function onLoad() {
  let time = Date.now();
  await import("./render_modules/initStyle.js");
  const { initCurAioData } = await import("./render_modules/curAioData.js");
  const { Logs } = await import("./render_modules/logs.js");
  const log = new Logs("主渲染进程模块");
  log("初始化", Date.now() - time);
  if (location.hash === "#/blank") {
    navigation.addEventListener("navigatesuccess", updateHash, { once: true });
  } else {
    updateHash();
  }
  /**
   * 根据页面哈希值决定加载页面模块
   * @returns {void}
   */
  function updateHash() {
    let hash = location.hash;
    if (hash === "#/blank") {
      return;
    }
    if (hash.includes("#/main/message")) {
      initCurAioData();
      app.classList.add("lite-tools-main");
      import("./pages/mainMessage.js");
    } else if (hash.includes("#/chat")) {
      initCurAioData();
      app.classList.add("lite-tools-chat");
      import("./pages/chatMessage.js");
    } else if (hash.includes("#/forward")) {
      app.classList.add("lite-tools-forward");
      import("./pages/forward.js");
    } else if (hash.includes("#/image-viewer")) {
      app.classList.add("lite-tools-image-viewer");
      import("./pages/imageViewer.js");
    }
    lite_tools.windowOnload();
  }
}
if (Object.keys(options).length > 0) {
  onLoad();
} else {
  console.log("等待配置文件更新");
  updateOptions(() => {
    if (first("init")) {
      onLoad();
    }
  });
}
/**
 * 设置页面入口
 * @param {Element} view 设置页面容器
 */
function onSettingWindowCreated(view) {
  import("./pages/configView.js").then((module) => {
    module.onConfigView(view);
  }).catch((e) => {
    // 不加 catch 时动态加载失败只会变成未处理的 Promise 拒绝，设置页表现为空白且无任何提示
    console.error("[lite_tools] 配置界面加载失败:", e);
  });
}

export { onSettingWindowCreated };
