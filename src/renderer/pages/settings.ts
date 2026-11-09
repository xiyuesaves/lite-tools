import settingsHTMLPath from "@/assets/html/settings/index.html";
import { createLogger } from "@/renderer/utils/createLogger";
import { configStore } from "@/renderer/modules/configStore";
import { isll } from "@/renderer/utils/loaderInspector";
import { normalizePathsSimple } from "@/common/normalizePathsSimple";
import type { StickerPack, StickerStore } from "@/common/types/localStickers";
import { styleManager } from "@/renderer/modules/styleManager";
import { pluginPath } from "@/renderer/utils/pluginPaths";
import { join, resolvePath } from "@/renderer/utils/pathUtils";
import { toastManager } from "@/renderer/modules/toastManager";

type OptionItem = {
  name: string;
  [key: string]: any;
};

const log = createLogger("settings");
const STICKER_SORT_ITEM_SELECTOR = ".drag-list-item";

async function initSettingView(view: HTMLDivElement) {
  styleManager.inject("settings");
  styleManager.inject("GitHubMarkdownMini");
  await configStore.ready;
  await toastManager.setup();
  const config = configStore.value;
  log("获取到配置数据", config);
  try {
    const devInfo: HTMLDivElement = document.createElement("div");
    devInfo.className = "wrap";
    devInfo.innerHTML = `<div class="vertical-list-item">
<p>加载器：${isll ? "LiteLoaderQQNT" : "QwQNT"}</p>
<p>插件版本：${__VERSION__}</p>
<p>构建时间：${__BUILD_DATE__}</p>
</div>
`;
    if (!__DEV__ && __ALPHA__) {
      devInfo.insertAdjacentHTML(
        "afterbegin",
        `<div style="color: red;justify-content: center;" class="vertical-list-item">
<p><strong>该版本仅供内部测试，请勿外传</strong></p>
</div>`,
      );
    }

    const settingsHTML = await (await fetch(resolvePath(join(pluginPath, "dist/renderer", settingsHTMLPath)))).text();
    view.insertAdjacentHTML("beforeend", settingsHTML);
    view.querySelector(".lite-tools-settings")!.insertAdjacentElement("afterbegin", devInfo);
    log("初始化HTML完成");
    initSettings(view, config);
  } catch (err: any) {
    log("初始化出错", err);
    view.insertAdjacentHTML("beforeend", `<div class="error">初始化配置页面出现错误：</div>`);
    view.insertAdjacentHTML("beforeend", `<pre class="error">${err}${err?.stack}</pre>`);
  }
}

async function initSettings(view: HTMLDivElement, config: Config) {
  // 显示插件版本信息
  const versionLink = view.querySelector(".version .link") as HTMLElement;
  versionLink.innerText = __VERSION__;
  // 初始化折叠
  initWrap(view);
  // 初始化switch按钮
  initSwitchButton(view, config);
  // 初始化下拉菜单
  initSelectMenu(view, config);
  // 初始化配置项联动显隐
  initLinkedVisibility(view, config);
  // 初始化精简功能
  initSidebar(view, config);
  // 初始化撤回相关选项
  initRecallOptions(view, config);
  // 初始化输入框
  initInput(view, config);
  // 初始化按钮
  initButton(view, config);
  // 初始化tg贴纸下载
  initTgStickerDownload(view, config);
  // 初始化代理设置
  initProxy(view, config);
  // 初始化链接
  initLink(view, config);
  // 初始化本地贴纸排序
  initLocalTagSortOptimized(view);
  // debug
  view.querySelector("button.open-debug")?.addEventListener("click", () => {
    lite_tools.openDevWindow();
  });
  log("初始化设置页面完成");
}

