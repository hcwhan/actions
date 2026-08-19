
import { describe, expect, it } from "vitest";
import {


  parseArgsInput,
  parseDispatchInputs,
  parseJobStartMs,
  parseLimitHoursInput,
} from "@/watchdog/lib/parse-inputs.js";


// 小时 → 毫秒（断言用）
const MS_PER_HOUR = 60 * 60 * 1000;

describe("parseArgsInput", () => {
  it("解析空数组", () => {
    expect(parseArgsInput("[]")).toEqual([]);
    expect(parseArgsInput("  ")).toEqual([]);
  });

  it("解析字符串数组", () => {
    expect(parseArgsInput('["-C","build"]')).toEqual(["-C", "build"]);
  });

  it("拒绝非数组 JSON", () => {
    expect(() => parseArgsInput('{"cmd":"build"}')).toThrow(/args 无效：须为 JSON 数组/);
  });

  it("拒绝非 string 元素", () => {
    expect(() => parseArgsInput("[1]")).toThrow(/args 无效：数组元素须均为 string/);
  });

  it("拒绝非法 JSON", () => {
    expect(() => parseArgsInput("not-json")).toThrow(/args 无效：非合法 JSON/);
  });
});

describe("parseJobStartMs", () => {
  it("解析毫秒时间戳字符串", () => {
    expect(parseJobStartMs("1724034567890")).toBe(1724034567890);
    expect(parseJobStartMs(" 1724034567890 ")).toBe(1724034567890);
  });

  it("解析小数毫秒（Number 可接受）", () => {
    expect(parseJobStartMs("1724034567890.5")).toBe(1724034567890.5);
  });

  it('拒绝 "NaN"', () => {
    expect(() => parseJobStartMs("NaN")).toThrow(/job-start-time 无效：NaN/);
  });

  it('拒绝非数字字符串', () => {
    expect(() => parseJobStartMs("not-a-number")).toThrow(/job-start-time 无效：not-a-number/);
  });
});

describe("parseLimitHoursInput", () => {
  it('解析整数小时 "5" → 18000000 ms', () => {
    expect(parseLimitHoursInput("5")).toBe(5 * MS_PER_HOUR);
    expect(parseLimitHoursInput("5")).toBe(18_000_000);
  });

  it('解析小数小时 "4.5"', () => {
    expect(parseLimitHoursInput("4.5")).toBe(4.5 * MS_PER_HOUR);
  });

  it('解析小数小时 "0.5"', () => {
    expect(parseLimitHoursInput("0.5")).toBe(0.5 * MS_PER_HOUR);
  });

  it('拒绝 "0"', () => {
    expect(() => parseLimitHoursInput("0")).toThrow(/limit-hours 无效：0/);
  });

  it('拒绝 "-1"', () => {
    expect(() => parseLimitHoursInput("-1")).toThrow(/limit-hours 无效：-1/);
  });

  it('拒绝 "NaN"', () => {
    expect(() => parseLimitHoursInput("NaN")).toThrow(/limit-hours 无效：NaN/);
  });
});

describe("parseDispatchInputs", () => {
  it("解析 JSON 对象字符串", () => {
    expect(parseDispatchInputs('{"ninja_workers":"8","use_cache":"true"}')).toEqual({
      ninja_workers: "8",
      use_cache: "true",
    });
  });

  it('空字符串 → {}', () => {
    expect(parseDispatchInputs("")).toEqual({});
  });

  it("仅空白 → {}", () => {
    expect(parseDispatchInputs("   \n  ")).toEqual({});
  });

  it("拒绝 JSON 数组", () => {
    expect(() => parseDispatchInputs("[]")).toThrow(/dispatch-inputs 须为 JSON 对象/);
  });

  it("拒绝 JSON null", () => {
    expect(() => parseDispatchInputs("null")).toThrow(/dispatch-inputs 须为 JSON 对象/);
  });

  it("拒绝非 string 值", () => {
    expect(() => parseDispatchInputs('{"count":8}')).toThrow(/dispatch-inputs\.count 须为 string/);
  });

  it("拒绝无效 JSON", () => {
    expect(() => parseDispatchInputs("{bad json}")).toThrow(/dispatch-inputs 无效：非合法 JSON/);
  });
});
