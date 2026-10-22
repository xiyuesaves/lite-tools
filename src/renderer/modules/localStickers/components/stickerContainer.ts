import { LitElement, html, css } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";

import { createLogger } from "@/renderer/utils/createLogger";
import { configStore } from "@/renderer/modules/configStore";
import { ContextMenu } from "@/renderer/components/contextMenu";
import { openFolder } from "@/renderer/utils/nativeCall";
import { StickerPack, StickerItem, StickerPackLabel } from "./stickerPack";

import type { StickerStore } from "@/common/types/localStickers";

// 引入拆分后的 Icon 组件以确保注册
import "./stickerIcon";
import type { StickerIcon } from "./stickerIcon";

interface LtStickerEvent extends CustomEvent {
  detail: { path: string; label: string };
}

declare global {
  interface HTMLElementEventMap {
    "lt-select-sticker": LtStickerEvent;
    "lt-send-sticker": LtStickerEvent;
  }
}

const log = createLogger("stickerContainer");

@customElement("lt-sticker-container")
export class StickerContainer extends LitElement {
  static styles = css`
    :host {
      display: block;
      --transition-time: 150ms;
      --shadow-width: 8px;
      --shadow-offset: calc(var(--shadow-width) * 3);
      --offset-x: -46px;
      --offset-y: 6px;
      position: relative;
    }
    :host(:not(:last-child)) {
      margin-right: 4px;
    }
    :host(:not(:first-child)) {
      margin-left: 4px;
    }

    .lt-sticker-panel-container {
      position: absolute;
      bottom: calc(100% + var(--offset-y) - var(--shadow-offset));
      right: calc(var(--offset-x) - var(--shadow-offset));
      z-index: 1000;
      opacity: 0;
      pointer-events: none;
      transition:
        clip-path var(--transition-time) var(--transition-time),
        opacity var(--transition-time);
      clip-path: inset(60% 0 0 60% round 6px);
      filter: drop-shadow(0 8px var(--shadow-width) rgba(0, 0, 0, 0.14));
      border-radius: 6px;
      padding: var(--shadow-offset);
      &.left {
        right: unset;
        --offset-x: -10px;
        left: calc(var(--offset-x) - var(--shadow-offset));
        clip-path: inset(60% 60% 0 0 round 6px);
      }
      &.center {
        right: unset;
        left: 50%;
        transform: translateX(-50%);
        clip-path: inset(60% 60% 0 60% round 6px);
      }
      &::after {
        content: "";
        display: block;
        width: 100%;
        height: 10px;
        position: absolute;
        left: 0;
        bottom: -10px;
      }
      &.show {
        opacity: 1;
        transition-delay: unset;
        clip-path: inset(0 0 0 0 round 6px);
        lt-sticker-panel {
          pointer-events: auto;
        }
      }
    }
  `;

  @state()
  public stickerStore: StickerStore = { status: "info", msg: "初始化中..." };

  @state()
  private config!: Config;

  @state()
  private isReady = false;

  @state()
  private showPanel = false;

  @state()
  private mouseEnterInIcon = false;

  @state()
  private ignoreClick = false;

  private get panelWidth() {
    return this?.config?.localStickers?.panelWidth ?? 350;
  }

  private get panelHeight() {
    return this?.config?.localStickers?.panelHeight ?? 420;
  }

  private get stickersPerRow() {
    return this?.config?.localStickers?.stickersPerRow ?? 6;
  }

  private listenerSet = new Set<() => void>();

  @query("lt-context-menu", true)
  private contextMenu!: ContextMenu;

  @query("lt-sticker-icon", true)
  private stickerIcon!: StickerIcon;

  private longPressTimer?: ReturnType<typeof setTimeout>;

  private activeStickerItem?: StickerItem;

  private activeStickerPackLabel?: StickerPackLabel;

  @state()
  private previewStickerPath?: string;

  @state()
  private showPreview = false;

  @state()
  private iconRect?: DOMRect;

