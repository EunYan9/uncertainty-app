// ============================================================
// 粗差剔除（肖维涅准则）与不确定度分析 —— 计算引擎
// 规则来源：上海科技大学《普通物理I实验绪论》及课堂幻灯片
// ============================================================

// ---------- 十进制数字串级修约（避免浮点误差） ----------

type RoundMode = 'halfUp' | 'halfEven'; // halfUp=四舍五入；halfEven=四舍六入五凑偶(GB8170)

interface DigitRep { digits: string; exp: number; neg: boolean }

function toDigits(x: number): DigitRep {
  const neg = x < 0;
  const s = Math.abs(x).toExponential(14); // 15 位有效数字，足够区分十进制边界
  const [m, e] = s.split('e');
  const exp = parseInt(e, 10);
  let digits = m.replace('.', '');
  digits = digits.replace(/0+$/, '');
  if (digits === '') digits = '0';
  return { digits, exp, neg };
}

function fromDigits(digits: string, exp: number, neg: boolean): number {
  const head = digits[0];
  const rest = digits.slice(1) || '0';
  const v = parseFloat(`${head}.${rest}e${exp}`);
  return neg ? -v : v;
}

/** 把 x 修约到 10^placeExp 这一位（placeExp=-2 即保留到百分位） */
export function roundAtPlace(x: number, placeExp: number, mode: RoundMode = 'halfUp'): number {
  if (!isFinite(x) || x === 0) return 0;
  const { digits, exp, neg } = toDigits(x);
  const keep = exp - placeExp + 1;
  if (keep >= digits.length) return x; // 本身已不够该精度，无需修约
  if (keep < 0) return 0;              // 最高位比目标位低两级以上，必修为 0
  // keep === 0 时保留位为空（目标位上是 0），是否进位全看被舍弃的首位
  const kept = keep === 0 ? '' : digits.slice(0, keep);
  const dropped = keep === 0 ? digits : digits.slice(keep);
  const d0 = parseInt(dropped[0], 10);
  const restNonzero = /[1-9]/.test(dropped.slice(1));
  let up: boolean;
  if (d0 > 5) up = true;
  else if (d0 < 5) up = false;
  else if (restNonzero) up = true;          // 5 后有数进上去
  else if (mode === 'halfUp') up = true;    // 四舍五入
  else up = parseInt(kept === '' ? '0' : kept[kept.length - 1], 10) % 2 === 1; // 五凑偶
  if (kept === '') {
    // 目标位上是 0：进位则得 1 个目标位单位，否则为 0
    return up ? fromDigits('1', placeExp, neg) : 0;
  }
  let newDigits = kept;
  let newExp = exp;
  if (up) {
    const arr = kept.split('').map(Number);
    let i = arr.length - 1;
    while (i >= 0) {
      if (arr[i] === 9) { arr[i] = 0; i--; } else { arr[i]++; break; }
    }
    if (i < 0) { arr.unshift(1); newExp++; } // 999…→1000… 进位
    newDigits = arr.join('');
  }
  return fromDigits(newDigits, newExp, neg);
}

/** 保留 m 位有效数字 */
export function roundSigFigs(x: number, m: number, mode: RoundMode = 'halfUp'): number {
  if (!isFinite(x) || x === 0) return 0;
  const { exp } = toDigits(x);
  return roundAtPlace(x, exp - m + 1, mode);
}

/** 格式化为末位在 10^placeExp 的十进制字符串（补 0） */
export function formatAtPlace(x: number, placeExp: number): string {
  const v = roundAtPlace(x, placeExp, 'halfUp');
  if (placeExp >= 0) return v.toFixed(0);
  const decimals = -placeExp;
  return v.toFixed(decimals);
}

/** 多保留位数显示：sig 位有效数字（补 0 以体现精度） */
export function manyDigits(x: number, sig = 6): string {
  if (!isFinite(x)) return '—';
  if (x === 0) return '0';
  const neg = x < 0;
  const v = roundSigFigs(Math.abs(x), sig, 'halfUp');
  const { exp } = toDigits(v);
  const s = formatAtPlace(v, exp - sig + 1);
  return (neg ? '-' : '') + s;
}

/** 带正负号的多保留位数 */
export function signedManyDigits(x: number, sig = 6): string {
  if (x === 0) return '0';
  return (x > 0 ? '+' : '') + manyDigits(x, sig);
}

// ---------- 数据输入解析 ----------

export interface ParsedData {
  values: number[];
  raws: string[];
  decimals: number[];   // 每个测量值的小数位数
  errors: string[];
}