async function initLocalTagSortOptimized(view: HTMLDivElement) {
  const stickerDragList = view.querySelector<HTMLUListElement>(".stickers-sort ul");
  if (!stickerDragList) return;

  let draggedItem: HTMLLIElement | null = null;
  const transparentDragImage = createTransparentDragImage();
  let dragStartOrder: string[] = [];

  const getItems = () => Array.from(stickerDragList.querySelectorAll<HTMLLIElement>(STICKER_SORT_ITEM_SELECTOR));

  const getCurrentOrder = () =>
    getItems()
      .map((item) => item.dataset.dirPath)
      .filter((dirPath): dirPath is string => Boolean(dirPath));

  const renderStickerStore = (stickerStore: StickerStore) => {
    stickerDragList.replaceChildren(createDividerElement());

    if (stickerStore.status !== "success") {
      return;
    }

    const fragment = document.createDocumentFragment();
    sortStickerPacks(stickerStore.stickerPacks).forEach((stickerPack) => {
      fragment.append(createStickerSortItem(stickerPack));
    });
    stickerDragList.append(fragment);
  };

  const moveDraggedItem = (target: HTMLLIElement | null) => {
    if (!draggedItem) return;

    const currentNextSibling = draggedItem.nextElementSibling;
    if (target === draggedItem || target === currentNextSibling || (!target && !currentNextSibling)) {
      return;
    }

    const previousRects = new Map(getItems().map((item) => [item, item.getBoundingClientRect()] as const));

    if (target) {
      stickerDragList.insertBefore(draggedItem, target);
    } else {
      stickerDragList.append(draggedItem);
    }

    playStickerSortAnimation(getItems(), previousRects, draggedItem);
  };

  const persistStickerOrder = () => {
    const nextOrder = getCurrentOrder();
    if (nextOrder.length === 0 || dragStartOrder.join("|") === nextOrder.join("|")) {
      return;
    }

    getItems().forEach((item, index) => {
      const dirPath = item.dataset.dirPath;
      if (!dirPath) return;

      const previousIndex = Number(item.dataset.index ?? index);
      item.dataset.index = String(index);
      if (previousIndex !== index) {
        lite_tools.updateStickerPackConfig(dirPath, "index", index);
      }
    });
  };

  renderStickerStore(await lite_tools.getStickerStore());

  lite_tools.onStickerStoreUpdated(renderStickerStore);

  stickerDragList.addEventListener("dragstart", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLLIElement>(STICKER_SORT_ITEM_SELECTOR);
    if (!target) return;

    draggedItem = target;
    dragStartOrder = getCurrentOrder();
    stickerDragList.classList.add("drag-sorting");

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.dropEffect = "move";
      event.dataTransfer.setData("text/plain", target.dataset.dirPath ?? "");
      event.dataTransfer.setDragImage(transparentDragImage, 0, 0);
    }

    requestAnimationFrame(() => {
      if (draggedItem === target) {
        target.classList.add("dragging");
      }
    });
  });

  stickerDragList.addEventListener("dragenter", (event) => {
    if (!draggedItem) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  });

  stickerDragList.addEventListener("dragover", (event) => {
    if (!draggedItem) return;

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    moveDraggedItem(getStickerSortInsertTarget(stickerDragList, event.clientY, draggedItem));
  });

  stickerDragList.addEventListener("drop", (event) => {
    event.preventDefault();
  });

  stickerDragList.addEventListener("dragend", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLLIElement>(STICKER_SORT_ITEM_SELECTOR);
    if (target) {
      target.classList.remove("dragging");
    }
    draggedItem?.classList.remove("dragging");

    stickerDragList.classList.remove("drag-sorting");
    persistStickerOrder();
    draggedItem = null;
    dragStartOrder = [];
  });
}

function createDividerElement() {
  const divider = document.createElement("hr");
  divider.className = "horizontal-dividing-line";
  return divider;
}

function createStickerSortItem(stickerPack: StickerPack) {
  const item = document.createElement("li");
  item.className = "drag-list-item";
  item.draggable = true;
  item.dataset.dirPath = stickerPack.dirPath;
  item.dataset.index = String(stickerPack.index);

  const content = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = `${stickerPack.label} (${stickerPack.stickers.length})`;

  content.append(title);
  item.append(content);

  return item;
}

function createTransparentDragImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas;
}

