import { configStore } from "@/renderer/modules/configStore";
import { createComparator } from "@/common/createComparator";
import { createLogger } from "@/renderer/utils/createLogger";
import { styleManager } from "@/renderer/modules/styleManager";

import type { WallpaperData } from "@/common/types/wallpaper";

const log = createLogger("WallpaperManager");

class WallpaperManager {
  private container: HTMLElement | null = null;
  private wallpaper: HTMLElement | null = null;
  private isReady = false;
  private comparedWallpaper: ReturnType<typeof createComparator>;
  private currentWallpaper: HTMLImageElement | HTMLVideoElement | null = null;

  constructor() {
    this.comparedWallpaper = createComparator({});
  }

  async setup() {
    if (this.isReady) return;

    await configStore.ready;

    if (configStore.value.interface.wallpaper.enabled) {
      this.updateWallpaperEffects();
      styleManager.inject("wallpaper");
      document.body.classList.add("lt-wallpaper");
    }

    ({ container: this.container, wallpaper: this.wallpaper } = this.createContainer());

    this.bindEvents();

    this.updateVisibility();

    this.isReady = true;
  }

  private createContainer() {
    const container = document.createElement("div");
    container.classList.add("lt-wallpaper-container");
    const wallpaper = document.createElement("div");
    wallpaper.classList.add("lt-wallpaper");
    container.appendChild(wallpaper);
    document.querySelector("#app")!.appendChild(container);
    return { container, wallpaper };
  }

  private bindEvents() {
    lite_tools.onWallpaperChanged((data) => {
      this.updateWallpaper(data);
    });
    configStore.onChange(() => {
      this.updateWallpaperEffects();
      this.updateVisibility();
    });
  }

  private updateVisibility() {
    if (!this.wallpaper) return;

    const isEnabled = configStore.value.interface.wallpaper.enabled;
    if (isEnabled) {
      styleManager.inject("wallpaper");
      document.body.classList.add("lt-wallpaper");
      lite_tools.getWallpaperData();
    } else {
      this.comparedWallpaper({});
      document.body.classList.remove("lt-wallpaper");
      this.handleDisableAnimation();
      styleManager.remove("wallpaper");
    }
  }

  private handleDisableAnimation() {
    if (!this.container) return;

    const ontransitionend = () => {
      if (!configStore.value.interface.wallpaper.enabled && this.wallpaper) {
        this.wallpaper.innerHTML = "";
      }
    };
    this.container.addEventListener("transitionend", ontransitionend, { once: true });
  }

  private updateWallpaper(data: WallpaperData) {
    if (!this.wallpaper) return;

    if (!configStore.value.interface.wallpaper.enabled) return;

    console.log("Updating wallpaper...", data);

    if (!this.comparedWallpaper(data)) return;

    if (data.type === "image") {
      const img = new Image();
      img.style.objectFit = "cover";
      img.onload = () => {
        log("图片加载完成");
        this.wallpaper?.insertAdjacentElement("afterbegin", img);
        img.offsetHeight;
        img.classList.add("show");
        this.currentWallpaper = img;
      };
      img.ontransitionend = () => {
        this.removeOtherElement(img);
      };
      img.onerror = (err) => {
        log("图片加载失败", err);
        const errorEl = this.resourceError("图片加载失败，请检查图片路径是否存在，或是否有权限访问");
        this.wallpaper?.insertAdjacentElement("afterbegin", errorEl);
        this.currentWallpaper = null;
        errorEl.offsetHeight;
        errorEl.classList.add("show");
        errorEl.ontransitionend = () => {
          this.removeOtherElement(errorEl);
        };
      };
      img.src = "appimg://" + data.path;
      log("图片路径", img.src);
    } else if (data.type === "video") {
      const video = document.createElement("video");
      video.src = data.url;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.onloadeddata = () => {
        this.wallpaper?.insertAdjacentElement("afterbegin", video);
        video.offsetHeight;
        video.classList.add("show");
        video.play();
        this.currentWallpaper = video;
      };
      video.ontransitionend = () => {
        this.removeOtherElement(video);
      };
      video.onerror = (err) => {
        log("视频加载失败", err);
        const errorEl = this.resourceError("视频加载失败，请检查视频路径是否存在，或是否有权限访问");
        this.wallpaper?.insertAdjacentElement("afterbegin", errorEl);
        this.currentWallpaper = null;
        errorEl.offsetHeight;
        errorEl.classList.add("show");
        errorEl.ontransitionend = () => {
          this.removeOtherElement(errorEl);
        };
      };
    }
  }

  private updateWallpaperEffects() {
    document.body.classList.toggle("lt-wallpaper-blur-message", configStore.value.interface.wallpaper.blur.message);
    document.body.classList.toggle("lt-wallpaper-remove-overlay", configStore.value.interface.wallpaper.removeOverlay);
    document.body.classList.toggle(
      "lt-wallpaper-blur-chat-input-area",
      configStore.value.interface.wallpaper.blur.chatInputArea,
    );
    document.body.classList.toggle(
      "lt-wallpaper-blur-recent-contact",
      configStore.value.interface.wallpaper.blur.recentContact,
    );
    document.body.classList.toggle("lt-wallpaper-blur-group-box", configStore.value.interface.wallpaper.blur.groupBox);

    const opacity = configStore.value.interface.wallpaper.opacity;
    document.documentElement.style.setProperty(
      "--lt-wallpaper-opacity",
      String((Number.isNaN(opacity) ? 50 : opacity) / 100),
    );

    const containerOpacity = configStore.value.interface.wallpaper.containerOpacity;
    document.documentElement.style.setProperty(
      "--lt-wallpaper-container-opacity",
      String((Number.isNaN(containerOpacity) ? 50 : containerOpacity) / 100),
    );
  }

  private removeOtherElement(target: HTMLElement) {
    this.wallpaper?.querySelectorAll<HTMLElement>(":scope > *").forEach((el) => {
      if (el !== target) {
        el.ontransitionend = () => {
          if (el instanceof HTMLVideoElement) {
            el.src = "";
            el.load();
          }
          el.remove();
        };
        el.classList.remove("show");
      }
    });
  }

  private resourceError(error: string) {
    const div = document.createElement("div");
    div.style.textAlign = "center";
    div.style.color = "#d65d0e";
    div.style.backgroundColor = "#665c54";
    div.style.fontSize = "32px";
    div.style.display = "flex";
    div.style.justifyContent = "center";
    div.style.alignItems = "center";
    div.style.boxSizing = "border-box";
    div.style.padding = "32px";
    div.textContent = error;
    return div;
  }
}

const wallpaperManager = new WallpaperManager();

export { wallpaperManager };
