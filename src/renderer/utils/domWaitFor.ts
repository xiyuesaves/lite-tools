type Waiter = {
  selector?: string;
  element?: HTMLElement;
  resolve: (result: any) => void;
  reject: (err: unknown) => void;
  timeoutId?: number;
  propPath?: string; // 可选，等待实例属性
};

const waiters: Waiter[] = [];
let observer: MutationObserver | null = null;
let pollId: number | undefined;
const INSTANCE_POLL_INTERVAL = 100;

function getByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const segments = path
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  return segments.reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

function removeWaiter(waiter: Waiter) {
  const index = waiters.indexOf(waiter);
  if (index !== -1) waiters.splice(index, 1);
  if (waiter.timeoutId !== undefined) window.clearTimeout(waiter.timeoutId);

  if (pollId !== undefined && !waiters.some((item) => item.propPath !== undefined)) {
    window.clearInterval(pollId);
    pollId = undefined;
  }
  if (waiters.length === 0 && observer) {
    observer.disconnect();
    observer = null;
  }
}

function checkWaiter(waiter: Waiter): boolean {
  // selector 模式始终查询当前节点，避免组件重建后继续等待旧节点。
  const element = waiter.selector !== undefined
    ? document.querySelector<HTMLElement>(waiter.selector)
    : waiter.element;
  if (!element) return false;

  if (waiter.propPath !== undefined) {
    const vueInstances = element.__VUE__;
    if (vueInstances?.length) {
      for (const instance of new Set(vueInstances)) {
        const value = getByPath(instance, waiter.propPath);
        if (value !== undefined) {
          waiter.resolve({ element, instance, value });
          return true;
        }
      }
    }
    return false;
  }

  waiter.resolve(element);
  return true;
}

function checkWaiters() {
  for (let i = waiters.length - 1; i >= 0; i--) {
    const waiter = waiters[i];
    try {
      if (checkWaiter(waiter)) removeWaiter(waiter);
    } catch (error) {
      // 单个实例的 getter / Proxy 异常不能中断其他任务。
      removeWaiter(waiter);
      waiter.reject(error);
    }
  }
}

function ensureObserver() {
  if (!observer) {
    const nextObserver = new MutationObserver(checkWaiters);
    try {
      // document 在 body 创建前即可监听，也能覆盖整个 body 被替换的情况。
      nextObserver.observe(document, { childList: true, subtree: true, attributes: true });
      observer = nextObserver;
    } catch (error) {
      nextObserver.disconnect();
      throw error;
    }
  }
  // __VUE__ 和实例属性赋值不一定产生 DOM mutation，需要独立唤醒。
  if (pollId === undefined && waiters.some((waiter) => waiter.propPath !== undefined)) {
    pollId = window.setInterval(checkWaiters, INSTANCE_POLL_INTERVAL);
  }
}

function addWaiter(waiter: Waiter, timeout: number | undefined, timeoutMessage: string) {
  if (checkWaiter(waiter)) return;

  waiters.push(waiter);
  try {
    if (timeout !== undefined) {
      waiter.timeoutId = window.setTimeout(() => {
        removeWaiter(waiter);
        waiter.reject(new Error(timeoutMessage));
      }, timeout);
    }
    ensureObserver();
  } catch (error) {
    removeWaiter(waiter);
    waiter.reject(error);
  }
}

/**
 * 等待元素出现
 */
function waitForElement(selector: string, timeout?: number): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    addWaiter({ selector, resolve, reject }, timeout, `waitForElement timeout: ${selector}`);
  });
}

/**
 * 等待 Vue 实例指定属性出现
 */
function waitForInstance(
  elOrSelector: string | HTMLElement,
  propPath: string,
  timeout?: number,
): Promise<{ element: HTMLElement; instance: any; value: any }> {
  return new Promise((resolve, reject) => {
    const target = typeof elOrSelector === "string" ? { selector: elOrSelector } : { element: elOrSelector };
    addWaiter({ ...target, propPath, resolve, reject }, timeout, `waitForInstance timeout: ${propPath}`);
  });
}

export { waitForElement, waitForInstance };