export function parseDataInput(text: string): ParsedData {
  const tokens = text.split(/[\s,，、;；\n\r\t]+/).filter(Boolean);
  const values: number[] = [];
  const raws: string[] = [];
  const decimals: number[] = [];
  const errors: string[] = [];
  const re = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
  for (const tk of tokens) {
    if (!re.test(tk)) { errors.push(tk); continue; }
    const v = parseFloat(tk);
    if (!isFinite(v)) { errors.push(tk); continue; }
    const m = tk.match(/^([+-]?)(\d+)?(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
    let dec = 0;
    if (m) {
      const frac = (m[3] || '').length;
      const expo = m[4] ? parseInt(m[4], 10) : 0;
      dec = Math.max(0, frac - expo);
    }
    values.push(v); raws.push(tk); decimals.push(dec);
  }
  return { values, raws, decimals, errors };
}

// ---------- 基本统计量 ----------

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** 测量值的标准偏差 σ_N（贝塞尔公式，分母 n−1） */
export function sampleStd(xs: number[], m?: number): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const mu = m ?? mean(xs);
  const s = xs.reduce((a, x) => a + (x - mu) * (x - mu), 0);
  return Math.sqrt(s / (n - 1));
}

/** 平均值的标准偏差 σ_N̄ = σ_N/√n */
export function stdOfMean(xs: number[], m?: number): number {
  const s = sampleStd(xs, m);
  return s / Math.sqrt(xs.length);
}

// ---------- 肖维涅系数 ----------

const CHAU_TABLE = new Map<number, number>([
  [5, 1.65], [6, 1.75], [7, 1.80], [8, 1.86], [9, 1.92], [10, 1.96],
  [11, 2.00], [12, 2.03], [13, 2.07], [14, 2.10], [15, 2.13], [16, 2.15],
  [17, 2.18], [18, 2.20], [19, 2.22], [20, 2.24], [25, 2.33], [30, 2.39],
  [40, 2.50], [50, 2.58], [60, 2.64], [70, 2.69], [80, 2.73], [90, 2.77],
  [100, 2.81], [110, 2.84], [150, 2.93], [200, 3.02],
]);

/** 标准正态分布逆 CDF（Acklam 有理逼近，最大误差 ~1e-9） */
function invNorm(p: number): number {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const plow = 0.02425, phigh = 1 - plow;
  let q: number, r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export interface CResult { c: number; source: 'table' | 'theory' | 'none'; note: string }

/** 肖维涅系数 c：优先查课程给出的表；表外按理论公式 c = Φ⁻¹(1 − 1/(4n)) 补足 */
export function chauvenetC(n: number): CResult {
  const hit = CHAU_TABLE.get(n);
  if (hit !== undefined) return { c: hit, source: 'table', note: `n=${n}，查肖维涅系数表` };
  if (n >= 2) {
    const cTheory = invNorm(1 - 1 / (4 * n));
    const c = roundSigFigs(cTheory, 3, 'halfUp');
    return { c, source: 'theory', note: `n=${n} 不在课程系数表内，按理论公式 Φ⁻¹(1−1/(4n)) 补得` };
  }
  return { c: NaN, source: 'none', note: '数据太少，无法使用肖维涅准则' };
}

// ---------- t_p 系数 ----------

export const P_OPTIONS = ['0.683', '0.90', '0.95', '0.98', '0.99'] as const;
export type PKey = typeof P_OPTIONS[number];

const T_TABLE: Record<PKey, Record<number, number>> = {
  '0.683': { 3: 1.32, 4: 1.20, 5: 1.14, 6: 1.11, 7: 1.09, 8: 1.08, 9: 1.07, 10: 1.06, 11: 1.05 },
  '0.90': { 3: 2.92, 4: 2.35, 5: 2.13, 6: 2.02, 7: 1.94, 8: 1.90, 9: 1.86, 10: 1.83, 11: 1.81 },
  '0.95': { 3: 4.30, 4: 3.18, 5: 2.78, 6: 2.57, 7: 2.45, 8: 2.36, 9: 2.31, 10: 2.26, 11: 2.23 },
  '0.98': { 3: 6.96, 4: 4.54, 5: 3.75, 6: 3.36, 7: 3.14, 8: 3.00, 9: 2.90, 10: 2.82, 11: 2.76 },
  '0.99': { 3: 9.93, 4: 5.84, 5: 4.60, 6: 4.03, 7: 3.71, 8: 3.50, 9: 3.36, 10: 3.25, 11: 3.17 },
};
const T_INF: Record<PKey, number> = { '0.683': 1.00, '0.90': 1.65, '0.95': 1.96, '0.98': 2.33, '0.99': 2.58 };
// n=2（ν=1）超出课程表，给出 t 分布理论值
const T_N2: Record<PKey, number> = { '0.683': 1.82, '0.90': 6.31, '0.95': 12.71, '0.98': 31.82, '0.99': 63.66 };

export interface TResult { tp: number; note: string }

export function tFactor(n: number, p: PKey): TResult {
  if (n >= 3 && n <= 11) return { tp: T_TABLE[p][n], note: `n=${n}，P=${p}，查 t 表` };
  if (n >= 12) return { tp: T_INF[p], note: `n=${n} 超出课程 t 表（3–11），取 n→∞ 行` };
  if (n === 2) return { tp: T_N2[p], note: `n=2 超出课程 t 表，取 t 分布理论值（ν=1）` };
  return { tp: NaN, note: '数据不足，无法取 t 值' };
}

// ---------- 粗差剔除（肖维涅准则，逐轮迭代） ----------

export interface DevRow {
  seq: number;      // 原始序号（从 1 起）
  value: number;
  dev: number;      // N_i − N̄（带符号）
  absDev: number;
  reject: boolean;
}

export interface RoundResult {
  round: number;
  n: number;
  mean: number;
  sigmaN: number;       // 测量值标准偏差
  sigmaMean: number;    // 平均值标准偏差
  c: number;
  cNote: string;
  cSource: 'table' | 'theory' | 'none';
  limit: number;        // c·σ_N
  rows: DevRow[];
  rejected: DevRow[];
}

export function grossErrorRounds(values: number[]): RoundResult[] {
  let current = values.map((v, i) => ({ seq: i + 1, value: v }));
  const rounds: RoundResult[] = [];
  for (let r = 1; r <= 10; r++) {
    const n = current.length;
    const xs = current.map(c => c.value);
    const m = mean(xs);
    const sN = sampleStd(xs, m);
    const cRes = chauvenetC(n);
    const limit = cRes.c * sN;
    const rows: DevRow[] = current.map(({ seq, value }) => {
      const dev = value - m;
      const absDev = Math.abs(dev);
      return { seq, value, dev, absDev, reject: isFinite(limit) ? absDev > limit : false };
    });
    const rejected = rows.filter(row => row.reject);
    rounds.push({
      round: r, n, mean: m, sigmaN: sN, sigmaMean: sN / Math.sqrt(n),
      c: cRes.c, cNote: cRes.note, cSource: cRes.source, limit, rows, rejected,
    });
    if (rejected.length === 0) break;
    if (n - rejected.length < 3) break; // 至少保留 3 个数据
    const rejectSeqs = new Set(rejected.map(row => row.seq));
    current = current.filter(c => !rejectSeqs.has(c.seq));
  }
  return rounds;
}

// ---------- 不确定度合成与结果修约 ----------

export interface FinalizeResult {
  URaw: number;
  URounded: number;
  UDisplay: string;
  finalMean: number;
  finalMeanDisplay: string;
  placeExp: number;      // 最终结果末位 10^placeExp
  notes: string[];
}

/**
 * 不确定度修约 + 平均值对齐（规则见绪论 2.2 节幻灯片：N̄=1.234 mm 三例）
 * 1. U 首位数字 ≤2 保留 2 位有效数字，≥3 保留 1 位；
 * 2. 若 U 修约值末位比平均值精度位更细：按 GB8170 凑偶试修约到平均值位，
 *    非零（首位 ≥6）则取之；会为 0（首位 ≤5）则 U 保留在自身位，平均值末位补 0；
 * 3. 若 U 更粗：平均值按四舍五入修约到 U 的末位。
 */
export function finalizeResult(U: number, meanAligned: number, measPlaceExp: number): FinalizeResult {
  const notes: string[] = [];
  if (!(U > 0) || !isFinite(U)) {
    return {
      URaw: U, URounded: 0, UDisplay: '0',
      finalMean: meanAligned, finalMeanDisplay: formatAtPlace(meanAligned, measPlaceExp),
      placeExp: measPlaceExp, notes: ['U = 0，平均值保持测量精度位'],
    };
  }
  const { digits, exp } = toDigits(U); // exp = U 首位有效数字所在的位（如 0.047 → -2）
  const alpha = parseInt(digits[0], 10);
  const m = alpha <= 2 ? 2 : 1;
  notes.push(alpha <= 2
    ? `U 首位有效数字 α=${alpha} ≤ 2，U 保留 2 位有效数字`
    : `U 首位有效数字 α=${alpha} ≥ 3，U 保留 1 位有效数字`);
  const Ur = roundSigFigs(U, m, 'halfUp');
  const pU = toDigits(Ur).exp - (m - 1); // U 修约值末位所在的位

  if (exp < measPlaceExp) {
    // 情形2：U 的首位比平均值精度位更细 → 试修约到平均值位（GB8170 凑偶，对应幻灯片 α≤5 / α≥6 分界）
    const up = roundAtPlace(U, measPlaceExp, 'halfEven');
    if (up > 0) {
      notes.push(`U 修约到平均值精度位后非零（首位 ≥6），取 U=${formatAtPlace(up, measPlaceExp)}，平均值不变`);
      return {
        URaw: U, URounded: up, UDisplay: formatAtPlace(up, measPlaceExp),
        finalMean: meanAligned, finalMeanDisplay: formatAtPlace(meanAligned, measPlaceExp),
        placeExp: measPlaceExp, notes,
      };
    }
    notes.push(`U 修约到平均值精度位会为 0（首位 ≤5），故 U 保留在自身位 ${formatAtPlace(Ur, pU)}，平均值末位补 0 对齐`);
    return {
      URaw: U, URounded: Ur, UDisplay: formatAtPlace(Ur, pU),
      finalMean: meanAligned, finalMeanDisplay: formatAtPlace(meanAligned, pU),
      placeExp: pU, notes,
    };
  }
  if (exp === measPlaceExp) {
    // 情形1：U 的首位与平均值同位 → U 保留 1~2 位有效数字
    if (pU < measPlaceExp) {
      notes.push('U 末位比平均值精度位细，平均值末位补 0 对齐');
    } else {
      notes.push('U 末位与平均值精度位一致，直接对齐');
    }
    return {
      URaw: U, URounded: Ur, UDisplay: formatAtPlace(Ur, pU),
      finalMean: meanAligned, finalMeanDisplay: formatAtPlace(meanAligned, pU),
      placeExp: pU, notes,
    };
  }
  // 情形3：U 的首位比平均值位粗 → U 取修约值，平均值四舍五入修约到 U 的末位
  const mAligned = roundAtPlace(meanAligned, pU, 'halfUp');
  notes.push(`U 末位比平均值精度位粗，平均值按四舍五入修约到 U 的末位`);
  return {
    URaw: U, URounded: Ur, UDisplay: formatAtPlace(Ur, pU),
    finalMean: mAligned, finalMeanDisplay: formatAtPlace(mAligned, pU),
    placeExp: pU, notes,
  };
}

// ---------- 汇总分析 ----------

export interface AnalysisResult {
  rounds: RoundResult[];
  cleanValues: { seq: number; value: number }[];
  nFinal: number;
  meanFinal: number;          // 全精度平均值
  meanAligned: number;        // 与测量值对齐的平均值
  meanAlignedDisplay: string;
  meanFullDisplay: string;
  measPlaceExp: number;       // 测量值精度位
  sigmaNFinal: number;
  sigmaMeanFinal: number;
  tp: number;
  tpNote: string;
  deltaA: number;
  deltaB: number;
  U: number;
  fin: FinalizeResult;
  warnings: string[];
}

export function fullAnalysis(
  values: number[],
  decimals: number[],
  deltaInstrument: number,
  p: PKey,
): AnalysisResult {
  const warnings: string[] = [];
  const measDecimals = Math.max(...decimals);
  const measPlaceExp = -measDecimals;
  const decSet = new Set(decimals);
  if (decSet.size > 1) {
    warnings.push(`各测量值小数位数不一致（${Array.from(decSet).sort((a: number, b: number) => a - b).join(' / ')} 位），已按最细的 ${measDecimals} 位对齐平均值，请确认记录是否有误`);
  }

  const rounds = grossErrorRounds(values);
  const last = rounds[rounds.length - 1];
  const keepSeqs = new Set(last.rows.map(r => r.seq));
  const cleanValues = values.map((v, i) => ({ seq: i + 1, value: v })).filter(c => keepSeqs.has(c.seq));

  const nF = last.n;
  const meanF = last.mean;
  const sigmaNF = last.sigmaN;
  const sigmaMeanF = last.sigmaMean;
  const meanAligned = roundAtPlace(meanF, measPlaceExp, 'halfUp');

  const tRes = tFactor(nF, p);
  if (tRes.note.includes('超出') || tRes.note.includes('不足')) warnings.push(tRes.note);
  if (rounds.some(r => r.cSource === 'theory')) {
    warnings.push(rounds.find(r => r.cSource === 'theory')!.cNote);
  }
  if (nF < 3) warnings.push('剔除后数据不足 3 个，统计结果仅供参考');

  const deltaA = tRes.tp * sigmaMeanF;
  const deltaB = 0.95 * deltaInstrument;
  const U = Math.sqrt(deltaA * deltaA + deltaB * deltaB);
  const fin = finalizeResult(U, meanAligned, measPlaceExp);

  return {
    rounds, cleanValues, nFinal: nF,
    meanFinal: meanF, meanAligned,
    meanAlignedDisplay: formatAtPlace(meanAligned, measPlaceExp),
    meanFullDisplay: manyDigits(meanF, 8),
    measPlaceExp,
    sigmaNFinal: sigmaNF, sigmaMeanFinal: sigmaMeanF,
    tp: tRes.tp, tpNote: tRes.note,
    deltaA, deltaB, U, fin, warnings,
  };
}
