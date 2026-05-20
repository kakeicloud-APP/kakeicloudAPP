/**
 * kakeicloud v1.8.4 | 2026/05/20
 * kakeicloud-app/app/import/page.tsx
 */

'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

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

type ReceiptKind = '経費' | '医療費' | 'ふるさと納税' | '家事'

const TABS = ['弥生CSV', 'カードCSV', 'PDF', 'レシート']

const KEIJI_ACCOUNTS = [
  '消耗品費', '通信費', '旅費交通費', '接待交際費', '地代家賃',
  '水道光熱費', '修繕費', '広告宣伝費', '外注費', '減価償却費', '雑費', '開業費償却'
]

const KIND_TO_ACCOUNT: Record<ReceiptKind, string> = {
  '経費': '',
  '医療費': '医療費',
  'ふるさと納税': '寄附金',
  '家事': '家事',
}

const KIND_TO_TAX_TYPE: Record<ReceiptKind, string> = {
  '経費': '課税仕入',
  '医療費': '対象外',
  'ふるさと納税': '対象外',
  '家事': '対象外',
}

export default function ImportPage() {
  const [tab, setTab] = useState('カードCSV')
  const [person, setPerson] = useState<'hiroshi' | 'wife'>('hiroshi')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rules, setRules] = useState<ClassificationRule[]>([])
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [swipeStart, setSwipeStart] = useState<{ id: string; x: number } | null>(null)
  const [swipeOffset, setSwipeOffset] = useState<{ [id: string]: number }>({})

  // レシート確認カード
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)
  const [receiptKind, setReceiptKind] = useState<ReceiptKind>('経費')
  const [receiptAccount, setReceiptAccount] = useState(KEIJI_ACCOUNTS[0])
  const [savingReceipt, setSavingReceipt] = useState(false)

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
      return {
        ...r,
        status: matched.action as ImportRow['status'],
        account: matched.account || r.account,
      }
    })
  }

  function parseYayoiCSV(text: string): ImportRow[] {
    const lines = text.split('\n').filter(l => l.trim())
    return lines.slice(1).map((line, i) => {
      const cols = line.split(',').map(c => c.replace(/"/g, '').trim())
      if (!cols[0]) return null
      return {
        id: `y-${i}`,
        date: cols[0],
        description: cols[4] || '',
        amount: parseInt(cols[2] || cols[3] || '0') || 0,
        status: 'pending' as const,
        account: cols[1] || '',
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
        id: `c-${i}`,
        date: cols[0].replace(/\//g, '-'),
        description: cols[1] || cols[2] || '',
        amount,
        status: 'pending' as const,
      }
    }).filter(Boolean) as ImportRow[]
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setErrorMsg(null)

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

    // 確認カードに表示（リダイレクトなし）
    setReceiptData(json.data)
    setReceiptKind('経費')
    setReceiptAccount(json.data.account || KEIJI_ACCOUNTS[0])
  }

  async function saveReceipt() {
    if (!receiptData) return
    setSavingReceipt(true)
    try {
      const account = receiptKind === '経費' ? receiptAccount : KIND_TO_ACCOUNT[receiptKind]
      const year = parseInt(receiptData.date.split('-')[0])

      if (receiptKind === '家事') {
        // 家事は保存しない
        setReceiptData(null)
        alert('家事として記録しました（保存スキップ）')
        return
      }

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
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = () => reject(new Error('
