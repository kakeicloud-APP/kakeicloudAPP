// v2.2.28 app/staging/page.tsx approveRowにcard_verified追加
/**
 * kakeicloud v2.2.28 | 2026/05/27
 * kakeicloud-app/app/staging/page.tsx
 */

'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { VERSION } from '../../lib/version'

type StagingRow = {
  id: string
  person: string
  source_type: string
  source_name: string
  date: string
  description: string
  amount: number
  status: 'keiji' | 'kataji' | 'confirm' | 'pending'
  matched_transaction_id: string | null
  match_note: string | null
  created_at: string
}

const KEIJI_ACCOUNTS = [
  '消耗品費', '通信費', '旅費交通費', '接待交際費', '地代家賃',
  '水道光熱費', '修繕費', '広告宣伝費', '外注費', '減価償却費',
  '車両費', '諸会費', '新聞図書費', '研修費', '支払手数料',
  '租税公課', '保険料', '雑費', '開業費償却'
]

function calcTax(amount: number, rate: number): number {
  if (rate === 0) return 0
  return Math.round(amount * rate / (100 + rate))
}

async function generateVoucherNo(person: string, year: number): Promise<string> {
  const prefix = person === 'hiroshi' ? 'H' : 'W'
  const { data } = await supabase
    .from('transactions')
    .select('voucher_no')
    .eq('person', person)
    .eq('year', year)
    .not('voucher_no', 'is', null)
    .order('voucher_no', { ascending: false })
    .limit(1)
  let nextNum = 1
  if (data && data.length > 0 && data[0].voucher_no) {
    const parts = data[0].voucher_no.split('-')
    nextNum = parseInt(parts[1]) + 1
  }
  return `${prefix}${year}-${String(nextNum).padStart(4, '0')}`
}

export default function StagingPage() {
  const [person, setPerson] = useState<'hiroshi' | 'wife'>('hiroshi')
  const [rows, setRows] = useState<StagingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<{[id: string]: string}>({})
  const [taxRates, setTaxRates] = useState<{[id: string]: number}>({})
  const [statuses, setStatuses] = useState<{[id: string]: string}>({})
  const [approving, setApproving] = useState<{[id: string]: boolean}>({})
  const [bulkApproving, setBulkApproving] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'keiji' | 'kataji' | 'confirm' | 'pending'>('all')

  useEffect(() => { fetchStaging() }, [person])

  async function fetchStaging() {
    setLoading(true)
    const { data } = await supabase
      .from('import_staging')
      .select('*')
      .eq('person', person)
      .order('date', { ascending: true })
    const r = data || []
    setRows(r)
    const initAccounts: {[id: string]: string} = {}
    const initTaxRates: {[id: string]: number} = {}
    const initStatuses: {[id: string]: string} = {}
    r.forEach((row: StagingRow) => {
      initAccounts[row.id] = KEIJI_ACCOUNTS[0]
      initTaxRates[row.id] = 10
      initStatuses[row.id] = row.status
    })
    setAccounts(initAccounts)
    setTaxRates(initTaxRates)
    setStatuses(initStatuses)
    setLoading(false)
  }

  async function approveRow(row: StagingRow) {
    const status = statuses[row.id] || row.status
    if (status === 'kataji') { await deleteRow(row.id); return }
    setApproving(prev => ({ ...prev, [row.id]: true }))
    try {
      // ⬇️ v2.2.28: Amazonマッチあり → 既存transactionにcard_verified:true追加
      if (row.matched_transaction_id) {
        const { error } = await supabase
          .from('transactions')
          .update({
            payment_account: row.source_name || null,
            is_confirmed: true,
            card_verified: true,  // ⬅️ v2.2.28
          })
          .eq('id', row.matched_transaction_id)
        if (error) throw new Error(error.message)
        await supabase.from('import_staging').delete().eq('id', row.id)
        setRows(prev => prev.filter(r => r.id !== row.id))
        return
      }

      // ⬇️ v2.2.28: 通常フロー → source_typeがカードならcard_verified:true
      const year = parseInt(row.date.split('-')[0])
      const account = accounts[row.id] || KEIJI_ACCOUNTS[0]
      const taxRate = taxRates[row.id] ?? 10
      const taxAmount = calcTax(row.amount, taxRate)
      const voucherNo = await generateVoucherNo(row.person, year)
      const { error } = await supabase.from('transactions').insert({
        person: row.person, date: row.date, account, amount: row.amount,
        tax_type: '課税仕入', tax_rate: taxRate, tax_amount: taxAmount,
        method: '未払金', payment_account: row.source_name || null,
        memo: row.description, year,
        card_verified: row.source_type === 'カード',  // ⬅️ v2.2.28
        is_closing: false, is_confirmed: false, is_void: false,
        is_printed: false, has_receipt: false, voucher_no: voucherNo,
      })
      if (error) throw new Error(error.message)
      await supabase.from('import_staging').delete().eq('id', row.id)
      setRows(prev => prev.filter(r => r.id !== row.id))
    } catch (e: any) {
      alert(`エラー: ${e.message}`)
    } finally {
      setApproving(prev => ({ ...prev, [row.id]: false }))
    }
  }

  async function deleteRow(id: string) {
    await supabase.from('import_staging').delete().eq('id', id)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  async function bulkApproveKeiji() {
    const keijiRows = rows.filter(r => (statuses[r.id] || r.status) === 'keiji')
    if (keijiRows.length === 0) { alert('経費ステータスの件数がありません'); return }
    if (!confirm(`経費${keijiRows.length}件をまとめて承認しますか？`)) return
    setBulkApproving(true)
    for (const row of keijiRows) {
      await approveRow(row)
    }
    setBulkApproving(false)
    alert('一括承認完了！')
  }

  const displayRows = rows.filter(r =>
    filterStatus === 'all' || (statuses[r.id] || r.status) === filterStatus
  )

  const counts = {
    keiji: rows.filter(r => (statuses[r.id] || r.status) === 'keiji').length,
    kataji: rows.filter(r => (statuses[r.id] || r.status) === 'kataji').length,
    confirm: rows.filter(r => (statuses[r.id] || r.status) === 'confirm').length,
    pending: rows.filter(r => (statuses[r.id] || r.status) === 'pending').length,
  }

  const statusColor = (s: string) => {
    if (s === 'keiji') return { bg: '#f0fdf4', border: '#16a34a', label: '経費', labelColor: '#16a34a' }
    if (s === 'kataji') return { bg: '#f3f4f6', border: '#9ca3af', label: '家事', labelColor: '#6b7280' }
    if (s === 'confirm') return { bg: '#fffbeb', border: '#f59e0b', label: '要確認', labelColor: '#d97706' }
    return { bg: 'white', border: '#e5e7eb', label: '未分類', labelColor: '#374151' }
  }

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <a href="/" style={{ padding: '8px 16px', background: '#e5e7eb', borderRadius: '6px', textDecoration: 'none', color: 'black', fontSize: '14px' }}>← 戻る</a>
        <h1 style={{ margin: 0, fontSize: '20px' }}>取込承認</h1>
        <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: 'auto' }}>{VERSION}</span>
      </div>

      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
        <button onClick={() => setPerson('hiroshi')}
          style={{ padding: '8px 20px', background: person === 'hiroshi' ? '#2563eb' : '#e5e7eb', color: person === 'hiroshi' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>廣！</button>
        <button onClick={() => setPerson('wife')}
          style={{ padding: '8px 20px', background: person === 'wife' ? '#2563eb​​​​​​​​​​​​​​​​
