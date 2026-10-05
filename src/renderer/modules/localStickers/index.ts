import { StickerPanel } from "./components/stickerPanel";
import { StickerMsg } from "./components/stickerMsg";
import { StickerList } from "./components/stickerList";
import { StickerBar, StickerBarItem } from "./components/stickerBar";
import { StickerPack, StickerPackLabel, StickerItem } from "./components/stickerPack";
import { StickerIcon } from "./components/stickerIcon";
import { StickerFullViewer } from "./components/stickerFullViewer";
import { StickerContainer } from "./components/stickerContainer";
import { basename } from "@/renderer/utils/pathUtils";

import { configStore } from "@/renderer/modules/configStore";
import { waitForElement, waitForInstance } from "@/renderer/utils/domWaitFor";
import { observeMutations } from "@/renderer/utils/observeMutations";
import { sendMessage } from "@/renderer/utils/nativeCall";
import { aioStore } from "@/renderer/modules/aioStore";
import { createLogger } from "@/renderer/utils/createLogger";
import { ContextMenu, ContextMenuItem, ContextMenuType } from "@/renderer/components/contextMenu";
import { toastManager } from "@/renderer/modules/toastManager";
import { onComponentMount } from "@/renderer/modules/vueComponentTracker";
import { collectStickerSourcePaths } from "@/common/utils/stickerSource";

import type { StickerPack as StickerPackType } from "@/common/types/localStickers";

const log = createLogger("localStickers");

declare global {
  interface HTMLElementTagNameMap {
    "lt-sticker-store": StickerPanel;
    "lt-sticker-msg": StickerMsg;
    "lt-sticker-list": StickerList;
    "lt-sticker-pack": StickerPack;
    "lt-sticker-pack-name": StickerPackLabel;
    "lt-sticker-item": StickerItem;
    "lt-sticker-bar": StickerBar;
    "lt-sticker-bar-item": StickerBarItem;
    "lt-sticker-icon": StickerIcon;
    "lt-sticker-full-viewer": StickerFullViewer;
    "lt-context-menu": ContextMenu;
    "lt-context-menu-item": ContextMenuItem;
    "lt-sticker-container": StickerContainer;
  }
}

let rawContextMenu: HTMLElement;
let picPaths: string[] = [];

