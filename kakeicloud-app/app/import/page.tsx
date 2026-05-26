// v2.2.15 app/import/page.tsx receiptにpayment_card表示・保存追加
/**
 * kakeicloud v2.2.15 | 2026/05/24
 * kakeicloud-app/app/import/page.tsx
 */

'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { VERSION } from '../../lib/version'

type ImportRow = {
  id: string
  date: string
  description: string
  amount: number
  status: 'keiji' | 'kataji' | 'confirm' | 'pending'
  account?: string
  person?: string
  memo?: string
  note?: string
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
  payment_card?: string  // ⬅️ v2.2.15追加
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

type SummaryData = {
  billing_month: string
  billing_total: number
  honcard_total: number
  kazoku_total: number
  etc_total: number
}

type ReceiptKind = 'keiji' | 'iryo' | 'furusato' | 'kaji'

const TABS = ['弥生CSV', 'カードCSV', 'PDF', 'レシート', 'Amazon']

const KEIJI_ACCOUNTS = [
  '消耗品費', '通信費', '旅費交通費', '接待交際費', '地代家賃',
  '水道光熱費', '修繕費', '広告宣伝費', '外注費', '減価償却費',
  '車両費', '諸会費', '新聞図書費', '研修費', '支払手数料',
  '租税公課', '保険料', '雑費', '開業費償却'
]

const ALL_ACCOUNTS = {
  keiji: KEIJI_ACCOUNTS,
  uriage: ['売上高'],
  kojyo: ['医療費', '寄附金', '社会保険料', '生命保険料', '地震保険料', '小規模企業共済'],
  sonota: ['普通預金', '現金', '未払金', '前払費用', '棚卸資産', '事業主貸', '事業主借', '雑収入'],
}

function AccountSelect({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: React.CSSProperties }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '7px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', ...style }}>
      <optgroup label="経費">
        {ALL_ACCOUNTS.keiji.map(a => <option key={a} value={a}>{a}</option>)}
      </optgroup>
      <optgroup label="売上">
        {ALL_ACCOUNTS.uriage.map(a => <option key={a} value={a}>{a}</option>)}
      </optgroup>
      <optgroup label="控除">
        {ALL_ACCOUNTS.kojyo.map(a => <option key={a} value={a}>{a}</option>)}
      </optgroup>
      <optgroup label="その他">
        {ALL_ACCOUNTS.sonota.map(a => <option key={a} value={a}>{a}</option>)}
      </optgroup>
    </select>
  )
}

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
  const [cardImageSlots, setCardImageSlots] = useState<(File | null)[]>(Array(10).fill(null))
  const [processingImages, setProcessingImages] = useState(false)
  const [imageProgress, setImageProgress] = useState('')
  const [summarySlot, setSummarySlot] = useState<File | null>(null)
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)
  const [summaryImportId, setSummaryImportId] = useState<string | null>(null)
  const [processingSummary, setProcessingSummary] = useState(false)
  const [swipeStart, setSwipeStart] = useState<{ id: string; x: number } | null>(null)
  const [swipeOffset, setSwipeOffset] = useState<{ [id: string]: number }>({})
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  useEffect(() => { fetchMasters() }, [person])
  useEffect(() => {
    setTextInput('')
    setShowTextArea(false)
    setReceiptData(null)
    setAmazonData(null)
    setRows([])
    setErrorMsg(null)
    setCurrentImportId(null)
    setCardImageSlots(Array(10).fill(null))
    setImageProgress('')
    setSummarySlot(null)
    setSummaryData(null)
    setSummaryImportId(null)
    setExpandedRowId(null)
  }, [tab])

  async function fetchMasters() {
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from('classification_rules').select('*').order('priority', { ascending: false }),
      supabase.from('payment_accounts').select('*').eq('is_active', true)
        .or(`person.eq.${person},person.eq.both`),
    ])
    setRules(r || [])
    setPaymentAccounts(p || [])
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
      const description = cols[1] || cols[2] || ''
      return {
        id: `c-${i}`, date: cols[0].replace(/\//g, '-'),
        description, amount, status: 'pending' as const,
        memo: `カード：${description}`,
      }
    }).filter(Boolean) as ImportRow[]
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

  async function handleSummaryImport() {
    if (!summarySlot) return
    if (!selectedAccountId) { alert('取込元口座を選択してください'); return }
    setProcessingSummary(true)
    setErrorMsg(null)
    try {
      const base64 = await fileToBase64(summarySlot)
      const json = await callApi({
        type: 'card_summary',
        imageBase64: base64,
        mediaType: summarySlot.type || 'image/jpeg',
      })
      if (!json.data) throw new Error('no data')
      const sd: SummaryData = json.data
      setSummaryData(sd)
      const selectedAccount = paymentAccounts.find(a => a.id === selectedAccountId)
      const cardType = selectedAccount?.name || '不明'
      const { data: ci, error } = await supabase.from('card_imports').insert({
        card_type: cardType,
        billing_month: sd.billing_month,
        raw_text: JSON.stringify(sd),
        is_summary: true,
        billing_total: sd.billing_total,
        honcard_total: sd.honcard_total,
        kazoku_total: sd.kazoku_total,
        etc_total: sd.etc_total,
      }).select('id').single()
      if (error) throw new Error(error.message)
      setSummaryImportId(ci.id)
    } catch (error: any) {
      const msg = error.message || 'error'
      setErrorMsg(msg)
      alert(msg)
    } finally {
      setProcessingSummary(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
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
    }
  }

  async function handleCardImages() {
    const filledSlots = cardImageSlots.filter(s => s !== null) as File[]
    if (filledSlots.length === 0) { alert('画像を追加してください'); return }
    setProcessingImages(true)
    setErrorMsg(null)
    let allRows: ImportRow[] = [...rows]
    try {
      for (let i = 0; i < filledSlots.length; i++) {
        setImageProgress(`${i + 1}/${filledSlots.length}ページ処理中...`)
        const base64 = await fileToBase64(filledSlots[i])
        const json = await callApi({
          type: 'card_image',
          imageBase64: base64,
          mediaType: filledSlots[i].type || 'image/jpeg',
        })
        if (!Array.isArray(json.data)) continue
        const parsed: ImportRow[] = json.data.map((d: any, idx: number) => ({
          id: `ci-${i}-${idx}`,
          date: d.date || '',
          description: d.description || '',
          amount: Math.abs(d.amount || 0),
          status: 'pending' as const,
          person: d.person || 'hiroshi',
          memo: `カード：${d.description || ''}`,
          note: d.note || undefined,
        }))
        allRows = [...allRows, ...applyRules(parsed)]
      }
      setRows(allRows)
      setCardImageSlots(Array(10).fill(null))
      setImageProgress('')
      if (allRows.length === 0) alert('data not found')
    } catch (error: any) {
      const msg = error.message || 'error'
      setErrorMsg(msg)
      alert(msg)
    } finally {
      setProcessingImages(false)
      setImageProgress('')
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
      } else {
        const json = await callApi({ type: 'text_card', text: textInput })
        if (!Array.isArray(json.data)) throw new Error('data error')
        const parsed: ImportRow[] = json.data.map((d: any, i: number) => ({
          id: `t-${i}`, date: d.date || '', description: d.description || '',
          amount: Math.abs(d.amount || 0), status: 'pending' as const,
          memo: `カード：${d.description || ''}`,
        }))
        setRows(applyRules(parsed))
        setShowTextArea(false)
        if (parsed.length === 0) { alert('data not found'); return }
        const selectedAccount = paymentAccounts.find(a => a.id === selectedAccountId)
        const cardType = `${selectedAccount?.name || '不明'} (テキスト)`
        const billingMonth = parsed[0]?.date.slice(0, 7) || new Date().toISOString().slice(0, 7)
        const { data: ci } = await supabase.from('card_imports').insert({
          card_type: cardType, billing_month: billingMonth,
          raw_text: textInput, is_summary: false,
        }).select('id').single()
        if (ci) setCurrentImportId(ci.id)
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
    if (!Array.isArray(json.data)) throw new Error('data error')
    return json.data.map((d: any, i: number) => ({
      id: `pdf-${i}`, date: d.date || '', description: d.description || '',
      amount: Math.abs(d.amount || 0), status: 'pending' as const,
      note: d.note || undefined,
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
        invoice_no: receiptData.invoice_no || null,
        method: receiptData.payment_card ? '未払金' : '現金',
        payment_account: receiptData.payment_card || null,  // ⬅️ v2.2.15追加
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
        payment_account: 'Amazon',
        memo: 'Amazon証憑より',
        note: amazonData.memo || null,
        order_no: amazonData.order_no || null,
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

  async function saveRows() {
    if (rows.length === 0) { alert('データがありません'); return }
    if (!selectedAccountId) { alert('取込元口座を選択してください'); return }
    const isYayoi = tab === '弥生CSV'
    if (!isYayoi && !summaryImportId) {
      const go = confirm('サマリーページが未取込です。このまま保存しますか？')
      if (!go) return
    }
    if (!confirm(`${rows.length}件を保存しますか？`)) return
    setSaving(true)
    try {
      const selectedAccount = paymentAccounts.find(a => a.id === selectedAccountId)
      const sourceName = selectedAccount?.name || '不明'
      const sourceType = selectedAccount?.kind || 'card'
      if (isYayoi) {
        for (const r of rows) {
          await supabase.from('import_staging').insert({
            person: r.person || person,
            source_type: sourceType,
            source_name: sourceName,
            date: r.date,
            description: r.description,
            amount: r.amount,
            status: r.status,
            account: r.account || null,
            memo: r.memo || null,
            note: r.note || null,
            card_import_id: null,
          })
        }
      } else {
        for (const r of rows) {
          await supabase.from('card_details').insert({
            card_import_id: summaryImportId || null,
            person: r.person || person,
            date: r.date,
            description: r.description,
            amount: r.amount,
            status: r.status,
            account: r.account || null,
            memo: r.memo || null,
            note: r.note || null,
            source_name: sourceName,
            source_type: sourceType,
            matched_transaction_id: null,
          })
        }
      }
      alert(`${rows.length}件を保存しました`)
      setRows([])
      setCurrentImportId(null)
      setExpandedRowId(null)
    } catch (error: any) {
      alert(`save error: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  function updateRow(id: string, patch: Partial<ImportRow>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  function onTouchStart(id: string, x: number) { setSwipeStart({ id, x }) }
  function onTouchMove(id: string, x: number) {
    if (!swipeStart || swipeStart.id !== id) return
    const diff = x - swipeStart.x
    if (diff > 0) setSwipeOffset(prev => ({ ...prev, [id]: Math.min(diff, 100) }))
  }
  function onTouchEnd(id: string) {
    if ((swipeOffset[id] || 0) > 60) updateRow(id, { status: 'kataji' })
    setSwipeOffset(prev => ({ ...prev, [id]: 0 }))
    setSwipeStart(null)
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

  const statusLabel = (status: ImportRow['status']) => {
    if (status === 'keiji') return { label: '経費', color: '#16a34a' }
    if (status === 'kataji') return { label: '家事', color: '#9ca3af' }
    if (status === 'confirm') return { label: '要確認', color: '#d97706' }
    return { label: '未分類', color: '#374151' }
  }

  const isReceiptTab = tab === 'レシート'
  const isAmazonTab = tab === 'Amazon'
  const isPdfOrCsv = tab === 'PDF' || tab === 'カードCSV' || tab === '弥生CSV'
  const filledSlotCount = cardImageSlots.filter(s => s !== null).length
  const saveLabel = tab === '弥生CSV' ? 'stagingに保存' : 'card_detailsに保存'

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
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#374151', marginBottom: '8px' }}>取込元口座</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {paymentAccounts.map(a => (
              <button key={a.id} onClick={() => setSelectedAccountId(a.id)}
                style={{
                  padding: '12px 20px',
                  background: selectedAccountId === a.id ? '#2563eb' : '#f3f4f6',
                  color: selectedAccountId === a.id ? 'white' : '#374151',
                  border: `2px solid ${selectedAccountId === a.id ? '#2563eb' : '#e5e7eb'}`,
                  borderRadius: '10px', cursor: 'pointer',
                  fontSize: '15px', fontWeight: selectedAccountId === a.id ? 'bold' : 'normal',
                  minWidth: '140px',
                }}>
                💳 {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isReceiptTab && !isAmazonTab && (
        <div style={{ position: 'relative', marginBottom: '8px' }}>
          <div style={{ width: '100%', padding: '14px', background: loading ? '#9ca3af' : '#2563eb', color: 'white', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '15px', boxSizing: 'border-box' }}>
            {loading ? '解析中...' : `📁 ${tab}ファイルを選択`}
          </div>
          {!loading && (
            <input type="file" accept={tab === 'PDF' ? '.pdf' : '.csv'} onChange={handleFile}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
          )}
        </div>
      )}

      {tab === 'カードCSV' && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ marginBottom: '12px', background: '#fffbeb', border: `2px solid ${summaryData ? '#16a34a' : '#f59e0b'}`, borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#92400e', marginBottom: '8px' }}>
              ステップ1　サマリーページ（請求合計）
            </div>
            {summaryData ? (
              <div style={{ background: 'white', borderRadius: '8px', padding: '10px', fontSize: '13px' }}>
                <div style={{ color: '#16a34a', fontWeight: 'bold', marginBottom: '6px' }}>✅ 読み取り完了</div>
                <div style={{ marginBottom: '2px' }}>請求月：<strong>{summaryData.billing_month}</strong></div>
                <div style={{ marginBottom: '2px' }}>請求合計：<strong>¥{summaryData.billing_total.toLocaleString()}</strong></div>
                <div style={{ marginBottom: '2px', color: '#2563eb' }}>本カード（妻）：¥{summaryData.honcard_total.toLocaleString()}</div>
                <div style={{ marginBottom: '2px', color: '#7c3aed' }}>家族カード（廣！）：¥{summaryData.kazoku_total.toLocaleString()}</div>
                {summaryData.etc_total > 0 && <div style={{ marginBottom: '2px', color: '#6b7280' }}>ETC：¥{summaryData.etc_total.toLocaleString()}</div>}
                <button onClick={() => { setSummaryData(null); setSummarySlot(null); setSummaryImportId(null) }}
                  style={{ marginTop: '8px', padding: '4px 12px', background: '#fee2e2', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', color: '#dc2626' }}>
                  やり直し
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{
                  padding: '12px 16px',
                  background: summarySlot ? '#f0fdf4' : 'white',
                  border: `1px solid ${summarySlot ? '#16a34a' : '#d1d5db'}`,
                  borderRadius: '8px', fontSize: '13px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                }}>
                  {summarySlot ? (
                    <>
                      <span style={{ color: '#16a34a', fontWeight: 'bold', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ✅ {summarySlot.name}
                      </span>
                      <button onClick={handleSummaryImport} disabled={processingSummary}
                        style={{ padding: '8px 16px', background: processingSummary ? '#9ca3af' : '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: processingSummary ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '13px', flexShrink: 0, zIndex: 1, position: 'relative' }}>
                        {processingSummary ? '読取中...' : '🤖 読み取る'}
                      </button>
                    </>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>📊 サマリーページをタップして追加</span>
                  )}
                </div>
                {!processingSummary && !summarySlot && (
                  <input type="file" accept="image/*"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                    onChange={e => {
                      if (e.target.files?.[0]) setSummarySlot(e.target.files[0])
                      e.target.value = ''
                    }}
                  />
                )}
              </div>
            )}
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#374151', marginBottom: '10px' }}>
              ステップ2　明細ページ（ページごとにタップして追加）
            </div>
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} style={{ position: 'relative', marginBottom: '6px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px',
                  background: cardImageSlots[i] ? '#f0fdf4' : 'white',
                  border: `1px solid ${cardImageSlots[i] ? '#16a34a' : '#d1d5db'}`,
                  borderRadius: '8px', fontSize: '13px',
                }}>
                  <span style={{ fontSize: '11px', color: '#6b7280', minWidth: '52px', flexShrink: 0 }}>ページ{i + 1}</span>
                  {cardImageSlots[i] ? (
                    <span style={{ color: '#16a34a', fontWeight: 'bold', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      ✅ {cardImageSlots[i]!.name}
                    </span>
                  ) : (
                    <span style={{ color: '#9ca3af', flex: 1 }}>タップして追加</span>
                  )}
                  {cardImageSlots[i] && (
                    <button onClick={e => {
                      e.stopPropagation()
                      setCardImageSlots(prev => { const next = [...prev]; next[i] = null; return next })
                    }}
                      style={{ padding: '2px 8px', background: '#fee2e2', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#dc2626', flexShrink: 0, zIndex: 1, position: 'relative' }}>
                      削除
                    </button>
                  )}
                </div>
                {!processingImages && (
                  <input type="file" accept="image/*"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                    onChange={e => {
                      if (e.target.files?.[0]) {
                        const file = e.target.files[0]
                        setCardImageSlots(prev => { const next = [...prev]; next[i] = file; return next })
                      }
                      e.target.value = ''
                    }}
                  />
                )}
              </div>
            ))}
            {filledSlotCount > 0 && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button onClick={handleCardImages} disabled={processingImages}
                  style={{ flex: 1, padding: '13px', background: processingImages ? '#9ca3af' : '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', cursor: processingImages ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
                  {processingImages ? imageProgress || '処理中...' : `🤖 ${filledSlotCount}枚を順番に読み取る`}
                </button>
                <button onClick={() => setCardImageSlots(Array(10).fill(null))} disabled={processingImages}
                  style={{ padding: '13px 16px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  クリア
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {isReceiptTab && !receiptData && (
        <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ padding: '14px', background: loading ? '#9ca3af' : '#16a34a', color: 'white', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '15px' }}>
              {loading ? 'AI読取中...' : '📷 カメラで撮影'}
            </div>
            {!loading && <input type="file" accept="image/*" capture="environment" onChange={handleFile}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />}
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ padding: '14px', background: loading ? '#9ca3af' : '#0891b2', color: 'white', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '15px' }}>
              {loading ? 'AI読取中...' : '🖼 写真を選択'}
            </div>
            {!loading && <input type="file" accept="image/*" onChange={handleFile}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />}
          </div>
        </div>
      )}

      {isAmazonTab && !amazonData && (
        <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ padding: '14px', background: loading ? '#9ca3af' : '#f97316', color: 'white', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '15px' }}>
              {loading ? 'AI読取中...' : '📷 カメラで撮影'}
            </div>
            {!loading && <input type="file" accept="image/*" capture="environment" onChange={handleFile}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />}
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ padding: '14px', background: loading ? '#9ca3af' : '#f97316', color: 'white', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '15px' }}>
              {loading ? 'AI読取中...' : '🖼 スクショを選択'}
            </div>
            {!loading && <input type="file" accept="image/*" onChange={handleFile}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />}
          </div>
        </div>
      )}

      {!receiptData && !amazonData && (
        <div style={{ marginBottom: '16px' }}>
          <button onClick={() => setShowTextArea(!showTextArea)}
            style={{ width: '100%', padding: '12px', background: showTextArea ? '#e5e7eb' : '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: '#374151', textAlign: 'left' }}>
            📋 テキストから読み取る（API混雑時）{showTextArea ? ' ▲' : ' ▼'}
          </button>
          {showTextArea && (
            <div style={{ marginTop: '8px', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', background: '#fafafa' }}>
              <textarea value={textInput} onChange={e => setTextInput(e.target.value)}
                placeholder="明細データを貼り付け..."
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px', boxSizing: 'border-box', minHeight: '120px', fontSize: '13px', resize: 'vertical' }} />
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

      {receiptData && (
        <div style={{ background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#16a34a' }}>AI読取完了 - 内容確認</div>
          <div style={{ background: 'white', borderRadius: '8px', padding: '12px', marginBottom: '12px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: '#6b7280' }}>日付</span><span>{receiptData.date}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: '#6b7280' }}>店名</span><span>{receiptData.store_name}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: '#6b7280' }}>金額</span><span style={{ fontWeight: 'bold', fontSize: '16px' }}>¥{receiptData.amount.toLocaleString()}</span></div>
            {receiptData.tax_amount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: '#6b7280' }}>消費税</span><span>¥{receiptData.tax_amount.toLocaleString()}（{receiptData.tax_rate}%）</span></div>}
            {/* ⬇️ v2.2.15: invoice_no・payment_card表示追加 */}
            {receiptData.invoice_no && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: '#6b7280' }}>登録番号</span><span style={{ fontSize: '11px' }}>{receiptData.invoice_no}</span></div>}
            {receiptData.payment_card && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: '#6b7280' }}>支払カード</span><span style={{ color: '#2563eb', fontWeight: 'bold' }}>💳 {receiptData.payment_card}</span></div>}
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
              style={{ padding: '14px 20px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>やり直し</button>
          </div>
        </div>
      )}

      {amazonData && (
        <div style={{ background: '#fff7ed', border: '2px solid #f97316', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#f97316' }}>🛒 Amazon AI読取完了 - 内容確認</div>
          <div style={{ background: 'white', borderRadius: '8px', padding: '12px', marginBottom: '12px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: '#6b7280' }}>日付</span><span>{amazonData.date}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: '#6b7280' }}>金額</span><span style={{ fontWeight: 'bold', fontSize: '16px' }}>¥{amazonData.amount.toLocaleString()}</span></div>
            <div style={{ marginBottom: '4px' }}><span style={{ color: '#6b7280', fontSize: '12px' }}>商品概要（note）：</span><span style={{ fontSize: '12px' }}>{amazonData.memo}</span></div>
            {amazonData.order_no && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: '#6b7280' }}>注文番号</span><span style={{ fontSize: '11px' }}>{amazonData.order_no}</span></div>}
            {/* ⬇️ v2.2.15: invoice_no表示追加 */}
            {amazonData.invoice_no && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: '#6b7280' }}>登録番号</span><span style={{ fontSize: '11px', color: '#7c3aed' }}>{amazonData.invoice_no}</span></div>}
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
              style={{ padding: '14px 20px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>やり直し</button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', fontSize: '12px' }}>
            <span style={{ color: '#16a34a' }}>経費：{counts.keiji}件</span>
            <span style={{ color: '#6b7280' }}>家事：{counts.kataji}件</span>
            <span style={{ color: '#d97706' }}>要確認：{counts.confirm}件</span>
            <span style={{ color: '#374151' }}>未分類：{counts.pending}件</span>
          </div>

          {rows.map(r => {
            const offset = swipeOffset[r.id] || 0
            const { bg, border } = statusBg(r.status)
            const { label, color } = statusLabel(r.status)
            const isExpanded = expandedRowId === r.id

            return (
              <div key={r.id} style={{ position: 'relative', marginBottom: '6px', overflow: 'hidden', borderRadius: '8px' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '70px', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#6b7280', fontWeight: 'bold' }}>
                  家事 →
                </div>
                <div
                  onTouchStart={e => onTouchStart(r.id, e.touches[0].clientX)}
                  onTouchMove={e => onTouchMove(r.id, e.touches[0].clientX)}
                  onTouchEnd={() => onTouchEnd(r.id)}
                  style={{ transform: `translateX(${offset}px)`, transition: offset === 0 ? 'transform 0.2s' : 'none', background: bg, border: `1px solid ${border}`, borderLeft: `4px solid ${border}`, borderRadius: '8px', opacity: r.status === 'kataji' ? 0.5 : 1 }}>

                  <div onClick={() => setExpandedRowId(isExpanded ? null : r.id)}
                    style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '2px' }}>
                        <span style={{ fontSize: '11px', color: '#6b7280' }}>{r.date}</span>
                        {r.person && (
                          <span style={{ fontSize: '10px', background: r.person === 'wife' ? '#dbeafe' : '#ede9fe', color: r.person === 'wife' ? '#1d4ed8' : '#7c3aed', padding: '1px 6px', borderRadius: '4px' }}>
                            {r.person === 'wife' ? '妻' : '廣！'}
                          </span>
                        )}
                        <span style={{ fontSize: '10px', fontWeight: 'bold', color }}>{label}</span>
                        {r.account && <span style={{ fontSize: '10px', color: '#6b7280' }}>{r.account}</span>}
                      </div>
                      <div style={{ fontSize: '13px' }}>{r.description}</div>
                      {r.memo && !isExpanded && (
                        <div style={{ fontSize: '11px', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📝 {r.memo}</div>
                      )}
                      {r.note && !isExpanded && (
                        <div style={{ fontSize: '11px', color: '#2563eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🛣 {r.note}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '15px', fontWeight: 'bold' }}>¥{r.amount.toLocaleString()}</span>
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0 12px 12px', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', marginTop: '10px' }}>
                        {(['keiji', 'kataji', 'confirm', 'pending'] as const).map(s => (
                          <button key={s} onClick={() => updateRow(r.id, { status: s })}
                            style={{
                              flex: 1, padding: '6px 4px',
                              background: r.status === s ? (s === 'keiji' ? '#16a34a' : s === 'kataji' ? '#6b7280' : s === 'confirm' ? '#d97706' : '#374151') : '#f3f4f6',
                              color: r.status === s ? 'white' : '#374151',
                              border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold',
                            }}>
                            {s === 'keiji' ? '経費' : s === 'kataji' ? '家事' : s === 'confirm' ? '要確認' : '未分類'}
                          </button>
                        ))}
                      </div>

                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>科目</label>
                        <AccountSelect
                          value={r.account || '消耗品費'}
                          onChange={v => updateRow(r.id, { account: v })}
                        />
                      </div>

                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>摘要（memo・印刷される）</label>
                        <input value={r.memo || ''} onChange={e => updateRow(r.id, { memo: e.target.value })}
                          style={{ width: '100%', padding: '7px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>備考（note・印刷されない）</label>
                        <input value={r.note || ''} onChange={e => updateRow(r.id, { note: e.target.value })}
                          style={{ width: '100%', padding: '7px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          <div style={{ marginTop: '16px', display: 'flex', gap: '8px', position: 'sticky', bottom: '16px' }}>
            <button onClick={saveRows} disabled={saving}
              style={{ flex: 1, padding: '14px', background: saving ? '#9ca3af' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: saving ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
              {saving ? '保存中...' : `💾 ${rows.length}件を${saveLabel}`}
            </button>
            <button onClick={() => setRows([])} style={{ padding: '14px 20px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>クリア</button>
          </div>
        </>
      )}
    </div>
  )
}
