type RkeyData = {
  private_rkey: string;
  group_rkey: string;
  expired_time: number;
};

/** 去掉 NapCat/QQ 返回里可能带的 "&rkey=" 前缀。 */
function normalizeRkey(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .replace(/^&?rkey=/i, "")
    .replace(/^&/, "");
}

/**
 * 解析 NapCat `nc_get_rkey` 的响应。
 * type 10 为私聊 rkey，type 20 为群聊 rkey；过期时间取两者中更早的一个。
 */
function parseNapcatRkeyResponse(payload: unknown): RkeyData | null {
  const root = payload as { data?: any } | null | undefined;
  const list: any[] = Array.isArray(root?.data?.data)
    ? root!.data.data
    : Array.isArray(root?.data)
      ? root!.data
      : [];
  if (!list.length) return null;

  const findEntry = (type: number) => list.find((item) => Number(item?.type) === type);
  const privateEntry = findEntry(10);
  const groupEntry = findEntry(20);
  const private_rkey = normalizeRkey(privateEntry?.rkey);
  const group_rkey = normalizeRkey(groupEntry?.rkey);
  if (!private_rkey || !group_rkey) return null;

  const expirations = [privateEntry, groupEntry]
    .map((item) => Number(item?.time ?? 0) + Number(item?.ttl ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    private_rkey,
    group_rkey,
    expired_time: expirations.length ? Math.min(...expirations) : 0,
  };
}

export { normalizeRkey, parseNapcatRkeyResponse, type RkeyData };
