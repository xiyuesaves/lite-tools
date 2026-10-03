// 防抖函数
import { debounce } from "../render_modules/debounce.js";
// 检查更新;
import { checkUpdate } from "../render_modules/checkUpdate.js";
// 向设置界面插入动态选项
import { addOptionLi } from "../render_modules/addOptionLi.js";
// 初始化设置界面监听方法
import { SwitchEventlistener } from "../render_modules/addSwitchEventlistener.js";
// 加载配置信息
import { options, updateOptions } from "../render_modules/options.js";
// 后缀类
import { TailList } from "../render_modules/tailList.js";
// 引入图标
import { pluginIcon } from "../render_modules/svg.js";
// 简单markdown转html
import { simpleMarkdownToHTML } from "../render_modules/simpleMarkdownToHTML.js";
// 更新日志弹窗
import { openChangeLog } from "../render_modules/openChangeLog.js";
// 获取当前登录账号信息
import { getAuthData } from "../render_modules/nativeCall.js";
// 配置属性读写模块
import { getValueByPath, setValueByPath } from "../render_modules/ObjectPathUtils.js";
// 配置界面日志
import { Logs } from "../render_modules/logs.js";
import { showToast, clearToast } from "../render_modules/toast.js";
const log = new Logs("配置界面");

/**
 * 打开设置界面时触发
 * @param {Element} view 设置页面容器
 */
