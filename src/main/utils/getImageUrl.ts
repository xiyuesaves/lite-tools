import { createHash } from "node:crypto";
import { configManager } from "@/main/modules/configManager";
import { createLogger } from "@/main/utils/createLogger";
import { normalizeRkey, parseNapcatRkeyResponse, type RkeyData } from "@/common/utils/napcatRkey";

type PicElement = {
  originImageUrl?: string;
  md5HexStr?: string;
  [key: string]: any;
};

const IMAGE_HOST = "https://gchat.qpic.cn";
const IMAGE_HOST_NT = "https://multimedia.nt.qq.com.cn";
const NAPCAT_CREDENTIAL_TTL_MS = 60 * 60 * 1000;
const log = createLogger("getImageUrl");

const cachedRkey = {
  private_rkey: "",
  group_rkey: "",
  expired_time: 0,
};

let pendingRkeyPromise: Promise<void> | null = null;
let pendingNapcatLogin: Promise<string> | null = null;
let napcatCredential = { value: "", expiredAt: 0 };

/** NapCat 源需要 WebUI 地址与 token 同时配置，地址与 token 都来自用户配置。 */
function getNapcatSource() {
  const global = configManager.value.global;
  const url = (global.napcatRkeyUrl || "").trim().replace(/\/+$/, "");
  const token = (global.napcatRkeyToken || "").trim();
  return url && token ? { url, token } : null;
}

async function loginNapcat(source: { url: string; token: string }) {
  if (napcatCredential.value && Date.now() < napcatCredential.expiredAt) {
    return napcatCredential.value;
  }
  if (pendingNapcatLogin) {
    return pendingNapcatLogin;
  }

  pendingNapcatLogin = (async () => {
    try {
      const hash = createHash("sha256").update(`${source.token}.napcat`).digest("hex");
      const res = await fetch(`${source.url}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash }),
      });
      if (!res.ok) {
        throw new Error(`napcat login http ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as any;
      const credential = data?.data?.Credential;
      if (typeof credential !== "string" || !credential) {
        throw new Error("napcat 登录没有返回 Credential");
      }

      napcatCredential = { value: credential, expiredAt: Date.now() + NAPCAT_CREDENTIAL_TTL_MS };
      log("NapCat 登录成功");
      return credential;
    } finally {
      pendingNapcatLogin = null;
    }
  })();

  return pendingNapcatLogin;
}

async function fetchNapcatRkey(): Promise<RkeyData | null> {
  const source = getNapcatSource();
  if (!source) {
    log("NapCat 未配置 WebUI 地址或 Token");
    return null;
  }

  try {
    const credential = await loginNapcat(source);
    const res = await fetch(`${source.url}/api/Debug/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}` },
      body: JSON.stringify({ action: "nc_get_rkey", params: {} }),
    });
    if (!res.ok) {
      throw new Error(`napcat call http ${res.status} ${res.statusText}`);
    }

    const data = parseNapcatRkeyResponse(await res.json());
    if (!data) {
      throw new Error("nc_get_rkey 响应里缺少私聊或群聊 rkey");
    }
    return data;
  } catch (err) {
    // 凭证可能已失效，清空后让下一次调用重新登录
    napcatCredential = { value: "", expiredAt: 0 };
    log("从 NapCat 获取 rkey 失败", err);
    return null;
  }
}

async function fetchRemoteRkey(): Promise<RkeyData | null> {
  try {
    const res = await fetch(configManager.value.global.rkeyServerUrl);
    const data = (await res.json()) as RkeyData;
    if (!data?.private_rkey || !data?.group_rkey) {
      throw new Error("rkey 响应缺少 private_rkey 或 group_rkey");
    }
    return data;
  } catch (err) {
    log("获取rkey失败", err);
    return null;
  }
}

async function fetchRkey(type: "private_rkey" | "group_rkey") {
  const now = Date.now();

  if (now <= cachedRkey.expired_time) {
    log("rkey未过期，使用缓存");
    return cachedRkey[type];
  }

  if (pendingRkeyPromise) {
    await pendingRkeyPromise;
    return cachedRkey[type];
  }

  const useNapcat = configManager.value.global.rkeySource === "napcat";
  pendingRkeyPromise = (async () => {
    try {
      const data = useNapcat ? await fetchNapcatRkey() : await fetchRemoteRkey();
      if (!data) return;

      cachedRkey.private_rkey = data.private_rkey;
      cachedRkey.group_rkey = data.group_rkey;
      cachedRkey.expired_time = Number(data.expired_time) * 1000;
      log("rkey更新成功", { source: useNapcat ? "napcat" : "remote", expired_time: cachedRkey.expired_time });
    } finally {
      pendingRkeyPromise = null;
    }
  })();

  await pendingRkeyPromise;
  return cachedRkey[type];
}

async function getImageUrl(picElement: PicElement): Promise<string | null> {
  const { originImageUrl: url, md5HexStr } = picElement;

  if (!url) {
    if (md5HexStr) {
      return `${IMAGE_HOST}/gchatpic_new/0/0-0-${md5HexStr.toUpperCase()}/0`;
    }
    return null;
  }

  const parsedUrl = new URL(url, IMAGE_HOST);
  const imageAppid = parsedUrl.searchParams.get("appid");

  if (!imageAppid || !["1406", "1407"].includes(imageAppid)) {
    return parsedUrl.toString();
  }

  let rkey = parsedUrl.searchParams.get("rkey");
  if (!rkey) {
    const rkeyType = imageAppid === "1406" ? "private_rkey" : "group_rkey";
    const rawRkey = await fetchRkey(rkeyType);

    if (rawRkey) {
      parsedUrl.searchParams.set("rkey", normalizeRkey(rawRkey));
    }
  }

  parsedUrl.host = new URL(IMAGE_HOST_NT).host;

  return parsedUrl.toString();
}

export { getImageUrl };
