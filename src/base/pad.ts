
// 零填充至指定宽度
export function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}
