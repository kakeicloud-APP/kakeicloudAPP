/**

- kakeicloud v1.8.7 | 2026/05/20
- kakeicloud-app/app/import/page.tsx
  */

‘use client’
import { useEffect, useRef, useState } from ‘react’
import { supabase } from ‘../../lib/supabase’
import { VERSION } from ‘../../lib/version’

type ImportRow = {
id: string
date: string
description: string
amount: number
status: ‘keiji’ | ‘kataji’ | ‘confirm’ | ‘pending’
account?: string
}

type ClassificationRule = {
id: string
keyword: string
action: string
account: string | null
person: string
priority: number
}

type PaymentAccount = {
id: string
kind: string
name: string
person: string
}

type ReceiptData = {
store_name: string
date: string
amount: number
tax_amount: number
tax_rate: number
memo: string
account: string
invoice_no: string
}

type ReceiptKind = ‘経費’ | ‘医療費’ | ‘ふるさと納税’ | ‘家事’

const TABS = [‘弥生CSV’, ‘カードCSV’, ‘PDF’, ‘レシート’]

const KEIJI_ACCOUNTS = [
‘消耗品費’, ‘通信費’, ‘旅費交通費’, ‘接待交際費’, ‘地代家賃’,
‘水道光熱費’, ‘修繕費’, ‘広告宣伝費’, ‘外注費’, ‘減価償却費’, ‘雑費’, ‘開業費償却’
]

const KIND_TO_ACCOUNT: Record<ReceiptKind, string> = {
‘経費’: ‘’,
‘医療費’: ‘医療費’,
‘ふるさと納税’: ‘寄附金’,
‘家事’: ‘家事’,
}

const KIND_TO_TAX_TYPE: Record<ReceiptKind, string> = {
‘経費’: ‘課税仕入’,
‘医療費’: ‘対象外’,
‘ふるさと納税’: ‘対象外’,
‘家事’: ‘対象外’,
}

export default function ImportPage() {
const [tab, setTab] = useState(‘カードCSV’)
const [person, setPerson] = useState<‘hiroshi’ | ‘wife’>(‘hiroshi’)
const [rows, setRows] = useState<ImportRow[]>([])
const [loading, setLoading] = useState(false)
const [saving, setSaving] = useState(false)
const [errorMsg, setErrorMsg] = useState<string | null>(null)
const [rules, setRules] = useState<ClassificationRule[]>([])
const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([])
const [selectedAccountId, setSelectedAccountId] = useState(’’)
const [swipeStart, setSwipeStart] = useState<{ id: string; x: number } | null>(null)
const [swipeOffset, setSwipeOffset] = useState<{ [id: string]: number }>({})

const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)
const [receiptKind, setReceiptKind] = useState<ReceiptKind>(‘経費’)
const [receiptAccount, setReceiptAccount] = useState(KEIJI_ACCOUNTS[0])
const [savingReceipt, setSavingReceipt] = useState(false)

const fileRef = useRef<HTMLInputElement>(null)
const cameraRef = useRef<HTMLInputElement>(null)

useEffect(() => { fetchMasters() }, [person])

async function fetchMasters() {
const [{ data: r }, { data: p }] = await Promise.all([
supabase.from(‘classification_rules’).select(’*’).order(‘priority’, { ascending: false }),
supabase.from(‘payment_accounts’).select(’*’).eq(‘is_active’, true)
.or(`person.eq.${person},person.eq.both`),
])
setRules(r || [])
setPaymentAccounts(p || [])
if (p && p.length > 0) setSelectedAccountId(p[0].id)
}

function applyRules(rows: ImportRow[]): ImportRow[] {
const sorted = […rules].sort((a, b) => b.priority - a.priority)
return rows.map(r => {
const matched = sorted.find(rule =>
r.description.toUpperCase().includes(rule.keyword.toUpperCase())
)
if (!matched) return { …r, status: ‘pending’ }
return {
…r,
status: matched.action as ImportRow[‘status’],
account: matched.account || r.account,
}
})
}

