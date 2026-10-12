// 历史记录：每次计算的结果存 localStorage，写报告时可翻查/载入/复制
export interface HistoryRecord {
  id: string;
  time: number;          // 时间戳
  symbol: string;
  unit: string;
  p: string;
  deltaInst: string;
  dataText: string;      // 原始输入（用于“载入”还原）
  nRaw: number;          // 原始数据个数
  nFinal: number;        // 剔除后个数
  rejectedCount: number; // 剔除个数
  resultText: string;    // 最终结果，如 L = (63.56 ± 0.05) cm
  copyText: string;      // 完整抄写区文本
}

const KEY = 'uncertainty-history-v1';
const MAX = 50;

export function loadHistory(): HistoryRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveRecord(rec: HistoryRecord): void {
  try {
    const list = loadHistory().filter(r => r.id !== rec.id);
    list.unshift(rec);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch { /* 存储满或被禁用时静默失败 */ }
}

export function deleteRecord(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadHistory().filter(r => r.id !== id)));
  } catch { /* ignore */ }
}

export function clearHistory(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
