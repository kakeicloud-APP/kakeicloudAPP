// v2.1.2 app/import/page.tsx saveToStagingにAmazonマッチング追加
/**
 * kakeicloud v2.1.2 | 2026/05/22
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

type AmazonData = {
  date: string
  amount: number
  tax_amount: number
  tax_rate: number
  order_no: string
  invoice_no: string
  memo: string
  note: string
  account: string
}

type ReceiptKind = 'keiji' | 'iryo' | 'furusato' | 'kaji'

const TABS = ['弥生CSV', 'カードCSV', 'PDF', 'レシート', 'Amazon']

const KEIJI_ACCOUNTS = [
  '消耗品費', '通信費', '旅費交通費', '接待交際費', '地代家賃',
  '水道光熱費', '修繕費', '広告宣伝費', '外注費', '減価償却費',
  '車両費', '諸会費', '新聞図書費', '研修費', '支払手数料',
  '租税公課', '保険料', '雑費', '開業費償却'
]

const RECEIPT_KIND_LABELS: Record<ReceiptKind, string> = {
  keiji: '経費', iryo: '医療費', furusato: 'ふるさと納税', kaji: '家事',
}

const KIND_TO_ACCOUNT: Record<ReceiptKind, string> = {
  keiji: '', iryo: '医療費', furusato: '寄附金', kaji: '家事',
}

const KIND_TO_TAX_TYPE: Record<ReceiptKind, string> = {
  keiji: '課税仕入', iryo: '対象外', furusato: '対象外', kaji: '対象外',
}

export default function ImportPage() {
  const [tab, setTab] = useState('カードCSV')
  const [person, setPerson] = useState<'hiroshi' | 'wife'>('hiroshi')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rules, setRules] = useState<ClassificationRule[]>([])
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)
  const [receiptKind, setReceiptKind] = useState<ReceiptKind>('keiji')
  const [receiptAccount, setReceiptAccount] = useState(KEIJI_ACCOUNTS[0])
  const [savingReceipt, setSavingReceipt] = useState(false)
  const [amazonData, setAmazonData] = useState<AmazonData | null>(null)
  const [amazonAccount, setAmazonAccount] = useState(KEIJI_ACCOUNTS[0])
  const [savingAmazon, setSavingAmazon] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [showTextArea, setShowTextArea] = useState(false)
  const [currentImportId, setCurrentImportId] = useState<string | null>(null)
  const [swipeStart, setSwipeStart] = useState<{ id: string; x: number } | null>(null)
  const [swipeOffset, setSwipeOffset] = useState<{ [id: string]: number }>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchMasters() }, [person])
  useEffect(() => {
    setTextInput('')
    setShowTextArea(false)
    setReceiptData(null)
    setAmazonData(null)
    setRows([])
    setErrorMsg(null)
    setCurrentImportId(null)
  }, [tab])

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

  function parseYayoiCSV(text: string): ImportRow[] {
    const lines = text.split('\n').filter(l => l.trim())
    return lines.slice(1).map((line, i) => {
      const cols = line.split(',').map(c => c.replace(/"/g, '').trim())
      if (!cols[0]) return null
      return {
        id: `y-${i}`, date: cols[0], description: cols[4] || '',
        amount: parseInt(cols[2] || cols[3] || '0') || 0,
        status: 'pending' as const, account: cols[1] || '',
      }
    }).filter(Boolean) as ImportRow[]
  }

  function parseCardCSV(text: string): ImportRow[] {
    const lines = text.split('\n').filter(l => l.trim())
    return lines.slice(1).map((line, i) => {
      const cols = line.split(',').map(c => c.replace(/"/g, '').trim())
      if (!cols[0]) return null
      const amount = parseInt(cols[3]?.replace(/[^0-9-]/g, '') || '0') || 0
      if (amount <= 0) return null
      return {
        id: `c-${i}`, date: cols[0].replace(/\//g, '-'),
        description: cols[1] || cols[2] || '', amount, status: 'pending' as const,
      }
    }).filter(Boolean) as ImportRow[]
  }

  async function saveToCardImports(rawText: string, cardType: string, billingMonth: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.from('card_imports').insert({
        card_type: cardType, billing_month: billingMonth, raw_text: rawText,
      }).select('id').single()
      if (error) { console.error('card_imports save error:', error); return null }
      return data?.id || null
    } catch (e) {
      console.error('card_imports error:', e); return null
    }
  }

  async function findAmazonMatch(date: string, amount: number): Promise<{ id: string; order_no: string; memo: string } | null> {
    const dateObj = new Date(date)
    const minus7 = new Date(dateObj.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const plus7 = new Date(dateObj.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { data } = await supabase
      .from('transactions')
      .select('id, date, memo, order_no')
      .eq('person', person)
      .eq('amount', amount)
      .not('order_no', 'is', null)
      .eq('is_void', false)
      .gte('date', minus7)
      .lte('date', plus7)
      .limit(1)
    if (data && data.length > 0) return data[0]
    return null
  }

  async function callApi(body: object): Promise<any> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25000)
    let res: Response
    try {
      res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    return json
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setErrorMsg(null)
    try {
      if (tab === 'レシート') { await handleReceipt(file); return }
      if (tab === 'Amazon') { await handleAmazon(file); return }
      let parsed: ImportRow[] = []
      if (tab === 'カードCSV') parsed = applyRules(parseCardCSV(await file.text()))
      else if (tab === '弥生CSV') parsed = applyRules(parseYayoiCSV(await file.text()))
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

  async function handleTextRead() {
    if (!textInput.trim()) { alert('テキストを入力してください'); return }
    setLoadingText(true)
    setErrorMsg(null)
    try {
      if (tab === 'レシート') {
        const json = await callApi({ type: 'text_receipt', text: textInput })
        if (!json.data) throw new Error('no data')
        setReceiptData(json.data)
        setReceiptKind('keiji')
        setReceiptAccount(json.data.account || KEIJI_ACCOUNTS[0])
        setShowTextArea(false)
      } else if (tab === 'Amazon') {
        const json = await callApi({ type: 'text_amazon', text: textInput })
        if (!json.data) throw new Error('no data')
        setAmazonData(json.data)
        setAmazonAccount(json.data.account || KEIJI_ACCOUNTS[0])
        setShowTextArea(false)
      } else if (tab === 'カードCSV' || tab === '弥生CSV' || tab === 'PDF') {
        const json = await callApi({ type: 'text_card', text: textInput })
        if (!Array.isArray(json.data)) throw new Error('data error')
        const parsed: ImportRow[] = json.data.map((d: any, i: number) => ({
          id: `t-${i}`, date: d.date || '', description: d.description || '',
          amount: Math.abs(d.amount || 0), status: 'pending' as const,
        }))
        setRows(applyRules(parsed))
        setShowTextArea(false)
        if (parsed.length === 0) { alert('data not found'); return }
        const selectedAccount = paymentAccounts.find(a => a.id === selectedAccountId)
        const suffix = tab === 'PDF' ? 'PDF' : 'CSV'
        const cardType = `${selectedAccount?.name || '不明'} (${suffix})`
        const billingMonth = parsed[0]?.date.slice(0, 7) || new Date().toISOString().slice(0, 7)
        const importId = await saveToCardImports(textInput, cardType, billingMonth)
        if (importId) setCurrentImportId(importId)
      }
    } catch (error: any) {
      const msg = error.message || 'error'
      setErrorMsg(msg)
      alert(msg)
    } finally {
      setLoadingText(false)
    }
  }

  async function handlePDF(file: File): Promise<ImportRow[]> {
    const base64 = await fileToBase64(file)
    const json = await callApi({ type: 'pdf', imageBase64: base64, mediaType: 'application/pdf' })
    if (!Array.isArray(json.data)) throw new Error(`data error`)
    return json.data.map((d: any, i: number) => ({
      id: `pdf-${i}`, date: d.date || '', description: d.description || '',
      amount: Math.abs(d.amount || 0), status: 'pending' as const,
    }))
  }

  async function handleReceipt(file: File) {
    const base64 = await fileToBase64(file)
    const json = await callApi({ type: 'receipt', imageBase64: base64, mediaType: file.type || 'image/jpeg' })
    if (!json.data) throw new Error('no data')
    setReceiptData(json.data)
    setReceiptKind('keiji')
    setReceiptAccount(json.data.account || KEIJI_ACCOUNTS[0])
  }

  async function handleAmazon(file: File) {
    const base64 = await fileToBase64(file)
    const json = await callApi({ type: 'amazon', imageBase64: base64, mediaType: file.type || 'image/jpeg' })
    if (!json.data) throw new Error('no data')
    setAmazonData(json.data)
    setAmazonAccount(json.data.account || KEIJI_ACCOUNTS[0])
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
      if (receiptKind === 'kaji') { setReceiptData(null); alert('家事として記録しました'); return }
      const account = receiptKind === 'keiji' ? receiptAccount : KIND_TO_ACCOUNT[receiptKind]
      const year = parseInt(receiptData.date.split('-')[0])
      const { error } = await supabase.from('transactions').insert({
        person, date: receiptData.date, account, amount: receiptData.amount,
        tax_type: KIND_TO_TAX_TYPE[receiptKind],
        tax_rate: receiptKind === 'keiji' ? receiptData.tax_rate : 0,
        tax_amount: receiptKind === 'keiji' ? receiptData.tax_amount : 0,
        invoice_no: receiptData.invoice_no || null, method: '未払金',
        memo: receiptData.memo || receiptData.store_name,
        year, is_closing: false, is_confirmed: false, is_void: false, is_printed: false, has_receipt: true,
      })
      if (error) throw new Error(error.message)
      setReceiptData(null)
      setTextInput('')
      alert('登録しました')
    } catch (e: any) {
      alert(`save error: ${e.message}`)
    } finally {
      setSavingReceipt(false)
    }
  }

  async function saveAmazon() {
    if (!amazonData) return
    setSavingAmazon(true)
    try {
      if (amazonData.order_no) {
        const { data: existing } = await supabase
          .from('transactions').select('id, date, memo').eq('order_no', amazonData.order_no).limit(1)
        if (existing && existing.length > 0) {
          const dup = existing[0]
          const go = confirm(`⚠️ 注文番号 ${amazonData.order_no} はすでに登録されています。\n日付：${dup.date}\n摘要：${dup.memo}\n\n続けますか？`)
          if (!go) { setSavingAmazon(false); return }
        }
      }
      const year = parseInt(amazonData.date.split('-')[0])
      const { error } = await supabase.from('transactions').insert({
        person, date: amazonData.date, account: amazonAccount, amount: amazonData.amount,
        tax_type: '課税仕入', tax_rate: amazonData.tax_rate || 10, tax_amount: amazonData.tax_amount || 0,
        invoice_no: amazonData.invoice_no || null, method: '未払金',
        memo: amazonData.memo, note: amazonData.note || null, order_no: amazonData.order_no || null,
        year, is_closing: false, is_confirmed: false, is_void: false, is_printed: false, has_receipt: false,
      })
      if (error) throw new Error(error.message)
      setAmazonData(null)
      setTextInput('')
      alert('登録しました')
    } catch (e: any) {
      alert(`save error: ${e.message}`)
    } finally {
      setSavingAmazon(false)
    }
  }

  async function saveToStaging() {
    if (rows.length === 0) { alert('データがありません'); return }
    if (!confirm(`${rows.length}件をstagingに保存しますか？`)) return
    setSaving(true)
    try {
      const selectedAccount = paymentAccounts.find(a => a.id === selectedAccountId)
      const sourceName = selectedAccount?.name || '不明'
      const sourceType = selectedAccount?.kind || 'card'
      for (const r of rows) {
        let matchedId: string | null = null
        let matchNote: string | null = null

        // AMAZON行のマッチング
        if (r.description.toUpperCase().includes('AMAZON')) {
          const match = await findAmazonMatch(r.date, r.amount)
          if (match) {
            matchedId = match.id
            matchNote = `候補: ${match.order_no} / ${match.memo}`
          }
        }

        await supabase.from('import_staging').insert({
          person, source_type: sourceType, source_name: sourceName,
          date: r.date, description: r.description, amount: r.amount, status: r.status,
          matched_transaction_id: matchedId,
          match_note: matchNote,
        })
      }
      alert(`${rows.length}件を保存しました`)
      setRows([])
      setCurrentImportId(null)
    } catch (error: any) {
      alert(`save error: ${error.message}`)
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

  const statusBg = (status: ImportRow['status']) => {
    if (status === 'kataji') return { bg: '#f3f4f6', border: '#9ca3af' }
    if (status === 'keiji') return { bg: '#f0fdf4', border: '#16a34a' }
    if (status === 'confirm') return { bg: '#fffbeb', border: '#f59e0b' }
    return { bg: 'white', border: '#e5e7eb' }
  }

  const isReceiptTab = tab === 'レシート'
  const isAmazonTab = tab === 'Amazon'
  const isPdfOrCsv = tab === 'PDF' || tab === 'カードCSV' || tab === '弥生CSV'
  const showTextReadButton = tab === 'レシート' || tab === 'Amazon' || tab === 'カードCSV' || tab === '弥生CSV' || tab === 'PDF'

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <a href="/" style={{ padding: '8px 16px', background: '#e5e7eb', borderRadius: '6px', textDecoration: 'none', color: 'black', fontSize: '14px' }}>← 戻る</a>
        <h1 style={{ margin: 0, fontSize: '20px' }}>インポート</h1>
        <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: 'auto' }}>{VERSION}</span>
      </div>

      {errorMsg && (
        <div style={{ background: '#fef2f2', border: '1px solid #dc2626', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#dc2626', wordBreak: 'break-all' }}>
          {errorMsg}
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
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 16px', background: tab === t ? '#7c3aed' : '#e5e7eb', color: tab === t ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '13px' }}>{t}</button>
        ))}
      </div>

      {isPdfOrCsv && paymentAccounts.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#374151' }}>取込元口座</label>
          <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}
            style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}>
            {paymentAccounts.map(a => <option key={a.id} value={a.id}>{a.name}（{a.kind}）</option>)}
          </select>
        </div>
      )}

      {!isReceiptTab && !isAmazonTab && (
        <div style={{ marginBottom: '12px' }}>
          <input ref={fileRef} type="file" accept={tab === 'PDF' ? '.pdf' : '.csv'} onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={loading}
            style={{ width: '100%', padding: '14px', background: loading ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
            {loading ? '解析中...' : `📁 ${tab}ファイルを選択`}
          </button>
        </div>
      )}

      {isReceiptTab && !receiptData && (
        <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => cameraRef.current?.click()} disabled={loading}
            style={{ flex: 1, padding: '14px', background: loading ? '#9ca3af' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
            {loading ? 'AI読取中...' : '📷 カメラで撮影'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={loading}
            style={{ flex: 1, padding: '14px', background: loading ? '#9ca3af' : '#0891b2', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
            {loading ? 'AI読取中...' : '🖼 写真を選択'}
          </button>
        </div>
      )}

      {isAmazonTab && !amazonData && (
        <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => cameraRef.current?.click()} disabled={loading}
            style={{ flex: 1, padding: '14px', background: loading ? '#9ca3af' : '#f97316', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
            {loading ? 'AI読取中...' : '📷 カメラで撮影'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={loading}
            style={{ flex: 1, padding: '14px', background: loading ? '#9ca3af' : '#f97316', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
            {loading ? 'AI読取中...' : '🖼 スクショを選択'}
          </button>
        </div>
      )}

      {showTextReadButton && !receiptData && !amazonData && (
        <div style={{ marginBottom: '16px' }}>
          <button onClick={() => setShowTextArea(!showTextArea)}
            style={{ width: '100%', padding: '12px', background: showTextArea ? '#e5e7eb' : '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: '#374151', textAlign: 'left' }}>
            📋 テキストから読み取る（API混雑時）{showTextArea ? ' ▲' : ' ▼'}
          </button>
          {showTextArea && (
            <div style={{ marginTop: '8px', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', background: '#fafafa' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                {tab === 'PDF' ? 'PDFから手動でコピーしたテキストを貼り付けてください' : '写真から手動でコピーしたテキストを貼り付けてください'}
              </label>
              <textarea
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder={
                  isReceiptTab ? '店名、日付、金額、税率、登録番号などを貼り付け...' :
                  isAmazonTab ? '注文番号、日付、商品名、金額などを貼り付け...' :
                  '明細データを貼り付け（日付、店名、金額）...'
                }
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px', boxSizing: 'border-box', minHeight: '120px', fontSize: '13px', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button onClick={handleTextRead} disabled={loadingText || !textInput.trim()}
                  style={{ flex: 1, padding: '12px', background: loadingText || !textInput.trim() ? '#9ca3af' : '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', cursor: loadingText || !textInput.trim() ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
                  {loadingText ? 'AI読取中...' : '🤖 読み取る'}
                </button>
                <button onClick={() => { setTextInput(''); setShowTextArea(false) }}
                  style={{ padding: '12px 20px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                  クリア
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {currentImportId && (
        <div style={{ background: '#eff6ff', border: '1px solid #3b82f6', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: '#1d4ed8' }}>
          📂 明細保存済 ID: {currentImportId.slice(0, 8)}...
        </div>
      )}

      {receiptData && (
        <div style={{ background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#16a34a' }}>AI読取完了 - 内容確認</div>
          <div style={{ background: 'white', borderRadius: '8px', padding: '12px', marginBottom: '12px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#6b7280' }}>日付</span><span>{receiptData.date}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#6b7280' }}>店名</span><span>{receiptData.store_name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#6b7280' }}>金額</span>
              <span style={{ fontWeight: 'bold', fontSize: '16px' }}>¥{receiptData.amount.toLocaleString()}</span>
            </div>
            {receiptData.tax_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
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
              {(Object.keys(RECEIPT_KIND_LABELS) as ReceiptKind[]).map(k => (
                <button key={k} onClick={() => setReceiptKind(k)}
                  style={{ padding: '8px 14px', background: receiptKind === k ? '#7c3aed' : '#e5e7eb', color: receiptKind === k ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  {RECEIPT_KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
          {receiptKind === 'keiji' && (
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
            <button onClick={() => { setReceiptData(null); setTextInput('') }}
              style={{ padding: '14px 20px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
              やり直し
            </button>
          </div>
        </div>
      )}

      {amazonData && (
        <div style={{ background: '#fff7ed', border: '2px solid #f97316', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#f97316' }}>🛒 Amazon AI読取完了 - 内容確認</div>
          <div style={{ background: 'white', borderRadius: '8px', padding: '12px', marginBottom: '12px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#6b7280' }}>日付</span><span>{amazonData.date}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#6b7280' }}>金額</span>
              <span style={{ fontWeight: 'bold', fontSize: '16px' }}>¥{amazonData.amount.toLocaleString()}</span>
            </div>
            {amazonData.tax_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#6b7280' }}>消費税</span>
                <span>¥{amazonData.tax_amount.toLocaleString()}（{amazonData.tax_rate}%）</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#6b7280' }}>摘要</span><span>{amazonData.memo}</span>
            </div>
            {amazonData.note && (
              <div style={{ marginBottom: '4px' }}>
                <span style={{ color: '#6b7280', fontSize: '11px' }}>備考</span>
                <div style={{ fontSize: '11px', color: '#374151', marginTop: '2px' }}>{amazonData.note}</div>
              </div>
            )}
            {amazonData.order_no && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#6b7280' }}>注文番号</span>
                <span style={{ fontSize: '11px' }}>{amazonData.order_no}</span>
              </div>
            )}
            {amazonData.invoice_no && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>登録番号</span>
                <span style={{ fontSize: '11px' }}>{amazonData.invoice_no}</span>
              </div>
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: '#374151' }}>科目</label>
            <select value={amazonAccount} onChange={e => setAmazonAccount(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}>
              {KEIJI_ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={saveAmazon} disabled={savingAmazon}
              style={{ flex: 1, padding: '14px', background: savingAmazon ? '#9ca3af' : '#f97316', color: 'white', border: 'none', borderRadius: '8px', cursor: savingAmazon ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
              {savingAmazon ? '登録中...' : '💾 登録'}
            </button>
            <button onClick={() => { setAmazonData(null); setTextInput('') }}
              style={{ padding: '14px 20px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
              やり直し
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', fontSize: '12px' }}>
          <span style={{ color: '#16a34a' }}>経費：{counts.keiji}件</span>
          <span style={{ color: '#6b7280' }}>家事：{counts.kataji}件</span>
          <span style={{ color: '#d97706' }}>要確認：{counts.confirm}件</span>
          <span style={{ color: '#374151' }}>未分類：{counts.pending}件</span>
        </div>
      )}

      {rows.map(r => {
        const offset = swipeOffset[r.id] || 0
        const { bg, border } = statusBg(r.status)
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
              style={{ transform: `translateX(${offset}px)`, transition: offset === 0 ? 'transform 0.2s' : 'none', background: bg, border: `1px solid ${border}`, borderLeft: `4px solid ${border}`, borderRadius: '8px', padding: '10px 12px', opacity: r.status === 'kataji' ? 0.5 : 1, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>{r.date}</div>
                  <div style={{ fontSize: '13px' }}>{r.description}</div>
                  {r.account && <div style={{ fontSize: '11px', color: '#6b7280' }}>{r.account}</div>}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 'bold', marginLeft: '12px' }}>¥{r.amount.toLocaleString()}</div>
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
          <button onClick={() => setRows([])} style={{ padding: '14px 20px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>クリア</button>
        </div>
      )}
    </div>
  )
}