function sortStickerPacks(stickerPacks: StickerPack[]) {
  return [...stickerPacks].sort((a, b) => {
    if (a.index !== b.index) {
      return a.index - b.index;
    }

    const labelCompare = a.label.localeCompare(b.label);
    if (labelCompare !== 0) {
      return labelCompare;
    }

    return a.dirPath.localeCompare(b.dirPath);
  }).filter(item => item.index >= 0)
}

function getStickerSortInsertTarget(
  stickerDragList: HTMLUListElement,
  clientY: number,
  draggedItem: HTMLLIElement,
): HTMLLIElement | null {
  const items = Array.from(stickerDragList.querySelectorAll<HTMLLIElement>(STICKER_SORT_ITEM_SELECTOR)).filter(
    (item) => item !== draggedItem,
  );

  let closestItem: HTMLLIElement | null = null;
  let closestOffset = Number.NEGATIVE_INFINITY;

  items.forEach((item) => {
    const rect = item.getBoundingClientRect();
    const offset = clientY - rect.top - rect.height / 2;

    if (offset < 0 && offset > closestOffset) {
      closestOffset = offset;
      closestItem = item;
    }
  });

  return closestItem;
}

function playStickerSortAnimation(
  items: HTMLLIElement[],
  previousRects: Map<HTMLLIElement, DOMRect>,
  draggedItem: HTMLLIElement,
) {
  items.forEach((item) => {
    if (item === draggedItem) return;

    const previousRect = previousRects.get(item);
    if (!previousRect) return;

    const nextRect = item.getBoundingClientRect();
    const deltaX = previousRect.left - nextRect.left;
    const deltaY = previousRect.top - nextRect.top;

    if (deltaX === 0 && deltaY === 0) return;

    item.style.transition = "none";
    item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    item.getBoundingClientRect();

    requestAnimationFrame(() => {
      item.style.transition = "";
      item.style.transform = "";
    });
  });
}

function initLink(view: HTMLDivElement, config: Config) {
  view.querySelectorAll(".link").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const href = el.getAttribute("data-href");
      if (href) {
        lite_tools.openExternal(href);
      }
    });
  });
}

// 初始化代理设置
function initProxy(view: HTMLDivElement, config: Config) {
  const btn = view.querySelector<HTMLButtonElement>(".check-proxy-btn");
  btn?.addEventListener("click", () => {
    lite_tools.checkProxy();
  });
}

// 初始化tg贴纸下载
function initTgStickerDownload(view: HTMLDivElement, config: Config) {
  const btn = view.querySelector<HTMLButtonElement>(".tg-sticker-download-btn")!;
  btn.addEventListener("click", () => {
    const url = view.querySelector<HTMLInputElement>(".tg-sticker-download-url")!.value;
    lite_tools.downloadTgSticker(url);
  });
}

// 初始化按钮
function initButton(view: HTMLDivElement, config: Config) {
  view.querySelectorAll<HTMLButtonElement>("button").forEach((el) => {
    const configPath = el.dataset.config;
    if (!configPath) return;

    const value = getValueByPath(config, configPath);
    if (value === undefined) {
      el.classList.add("error-button");
      el.setAttribute("placeholder", "配置项不存在");
      return;
    }

    const chooseType = el.dataset.choose;

    // 校验类型，若不符合要求直接跳过，避免嵌套
    if (chooseType && ["file", "files", "folder"].includes(chooseType)) {
      el.addEventListener("click", async () => {
        const fileExt = el.dataset.fileExt?.split(",") ?? ["*"];

        // 1. 根据类型动态生成 properties
        const properties: Electron.OpenDialogOptions["properties"] = ["dontAddToRecent"];

        if (chooseType === "folder") {
          properties.push("openDirectory");
        } else {
          properties.push("openFile");
          if (chooseType === "files") {
            properties.push("multiSelections");
          }
        }

        const filters = chooseType === "folder" ? [] : [{ name: "Files", extensions: fileExt }];

        const result = await lite_tools.showOpenDialog({
          title: chooseType === "folder" ? "选择文件夹" : "选择文件",
          properties: properties,
          filters: filters,
        });

        // 4. 处理结果
        if (!result.canceled && result.filePaths.length > 0) {
          const filePaths = normalizePathsSimple(result.filePaths);
          log("选中的路径:", configPath, filePaths);

          if (chooseType === "file" || chooseType === "folder") {
            setValueByPath(config, configPath, filePaths[0]);
            configStore.setConfig(config);
            dispatchEvent(view, configPath, filePaths[0]);
          } else {
            setValueByPath(config, configPath, filePaths);
            configStore.setConfig(config);
            dispatchEvent(view, configPath, filePaths);
          }
        }
      });
    }
  });
}

