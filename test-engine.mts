// 用绪论第 47 页例题验证：63.57 63.58 63.55 63.56 63.56 63.59 63.55 63.54 63.57 63.57，Δ仪=0.05
// 期望：N̄=63.564→63.56，σ_N≈0.015，c=1.96，cσ≈0.0295 无粗差，ΔA≈0.011，ΔB≈0.048，U≈0.05，结果 (63.56±0.05)cm
import { fullAnalysis, parseDataInput, manyDigits } from './src/lib/uncertainty.ts'

const parsed = parseDataInput('63.57 63.58 63.55 63.56 63.56 63.59 63.55 63.54 63.57 63.57')
const r = fullAnalysis(parsed.values, parsed.decimals, 0.05, '0.95')

const rd = r.rounds[0]
console.log('n =', rd.n)
console.log('mean =', manyDigits(rd.mean, 10), '→ 对齐', r.meanAlignedDisplay)
console.log('σ_N =', manyDigits(rd.sigmaN))
console.log('σ_N̄ =', manyDigits(rd.sigmaMean))
console.log('c =', rd.c, '| c·σ_N =', manyDigits(rd.limit))
console.log('剔除数 =', rd.rejected.length)
console.log('t_0.95 =', r.tp)
console.log('ΔA =', manyDigits(r.deltaA))
console.log('ΔB =', manyDigits(r.deltaB))
console.log('U(raw) =', manyDigits(r.U, 8), '→ 修约', r.fin.UDisplay)
console.log('修约说明:', r.fin.notes.join('；'))
console.log('最终结果: (' + r.fin.finalMeanDisplay + ' ± ' + r.fin.UDisplay + ')')

// 断言
const assert = (cond: boolean, msg: string) => { if (!cond) { console.error('FAIL:', msg); process.exit(1) } }
assert(rd.n === 10, 'n=10')
assert(r.meanAlignedDisplay === '63.56', 'mean 63.56')
assert(Math.abs(rd.sigmaN - 0.0150554) < 1e-6, 'σ_N≈0.0150554, got ' + rd.sigmaN)
assert(rd.c === 1.96, 'c=1.96')
assert(rd.rejected.length === 0, '无粗差')
assert(r.tp === 2.26, 't=2.26')
assert(Math.abs(r.deltaA - 0.01076) < 1e-5, 'ΔA≈0.01076')
assert(Math.abs(r.deltaB - 0.0475) < 1e-9, 'ΔB=0.0475')
assert(r.fin.UDisplay === '0.05', 'U=0.05')
assert(r.fin.finalMeanDisplay === '63.56', 'final mean 63.56')
console.log('\n✓ 绪论例题验证通过')

// 验证修约规则的三个幻灯片案例（N̄=1.234mm）
import { finalizeResult } from './src/lib/uncertainty.ts'
const cases: Array<[number, string, string]> = [
  [0.007, '0.007', '1.234'],   // 案例1: U=0.00α
  [0.0004, '0.0004', '1.2340'],// 案例2 α≤5
  [0.0005, '0.0005', '1.2340'],// 案例2 α=5（凑偶边界）
  [0.0007, '0.001', '1.234'],  // 案例2 α≥6
  [0.047, '0.05', '1.23'],     // 案例3 3≤α≤9
  [0.014, '0.014', '1.234'],   // 案例3 α≤2
]
for (const [U, eu, em] of cases) {
  const f = finalizeResult(U, 1.234, -3)
  console.log(`U=${U} → U'=${f.UDisplay}（期望 ${eu}），N̄=${f.finalMeanDisplay}（期望 ${em}）`)
  assert(f.UDisplay === eu && f.finalMeanDisplay === em, `case U=${U}`)
}
console.log('✓ 修约规则 6 个案例全部通过')

// 验证粗差剔除：构造一组含粗差的数据
const p2 = parseDataInput('10.1 10.2 9.9 10.0 10.1 10.2 10.0 15.8')
const r2 = fullAnalysis(p2.values, p2.decimals, 0.05, '0.95')
console.log('\n含粗差组: 轮数 =', r2.rounds.length, '第一轮剔除 =', r2.rounds[0].rejected.map(x => x.seq), '最终 n =', r2.nFinal)
assert(r2.rounds[0].rejected.length === 1 && r2.rounds[0].rejected[0].seq === 8, '剔除第8个')
assert(r2.nFinal === 7, 'n=7')
console.log('✓ 粗差剔除验证通过（剔除第 8 个离群值 15.8）')