  private handleContextMenu = (e: MouseEvent) => {
    const path = e.composedPath() as HTMLElement[];
    const stickerItem = path.find((item) => item instanceof StickerItem);
    const stickerPackLabel = path.find((item) => item instanceof StickerPackLabel);
    const sitckerPack = path.find((item) => item instanceof StickerPack);

    const container = path.find((item) => item instanceof StickerContainer);
    if (!container) return;

    e.preventDefault();
    e.stopPropagation();

    // 右键点击贴纸
    if (stickerItem) {
      stickerItem.active = true;
      const stickerPack = path.find((item) => item instanceof StickerPack)!;
      this.activeStickerItem = stickerItem;
      this.showPreview = false;
      this.contextMenu.show = true;
      this.contextMenu.position = { x: e.clientX, y: e.clientY };
      this.contextMenu.menuList = [
        {
          label: "打开文件夹",
          callback: () => {
            openFolder(stickerItem.sticker.path);
            this.closeContextMenu();
          },
        },
      ];
      if (sitckerPack!.stickerPack.index >= 0) {
        this.contextMenu.menuList.push(
          {
            label: "设为图标",
            callback: () => {
              const iconName = stickerItem.sticker.path.split("/").pop()!;
              lite_tools.updateStickerPackConfig(stickerPack.stickerPack.dirPath, "icon", iconName);
              this.closeContextMenu();
            },
          },
          {
            label: "删除",
            type: "danger",
            callback: () => {
              this.closeContextMenu();
              lite_tools.deleteSticker(stickerItem.sticker.path);
            },
          },
        );
      }
    }

    // 右键点击贴纸标题
    if (stickerPackLabel && sitckerPack!.stickerPack.index >= 0) {
      this.contextMenu.show = true;
      this.contextMenu.position = { x: e.clientX, y: e.clientY };
      this.contextMenu.menuList = [
        {
          label: "重命名",
          callback: async () => {
            this.closeContextMenu();
            const newLabel = await stickerPackLabel.enterEditMode();
            if (newLabel) {
              const stickerPack = path.find((item) => item instanceof StickerPack)!;
              stickerPack.stickerPack = {
                ...stickerPack.stickerPack,
                label: newLabel,
              };
              lite_tools.updateStickerPackConfig(stickerPack.stickerPack.dirPath, "label", newLabel);
            }
          },
        },
      ];
    }
  };

  private handleClick = (e: MouseEvent) => {
    if (this.ignoreClick) return;
    if (e.button === 0) {
      const path = e.composedPath() as HTMLElement[];
      const target = path.find((item) => item instanceof StickerItem);
      if (target) {
        if (!e.altKey) {
          this.dispatchEvent(
            new CustomEvent("lt-select-sticker", {
              detail: target.sticker,
              bubbles: true,
              composed: true,
            }),
          );
        } else {
          this.dispatchEvent(
            new CustomEvent("lt-send-sticker", {
              detail: target.sticker,
              bubbles: true,
              composed: true,
            }),
          );
        }
        if (!e.ctrlKey) {
          this.showPanel = false;
        }
      }
    }
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (!this.contains(e.target as Node)) {
      this.showPanel = false;
    }

    const path = e.composedPath() as HTMLElement[];
    const target = path.find((item) => item instanceof StickerItem);
    const contextMenu = path.find((item) => item instanceof ContextMenu);
    if (!contextMenu) {
      this.closeContextMenu();
    }
    if (target && e.button === 0) {
      this.longPressTimer = setTimeout(() => {
        this.previewStickerPath = target.sticker.path;
        this.showPreview = true;
        this.ignoreClick = true;
      }, 300);
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = undefined;
    }
    this.showPreview = false;
    setTimeout(() => (this.ignoreClick = false));
  };

  private handleMouseMove = (e: Event) => {
    if (this.showPreview) {
      const path = e.composedPath() as HTMLElement[];
      const target = path.find((item) => item instanceof StickerItem);
      if (target) {
        this.previewStickerPath = target.sticker.path;
      }
    }
  };

  private closeContextMenu = () => {
    this.contextMenu.show = false;
    if (this.activeStickerItem) {
      this.activeStickerItem.active = false;
      this.activeStickerItem = undefined;
    }
    if (this.activeStickerPackLabel) {
      this.activeStickerPackLabel = undefined;
    }
  };

