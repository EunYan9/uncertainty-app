import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  fullAnalysis, parseDataInput, manyDigits, roundSigFigs,
  type AnalysisResult, type PKey, type RoundResult,
} from '@/lib/uncertainty'
import {
  loadHistory, saveRecord, deleteRecord, clearHistory, type HistoryRecord,
} from '@/lib/history'

type InstMode = 'marked' | 'estimable' | 'nonestimable'

export default function Home() {
  const [symbol, setSymbol] = useState('N')
  const [unit, setUnit] = useState('')
  const [dataText, setDataText] = useState('')
  const [instMode, setInstMode] = useState<InstMode>('marked')
  const [division, setDivision] = useState('')
  const [deltaInstText, setDeltaInstText] = useState('')
  const [p, setP] = useState<PKey>('0.95')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [rawBySeq, setRawBySeq] = useState<Map<number, string>>(new Map())
  const [inputErrors, setInputErrors] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [historyVersion, setHistoryVersion] = useState(0)

  const history = useMemo(() => loadHistory(), [historyVersion])

  // Δ仪器 辅助计算：可估读取最小分度一半，不可估读取最小分度
  useEffect(() => {
    const d = parseFloat(division)
    if (!isFinite(d) || d <= 0) return
    if (instMode === 'estimable') setDeltaInstText(String(roundSigFigs(d / 2, 10)))
    else if (instMode === 'nonestimable') setDeltaInstText(String(roundSigFigs(d, 10)))
  }, [instMode, division])

  const parsedCount = useMemo(() => parseDataInput(dataText).values.length, [dataText])

  function compute() {
    const parsed = parseDataInput(dataText)
    setInputErrors(parsed.errors)
    const dInst = parseFloat(deltaInstText)
    if (parsed.values.length < 2) { alert('请至少输入 2 个有效数据'); return }
    if (!(dInst > 0)) { alert('请填写有效的 Δ仪器（大于 0）'); return }
    const res = fullAnalysis(parsed.values, parsed.decimals, dInst, p)
    const map = new Map(parsed.raws.map((r, i) => [i + 1, r]))
    setRawBySeq(map)
    setResult(res)
    setCopied(false)
    // 自动保存历史记录
    const sym = symbol.trim() || 'N'
    const u2 = unit.trim()
    const uu2 = u2 ? ` ${u2}` : ''
    const text = buildCopyText(res, { p, uu: uu2, deltaInstText, symbol: sym, rawBySeq: map })
    saveRecord({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: Date.now(),
      symbol: sym, unit: u2, p, deltaInst: deltaInstText, dataText,
      nRaw: parsed.values.length, nFinal: res.nFinal,
      rejectedCount: parsed.values.length - res.nFinal,
      resultText: `${sym} = (${res.fin.finalMeanDisplay} ± ${res.fin.UDisplay})${uu2}`,
      copyText: text,
    })
    setHistoryVersion(v => v + 1)
  }

  function loadRecord(rec: HistoryRecord) {
    setSymbol(rec.symbol); setUnit(rec.unit); setDataText(rec.dataText)
    setInstMode('marked'); setDeltaInstText(rec.deltaInst); setP(rec.p as PKey)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const u = unit.trim()
  const uu = u ? ` ${u}` : ''

  // 拼装抄写区文本
  const copyText = useMemo(() => {
    if (!result) return ''
    return buildCopyText(result, { p, uu, deltaInstText, symbol: symbol.trim() || 'N', rawBySeq })
  }, [result, p, uu, deltaInstText, symbol, rawBySeq])

  function copyAll() {
    navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">粗差剔除与不确定度分析工具</h1>
          <p className="text-sm text-slate-500">
            肖维涅准则剔除粗差 → t 分布 A 类分量 + 仪器误差 B 类分量 → 合成不确定度 U → 按绪论规则修约，直接给出可抄写格式
          </p>
        </header>

        {/* ================= 输入区 ================= */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">输入</CardTitle>
            <CardDescription>数据支持空格 / 逗号 / 换行分隔；请按原始读数填写（位数决定平均值的对齐精度）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>物理量符号</Label>
                <Input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="N" />
              </div>
              <div className="space-y-1.5">
                <Label>单位（可空）</Label>
                <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="cm / mm / g…" />
              </div>
              <div className="space-y-1.5">
                <Label>置信概率 P（查 t_p 表）</Label>
                <Select value={p} onValueChange={v => setP(v as PKey)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.683">68.3%</SelectItem>
                    <SelectItem value="0.90">90%</SelectItem>
                    <SelectItem value="0.95">95%（常用）</SelectItem>
                    <SelectItem value="0.98">98%</SelectItem>
                    <SelectItem value="0.99">99%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>测量数据（已识别 {parsedCount} 个）</Label>
              <Textarea
                rows={4}
                className="font-mono text-sm"
                placeholder="63.57 63.58 63.55 63.56 …"
                value={dataText}
                onChange={e => setDataText(e.target.value)}
              />
            </div>

            {/* Δ仪器：规则直接写在界面上 */}
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 space-y-3">
              <div className="text-sm font-semibold text-sky-900">Δ仪器 的确定规则（防止遗忘）</div>
              <ol className="list-decimal pl-5 text-sm text-sky-900/90 space-y-1">
                <li>仪器误差<b>已注明</b>的，直接取注明值作为 Δ仪器。</li>
                <li>未注明、且<b>能</b>对最小分度的下一位进行估算（可估读）的，取<b>最小分度值的一半</b>。</li>
                <li>未注明、且<b>不能</b>对最小分度下一位进行估算（不可估读，如数字仪表、游标）的，取<b>最小分度值</b>。</li>
              </ol>
              <RadioGroup value={instMode} onValueChange={v => setInstMode(v as InstMode)} className="flex flex-wrap gap-4 pt-1">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="marked" id="m1" /><Label htmlFor="m1">已注明误差</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="estimable" id="m2" /><Label htmlFor="m2">未注明·可估读（分度/2）</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="nonestimable" id="m3" /><Label htmlFor="m3">未注明·不可估读（=分度）</Label>
                </div>
              </RadioGroup>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {instMode !== 'marked' && (
                  <div className="space-y-1.5">
                    <Label>最小分度值</Label>
                    <Input value={division} onChange={e => setDivision(e.target.value)} placeholder="如 0.1" className="font-mono" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Δ仪器{instMode !== 'marked' ? '（已自动算出，可改）' : ''}</Label>
                  <Input value={deltaInstText} onChange={e => setDeltaInstText(e.target.value)} placeholder="如 0.05" className="font-mono" />
                </div>
              </div>
            </div>

            {inputErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>以下输入无法识别为数字，已忽略：{inputErrors.join('、')}</AlertDescription>
              </Alert>
            )}

            <Button className="w-full sm:w-auto" size="lg" onClick={compute}>开始计算</Button>
          </CardContent>
        </Card>

        {result && (
          <>
            {result.warnings.length > 0 && (
              <Alert className="border-amber-300 bg-amber-50">
                <AlertDescription>
                  <ul className="list-disc pl-5 space-y-1">
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* ================= 第一步：粗差剔除 ================= */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">第一步 · 粗差剔除（肖维涅准则 |ΔN_i| ≤ c·σ_N）</CardTitle>
                <CardDescription>
                  注意区分两个“长得很像”的量：剔除限用的是
                  <Badge className="mx-1 bg-blue-600">σ_N 测量值标准偏差</Badge>，
                  后面 ΔA 用的是
                  <Badge className="mx-1 bg-amber-600">σ_N̄ 平均值标准偏差</Badge>，两者差一个 √n
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {result.rounds.map((rd) => (
                  <RoundBlock key={rd.round} rd={rd} totalRounds={result.rounds.length} rawBySeq={rawBySeq} uu={uu} />
                ))}
              </CardContent>
            </Card>

            {/* ================= 第二步：不确定度分析 ================= */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">第二步 · 不确定度分析（剔除后剩余 n′ = {result.nFinal}）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <StatChip color="blue" label="σ_N 测量值标准偏差" hint="分母 n−1（贝塞尔）" value={`${manyDigits(result.sigmaNFinal)}${uu}`} />
                  <StatChip color="amber" label="σ_N̄ 平均值标准偏差" hint="= σ_N ⁄ √n" value={`${manyDigits(result.sigmaMeanFinal)}${uu}`} />
                  <StatChip color="slate" label={`t_${p}（n′=${result.nFinal}）`} hint={result.tpNote} value={String(result.tp)} />
                </div>

                <ExprBox color="amber" title="A 类分量（用 σ_N̄，平均值的标准偏差）">
                  ΔA = t_p·σ_N̄ = {result.tp} × {manyDigits(result.sigmaMeanFinal)} = <b>{manyDigits(result.deltaA)}{uu}</b>
                </ExprBox>

                <ExprBox color="slate" title="B 类分量（仪器误差）">
                  ΔB = 0.95·Δ仪 = 0.95 × {deltaInstText} = <b>{manyDigits(result.deltaB)}{uu}</b>
                </ExprBox>

                <ExprBox color="emerald" title="合成不确定度（先给多保留值）">
                  U = √(ΔA² + ΔB²) = √({manyDigits(result.deltaA)}² + {manyDigits(result.deltaB)}²) = <b>{manyDigits(result.U, 8)}{uu}</b>
                </ExprBox>

                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 space-y-2">
                  <div className="text-sm font-semibold text-emerald-900">U 的修约（绪论 2.2 节规则）</div>
                  <ul className="list-disc pl-5 text-sm text-emerald-900/90 space-y-1">
                    {result.fin.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                  <div className="font-mono text-base pt-1">U = <b>{result.fin.UDisplay}{uu}</b></div>
                </div>

                <Separator />

                <div className="rounded-xl border-2 border-slate-800 bg-white p-6 text-center space-y-1">
                  <div className="text-sm text-slate-500">最终测量结果（平均值末位与 U 对齐）</div>
                  <div className="font-mono text-2xl font-bold">
                    {symbol.trim() || 'N'} = ({result.fin.finalMeanDisplay} ± {result.fin.UDisplay}){uu}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ================= 抄写区 ================= */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">抄写区</CardTitle>
                  <CardDescription>按报告需要的格式整理好了，誊抄或复制均可</CardDescription>
                </div>
                <Button variant="outline" onClick={copyAll}>{copied ? '已复制 ✓' : '一键复制'}</Button>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap rounded-lg bg-slate-900 p-4 font-mono text-sm leading-7 text-slate-100">{copyText}</pre>
              </CardContent>
            </Card>

            {/* 系数表备查 */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full">查看课程系数表（肖维涅 c / t_p）▾</Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Card><CardContent className="pt-6 text-sm space-y-3">
                  <p><b>肖维涅系数 c</b>（n=5…20）：1.65, 1.75, 1.80, 1.86, 1.92, 1.96, 2.00, 2.03, 2.07, 2.10, 2.13, 2.15, 2.18, 2.20, 2.22, 2.24；（n=25,30,40,50,60,70,80,90,100,110,150,200）：2.33, 2.39, 2.50, 2.58, 2.64, 2.69, 2.73, 2.77, 2.81, 2.84, 2.93, 3.02。表外按理论公式 Φ⁻¹(1−1/(4n)) 补。</p>
                  <p><b>t_p</b>（n=3…11 / ∞）：t₀.₉₅ = 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23 / 1.96；其余 P 见绪论表格。n′≥12 取 ∞ 行。</p>
                </CardContent></Card>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        {/* ================= 历史记录 ================= */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">历史记录</CardTitle>
              <CardDescription>每次计算自动保存在本机浏览器里（最多 50 条），写报告时可翻查</CardDescription>
            </div>
            {history.length > 0 && (
              <Button variant="outline" onClick={() => {
                if (confirm('确定清空全部历史记录？此操作不可恢复。')) { clearHistory(); setHistoryVersion(v => v + 1) }
              }}>清空</Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {history.length === 0 && (
              <p className="text-sm text-slate-400">还没有记录——完成一次计算后会自动保存在这里。</p>
            )}
            {history.map((rec) => (
              <div key={rec.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400">{new Date(rec.time).toLocaleString('zh-CN', { hour12: false })}</span>
                  <Badge variant="secondary">n={rec.nRaw}→{rec.nFinal}</Badge>
                  {rec.rejectedCount > 0 && <Badge variant="destructive">剔除 {rec.rejectedCount} 个</Badge>}
                  <span className="font-mono font-bold">{rec.resultText}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => loadRecord(rec)}>载入到输入区</Button>
                  <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(rec.copyText)}>复制完整文本</Button>
                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => { deleteRecord(rec.id); setHistoryVersion(v => v + 1) }}>删除</Button>
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer select-none text-slate-500">展开完整文本</summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-900 p-3 font-mono text-xs leading-6 text-slate-100">{rec.copyText}</pre>
                </details>
              </div>
            ))}
          </CardContent>
        </Card>

        <footer className="space-y-1 pb-8 pt-2 text-center text-xs text-slate-400">
          <div>规则依据：上海科技大学《普通物理实验绪论》2.1–2.2 节 · 肖维涅准则 · t 分布 · GB8170-87 修约</div>
          <div className="font-semibold text-slate-500">版权归EunYan9所有</div>
        </footer>
      </div>
    </div>
  )
}

// ---------------- 抄写文本拼装 ----------------

function buildCopyText(
  result: AnalysisResult,
  opts: { p: string; uu: string; deltaInstText: string; symbol: string; rawBySeq: Map<number, string> },
): string {
  const { p, uu, deltaInstText, symbol, rawBySeq } = opts
  const lines: string[] = []
  lines.push('【粗差剔除（肖维涅准则）】')
  result.rounds.forEach((rd) => {
    if (result.rounds.length > 1) lines.push(`— 第 ${rd.round} 轮（n=${rd.n}）—`)
    lines.push(`n = ${rd.n}`)
    lines.push(`N̄ = ${manyDigits(rd.mean, 10)} ≈ ${result.meanAlignedDisplay}${uu}（平均值与测量值位数对齐）`)
    lines.push(`σ_N（测量值标准偏差）= ${manyDigits(rd.sigmaN)}${uu}`)
    lines.push(`σ_N̄（平均值标准偏差）= ${manyDigits(rd.sigmaMean)}${uu}`)
    lines.push(`肖维涅系数 c(n=${rd.n}) = ${rd.c}${rd.cSource === 'theory' ? '（理论公式补得）' : ''}`)
    lines.push(`剔除限 c·σ_N = ${rd.c} × ${manyDigits(rd.sigmaN)} = ${manyDigits(rd.limit)}${uu}`)
    rd.rows.forEach((row) => {
      const raw = rawBySeq.get(row.seq) ?? String(row.value)
      lines.push(`ΔN_${row.seq} = ${raw} − ${manyDigits(rd.mean, 10)} = ${row.dev >= 0 ? '+' : ''}${manyDigits(row.dev)}${uu}  |ΔN_${row.seq}| = ${manyDigits(row.absDev)} ${row.reject ? `> ${manyDigits(rd.limit)} → 剔除` : `≤ ${manyDigits(rd.limit)} → 保留`}`)
    })
    if (rd.rejected.length > 0) {
      lines.push(`本轮剔除：${rd.rejected.map(r => `第 ${r.seq} 个（${rawBySeq.get(r.seq) ?? r.value}）`).join('、')}`)
    } else {
      lines.push('本轮无粗差，通过检验')
    }
  })
  lines.push('')
  lines.push(`【不确定度分析】（剔除后 n' = ${result.nFinal}）`)
  lines.push(`t_${p}(n'=${result.nFinal}) = ${result.tp}`)
  lines.push(`ΔA = t_p·σ_N̄ = ${result.tp} × ${manyDigits(result.sigmaMeanFinal)} = ${manyDigits(result.deltaA)}${uu}`)
  lines.push(`ΔB = 0.95·Δ仪 = 0.95 × ${deltaInstText} = ${manyDigits(result.deltaB)}${uu}`)
  lines.push(`U = √(ΔA² + ΔB²) = √(${manyDigits(result.deltaA)}² + ${manyDigits(result.deltaB)}²) = ${manyDigits(result.U, 8)}${uu}`)
  lines.push(`U 修约：${result.fin.notes.join('；')}，U = ${result.fin.UDisplay}${uu}`)
  lines.push(`${symbol} = (${result.fin.finalMeanDisplay} ± ${result.fin.UDisplay})${uu}`)
  return lines.join('\n')
}

// ---------------- 子组件 ----------------

function StatChip({ color, label, hint, value }: { color: 'blue' | 'amber' | 'slate'; label: string; hint: string; value: string }) {
  const colorCls = {
    blue: 'border-blue-300 bg-blue-50 text-blue-900',
    amber: 'border-amber-300 bg-amber-50 text-amber-900',
    slate: 'border-slate-300 bg-slate-100 text-slate-900',
  }[color]
  return (
    <div className={`min-w-[210px] flex-1 rounded-lg border p-3 ${colorCls}`}>
      <div className="text-xs font-semibold">{label}</div>
      <div className="text-[11px] opacity-70">{hint}</div>
      <div className="font-mono text-lg font-bold">{value}</div>
    </div>
  )
}

function ExprBox({ color, title, children }: { color: 'blue' | 'amber' | 'slate' | 'emerald'; title: string; children: React.ReactNode }) {
  const colorCls = {
    blue: 'border-blue-300 bg-blue-50',
    amber: 'border-amber-300 bg-amber-50',
    slate: 'border-slate-300 bg-slate-100',
    emerald: 'border-emerald-300 bg-emerald-50',
  }[color]
  return (
    <div className={`rounded-lg border p-3 ${colorCls}`}>
      <div className="text-xs font-semibold text-slate-600">{title}</div>
      <div className="font-mono text-[15px] leading-7">{children}</div>
    </div>
  )
}

function RoundBlock({ rd, totalRounds, rawBySeq, uu }: { rd: RoundResult; totalRounds: number; rawBySeq: Map<number, string>; uu: string }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      {totalRounds > 1 && (
        <div className="text-sm font-bold text-slate-700">
          第 {rd.round} 轮{rd.round === 1 ? '（原始数据）' : '（剔除后重新计算）'}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <StatChip color="slate" label="数据个数 n" hint="" value={String(rd.n)} />
        <StatChip color="slate" label="算术平均值 N̄（多保留）" hint="与测量值对齐后见最终结果" value={manyDigits(rd.mean, 10)} />
        <StatChip color="blue" label="σ_N 测量值标准偏差" hint="分母 n−1（贝塞尔）" value={`${manyDigits(rd.sigmaN)}${uu}`} />
        <StatChip color="amber" label="σ_N̄ 平均值标准偏差" hint="= σ_N ⁄ √n" value={`${manyDigits(rd.sigmaMean)}${uu}`} />
      </div>

      <ExprBox color="blue" title={`肖维涅剔除限（用 σ_N，测量值的标准偏差） · ${rd.cNote}`}>
        c·σ_N = {rd.c} × {manyDigits(rd.sigmaN)} = <b>{manyDigits(rd.limit)}{uu}</b>
      </ExprBox>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">序号</TableHead>
              <TableHead>测量值 N_i</TableHead>
              <TableHead>偏差 ΔN_i = N_i − N̄</TableHead>
              <TableHead>|ΔN_i| 与 c·σ_N = {manyDigits(rd.limit)} 比较</TableHead>
              <TableHead className="w-20">判定</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rd.rows.map((row) => (
              <TableRow key={row.seq} className={row.reject ? 'bg-red-50' : ''}>
                <TableCell className="font-mono">{row.seq}</TableCell>
                <TableCell className="font-mono">{rawBySeq.get(row.seq) ?? row.value}</TableCell>
                <TableCell className="font-mono">{row.dev >= 0 ? '+' : ''}{manyDigits(row.dev)}</TableCell>
                <TableCell className="font-mono">{manyDigits(row.absDev)} {row.reject ? '>' : '≤'} {manyDigits(rd.limit)}</TableCell>
                <TableCell>
                  {row.reject
                    ? <Badge variant="destructive">剔除</Badge>
                    : <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">保留</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className={`rounded-lg p-3 text-sm font-semibold ${rd.rejected.length > 0 ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
        {rd.rejected.length > 0
          ? `本轮剔除：${rd.rejected.map(r => `第 ${r.seq} 个数据（${rawBySeq.get(r.seq) ?? r.value}）`).join('、')}，剩余 ${rd.n - rd.rejected.length} 个${rd.round < totalRounds ? '，进入下一轮复核' : ''}`
          : `本轮无粗差：所有 |ΔN_i| ≤ c·σ_N，数据组通过肖维涅准则检验（共 ${rd.n} 个）`}
      </div>
    </div>
  )
}