async function setupLocalStickers() {
  await configStore.ready;
  const injectPositionRight = ".chat-func-bar>.func-bar-native.func-bar-shortcuts:last-child,#func-bar-shortcuts-right";
  const injectPositionLeft =
    ".chat-func-bar>.func-bar-native.func-bar-shortcuts:first-child,.chat-func-bar>.chat-func-bar__left";
  log("初始化");

  const stickerContainer = document.createElement("lt-sticker-container");
  const addToLocalStickerContextMenu = document.createElement("lt-context-menu-item") as ContextMenuItem;
  addToLocalStickerContextMenu.showIcon = true;

  document.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button === 2) {
      const messageEl = (e.target as HTMLElement).closest(".message");
      if (messageEl) {
        messageEl.__VUE__?.some((item) => {
          const elements = item?.props?.msgRecord?.elements || [];
          const targetElement = elements.find((el: any) => el.elementType === 11 || el.elementType === 2);
          if (targetElement) {
            if (targetElement.elementType === 11) {
              picPaths = [targetElement.marketFaceElement?.staticFacePath as string].filter(Boolean);
            } else if (targetElement.elementType === 2) {
              picPaths = collectStickerSourcePaths(targetElement.picElement);
            }
            return true;
          }
          return false;
        });
      }
    }
  });

  onComponentMount((component) => {
    if (
      configStore.value.localStickers.enabled &&
      stickerContainer.stickerStore.status === "success" &&
      component?.props?.icon === "expression_add"
    ) {
      addToLocalStickerContextMenu.item = buildStickerMenu(
        stickerContainer.stickerStore.stickerPacks,
        picPaths,
        () => rawContextMenu,
      );

      setTimeout(() => {
        rawContextMenu = component.vnode.el.closest(".q-context-menu");
      }, 100);

      component.vnode.el
        .closest(".q-context-menu-item")
        .insertAdjacentElement("afterend", addToLocalStickerContextMenu);
    }
  });

  // const editor = (await waitForElement(".ck.ck-content.ck-editor__editable")) as any;

  // const ckeditorInstance = editor.ckeditorInstance;
  // const ckeditEditorModel = ckeditorInstance.model;

  let editorModel: "ckeditor" | "proseMirror" = "ckeditor";
  let ckeditorInstance: any;
  let ckeditEditorModel: any;
  let proseMirror: any;

  const editor = (await Promise.any([
    waitForElement(".ck.ck-content.ck-editor__editable"),
    waitForInstance(".qq-msg-editor", "proxy.getEditor"),
  ])) as any;
  log("editor", editor);
  if (editor.ckeditorInstance) {
    editorModel = "ckeditor";
    ckeditorInstance = editor.ckeditorInstance;
    ckeditEditorModel = ckeditorInstance.model;
  } else {
    editorModel = "proseMirror";
    proseMirror = editor.value().editor;
    log(proseMirror);
  }

  let offObserver: ReturnType<typeof observeMutations> | null = null;

  const updateIconState = async () => {
    const isEnabled = configStore.value.localStickers.enabled;

    if (isEnabled) {
      const target = await waitForElement(
        configStore.value.localStickers.iconOnLeft ? injectPositionLeft : injectPositionRight,
      );
      if (target) {
        target.insertAdjacentElement("afterbegin", stickerContainer);
        offObserver?.();
        offObserver = observeMutations(target, updateIconState, {
          childList: true,
        });
      }
    } else {
      stickerContainer?.remove();
      offObserver?.();
    }
  };
  updateIconState();
  configStore.onChange(updateIconState);

  stickerContainer.addEventListener("lt-select-sticker", (e) => {
    if (configStore.value.localStickers.recentStickers.enabled) {
      lite_tools.updateRecentStickers(e.detail);
    }
    const picSubType = configStore.value.localStickers.sendAsPic ? 0 : 1;
    log("插入表情", e.detail.path);
    const summary = configStore.value.localStickers.customSummary ? getCustomSummary(e.detail.path) : "";
    if (editorModel === "ckeditor") {
      ckeditEditorModel.change((writer: any) => {
        const selection = ckeditEditorModel.document.selection;
        const position = selection.getFirstPosition();
        const writerEl = writer.createElement("msg-img", {
          data: JSON.stringify({ type: "pic", src: e.detail.path, picSubType, summary }),
        });
        writer.insert(writerEl, position);
        writer.setSelection(writer.createPositionAt(writerEl, "after"));
      });
    } else if (editorModel === "proseMirror") {
      log(proseMirror);
      const view = proseMirror.view;
      const state = view.state;
      const schema = proseMirror.schemaInstance;
      const tr = state.tr;
      const picNode = schema.nodeFromJSON({
        type: "msgPic",
        attrs: {
          item: {
            type: "pic",
            src: e.detail.path,
            picSubType,
            summary,
            thumbUrl: "",
          },
        },
      });
      tr.insert(state.selection.head, picNode);
      view.dispatch(tr);
      view.focus();
    }
  });

  stickerContainer.addEventListener("lt-send-sticker", (e) => {
    if (configStore.value.localStickers.recentStickers.enabled) {
      lite_tools.updateRecentStickers(e.detail);
    }
    const picSubType = configStore.value.localStickers.sendAsPic ? 0 : 1;
    const summary = configStore.value.localStickers.customSummary ? getCustomSummary(e.detail.path) : "";
    sendMessage(aioStore.getPeer(), [{ type: "image", path: e.detail.path, picSubType, summary }]);
    log("发送表情", e.detail.path);
  });
}

function getCustomSummary(path: string): string {
  // 返回第一个"."之前的内容
  const arr = basename(path).split(".");
  log("文件名", arr);
  if (arr.length >= 3) {
    return arr[0];
  }
  return "";
}