async function onConfigView(view) {
  // 调试用，等待5秒后再执行
  // await new Promise((res) => setTimeout(res, 3000));

  // 主进程配置尚未初始化时（旧版本会等主窗口首条消息才 loadUserConfig），
  // options 为空对象，后续 options.sidebar.top 等读取会抛错，
  // 页面只渲染出折叠标题、所有功能列表永远 hidden。这里等配置就绪再继续构建。
  if (Object.keys(options).length === 0) {
    log("主进程配置尚未就绪，等待配置初始化");
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (Object.keys(options).length > 0) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, 10 * 1000);
    });
  }

  document.querySelectorAll(".nav-item.liteloader,.nav-bar.liteloader .nav-item").forEach((node) => {
    if (node.textContent === "轻量工具箱") {
      node.querySelector(".q-icon").innerHTML = pluginIcon;
    }
  });
  // 返回通用监听方法
  const addSwitchEventlistener = SwitchEventlistener(view);
  log("开始初始化");
  // 初始化常量
  const plugin_path = LiteLoader.plugins.lite_tools.path.plugin;
  const css_file_path = `local:///${plugin_path}/src/css/view.css`;
  const html_file_path = `local:///${plugin_path}/src/html/view.html`;
  log("css_file_path", css_file_path);
  log("html_file_path", html_file_path);

  // CSS
  const link_element = document.createElement("link");
  link_element.rel = "stylesheet";
  link_element.href = css_file_path;
  document.head.appendChild(link_element);
  log("插入css");

  // HTMl
  const html_text = await (await fetch(html_file_path)).text();
  view.insertAdjacentHTML("afterbegin", html_text);
  log("dom加载完成");

  // 防抖更新配置方法
  const debounceSetOptions = debounce(() => {
    lite_tools.setOptions(options);
  }, 100);

  // 从仓库检查更新
  checkUpdate(view);
  // 调试模式动态更新样式
  lite_tools.updateSettingStyle(() => {
    link_element.href = css_file_path + `?r=${new Date().getTime()}`;
  });
  // 显示插件版本信息
  view.querySelector(".version .link").innerText = LiteLoader.plugins.lite_tools.manifest.version;

  const sidebar = view.querySelector(".sidebar ul");
  const textArea = view.querySelector(".textArea ul");
  const chatArea = view.querySelector(".chatArea ul");

  log("开始添加功能");

  // 异步初始化自定义字体功能
  initFontList();
  async function initFontList() {
    /**
     * 获取系统字体列表 改用浏览器接口
     * @type {FontData[]}
     */
    const systemFonts = await window.queryLocalFonts();
    const fontListEl = view.querySelector(".font-list");
    const fontInputEl = view.querySelector(".font-input");
    let listHeight = 0;
    let rendererList = [];
    function resizeHeight() {
      listHeight = fontListEl.offsetHeight;
      fontListEl.dispatchEvent(new Event("scroll"));
      log("更新列表高度", listHeight);
    }
    const resizeObserver = new ResizeObserver(resizeHeight);
    resizeObserver.observe(fontListEl);
    fontListEl.addEventListener("scroll", (event) => {
      // 计算可见范围并更新字体样式
      const startIndex = Math.floor(event.target.scrollTop / 26);
      const endIndex = startIndex + Math.ceil(listHeight / 26);
      for (let i = startIndex; i < endIndex; i++) {
        const target = rendererList[i];
        if (target) {
          target.style.fontFamily = `"${target.FontData.fullName}"`;
          if (target.FontData.family) {
            target.style.fontFamily += `, "${target.FontData.family}"`;
          }
          target.style.fontStyle = ["italic", "oblique"].includes(target.FontData.style.toLocaleLowerCase())
            ? target.FontData.style
            : "normal";
        }
      }
    });
    fontInputEl.value = options.message.overrideFont.fullName;
    fontInputEl.addEventListener("focus", updateFilterFontList);
    fontInputEl.addEventListener("input", updateFilterFontList);
    fontInputEl.addEventListener("blur", () => {
      fontListEl.classList.remove("show");
    });
    fontListEl.addEventListener("mousedown", (event) => {
      if (event.target.classList.contains("setting-item")) {
        const findFontData = event.target.FontData;
        options.message.overrideFont = {
          family: findFontData.family,
          style: ["italic", "oblique"].includes(findFontData.style.toLocaleLowerCase()) ? findFontData.style : "normal",
          fullName: findFontData.fullName,
          postscriptName: findFontData.postscriptName,
        };
        fontInputEl.value = findFontData.fullName;
        debounceSetOptions();
      }
    });
    log("初始化字体列表完成");
    function updateFilterFontList(event) {
      if (event.type === "focus") {
        event.target.select();
      }
      fontListEl.classList.add("show");
      if (event.target.value.length && event.type === "input") {
        const filterFontList = systemFonts.filter((FontData) => {
          return (
            FontData.fullName.toLocaleLowerCase().includes(event.target.value.toLocaleLowerCase()) ||
            FontData.family.toLocaleLowerCase().includes(event.target.value.toLocaleLowerCase()) ||
            FontData.postscriptName.toLocaleLowerCase().includes(event.target.value.toLocaleLowerCase())
          );
        });
        updateFontList(filterFontList);
      } else {
        updateFontList(systemFonts);
      }
      if (event.type === "input") {
        options.message.overrideFont = {
          family: "",
          style: "",
          fullName: event.target.value,
          postscriptName: "",
        };
        debounceSetOptions();
      }
      fontListEl.dispatchEvent(new Event("scroll"));
    }
    function updateFontList(fontList) {
      rendererList = [];
      fontListEl.innerHTML = "";
      if (!fontList.length) {
        const settingOptionEl = document.createElement("span");
        settingOptionEl.setAttribute("title", "没有匹配字体");
        settingOptionEl.classList.add("setting-item");
        settingOptionEl.classList.add("poe-none");
        settingOptionEl.innerText = "没有匹配字体";
        fontListEl.appendChild(settingOptionEl);
      }
      fontList.forEach((FontData) => {
        const settingOptionEl = document.createElement("span");
        settingOptionEl.classList.add("setting-item");
        settingOptionEl.setAttribute("title", FontData.fullName);
        settingOptionEl.innerText = FontData.fullName;
        settingOptionEl.FontData = FontData;
        rendererList.push(settingOptionEl);
        fontListEl.appendChild(settingOptionEl);
      });
    }
  }

  // 添加侧边栏上方功能列表
  addOptionLi(options.sidebar.top, sidebar, "sidebar.top", "disabled");

  // 添加侧边栏下方功能列表
  addOptionLi(options.sidebar.bottom, sidebar, "sidebar.bottom", "disabled");

  // 添加输入框上方功能列表
  addOptionLi(options.textAreaFuncList, textArea, "textAreaFuncList", "disabled");

  // 添加聊天框上方功能列表
  addOptionLi(options.chatAreaFuncList, chatArea, "chatAreaFuncList", "disabled");

  log("精简功能添加完成");

  // 列表展开功能
  view.querySelectorAll(".wrap .vertical-list-item.title").forEach((el) => {
    el.addEventListener("click", function () {
      const wrap = this.parentElement;
      wrap.querySelector(".icon").classList.toggle("is-fold");
      wrap.querySelector("ul").classList.toggle("hidden");
    });
  });

  log("页面功能初始化完成");

  // 批量添加事件
  view.querySelectorAll(".q-switch").forEach((el) => {
    const configPath = el.getAttribute("data-config");
    if (configPath) {
      addSwitchEventlistener(configPath, el);
    }
  });

  // 初始化下拉框
  view.querySelectorAll(".setting-select").forEach((el) => {
    const configPath = el.getAttribute("data-config");
    if (configPath) {
      el.addEventListener("click", (event) => {
        if (event.target.classList.contains("setting-item")) {
          const newValue = event.target.getAttribute("data-value");
          const showVlaue = event.target.innerText;
          setValueByPath(options, configPath, newValue);
          lite_tools.setOptions(options);
          el.querySelector("input.setting-input")?.setAttribute("value", showVlaue);
          el.querySelector("div.setting-view")?.setAttribute("data-value", showVlaue);
        }
        el.querySelector(".setting-option").classList.toggle("show");
      });
      const option = getValueByPath(options, configPath);
      const showVlaue =
        Array.from(el.querySelectorAll(".setting-item")).find((item) => item.getAttribute("data-value") === option)?.innerText ?? option;
      el.querySelector("input.setting-input")?.setAttribute("value", showVlaue);
      el.querySelector("div.setting-view")?.setAttribute("data-value", showVlaue);
    }
  });
  document.addEventListener("mousedown", closeSettingOption);
  window.addEventListener("blur", closeSettingOption);
  function closeSettingOption(event) {
    const openSeletc = view.querySelector(".setting-select:has(.setting-option.show)");
    if (openSeletc === event?.target?.closest?.(".setting-select")) {
      return;
    }
    view.querySelectorAll(".setting-select .setting-option").forEach((el) => el.classList.remove("show"));
  }

  // 划词搜索
  addSwitchEventlistener("qContextMenu.wordSearch.enabled", ".switchSelectSearch", (_, enabled) => {
    view.querySelector(".select-search-url").classList.toggle("disabled-input", !enabled);
  });
  const searchEl = view.querySelector(".search-url");
  searchEl.value = options.qContextMenu.wordSearch.searchUrl;
  searchEl.addEventListener("input", (e) => {
    options.qContextMenu.wordSearch.searchUrl = e.target.value;
    debounceSetOptions();
  });

  // 图片搜索
  addSwitchEventlistener("qContextMenu.imageSearch.enabled", ".switchImageSearch", (_, enabled) => {
    view.querySelector(".image-select-search-url").classList.toggle("disabled-input", !enabled);
  });
  const imgSearchEl = view.querySelector(".img-search-url");
  imgSearchEl.value = options.qContextMenu.imageSearch.searchUrl;
  imgSearchEl.addEventListener("input", (e) => {
    options.qContextMenu.imageSearch.searchUrl = e.target.value;
    debounceSetOptions();
  });

  // 头像黏贴消息框效果
  addSwitchEventlistener("message.avatarSticky.enabled", ".avatarSticky", (_, enabled) => {
    view.querySelector(".avatar-bottom-li").classList.toggle("disabled-switch", !enabled);
  });

  /**
   * 初始化自定义撤回样式
   * @type {Element}
   */
  const customTextColorLight = view.querySelector(".custom-text-color-lite");
  customTextColorLight.value = options.preventMessageRecall.textColor.light;
  customTextColorLight.addEventListener("change", (event) => {
    options.preventMessageRecall.textColor.light = event.target.value;
    debounceSetOptions();
  });

  const customTextColorDark = view.querySelector(".custom-text-color-dark");
  customTextColorDark.value = options.preventMessageRecall.textColor.dark;
  customTextColorDark.addEventListener("change", (event) => {
    options.preventMessageRecall.textColor.dark = event.target.value;
    debounceSetOptions();
  });

  // 清除本地撤回数据
  view.querySelector(".clear-localStorage-recall-msg").addEventListener("click", () => {
    log("清除本地数据");
    lite_tools.clearLocalStorageRecallMsg();
  });
  // 动态更新界面上的撤回数据
  lite_tools.onUpdateRecallListNum((_, num) => {
    view.querySelector(".local-recall-msg-num").innerText = `清除所有本地保存的撤回数据，当前保存约 ${num} 条消息`;
  });
  // 获取本地撤回消息数量
  const recallNum = lite_tools.getRecallListNum();
  view.querySelector(".local-recall-msg-num").innerText = `清除所有本地保存的撤回数据，当前保存约 ${recallNum} 条消息`;
  // 查看撤回数据
  view.querySelector(".open-recall-msg-list").addEventListener("click", () => {
    log("查看撤回数据");
    lite_tools.openRecallMsgList();
  });

  // 图片遮罩
  addSwitchEventlistener("message.preventNSFW.enabled", ".preventNSFW", (_, enabled) => {
    view.querySelector(".preventNSFW-keyword").classList.toggle("disabled-input", !enabled);
  });
  const preventNSFW = view.querySelector(".preventNSFW-list-input");
  preventNSFW.value = options.message.preventNSFW.list.join(",");
  preventNSFW.addEventListener("input", (e) => {
    if (e.target.value.length) {
      options.message.preventNSFW.list = e.target.value.split(",");
    } else {
      options.message.preventNSFW.list = [];
    }
    debounceSetOptions();
  });

  // 消息关键词
  addSwitchEventlistener("keywordReminder.enabled", ".keywordReminder", (_, enabled) => {
    view.querySelector(".keywordReminder-keyword").classList.toggle("disabled-input", !enabled);
  });
  const keywordReminder = view.querySelector(".keywordReminder-keyword-input");
  keywordReminder.value = options.keywordReminder.keyList.join(",");
  keywordReminder.addEventListener("input", (e) => {
    if (e.target.value.length) {
      options.keywordReminder.keyList = e.target.value.split(",");
    } else {
      options.keywordReminder.keyList = [];
    }
    debounceSetOptions();
  });

  // 消息转图片
  const defaultSaveFilePath = view.querySelector(".select-default-save-file-input-clear");
  defaultSaveFilePath.value = options.qContextMenu.messageToImage.path;
  view.querySelector(".select-default-save-file-input").addEventListener("click", async () => {
    const result = await lite_tools.showOpenDialog({
      title: "请选择文件夹", //默认路径,默认选择的文件
      properties: ["openDirectory"],
      buttonLabel: "选择文件夹",
    });
    if (!result.canceled) {
      options.qContextMenu.messageToImage.path = result.filePaths[0];
      log("选择了消息转图片默认保存路径", options.qContextMenu.messageToImage.path);
      debounceSetOptions();
    }
  });
  defaultSaveFilePath.addEventListener("click", (e) => {
    e.target.value = "";
    options.qContextMenu.messageToImage.path = "";
    debounceSetOptions();
  });

  // 本地表情包功能
  addSwitchEventlistener("localEmoticons.enabled", ".switchLocalEmoticons", (_, enabled) => {
    view.querySelector(".select-folder-input").classList.toggle("disabled-input", !enabled);
    view.querySelector(".copyFileTolocalEmoticons").classList.toggle("disabled-switch", !enabled);
  });
  view.querySelector(".select-folder-input input").value = options.localEmoticons.localPath;
  view.querySelector(".select-local-emoticons-folder").addEventListener("click", async () => {
    const result = await lite_tools.showOpenDialog({
      title: "请选择文件夹", //默认路径,默认选择的文件
      properties: ["openDirectory"],
      buttonLabel: "选择文件夹",
    });
    if (!result.canceled) {
      options.localEmoticons.localPath = result.filePaths[0];
      log("选择了本地表情路径", options.localEmoticons.localPath);
      debounceSetOptions();
    }
  });
  view.querySelector(".select-local-emoticons-folder-clear").addEventListener("click", (e) => {
    e.target.value = "";
    options.localEmoticons.localPath = "";
    debounceSetOptions();
  });

  // 快捷输入表情功能
  addSwitchEventlistener("localEmoticons.quickEmoticons", ".switchQuickEmoticons", (_, enabled) => {
    view.querySelector(".switchQuickEmoticonsAutoInputOnlyOne").parentNode.classList.toggle("disabled-switch", !enabled);
  });
  // 快捷表情自动插入
  const quickEmoticonsActiveKey = view.querySelector(".quickEmoticonsActiveKey");
  quickEmoticonsActiveKey.value = options.localEmoticons.quickEmoticonsActiveKey;
  quickEmoticonsActiveKey.addEventListener("input", (e) => {
    // 只保留一位
    if (e.target.value.length > 1) {
      e.target.value = e.target.value.split("")[e.target.value.length - 1];
    } else if (e.target.value.length === 0) {
      e.target.value = "/";
    }
    options.localEmoticons.quickEmoticonsActiveKey = e.target.value.split("")[0];
    debounceSetOptions();
  });
  // 常用表情分类
  addSwitchEventlistener("localEmoticons.commonlyEmoticons", ".switchCommonlyEmoticons", (_, enabled) => {
    view.querySelector(".hoverShowCommonlyEmoticons").classList.toggle("disabled-switch", !enabled);
  });
  //最近使用分组数量
  view.querySelector(".recent-folders-num").value = options.localEmoticons.recentlyNum;
  view.querySelector(".recent-folders-num").addEventListener("blur", (e) => {
    const newRecentFoldersNum = parseInt(e.target.value);
    let newValue = Number.isNaN(newRecentFoldersNum) ? 0 : newRecentFoldersNum;
    if (newValue < -2) {
      newValue = 0;
    }
    options.localEmoticons.recentlyNum = newValue;
    e.target.value = options.localEmoticons.recentlyNum;
    debounceSetOptions();
  });

  // 初始化背景路径选择监听和值
  view.querySelector(".select-background-wallpaper-clear").value = options.background.url;
  view.querySelector(".select-background-wallpaper").addEventListener("click", async () => {
    const result = await lite_tools.showOpenDialog({
      title: "请选择文件", //默认路径,默认选择的文件
      defaultPath: "default.jpg", //过滤文件后缀
      filters: [
        {
          name: "img",
          extensions: ["jpg", "png", "gif", "webp", "jpeg", "mp4", "webm"],
        },
      ], //打开按钮
      buttonLabel: "选择", //回调结果渲染到img标签上
    });
    if (!result.canceled) {
      options.background.url = result.filePaths[0];
      log("选择了背景图片/视频地址", options.background.url);
      debounceSetOptions();
    }
  });
  view.querySelector(".select-background-wallpaper-clear").addEventListener("click", (e) => {
    e.target.value = "";
    options.background.url = "";
    debounceSetOptions();
  });
  // 初始化背景透明度输入框监听和值
  view.querySelector(".background-opacity").value = options.background.opacity * 100;
  view.querySelector(".background-opacity").addEventListener("blur", (e) => {
    const inputValue = parseInt(e.target.value) / 100;
    if (!Number.isNaN(inputValue) && inputValue >= 0 && inputValue <= 1) {
      options.background.opacity = inputValue;
    } else {
      options.background.opacity = 0.5;
    }
    e.target.value = options.background.opacity * 100;
    debounceSetOptions();
  });

  // 监听连接元素点击
  view.addEventListener("click", (e) => {
    if (e.target.tagName === "A") {
      const href = e.target.getAttribute("data-href");
      if (href) {
        lite_tools.openWeb(href);
      }
    }
  });

  log("完成所有选项初始化");

  // 自定义历史表情数量
  view.querySelector(".recommend-num").innerText = `自定义历史表情保存数量，推荐：${options.localEmoticons.rowsSize}，${
    options.localEmoticons.rowsSize * 2
  }，${options.localEmoticons.rowsSize * 3}，${options.localEmoticons.rowsSize * 4}`;
  const commonlyEmoticonsEl = view.querySelector(".commonly-emoticons-num");
  commonlyEmoticonsEl.setAttribute("placeholder", options.localEmoticons.rowsSize * 3);
  commonlyEmoticonsEl.value = options.localEmoticons.commonlyNum;
  commonlyEmoticonsEl.addEventListener("blur", (e) => {
    let inputValue = parseInt(e.target.value);
    if (!inputValue || inputValue <= 0) {
      inputValue = options.localEmoticons.rowsSize * 3;
    }
    options.localEmoticons.commonlyNum = inputValue;
    commonlyEmoticonsEl.value = options.localEmoticons.commonlyNum;
    debounceSetOptions();
  });

  // 不可复用的拖拽选择方法
  function initSider() {
    updateSider();
    let hasDown = false;
    let downX = 0;
    let btnX = 0;
    let siderBar;
    let siderWidth;
    const step = [0, 25, 50, 75, 100];

    window.addEventListener("mousedown", (event) => {
      if (event.target.classList.contains("sider-button")) {
        siderBar = view.querySelector(".sider");
        siderWidth = siderBar.offsetWidth;
        hasDown = true;
        downX = event.clientX;
        btnX = event.target.offsetLeft;
      }
    });
    window.addEventListener("mousemove", (event) => {
      if (hasDown) {
        // 很怪的判定方法
        const moveX = downX - event.clientX;
        const process = parseInt(((btnX - moveX) / siderWidth) * 100);
        const newVal = step.findIndex((num) => {
          const offset = Math.abs(num - process);
          if (offset < 12) {
            return true;
          }
        });
        if (newVal !== -1) {
          options.localEmoticons.rowsSize = newVal + 3;
          view.querySelector(".commonly-emoticons-num").setAttribute("placeholder", options.localEmoticons.rowsSize * 3);
          view.querySelector(".recommend-num").innerText = `自定义历史表情保存数量，推荐：${options.localEmoticons.rowsSize}，${
            options.localEmoticons.rowsSize * 2
          }，${options.localEmoticons.rowsSize * 3}，${options.localEmoticons.rowsSize * 4}`;
          debounceSetOptions();
          updateSider();
        }
      }
    });
    window.addEventListener("mouseup", () => {
      hasDown = false;
    });
  }
  initSider();

  function updateSider() {
    const button = view.querySelector(".sider-button");
    const mask = view.querySelector(".sider-mask");
    const siderStepItems = view.querySelectorAll(".sider-step-item");
    siderStepItems.forEach((item, index) => {
      const value = parseInt(item.getAttribute("data-value"));
      if (value <= options.localEmoticons.rowsSize) {
        item.classList.add("active-bg");
        const offset = `${100 * (index / (siderStepItems.length - 1))}%`;
        button.style.left = offset;
        mask.style.width = offset;
      } else {
        item.classList.remove("active-bg");
      }
    });
  }

  // 消息后缀
  const listView = view.querySelector(".vertical-list-item .tail-ruls-list");
  const tailList = new TailList(listView, options.tail.list);
  view.querySelector(".create-new-tail-item").addEventListener("click", () => {
    tailList.createNewTail();
  });

  // rkey接口请求地址
  const rkeyApiUrl = view.querySelector(".rkey-api-url");
  rkeyApiUrl.value = options.rkeyAPI;
  rkeyApiUrl.addEventListener("input", (e) => {
    options.rkeyAPI = e.target.value;
    debounceSetOptions();
  });

  // rkey Token
  const rkeyToken = view.querySelector(".rkey-token");
  rkeyToken.value = options.rkeyToken;
  rkeyToken.addEventListener("input", (e) => {
    options.rkeyToken = e.target.value;
    debounceSetOptions();
  });

  // 代理地址
  const proxyUrl = view.querySelector(".proxy-url");
  proxyUrl.value = options.proxy.url;
  const proxyStatus = view.querySelector(".test-proxy");
  const applyProxy = view.querySelector(".apply-proxy-url");
  applyProxy.addEventListener("click", async () => {
    applyProxy.classList.add("disabled-input");
    proxyStatus.innerHTML = "检查中...";
    proxyStatus.className = "test-proxy";
    proxyStatus.style.pointerEvents = "none";
    await lite_tools.applyProxy(proxyUrl.value);
    applyProxy.classList.remove("disabled-input");
  });
  proxyStatus.addEventListener("click", () => {
    proxyStatus.innerHTML = "检查中...";
    proxyStatus.className = "test-proxy";
    proxyStatus.style.pointerEvents = "none";
    applyProxy.classList.add("disabled-input");
    lite_tools.checkProxy();
  });
  lite_tools.updateProxyStatus((_, status) => {
    proxyStatus.style.pointerEvents = "auto";
    applyProxy.classList.remove("disabled-input");
    if (status.success) {
      proxyStatus.classList.add("success");
      proxyStatus.classList.remove("error");
      proxyStatus.innerHTML = status.message;
    } else {
      proxyStatus.classList.add("error");
      proxyStatus.classList.remove("success");
      proxyStatus.innerHTML = status.message;
    }
  });

  // 选项高亮-自定义颜色
  addCustomColorEvent(view.querySelectorAll(`.custom-color-light input[type="color"]`));
  addCustomColorEvent(view.querySelectorAll(`.custom-color-dark input[type="color"]`));

  function addCustomColorEvent(elements) {
    elements.forEach((el) => {
      const id = el.id.replace("lt-", "").split("-");
      const theme = id[0];
      const color = id[1];
      el.value = options.qContextMenu.customHighlightReplies[theme][color];
      el.addEventListener("change", (event) => {
        options.qContextMenu.customHighlightReplies[theme][color] = event.target.value;
        debounceSetOptions();
      });
    });
  }

  // 打开当前版本的更新日志
  view.querySelector(".tag-version").addEventListener("click", () => {
    fetch(`local:///${LiteLoader.plugins.lite_tools.path.plugin}/changeLog.md`)
      .then((res) => res.text())
      .then((text) => {
        log("打开更新日志", text);
        const updateLogs = simpleMarkdownToHTML(text);
        openChangeLog(
          updateLogs,
          false,
          `https://github.com/xiyuesaves/LiteLoaderQQNT-lite_tools/releases/tag/${LiteLoader.plugins.lite_tools.manifest.repository.release.tag}`,
        );
      });
  });

  // 监听更新进度
  let prevToast = null;
  lite_tools.updateEvent((event, data) => {
    log("更新进度", data);
    if (data.toast) {
      if (data.status === "processing" || data.status === "end") {
        if (prevToast) {
          prevToast.close();
        }
        if (data.status === "end") {
          clearToast();
        }
        prevToast = showToast(data.toast.content, data.toast.type, data.toast.duration);
      } else {
        showToast(data.toast.content, data.toast.type, data.toast.duration);
      }
    }
  });

  // 监听独立配置文件切换
  const userConfig = await lite_tools.getUserConfig();
  const authData = await getAuthData();
  const standaloneConfiguration = view.querySelector(".standaloneConfiguration");
  if (userConfig && authData) {
    standaloneConfiguration.classList.toggle("is-active", userConfig.has(authData.uid));
    standaloneConfiguration.addEventListener("click", () => {
      if (standaloneConfiguration.classList.contains("is-active")) {
        lite_tools.deleteUserConfig(authData.uid);
        standaloneConfiguration.classList.remove("is-active");
      } else {
        lite_tools.addUserConfig(authData.uid, authData.uin);
        standaloneConfiguration.classList.add("is-active");
      }
    });
  } else {
    standaloneConfiguration.classList.add("disabled-switch");
    standaloneConfiguration.setAttribute("title", "当前环境无法启用");
  }

  // 选择ffmpge路径
  const ffmpegPath = view.querySelector(".select-ffmpeg-path");
  ffmpegPath.value = options.localEmoticons.ffmpegPath;
  // 清除设置路径
  ffmpegPath.addEventListener("click", (e) => {
    e.target.value = "";
    options.localEmoticons.ffmpegPath = "";
    debounceSetOptions();
  });
  view.querySelector(".ffmpeg-path-btn").addEventListener("click", async () => {
    const result = await lite_tools.showOpenDialog({
      title: "请选择ffmpeg",
      properties: ["openFile"],
      buttonLabel: "选择",
    });
    if (!result.canceled) {
      options.localEmoticons.ffmpegPath = result.filePaths[0];
      log("选择了ffmpeg路径", options.localEmoticons.ffmpegPath);
      debounceSetOptions();
    }
  });

  // 选择tgs_to_gif路径
  const tgsToGifPath = view.querySelector(".select-tgs-to-gif-path");
  tgsToGifPath.value = options.localEmoticons.tgsToGifPath;
  // 清除设置路径
  tgsToGifPath.addEventListener("click", (e) => {
    e.target.value = "";
    options.localEmoticons.tgsToGifPath = "";
    debounceSetOptions();
  });
  view.querySelector(".tgs-to-gif-path-btn").addEventListener("click", async () => {
    const result = await lite_tools.showOpenDialog({
      title: "请选择tgs_to_gif",
      properties: ["openFile"],
      buttonLabel: "选择",
    });
    if (!result.canceled) {
      options.localEmoticons.tgsToGifPath = result.filePaths[0];
      log("选择了tgs_to_gif路径", options.localEmoticons.tgsToGifPath);
      debounceSetOptions();
    }
  });

  // 设置Telegram Bot Token
  const tgBotToken = view.querySelector(".tg-bot-token");
  tgBotToken.value = options.localEmoticons.tgBotToken;
  tgBotToken.addEventListener("input", (e) => {
    options.localEmoticons.tgBotToken = e.target.value;
    debounceSetOptions();
  });
  // tg表情集下载
  // 表情集下载提示元素
  lite_tools.onDownloadTgStickerEvent((_, data) => {
    clearToast();
    showToast(data.message, data.type, data.duration);
  });
  const tgSticker = view.querySelector(".tg-sticker-add-link");
  view.querySelector(".tg-sticker-btn").addEventListener("click", async () => {
    log(tgSticker.value);
    if (tgSticker.value.startsWith("https://t.me/addstickers/")) {
      if (!options.localEmoticons.tgBotToken) {
        showToast("需要填写 Telegram Bot Token", "error", 3000);
        return;
      }
      if (!options.localEmoticons.enabled) {
        showToast("需要启用本地表情", "error", 3000);
        return;
      }
      if (!options.localEmoticons.localPath) {
        showToast("需要选择本地表情路径", "error", 3000);
        return;
      }
      clearToast();
      if (!options.localEmoticons.ffmpegPath) {
        showToast("没有配置 FFmpeg 路径，可能无法下载动态表情", "default", 30000);
      }
      if (!options.localEmoticons.tgsToGifPath) {
        showToast("没有配置 tgs_to_gif 路径，无法下载 TGS 表情", "default", 30000);
      }
      showToast("已添加下载请求", "default", 30000);
      lite_tools.downloadTgSticker(tgSticker.value);
    } else {
      showToast("无法识别Telegram表情集链接", "error", 6000);
    }
  });

  // 导入eif贴纸集
  view.querySelector(".import-eif-sticker").addEventListener("click", async () => {
    const result = await lite_tools.showOpenDialog({
      title: "请选择eif文件",
      properties: ["openFile"],
      filters: [
        {
          name: "eif",
          extensions: ["eif"],
        },
      ],
      buttonLabel: "选择",
    });
    if (!result.canceled) {
      log("选择了eif文件", result.filePaths[0]);
      lite_tools.extractEifFile(result.filePaths[0]);
    }
  });

  // 监听设置文件变动
  updateOptions((opt) => {
    log("检测到配置更新", opt);
    view.querySelector(".select-background-wallpaper-clear").value = opt.background.url;
    view.querySelector(".select-local-emoticons-folder-clear").value = opt.localEmoticons.localPath;
    view.querySelector(".select-default-save-file-input-clear").value = opt.qContextMenu.messageToImage.path;
    view.querySelector(".select-ffmpeg-path").value = opt.localEmoticons.ffmpegPath;
    view.querySelector(".select-tgs-to-gif-path").value = opt.localEmoticons.tgsToGifPath;
    tailList?.updateOptions();
  });
  log("完成初始化");
}

export { onConfigView };
