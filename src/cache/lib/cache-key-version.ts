import { pad } from "@/base/pad.js";

// GHA cache key 上限（@actions/cache ValidationError）
export const GHA_CACHE_KEY_MAX_LENGTH = 512;

// 固定 UTC 后缀宽度：-YYYY.MM.DD-HH.mm.ss-SSS
export const VERSIONED_TIMESTAMP_SUFFIX_LENGTH = 24;

// cache-key 本体允许的最大长度（加上后缀后不超过 GHA 上限）
export const MAX_CACHE_KEY_BASE_LENGTH = GHA_CACHE_KEY_MAX_LENGTH - VERSIONED_TIMESTAMP_SUFFIX_LENGTH;

// 生成 UTC 时间戳后缀
function formatTimestampSuffix(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = pad(date.getUTCMonth() + 1, 2);
  const d = pad(date.getUTCDate(), 2);
  const h = pad(date.getUTCHours(), 2);
  const mi = pad(date.getUTCMinutes(), 2);
  const s = pad(date.getUTCSeconds(), 2);
  const ms = pad(date.getUTCMilliseconds(), 3);
  return `-${y}.${mo}.${d}-${h}.${mi}.${s}-${ms}`;
}

// 校验 UTC 时间戳各字段合法且与 Date  roundtrip 一致
function isValidUtcTimestamp(year: number, month: number, day: number, hh: number, mm: number, ss: number, ms: number): boolean {
  if (month < 1 || month > 12) {
    return false;
  }
  if (hh < 0 || hh > 23) {
    return false;
  }
  if (mm < 0 || mm > 59) {
    return false;
  }
  if (ss < 0 || ss > 59) {
    return false;
  }
  if (ms < 0 || ms > 999) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day, hh, mm, ss, ms));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hh &&
    date.getUTCMinutes() === mm &&
    date.getUTCSeconds() === ss &&
    date.getUTCMilliseconds() === ms
  );
}

// 缓存 key + 时间戳后缀 → 实际写入的 versioned key
export function buildVersionedCacheKey(cacheKey: string): string {
  const cacheKeyFull = `${cacheKey}${formatTimestampSuffix(new Date())}`;
  if (cacheKeyFull.length > GHA_CACHE_KEY_MAX_LENGTH) {
    throw new Error(`cache-key 无效：加上时间后缀后超过 ${GHA_CACHE_KEY_MAX_LENGTH} 字符（${cacheKeyFull.length} 字符）`);
  }
  return cacheKeyFull;
}

// key 列表中，取指定 cacheKey 前缀下时间戳最新者
export function pickNewestVersionedKey(keys: string[], cacheKey: string): string | null {
  let newestKey: string | null = null;
  let newestTime = -1;

  for (const key of keys) {
    if (!key.startsWith(cacheKey)) {
      continue;
    }
    const parsed = parseVersionedCacheKey(key, cacheKey);
    if (parsed === null) {
      continue;
    }
    const time = parsed.getTime();
    if (time >= newestTime) {
      newestTime = time;
      newestKey = key;
    }
  }

  return newestKey;
}

// 版本后缀正则：-YYYY.MM.DD-HH.mm.ss-SSS（UTC，GHA key 安全字符）
const SUFFIX_PATTERN = /^-(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})-(\d{3})$/;

// 从完整 key 解析后缀时间；不匹配 cacheKey 前缀或日期非法则 null
function parseVersionedCacheKey(key: string, cacheKey: string): Date | null {
  if (!key.startsWith(cacheKey)) {
    return null;
  }
  const suffix = key.slice(cacheKey.length);
  const match = SUFFIX_PATTERN.exec(suffix);
  if (!match) {
    return null;
  }
  const [, year, month, day, hh, mm, ss, ms] = match;
  const yearNum = Number(year);
  const monthNum = Number(month);
  const dayNum = Number(day);
  const hhNum = Number(hh);
  const mmNum = Number(mm);
  const ssNum = Number(ss);
  const msNum = Number(ms);

  if (!isValidUtcTimestamp(yearNum, monthNum, dayNum, hhNum, mmNum, ssNum, msNum)) {
    return null;
  }

  return new Date(Date.UTC(yearNum, monthNum - 1, dayNum, hhNum, mmNum, ssNum, msNum));
}