function parseYayoiCSV(text: string): ImportRow[] {
const lines = text.split(’\n’).filter(l => l.trim())
return lines.slice(1).map((line, i) => {
const cols = line.split(’,’).map(c => c.replace(/”/g, ‘’).trim())
if (!cols[0]) return null
return {
id: `y-${i}`,
date: cols[0],
description: cols[4] || ‘’,
amount: parseInt(cols[2] || cols[3] || ‘0’) || 0,
status: ‘pending’ as const,
account: cols[1] || ‘’,
}
}).filter(Boolean) as ImportRow[]
}

function parseCardCSV(text: string): ImportRow[] {
const lines = text.split(’\n’).filter(l => l.trim())
return lines.slice(1).map((line, i) => {
const cols = line.split(’,’).map(c => c.replace(/”/g, ‘’).trim())
if (!cols[0]) return null
const amount = parseInt(cols[3]?.replace(/[^0-9-]/g, ‘’) || ‘0’) || 0
if (amount <= 0) return null
return {
id: `c-${i}`,
date: cols[0].replace(///g, ‘-’),
description: cols[1] || cols[2] || ‘’,
amount,
status: ‘pending’ as const,
}
}).filter(Boolean) as ImportRow[]
}

async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
const file = e.target.files?.[0]
if (!file) return
setLoading(true)
setErrorMsg(null)

```
try {
  if (tab === 'レシート') {
    await handleReceipt(file)
    return
  }

  let parsed: ImportRow[] = []

  if (tab === '弥生CSV') {
    const text = await file.text()
    parsed = parseYayoiCSV(text)
  } else if (tab === 'カードCSV') {
    const text = await file.text()
    parsed = applyRules(parseCardCSV(text))
  } else if (tab === 'PDF') {
    parsed = await handlePDF(file)
    parsed = applyRules(parsed)
  }

  setRows(parsed)
  if (parsed.length === 0) {
    alert('取引データが見つかりませんでした。ファイルを確認してください。')
  }

} catch (error: any) {
  const msg = error.message || 'もう一度試してください'
  setErrorMsg(msg)
  alert(`取込エラー：${msg}`)
} finally {
  setLoading(false)
  if (fileRef.current) fileRef.current.value = ''
  if (cameraRef.current) cameraRef.current.value = ''
}
```

}

async function handlePDF(file: File): Promise<ImportRow[]> {
const base64 = await fileToBase64(file)
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 25000)

```
let res: Response
try {
  res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'pdf', imageBase64: base64, mediaType: 'application/pdf' }),
    signal: controller.signal,
  })
} catch (e: any) {
  clearTimeout(timer)
  if (e.name === 'AbortError') throw new Error('タイムアウト（25秒）：APIが応答しませんでした')
  throw new Error(`通信エラー：${e.message}`)
}
clearTimeout(timer)

const text = await res.text()
if (!res.ok) throw new Error(`APIエラー ${res.status}：${text}`)

let json: any
try { json = JSON.parse(text) } catch { throw new Error(`レスポンス解析失敗：${text.slice(0, 200)}`) }

if (json.error) throw new Error(json.error)
if (!Array.isArray(json.data)) throw new Error(`データ形式エラー：${text.slice(0, 200)}`)

return json.data.map((d: any, i: number) => ({
  id: `pdf-${i}`,
  date: d.date || '',
  description: d.description || '',
  amount: Math.abs(d.amount || 0),
  status: 'pending' as const,
}))
```

}

async function handleReceipt(file: File) {
const base64 = await fileToBase64(file)
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 25000)

```
let res: Response
try {
  res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'receipt', imageBase64: base64, mediaType: file.type || 'image/jpeg' }),
    signal: controller.signal,
  })
} catch (e: any) {
  clearTimeout(timer)
  if (e.name === 'AbortError') throw new Error('タイムアウト（25秒）：APIが応答しませんでした')
  throw new Error(`通信エラー：${e.message}`)
}
clearTimeout(timer)

const text = await res.text()
if (!res.ok) throw new Error(`APIエラー ${res.status}：${text}`)

let json: any
try { json = JSON.parse(text) } catch { throw new Error(`レスポンス解析失敗：${text.slice(0, 200)}`) }

if (json.error) throw new Error(json.error)
if (!json.data) throw new Error('データを読み取れませんでした')

setReceiptData(json.data)
setReceiptKind('経費')
setReceiptAccount(json.data.account || KEIJI_ACCOUNTS[0])
```

}