// 初始化输入框
function initInput(view: HTMLDivElement, config: Config) {
  view.querySelectorAll<HTMLInputElement>("input").forEach((el) => {
    const configPath = el.getAttribute("data-config");
    if (!configPath) return;

    const value = getValueByPath(config, configPath);
    if (value === undefined) {
      el.classList.add("error-input");
      el.value = "";
      el.setAttribute("placeholder", "配置项不存在");
      return;
    }
    el.value = value;
    const isNumber = el.getAttribute("type") === "number";
    view.addEventListener(configPath, (e) => {
      const event = e as CustomEvent<string>;
      el.value = event.detail;
    });
    if (el.hasAttribute("readonly")) {
      if (el.hasAttribute("data-clear")) {
        el.addEventListener("click", () => {
          setValueByPath(config, configPath, "");
          configStore.setConfig(config);
          dispatchEvent(view, configPath, "");
        });
      }
    } else {
      el.addEventListener("change", () => {
        let value: string | number = el.value;
        if (isNumber) {
          value = parseInt(value);
        }
        setValueByPath(config, configPath, value);
        configStore.setConfig(config);
        dispatchEvent(view, configPath, el.value);
      });
    }
  });
}

// 初始化撤回
async function initRecallOptions(view: HTMLDivElement, config: Config) {
  const localRecallMsgCache = view.querySelector<HTMLInputElement>(".local-recall-msg-num")!;
  const light = view.querySelector<HTMLInputElement>(".custom-text-color-lite")!;
  const dark = view.querySelector<HTMLInputElement>(".custom-text-color-dark")!;
  const openRedirectPicPathBtn = view.querySelector(".open-redirect-pic-path")!;
  view.querySelector(".clear-localStorage-recall-msg")!.addEventListener("click", () => {
    lite_tools.clearRecallCache();
  });
  view.querySelector(".open-recall-msg-list")?.addEventListener("click", () => {
    lite_tools.openRecallMsgList();
  });
  light.value = config.message.preventRecall.customTextColor.light;
  dark.value = config.message.preventRecall.customTextColor.dark;
  lite_tools.onUpdateRecallCacheSize(
    (size) => (localRecallMsgCache.innerText = `清除所有本地保存的撤回数据，当前保存有 ${size} 条消息`),
  );
  localRecallMsgCache.innerText = `清除所有本地保存的撤回数据，当前保存有 ${await lite_tools.getRecallCacheSize()} 条消息`;
  openRedirectPicPathBtn.addEventListener("click", () => {
    lite_tools.openRedirectPicPath();
  });
  light.addEventListener("change", () => {
    config.message.preventRecall.customTextColor.light = light.value;
    configStore.setConfig(config);
  });
  dark.addEventListener("change", () => {
    config.message.preventRecall.customTextColor.dark = dark.value;
    configStore.setConfig(config);
  });
}