  private showPanelHandler = (e: MouseEvent) => {
    this.showPanel = !this.showPanel;
    this.iconRect = this.stickerIcon.getBoundingClientRect();
  };

  private mouseEnterHandler = (e: MouseEvent) => {
    const localStickers = configStore.value.localStickers;
    if (localStickers.hoverShow) {
      this.mouseEnterInIcon = true;
      this.showPanel = true;
      this.iconRect = this.stickerIcon.getBoundingClientRect();
      log(e.target, this.iconRect);
    }
  };

  /** 面板里正在重命名，或右键菜单还开着时，不能因为鼠标移开就收起面板。 */
  private isPanelBusy() {
    if (this.contextMenu?.show) return true;
    const active = document.activeElement;
    return active instanceof HTMLInputElement && this.renderRoot?.contains(active) === true;
  }

  private mouseLeaveHandler = (e: MouseEvent) => {
    const localStickers = configStore.value.localStickers;
    if (!localStickers.hoverShow) return;
    // 正在编辑或菜单打开时直接放过，否则输入框会跟着面板一起消失
    if (this.isPanelBusy()) return;

    this.mouseEnterInIcon = false;
    setTimeout(() => {
      if (this.mouseEnterInIcon) return;
      if (this.isPanelBusy()) return;
      this.showPanel = false;
    }, 100);
  };

  protected async firstUpdated(): Promise<void> {
    await configStore.ready;

    this.stickerStore = await lite_tools.getStickerStore();
    this.config = configStore.value;
    log("更新 stickerStore", this.stickerStore);

    this.listenerSet.add(
      lite_tools.onConfigChange((config) => {
        this.config = config;
      }) as unknown as () => void,
    );

    this.listenerSet.add(
      lite_tools.onStickerStoreUpdated((stickerStore) => {
        log("更新 stickerStore", stickerStore);
        this.stickerStore = stickerStore;
      }),
    );
    this.contextMenu.addEventListener("lt-context-menu-cancel", this.closeContextMenu);

    document.addEventListener("mousedown", this.handleMouseDown);
    document.addEventListener("mouseup", this.handleMouseUp);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("contextmenu", this.handleContextMenu);
    document.addEventListener("click", this.handleClick);

    this.isReady = true;
  }

  public destroy() {
    this.listenerSet.forEach((unsubscribe) => unsubscribe());
    this.listenerSet.clear();

    this.contextMenu.removeEventListener("lt-context-menu-cancel", this.closeContextMenu);

    document.removeEventListener("mousedown", this.handleMouseDown);
    document.removeEventListener("mouseup", this.handleMouseUp);
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("contextmenu", this.handleContextMenu);
    document.removeEventListener("click", this.handleClick);

    this.isReady = false;
  }

  render() {
    return html`
      <lt-context-menu></lt-context-menu>
      <lt-sticker-full-viewer
        .show="${this.showPreview}"
        .stickerPath="${this.previewStickerPath}"
      ></lt-sticker-full-viewer>

      ${this.isReady
        ? html`<div
            style=${styleMap({
              maxWidth: `min(100vw, ${this.panelWidth}px)`,
              maxHeight: `min(100vh, ${this.panelHeight}px)`,
              "--icon-to-bottom-dist": `${window.innerHeight - (this.iconRect?.top || 0)}px`,
            })}
            class="lt-sticker-panel-container ${configStore.value.localStickers.iconOnLeft ? "left" : ""} ${this
              .showPanel
              ? "show"
              : ""}"
          >
            <lt-sticker-panel
              .panelWidth="${this.panelWidth}"
              .panelHeight="${this.panelHeight}"
              .stickersPerRow="${this.stickersPerRow}"
              .stickerStore="${this.stickerStore as any}"
              .showPanel="${this.showPanel}"
              @mouseenter="${this.mouseEnterHandler}"
              @mouseleave="${this.mouseLeaveHandler}"
            ></lt-sticker-panel>
          </div>`
        : ""}

      <lt-sticker-icon
        .showPanel="${this.showPanel}"
        @mouseenter="${this.mouseEnterHandler}"
        @mouseleave="${this.mouseLeaveHandler}"
        @click="${this.showPanelHandler}"
      >
      </lt-sticker-icon>
    `;
  }
}