async function saveReceipt() {
if (!receiptData) return
setSavingReceipt(true)
try {
if (receiptKind === ‘家事’) {
setReceiptData(null)
alert(‘家事として記録しました（保存スキップ）’)
return
}

```
  const account = receiptKind === '経費' ? receiptAccount : KIND_TO_ACCOUNT[receiptKind]
  const year = parseInt(receiptData.date.split('-')[0])

  const { error } = await supabase.from('transactions').insert({
    person,
    date: receiptData.date,
    account,
    amount: receiptData.amount,
    tax_type: KIND_TO_TAX_TYPE[receiptKind],
    tax_rate: receiptKind === '経費' ? receiptData.tax_rate : 0,
    tax_amount: receiptKind === '経費' ? receiptData.tax_amount : 0,
    invoice_no: receiptData.invoice_no || null,
    method: '未払金',
    memo: receiptData.memo || receiptData.store_name,
    year,
    is_closing: false,
    is_confirmed: false,
  })

  if (error) throw new Error(error.message)
  setReceiptData(null)
  alert('登録しました！')
} catch (e: any) {
  alert(`保存エラー：${e.message}`)
} finally {
  setSavingReceipt(false)
}
```

}

function fileToBase64(file: File): Promise<string> {
return new Promise((resolve, reject) => {
const reader = new FileReader()
reader.onload = () => resolve((reader.result as string).split(’,’)[1])
reader.onerror = () => reject(new Error(‘ファイル読込エラー’))
reader.readAsDataURL(file)
})
}

function onTouchStart(id: string, x: number) { setSwipeStart({ id, x }) }
function onTouchMove(id: string, x: number) {
if (!swipeStart || swipeStart.id !== id) return
const diff = x - swipeStart.x
if (diff > 0) setSwipeOffset(prev => ({ …prev, [id]: Math.min(diff, 100) }))
}
function onTouchEnd(id: string) {
if ((swipeOffset[id] || 0) > 60) {
setRows(prev => prev.map(r => r.id === id ? { …r, status: ‘kataji’ } : r))
}
setSwipeOffset(prev => ({ …prev, [id]: 0 }))
setSwipeStart(null)
}
function toggleStatus(id: string) {
setRows(prev => prev.map(r => {
if (r.id !== id) return r
const next: ImportRow[‘status’] = r.status === ‘kataji’ ? ‘pending’ : ‘kataji’
return { …r, status: next }
}))
}

async function saveToStaging() {
if (rows.length === 0) { alert(‘データがありません’); return }
if (!confirm(`${rows.length}件をstagingに保存します。よろしいですか？`)) return
setSaving(true)
try {
const selectedAccount = paymentAccounts.find(a => a.id === selectedAccountId)
const sourceName = selectedAccount?.name || ‘不明’
const sourceType = selectedAccount?.kind || ‘card’
for (const r of rows) {
await supabase.from(‘import_staging’).insert({
person, source_type: sourceType, source_name: sourceName,
date: r.date, description: r.description, amount: r.amount, status: r.status,
})
}
alert(`${rows.length}件を保存しました！`)
setRows([])
} catch (error: any) {
alert(`保存エラー：${error.message}`)
} finally {
setSaving(false)
}
}

const statusStyle = (status: ImportRow[‘status’], amount: number) => {
if (status === ‘kataji’) return { bg: ‘#f3f4f6’, border: ‘#9ca3af’, label: ‘家事’, color: ‘#6b7280’ }
if (status === ‘keiji’) return { bg: ‘#f0fdf4’, border: ‘#16a34a’, label: ‘経費’, color: ‘#16a34a’ }
if (status === ‘confirm’) return { bg: ‘#fffbeb’, border: ‘#f59e0b’, label: ‘要確認’, color: ‘#d97706’ }
if (amount >= 30000) return { bg: ‘#fef2f2’, border: ‘#dc2626’, label: ‘¥30,000+’, color: ‘#dc2626’ }
if (amount >= 10000) return { bg: ‘#fffbeb’, border: ‘#f59e0b’, label: ‘¥10,000+’, color: ‘#d97706’ }
return { bg: ‘white’, border: ‘#e5e7eb’, label: ‘’, color: ‘#6b7280’ }
}

const counts = {
keiji: rows.filter(r => r.status === ‘keiji’).length,
kataji: rows.filter(r => r.status === ‘kataji’).length,
confirm: rows.filter(r => r.status === ‘confirm’).length,
pending: rows.filter(r => r.status === ‘pending’).length,
}

return (
<div style={{ padding: ‘16px’, fontFamily: ‘sans-serif’, maxWidth: ‘800px’, margin: ‘0 auto’ }}>

```
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
    <a href="/" style={{ padding: '8px 16px', background: '#e5e7eb', borderRadius: '6px', textDecoration: 'none', color: 'black', fontSize: '14px' }}>← 戻る</a>
    <h1 style={{ margin: 0, fontSize: '20px' }}>📥 インポート</h1>
    <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: 'auto' }}>{VERSION}</span>
  </div>

  {errorMsg && (
    <div style={{ background: '#fef2f2', border: '1px solid #dc2626', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#dc2626', wordBreak: 'break-all' }}>
      ❌ {errorMsg}
    </div>
  )}

  <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
    <button onClick={() => setPerson('hiroshi')}
      style={{ padding: '8px 20px', background: person === 'hiroshi' ? '#2563eb' : '#e5e7eb', color: person === 'hiroshi' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>廣！</button>
    <button onClick={() => setPerson('wife')}
      style={{ padding: '8px 20px', background: person === 'wife' ? '#2563eb' : '#e5e7eb', color: person === 'wife' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>妻</button>
  </div>

  <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', overflowX: 'auto' }}>
    {TABS.map(t => (
      <button key={t} onClick={() => { setTab(t); setRows([]); setErrorMsg(null); setReceiptData(null) }}
        style={{ padding: '8px 16px', background: tab === t ? '#7c3aed' : '#e5e7eb', color: tab === t ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '13px' }}>{t}</button>
    ))}
  </div>

  {(tab === 'カードCSV' || tab === 'PDF') && (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#374151' }}>取込元口座</label>
      {paymentAccounts.length > 0 ? (
        <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}
          style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}>
          {paymentAccounts.map(a => (
            <option key={a.id} value={a.id}>{a.name}（{a.kind}）</option>
          ))}
        </select>
      ) : (
        <div style={{ padding: '10px', background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '8px', fontSize: '13px', color: '#92400e' }}>
          ⚙️ 設定から口座を登録してください
        </div>
      )}
    </div>
  )}

  {tab !== 'レシート' && (
    <div style={{ marginBottom: '16px' }}>
      <input ref={fileRef} type="file" accept={tab === 'PDF' ? '.pdf' : '.csv'}
        onChange={handleFile} style={{ display: 'none' }} />
      <button onClick={() => fileRef.current?.click()} disabled={loading}
        style={{ width: '100%', padding: '14px', background: loading ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
        {loading ? '解析中... しばらくお待ちください' : `📁 ${tab}ファイルを選択`}
      </button>
    </div>
  )}

  {tab === 'レシート' && !receiptData && (
    <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        onChange={handleFile} style={{ display: 'none' }} />
      <button onClick={() => cameraRef.current?.click()} disabled={loading}
        style={{ flex: 1, padding: '14px', background: loading ? '#9ca3af' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
        {loading ? 'AI読取中...' : '📷 カメラで撮影'}
      </button>
      <input ref={fileRef} type="file" accept="image/*"
        onChange={handleFile} style={{ display: 'none' }} />
      <button onClick={() => fileRef.current?.click()} disabled={loading}
        style={{ flex: 1, padding: '14px', background: loading ? '#9ca3af' : '#0891b2', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
        {loading ? 'AI読取中...' : '🖼 写真を選択'}
      </button>
    </div>
  )}

  {receiptData && (
    <div style={{ background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
      <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#16a34a' }}>
        ✅ AI読取完了 - 内容確認
      </div>
      <div style={{ background: 'white', borderRadius: '8px', padding: '12px', marginBottom: '12px', fontSize: '13px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#6b7280' }}>日付</span><span>{receiptData.date}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#6b7280' }}>店名</span><span>{receiptData.store_name}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#6b7280' }}>金額（税込）</span>
          <span style={{ fontWeight: 'bold', fontSize: '16px' }}>¥{receiptData.amount.toLocaleString()}</span>
        </div>
        {receiptData.tax_amount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#6b7280' }}>消費税</span>
            <span>¥{receiptData.tax_amount.toLocaleString()}（{receiptData.tax_rate}%）</span>
          </div>
        )}
        {receiptData.invoice_no && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>登録番号</span>
            <span style={{ fontSize: '11px' }}>{receiptData.invoice_no}</span>
          </div>
        )}
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: '#374151' }}>種別</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(['経費', '医療費', 'ふるさと納税', '家事'] as ReceiptKind[]).map(k => (
            <button key={k} onClick={() => setReceiptKind(k)}
              style={{ padding: '8px 14px', background: receiptKind === k ? '#7c3aed' : '#e5e7eb', color: receiptKind === k ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
              {k}
            </button>
          ))}
        </div>
      </div>
      {receiptKind === '経費' && (
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: '#374151' }}>科目</label>
          <select value={receiptAccount} onChange={e => setReceiptAccount(e.target.value)}
            style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}>
            {KEIJI_ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={saveReceipt} disabled={savingReceipt}
          style={{ flex: 1, padding: '14px', background: savingReceipt ? '#9ca3af' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: savingReceipt ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
          {savingReceipt ? '登録中...' : '💾 登録'}
        </button>
        <button onClick={() => setReceiptData(null)}
          style={{ padding: '14px 20px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
          やり直し
        </button>
      </div>
    </div>
  )}

  {rows.length > 0 && (
    <>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', fontSize: '12px' }}>
        <span style={{ color: '#16a34a' }}>🟢 経費：{counts.keiji}件</span>
        <span style={{ color: '#6b7280' }}>⬜ 家事：{counts.kataji}件</span>
        <span style={{ color: '#d97706' }}>🟡 要確認：{counts.confirm}件</span>
        <span style={{ color: '#374151' }}>⬜ 未分類：{counts.pending}件</span>
      </div>
      <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '12px' }}>
        ← 右スワイプまたはタップで家事⇔未分類切替
      </div>
    </>
  )}

  {rows.map(r => {
    const s = statusStyle(r.status, r.amount)
    const offset = swipeOffset[r.id] || 0
    return (
      <div key={r.id} style={{ position: 'relative', marginBottom: '6px', overflow: 'hidden', borderRadius: '8px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '70px', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#6b7280', fontWeight: 'bold' }}>
          家事 →
        </div>
        <div
          onClick={() => toggleStatus(r.id)}
          onTouchStart={e => onTouchStart(r.id, e.touches[0].clientX)}
          onTouchMove={e => onTouchMove(r.id, e.touches[0].clientX)}
          onTouchEnd={() => onTouchEnd(r.id)}
          style={{
            transform: `translateX(${offset}px)`,
            transition: offset === 0 ? 'transform 0.2s' : 'none',
            background: s.bg, border: `1px solid ${s.border}`,
            borderLeft: `4px solid ${s.border}`, borderRadius: '8px',
            padding: '10px 12px', opacity: r.status === 'kataji' ? 0.5 : 1, cursor: 'pointer',
          }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>{r.date}</span>
                {s.label && (
                  <span style={{ fontSize: '10px', background: s.border, color: 'white', padding: '1px 6px', borderRadius: '4px' }}>{s.label}</span>
                )}
              </div>
              <div style={{ fontSize: '13px' }}>{r.description}</div>
              {r.account && <div style={{ fontSize: '11px', color: '#6b7280' }}>{r.account}</div>}
            </div>
            <div style={{ fontSize: '15px', fontWeight: 'bold', marginLeft: '12px', flexShrink: 0 }}>
              ¥{r.amount.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    )
  })}

  {rows.length > 0 && (
    <div style={{ marginTop: '16px', display: 'flex', gap: '8px', position: 'sticky', bottom: '16px' }}>
      <button onClick={saveToStaging} disabled={saving}
        style={{ flex: 1, padding: '14px', background: saving ? '#9ca3af' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: saving ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
        {saving ? '保存中...' : `💾 ${rows.length}件をstagingに保存`}
      </button>
      <button onClick={() => setRows([])}
        style={{ padding: '14px 20px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>クリア</button>
    </div>
  )}
</div>
```

)
}
