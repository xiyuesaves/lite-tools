import { createLogger } from "@/renderer/utils/createLogger";
import { waitForInstance } from "@/renderer/utils/domWaitFor";

const log = createLogger("captureAIO");

enum InitStatus {
  Uninitialized,
  Initializing,
  Initialized,
}

class AioStore {
  private listeners: Set<Function> = new Set();
  private readyPromise: Promise<void>;
  private resolveReady: () => void;
  private curAioData: any;
  private status = InitStatus.Uninitialized;

  constructor() {
    const { resolve, promise } = Promise.withResolvers<void>();
    this.readyPromise = promise;
    this.resolveReady = resolve;
  }

  get value() {
    return this.curAioData;
  }

  get ready() {
    if (this.status === InitStatus.Uninitialized) {
      this.status = InitStatus.Initializing;
      this.setupCaptureAIO();
    }
    return this.readyPromise;
  }

  getPeer() {
    return {
      chatType: this.curAioData?.chatType,
      guildId: "",
      peerUid: this.curAioData?.header?.uid,
    };
  }

  async setupCaptureAIO(): Promise<void> {
    try {
      log("开始初始化");
      const { value: aioStore } = await waitForInstance(".aio.vue-component", "proxy.commonAioStore", 30000);
      this.handleCurAioData(aioStore);
      this.status = InitStatus.Initialized;
      this.resolveReady();
      log("初始化完成", this.curAioData);
      return;
    } catch (err) {
      log("初始化失败，获取Aio数据时出错");
    }
  }

  handleCurAioData(aioStore: any) {
    this.curAioData = aioStore?.curAioData;
    Object.defineProperty(aioStore, "curAioData", {
      enumerable: true,
      configurable: true,
      get: () => {
        return this.curAioData;
      },
      set: (newVal) => {
        log("curAioData更新", newVal);
        this.curAioData = newVal;
        this.notify();
      },
    });
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.curAioData);
    }
  }

  onChange(listener: (val: any) => void) {
    if (!this.listeners.has(listener)) {
      this.listeners.add(listener);
    }
    return () => this.offChange(listener);
  }

  offChange(listener: (val: any) => void) {
    this.listeners.delete(listener);
  }
}

const aioStore = new AioStore();

export { aioStore };