// 初始化精简功能
function initSidebar(view: HTMLDivElement, config: Config) {
  const sidebarEl = view.querySelector(".sideBar ul") as HTMLElement;
  const topFuncBarEl = view.querySelector(".topFuncBar ul") as HTMLElement;
  const chatFuncBarEl = view.querySelector(".chatFuncBar ul") as HTMLElement;
  createOptionItems(config, config.sideBar.top, sidebarEl, "sideBar.top", "enabled");
  createOptionItems(config, config.sideBar.bottom, sidebarEl, "sideBar.bottom", "enabled");
  if (config.topFuncBar.length > 1) {
    topFuncBarEl.querySelector(".first-tips")?.remove();
  }
  createOptionItems(config, config.topFuncBar, topFuncBarEl, "topFuncBar", "enabled");
  if (config.chatFuncBar.length > 1) {
    chatFuncBarEl.querySelector(".first-tips")?.remove();
  }
  createOptionItems(config, config.chatFuncBar, chatFuncBarEl, "chatFuncBar", "enabled");
  configStore.onChange((config) => {
    updateOptionItems(config.sideBar.top, sidebarEl, "sideBar.top", "enabled");
    updateOptionItems(config.sideBar.bottom, sidebarEl, "sideBar.bottom", "enabled");
  });
}

// 派发事件
function dispatchEvent(el: HTMLElement, configPath: string, detail: any) {
  const event = new CustomEvent(configPath, { detail });
  el.dispatchEvent(event);
}

// 初始化折叠
function initWrap(view: HTMLDivElement) {
  view.querySelectorAll(".wrap .vertical-list-item.title").forEach((el) => {
    el.addEventListener("click", () => {
      const wrap = el.parentElement!;
      wrap.querySelector(".icon")?.classList.toggle("is-fold");
      wrap.querySelector("ul")?.classList.toggle("hidden");
    });
  });
}

// 初始化switch按钮
function initSwitchButton(view: HTMLDivElement, config: Config) {
  view.querySelectorAll(".q-switch").forEach((el) => {
    const configPath = el.getAttribute("data-config");
    if (!configPath) return;

    const configValue = getValueByPath(config, configPath);
    if (configValue === undefined) {
      el.classList.add("error-switch");
      el.setAttribute("title", "配置项不存在");
      return;
    }
    el.classList.toggle("is-active", configValue);
    // 初始化时触发一次事件
    dispatchEvent(view, configPath, configValue);
    // 添加事件
    el.addEventListener("click", function () {
      const newValue = el.classList.toggle("is-active");
      log("更新配置项", configPath, newValue);
      setValueByPath(config, configPath, newValue);
      configStore.setConfig(config);
      dispatchEvent(view, configPath, newValue);
      // 彩蛋触发函数
      // switchButtons();
    });
  });
}

// 按配置值联动显隐（元素上标注 data-show-when="配置路径=期望值"）
function initLinkedVisibility(view: HTMLDivElement, config: Config) {
  const items = Array.from(view.querySelectorAll<HTMLElement>("[data-show-when]"));
  if (!items.length) return;

  const parseRule = (el: HTMLElement) => {
    const rule = el.getAttribute("data-show-when") || "";
    const separator = rule.lastIndexOf("=");
    if (separator < 0) return null;
    return { path: rule.slice(0, separator), value: rule.slice(separator + 1) };
  };

  const apply = (path: string, value: unknown) => {
    for (const el of items) {
      const rule = parseRule(el);
      if (!rule || rule.path !== path) continue;
      el.classList.toggle("hidden", String(value) !== rule.value);
    }
  };

  const paths = new Set<string>();
  for (const el of items) {
    const rule = parseRule(el);
    if (!rule) continue;
    paths.add(rule.path);
    apply(rule.path, getValueByPath(config, rule.path));
  }

  for (const path of paths) {
    view.addEventListener(path, (event) => apply(path, (event as CustomEvent).detail));
  }
}

