import assert from "node:assert/strict";
import { normalizeRkey, parseNapcatRkeyResponse } from "../../src/common/utils/napcatRkey";

function main() {
  // 标准 NapCat 响应：type 10 为私聊、type 20 为群聊，过期时间取更早的一个
  const parsed = parseNapcatRkeyResponse({
    status: "ok",
    data: {
      data: [
        { type: 10, rkey: "&rkey=PRIVATE-KEY", time: 1760000000, ttl: 3600 },
        { type: 20, rkey: "GROUP-KEY", time: 1760000000, ttl: 1800 },
      ],
    },
  });
  assert.deepEqual(parsed, {
    private_rkey: "PRIVATE-KEY",
    group_rkey: "GROUP-KEY",
    expired_time: 1760000000 + 1800,
  });

  // 数组直接挂在 data 上
  const flat = parseNapcatRkeyResponse({ data: [{ type: 10, rkey: "p" }, { type: 20, rkey: "g" }] });
  assert.equal(flat?.private_rkey, "p");
  assert.equal(flat?.group_rkey, "g");

  // 只有私聊 rkey 视为失败
  assert.equal(parseNapcatRkeyResponse({ data: { data: [{ type: 10, rkey: "p" }] } }), null);
  // 非法输入
  assert.equal(parseNapcatRkeyResponse(null), null);
  assert.equal(parseNapcatRkeyResponse("oops"), null);
  assert.equal(parseNapcatRkeyResponse({ data: { data: [] } }), null);

  // rkey 前缀清理
  assert.equal(normalizeRkey("&rkey=abc"), "abc");
  assert.equal(normalizeRkey("&abc"), "abc");
  assert.equal(normalizeRkey("abc"), "abc");
  assert.equal(normalizeRkey(undefined), "");

  console.log(JSON.stringify({ passed: true, napcatRkeyParsed: true, rkeyNormalized: true }));
}

main();