function buildStickerMenu(packs: StickerPackType[], sourceFilePaths: string[], getRawContextMenu: any): ContextMenuType {
  // 内部使用的临时类型，多了一个 path 用于构建树时去重和查找
  type TempMenuNode = ContextMenuType & { path: string };
  const treeChildren: TempMenuNode[] = [];

  const rootPathStr = configStore.value.localStickers.path.replace(/\\/g, "/").replace(/\/$/, "");

  for (const pack of packs) {
    // 过滤掉特殊贴纸包，如常用贴纸
    if (pack.index < 0) continue;
    const packPath = pack.dirPath.replace(/\\/g, "/");
    const nodeChain: { label: string; path: string; isLeaf: boolean }[] = [];

    if (packPath.startsWith(rootPathStr)) {
      const relativePart = packPath.slice(rootPathStr.length).replace(/^\//, "");
      const relSegments = relativePart.split("/").filter(Boolean);

      if (relSegments.length > 0) {
        const firstLevelPath = `${rootPathStr}/${relSegments[0]}`;
        const isFirstLevelLeaf = relSegments.length === 1;

        nodeChain.push({
          label: isFirstLevelLeaf ? pack.label : relSegments[0],
          path: firstLevelPath,
          isLeaf: isFirstLevelLeaf,
        });

        let currentPath = firstLevelPath;
        for (let i = 1; i < relSegments.length; i++) {
          currentPath = `${currentPath}/${relSegments[i]}`;
          const isLeaf = i === relSegments.length - 1;
          nodeChain.push({
            label: isLeaf ? pack.label : relSegments[i],
            path: currentPath,
            isLeaf,
          });
        }
      } else {
        nodeChain.push({ label: pack.label, path: rootPathStr, isLeaf: true });
      }
    } else {
      nodeChain.push({ label: pack.label, path: packPath, isLeaf: true });
    }

    // 2. 组装菜单树并绑定 Callback
    let currentLevel = treeChildren;
    for (let i = 0; i < nodeChain.length; i++) {
      const { label, path, isLeaf } = nodeChain[i];
      let existingNode = currentLevel.find((node) => node.path === path);

      if (!existingNode) {
        existingNode = { label, path };

        // 如果是叶子节点，绑定复制文件的回调
        if (isLeaf) {
          existingNode.callback = async (e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log(`添加到贴纸集: ${label}`);
            // patha: sourceFilePath, pathb: packPath (目标文件夹)
            const result = await lite_tools.copyFile(sourceFilePaths, packPath);
            if (result.success) {
              toastManager.show("添加成功", "success", 3000);
            } else {
              toastManager.show(`添加失败：${result.error}`, "error", 3000);
            }
            getRawContextMenu()?.remove();
          };
        }

        currentLevel.push(existingNode);
      } else if (isLeaf) {
        // 强制更新已存在的叶子节点
        existingNode.label = label;
        existingNode.callback = async (e) => {
          e.stopPropagation();
          e.preventDefault();
          log(`添加到贴纸集: ${label}`);
          const result = await lite_tools.copyFile(sourceFilePaths, packPath);
          if (result.success) {
            toastManager.show("添加成功", "success", 3000);
          } else {
            toastManager.show(`添加失败：${result.error}`, "error", 3000);
          }
          getRawContextMenu()?.remove();
        };
      }

      if (i < nodeChain.length - 1) {
        if (!existingNode.children) {
          existingNode.children = [];
        }
        currentLevel = existingNode.children as TempMenuNode[];
      }
    }
  }

  return {
    icon: StickerIcon.ICON,
    label: "添加到贴纸集",
    children: treeChildren,
  };
}

export {
  StickerPanel,
  StickerMsg,
  StickerList,
  StickerBar,
  StickerPack,
  StickerItem,
  StickerIcon,
  StickerFullViewer,
  StickerContainer,
  ContextMenu,
  ContextMenuItem,
  setupLocalStickers,
};
