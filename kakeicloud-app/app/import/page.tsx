/**
 * kakeicloud v1.8.8 | 2026/05/20
 * kakeicloud-app/app/import/page.tsx
 */

'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { VERSION } from '../../lib/version'

type ImportRow = {
  id: string
  date: string
  description: string
  amount: number
  status: 'keiji' | 'kataji' | 'confirm' | 'pending'
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

type ReceiptKind = 'keiji' | 'iryo' | 'furusato' | 'kaji'

const TABS = ['CSV', 'PDF', 'receipt']

const KEIJI_ACCOUNTS = [
  'shoumouhin', 'tsuushinhi', 'ryohi', 'settai', 'chidai',
  'koudouhi', 'shuurihi', 'koukoku', 'gaichuu', 'genka', 'zappi', 'kaigyo'
]

const RECEIPT_KINDS = [
  { key: 'keiji' as ReceiptKind, label: 'keiji' },
  { key: 'iryo' as ReceiptKind, label: 'iryo' },
  { key: 'furusato' as ReceiptKind, label: 'furusato' },
  { key: 'kaji' as ReceiptKind, label: 'kaji' },
]

const KIND_TO_ACCOUNT: Record<ReceiptKind, string> = {
  keiji: '',
  iryo: 'iryohi',
  furusato: 'kifukin',
  kaji: 'kaji',
}

const KIND_TO_TAX_TYPE: Record<ReceiptKind, string> = {
  keiji: 'kazei',
  iryo: 'taishogai',
  furusato: 'taishogai',
  kaji: 'taishogai',
}

export default function ImportPage() {
  const [tab, setTab] = useState('CSV')
  const [person, setPerson] = useState<'hiroshi' | 'wife'>('hiroshi')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rules, setRules] = useState<ClassificationRule[]>([])
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)
  const [receiptKind, setReceiptKind] = useState<ReceiptKind>('keiji')
  const [receiptAccount, setReceiptAccount] = useState(KEIJI_ACCOUNTS[0])
  const [savingReceipt, setSavingReceipt] = useState(false)
  const [swipeStart, setSwipeStart] = useState<{ id: string; x: number } | null>(null)
  const [swipeOffset, setSwipeOffset] = useState<{ [id: string]: number }>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchMasters() }, [person])

  async function fetchMasters() {
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from('classification_rules').select('*').order('priority', { ascending: false }),
      supabase.from('payment_accounts').select('*').eq('is_active', true)
        .or(`person.eq.${person},person.eq.both`),
    ])
    setRules(r || [])
    setPaymentAccounts(p || [])
    if (p && p.length > 0) setSelectedAccountId(p[0].id)
  }

  function applyRules(rows: ImportRow[]): ImportRow[] {
    const sorted = [...rules].sort((a, b) => b.priority - a.priority)
    return rows.map(r => {
      const matched = sorted.find(rule =>
        r.description.toUpperCase().includes(rule.keyword.toUpperCase())
      )
      if (!matched) return { ...r, status: 'pending' }
      return { ...r, status: matched.action as ImportRow['status'], account: matched.account || r.account }
    })
  }

  function parseCardCSV(text: string): ImportRow[] {
    const lines = text.split('\n').filter(l => l.trim())
    return lines.slice(1).map((line, i) => {
      const cols = line.split(',').map(c => c.replace(/"/g, '').trim())
      if (!cols[0]) return null
      const amount = parseInt(cols[3]?.replace(/[^0-9-]/g, '') || '0') || 0
      if (amount <= 0) return null
      return { id: `c-${i}`, date: cols[0].replace(/\//g, '-'), description: cols[1] || cols[2] || '', amount, status: 'pending' as const }
    }).filter(Boolean) as ImportRow[]
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setErrorMsg(null)
    try {
      if (tab === 'receipt') { await handleReceipt(file); return }
      let parsed: ImportRow[] = []
      if (tab === 'CSV') parsed = applyRules(parseCardCSV(await file.text()))
      else if (tab === 'PDF') { parsed = await handlePDF(file); parsed = applyRules(parsed) }
      setRows(parsed)
      if (parsed.length === 0) alert('data not found')
    } catch (error: any) {
      const msg = error.message || 'error'
      setErrorMsg(msg)
      alert(msg)
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
      if (cameraRef.current) cameraRef.current.value = ''
    }
  }

  async function handlePDF(file: File): Promise<ImportRow[]> {
    const base64 = await fileToBase64(file)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25000)
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
      if (e.name === 'AbortError') throw new Error('timeout 25s')
      throw new Error(`network error: ${e.message}`)
    }
    clearTimeout(timer)
    const text = await res.text()
    if (!res.ok) throw new Error(`API error ${res.status}: ${text}`)
    let json: any
    try { json = JSON.parse(text) } catch { throw new Error(`parse error: ${text.slice(0, 200)}`) }
    if (json.error) throw new Error(json.error)
    if (!Array.isArray(json.data)) throw new Error(`data error: ${text.slice(0, 200)}`)
    return json.data.map((d: any, i: number) => ({
      id: `pdf-${i}`, date: d.date || '', description: d.description || '',
      amount: Math.abs(d.amount || 0), status: 'pending' as const,
    }))
  }

  async function handleReceipt(file: File) {
    const base64 = await fileToBase64(file)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25000)
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
      if (e.name === 'AbortError') throw new Error('timeout 25s')
      throw new Error(`network error: ${e.message}`)
    }
    clearTimeout(timer)
    const text = await res.text()
    if (!res.ok) throw new Error(`API error ${res.status}: ${text}`)
    let json: any
    try { json = JSON.parse(text) } catch { throw new Error(`parse error: ${text.slice(0, 200)}`) }
    if (json.error) throw new Error(json.error)
    if (!json.data) throw new Error('no data')
    setReceiptData(json.data)
    setReceiptKind('keiji')
    setReceiptAccount(json.data.account || KEIJI_ACCOUNTS[0])
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = () => reject(new Error('file read error'))
      reader.readAsDataURL(file)
    })
  }

  async function saveReceipt() {
    if (!receiptData) return
    setSavingReceipt(true)
    try {
      if (receiptKind === 'kaji') { setReceiptData(null); alert('skip'); return }
      const account = receiptKind === 'keiji' ? receiptAccount : KIND_TO_ACCOUNT[receiptKind]
      const year = parseInt(receiptData.date.split('-')[0])
      const { error } = await supabase.from('transactions').insert({
        person, date: receiptData.date, account, amount: receiptData.amount,
        tax_type: KIND_TO_TAX_TYPE[receiptKind],
        tax_rate: receiptKind === 'keiji' ? receiptData.tax_rate : 0,
        tax_amount: receiptKind === 'keiji' ? receiptData.tax_amount : 0,
        invoice_no: receiptData.invoice_no || null,
        method: 'mibaraikin',
        memo: receiptData.memo || receiptData.store_name,
        year, is_closing: false, is_confirmed: false,
      })
      if (error) throw new Error(error.message)
      setReceiptData(null)
      alert('saved')
    } catch (e: any) {
      alert(`save error: ${e.message}`)
    } finally {
      setSavingReceipt(false)
    }
  }

  async function saveToStaging() {
    if (rows.length === 0) { alert('no data'); return }
    if (!confirm(`save ${rows.length} rows?`)) return
    setSaving(true)
    try {
      const selectedAccount = paymentAccounts.find(a => a.id === selectedAccountId)
      const sourceName = selectedAccount?.name || 'unknown'
      const sourceType = selectedAccount?.kind || 'card'
      for (const r of rows) {
        await supabase.from('import_staging').insert({
          person, source_type: sourceType, source_name: sourceName,
          date: r.date, description: r.description, amount: r.amount, status: r.status,
        })
      }
      alert(`saved ${rows.length}`)
      setRows([])
    } catch (error: any) {
      alert(`error: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  function onTouchStart(id: string, x: number) { setSwipeStart({ id, x }) }
  function onTouchMove(id: string, x: number) {
    if (!swipeStart || swipeStart.id !== id) return
    const diff = x - swipeStart.x
    if (diff > 0) setSwipeOffset(prev => ({ ...prev, [id]: Math.min(diff, 100) }))
  }
  function onTouchEnd(id: string) {
    if ((swipeOffset[id] || 0) > 60) setRows(prev => prev.map(r => r.id === id ? { ...r, status: 'kataji' } : r))
    setSwipeOffset(prev => ({ ...prev, [id]: 0 }))
    setSwipeStart(null)
  }
  function toggleStatus(id: string) {
    setRows(prev => prev.map(r => r.id !== id ? r : { ...r, status: r.status === 'kataji' ? 'pending' : 'kataji' }))
  }

  const counts = {
    keiji: rows.filter(r => r.status === 'keiji').length,
    kataji: rows.filter(r => r.status === 'kataji').length,
    confirm: rows.filter(r => r.status === 'confirm').length,
    pending: rows.filter(r => r.status === 'pending').length,
  }

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <a href="/" style={{ padding: '8px 16px', background: '#e5e7eb', borderRadius: '6px', textDecoration: 'none', color: 'black', fontSize: '14px' }}>back</a>
        <h1 style={{ margin: 0, fontSize: '20px' }}>import</h1>
        <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: 'auto' }}>{VERSION}</span>
      </div>

      {errorMsg && (
        <div style={{ background: '#fef2f2', border: '1px solid #dc2626', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#dc2626', wordBreak: 'break-all' }}>
          {errorMsg}
        </div>
      )}

      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
        <button onClick={() => setPerson('hiroshi')} style={{ padding: '8px 20px', background: person === 'hiroshi' ? '#2563eb' : '#e5e7eb', color: person === 'hiroshi' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>hiroshi</button>
        <button onClick={() => setPerson('wife')} style={{ padding: '8px 20px', background: person === 'wife' ? '#2563eb' : '#e5e7eb', color: person === 'wife' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>wife</button>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setRows([]); setErrorMsg(null); setReceiptData(null) }}
            style={{ padding: '8px 16px', background: tab === t ? '#7c3aed' : '#e5e7eb', color: tab === t ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>{t}</button>
        ))}
      </div>

      {(tab === 'CSV' || tab === 'PDF') && paymentAccounts.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}
            style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}>
            {paymentAccounts.map(a => <option key={a.id} value={a.id}>{a.name}({a.kind})</option>)}
          </select>
        </div>
      )}

      {tab !== 'receipt' && (
        <div style={{ marginBottom: '16px' }}>
          <input ref={fileRef} type="file" accept={tab === 'PDF' ? '.pdf' : '.csv'} onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={loading}
            style={{ width: '100%', padding: '14px', background: loading ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
            {loading ? 'loading...' : `select ${tab}`}
          </button>
        </div>
      )}

      {tab === 'receipt' && !receiptData && (
        <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => cameraRef.current?.click()} disabled={loading}
            style={{ flex: 1, padding: '14px', background: loading ? '#9ca3af' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
            {loading ? 'reading...' : 'camera'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={loading}
            style={{ flex: 1, padding: '14px', background: loading ? '#9ca3af' : '#0891b2', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
            {loading ? 'reading...' : 'photo'}
          </button>
        </div>
      )}

      {receiptData && (
        <div style={{ background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#16a34a' }}>AI read OK</div>
          <div style={{ background: 'white', borderRadius: '8px', padding: '12px', marginBottom: '12px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#6b7280' }}>date</span><span>{receiptData.date}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#6b7280' }}>store</span><span>{receiptData.store_name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#6b7280' }}>amount</span>
              <span style={{ fontWeight: 'bold', fontSize: '16px' }}>Y{receiptData.amount.toLocaleString()}</span>
            </div>
            {receiptData.tax_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>tax</span>
                <span>Y{receiptData.tax_amount.toLocaleString()}({receiptData.tax_rate}%)</span>
              </div>
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {RECEIPT_KINDS.map(k => (
                <button key={k.key} onClick={() => setReceiptKind(k.key)}
                  style={{ padding: '8px 14px', background: receiptKind === k.key ? '#7c3aed' : '#e5e7eb', color: receiptKind === k.key ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          {receiptKind === 'keiji' && (
            <div style={{ marginBottom: '12px' }}>
              <select value={receiptAccount} onChange={e => setReceiptAccount(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}>
                {KEIJI_ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={saveReceipt} disabled={savingReceipt}
              style={{ flex: 1, padding: '14px', background: savingReceipt ? '#9ca3af' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: savingReceipt ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
              {savingReceipt ? 'saving...' : 'save'}
            </button>
            <button onClick={() => setReceiptData(null)}
              style={{ padding: '14px 20px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>retry</button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', fontSize: '12px' }}>
          <span style={{ color: '#16a34a' }}>keiji:{counts.keiji}</span>
          <span style={{ color: '#6b7280' }}>kaji:{counts.kataji}</span>
          <span style={{ color: '#d97706' }}>confirm:{counts.confirm}</span>
          <span style={{ color: '#374151' }}>pending:{counts.pending}</span>
        </div>
      )}

      {rows.map(r => {
        const offset = swipeOffset[r.id] || 0
        const bg = r.status === 'kataji' ? '#f3f4f6' : r.status === 'keiji' ? '#f0fdf4' : r.status === 'confirm' ? '#fffbeb' : 'white'
        const border = r.status === 'kataji' ? '#9ca3af' : r.status === 'keiji' ? '#16a34a' : r.status === 'confirm' ? '#f59e0b' : '#e5e7eb'
        return (
          <div key={r.id} style={{ position: 'relative', marginBottom: '6px', overflow: 'hidden', borderRadius: '8px' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '70px', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#6b7280', fontWeight: 'bold' }}>kaji</div>
            <div
              onClick={() => toggleStatus(r.id)}
              onTouchStart={e => onTouchStart(r.id, e.touches[0].clientX)}
              onTouchMove={e => onTouchMove(r.id, e.touches[0].clientX)}
              onTouchEnd={() => onTouchEnd(r.id)}
              style={{ transform: `translateX(${offset}px)`, transition: offset === 0 ? 'transform 0.2s' : 'none', background: bg, border: `1px solid ${border}`, borderLeft: `4px solid ${border}`, borderRadius: '8px', padding: '10px 12px', opacity: r.status === 'kataji' ? 0.5 : 1, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>{r.date}</div>
                  <div style={{ fontSize: '13px' }}>{r.description}</div>
                </div>
                <div style={{ fontSize: '15px', fontWeight: 'bold', marginLeft: '12px' }}>Y{r.amount.toLocaleString()}</div>
              </div>
            </div>
          </div>
        )
      })}

      {rows.length > 0 && (
        <div style={{ marginTop: '16px', display: 'flex', gap: '8px', position: 'sticky', bottom: '16px' }}>
          <button onClick={saveToStaging} disabled={saving}
            style={{ flex: 1, padding: '14px', background: saving ? '#9ca3af' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: saving ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
            {saving ? 'saving...' : `save ${rows.length}`}
          </button>
          <button onClick={() => setRows([])} style={{ padding: '14px 20px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>clear</button>
        </div>
      )}
    </div>
  )
}