// 初始化下拉菜单
function initSelectMenu(view: HTMLDivElement, config: Config) {
  // 全局点击事件，关闭下拉菜单
  view.addEventListener("click", function (event) {
    const target = event.target as HTMLElement;
    if (!target.closest(".setting-select")) {
      view.querySelectorAll(".setting-option")!.forEach((item) => {
        item.classList.remove("show");
      });
    }
  });
  view.querySelectorAll(".setting-select").forEach((el) => {
    const item = el as HTMLElement;
    const configPath = item.getAttribute("data-config");
    if (!configPath) return;

    // 初始化选项
    const configValue = getValueByPath(config, configPath);
    if (configValue === undefined) {
      el.classList.add("error-switch");
      el.setAttribute("title", "配置项不存在");
      return;
    }
    const findEl = Array.from(item.querySelectorAll(".setting-item")).find(
      (item) => item.getAttribute("data-value") === configValue,
    ) as HTMLElement;
    const showVlaue = findEl?.innerText ?? configValue;
    item.querySelector("input.setting-input")?.setAttribute("value", showVlaue);
    item.querySelector("div.setting-view")?.setAttribute("data-value", showVlaue);
    // 初始化时触发一次事件
    dispatchEvent(view, configPath, configValue);
    // 添加监听
    item.addEventListener("click", function (event) {
      const target = event.target as HTMLElement;
      log("点击下拉菜单", target.classList);
      if (target.classList.contains("setting-item")) {
        const newValue = target.getAttribute("data-value");
        const showVlaue = target.innerText;
        log("更新下拉配置项", item, configPath, newValue);
        setValueByPath(config, configPath, newValue);
        configStore.setConfig(config);
        item.querySelector("input.setting-input")?.setAttribute("value", showVlaue);
        item.querySelector("div.setting-view")?.setAttribute("data-value", showVlaue);
        dispatchEvent(view, configPath, newValue);
      }
      view.querySelectorAll(".setting-select")!.forEach((item) => {
        if (item === el) return;
        item.querySelector(".setting-option")!.classList.remove("show");
      });
      item.querySelector(".setting-option")!.classList.toggle("show");
    });
  });
}

// 创建选项
function createOptionItems<T extends OptionItem>(
  config: Config,
  list: T[],
  element: HTMLElement,
  objKey: string,
  key: keyof T,
) {
  const frag = document.createDocumentFragment();

  list.forEach((item, index) => {
    const hr = document.createElement("hr");
    hr.classList.add("horizontal-dividing-line");

    const li = document.createElement("li");
    li.classList.add("vertical-list-item");
    li.dataset.id = `${objKey}-${item.name}`;

    const div = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = item.name;
    div.append(title);
    if (item.desc) {
      const desc = document.createElement("p");
      desc.classList.add("secondary-text");
      desc.textContent = item.desc;
      div.append(desc);
    }
    li.append(div);

    if (item[key] !== undefined) {
      const switchEl = document.createElement("div");
      switchEl.classList.add("q-switch");
      switchEl.classList.toggle("is-active", item[key]);
      switchEl.dataset.index = index.toString();
      switchEl.addEventListener("click", () => {
        const active = !switchEl.classList.contains("is-active");
        log("更新配置项", objKey, index, key, active);
        setValueByPath(config, `${objKey}[${index}].${String(key)}`, active);
        switchEl.classList.toggle("is-active", active);
        configStore.setConfig(config);
      });
      const span = document.createElement("span");
      span.classList.add("q-switch__handle");
      switchEl.append(span);
      li.append(switchEl);
    }

    frag.append(hr, li);
  });

  element.appendChild(frag);
}

// 更新选项
function updateOptionItems<T extends OptionItem>(list: T[], element: HTMLElement, objKey: string, key: keyof T) {
  list.forEach((item) => {
    const switchEl = element.querySelector(`li[data-id="${objKey}-${item.name}"] .q-switch`) as HTMLElement;
    switchEl.classList.toggle("is-active", item[key]);
  });
}

// 获取配置
function getValueByPath<T = any>(target: Record<string, any>, path: string): T | undefined {
  const pathArr = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let result: any = target;
  for (let i = 0; i < pathArr.length; i++) {
    if (result != null && result[pathArr[i]] !== undefined) {
      result = result[pathArr[i]];
    } else {
      return undefined;
    }
  }
  return result as T;
}

// 设置配置
function setValueByPath(
  target: Record<string, any>,
  path: string,
  value: any,
  createPath: boolean = false,
  overridePath: boolean = false,
): boolean {
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let current: any = target;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if ((!current[key] && createPath) || (!(current[key] instanceof Object) && overridePath)) {
      current[key] = {};
    }
    if (!current[key]) {
      return false;
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
  return true;
}

export { initSettingView };
