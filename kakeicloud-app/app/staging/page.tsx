// v2.0.7 app/staging/page.tsx 取込承認ページ新規作成
/**
 * kakeicloud v2.0.7 | 2026/05/22
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
          style={{ padding: '8px 20px', background: person === 'wife' ? '#2563eb' : '#e5e7eb', color: person === 'wife' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>妻</button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', fontSize: '13px' }}>
        <span style={{ padding: '6px 12px', background: '#f0fdf4', border: '1px solid #16a34a', borderRadius: '6px', color: '#16a34a', fontWeight: 'bold' }}>経費 {counts.keiji}件</span>
        <span style={{ padding: '6px 12px', background: '#f3f4f6', border: '1px solid #9ca3af', borderRadius: '6px', color: '#6b7280' }}>家事 {counts.kataji}件</span>
        <span style={{ padding: '6px 12px', background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '6px', color: '#d97706' }}>要確認 {counts.confirm}件</span>
        <span style={{ padding: '6px 12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', color: '#374151' }}>未分類 {counts.pending}件</span>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: `全件 ${rows.length}` },
          { key: 'keiji', label: `経費 ${counts.keiji}` },
          { key: 'kataji', label: `家事 ${counts.kataji}` },
          { key: 'confirm', label: `要確認 ${counts.confirm}` },
          { key: 'pending', label: `未分類 ${counts.pending}` },
        ].map(f => (
          <button key={f.key} onClick={() => setFilterStatus(f.key as any)}
            style={{ padding: '6px 12px', background: filterStatus === f.key ? '#7c3aed' : '#f3f4f6', color: filterStatus === f.key ? 'white' : '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
            {f.label}
          </button>
        ))}
      </div>

      {counts.keiji > 0 && (
        <button onClick={bulkApproveKeiji} disabled={bulkApproving}
          style={{ width: '100%', padding: '14px', background: bulkApproving ? '#9ca3af' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: bulkApproving ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px', marginBottom: '16px' }}>
          {bulkApproving ? '承認中...' : `✅ 経費 ${counts.keiji}件を一括承認`}
        </button>
      )}

      {loading ? <div>読み込み中...</div> : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '14px' }}>
          承認待ちのデータはありません
        </div>
      ) : (
        displayRows.map(row => {
          const s = statuses[row.id] || row.status
          const { bg, border, label, labelColor } = statusColor(s)
          const isApproving = approving[row.id]
          return (
            <div key={row.id} style={{ background: bg, border: `1px solid ${border}`, borderLeft: `4px solid ${border}`, borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>{row.date}　{row.source_name}</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '2px' }}>{row.description}</div>
                  <div style={{ fontSize: '15px', color: '#1e293b' }}>¥{row.amount.toLocaleString()}</div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: labelColor, background: 'white', border: `1px solid ${border}`, borderRadius: '4px', padding: '2px 8px', marginLeft: '8px' }}>{label}</span>
              </div>

              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {[
                  { key: 'keiji', label: '経費' },
                  { key: 'kataji', label: '家事' },
                  { key: 'confirm', label: '要確認' },
                ].map(opt => (
                  <button key={opt.key}
                    onClick={() => setStatuses(prev => ({ ...prev, [row.id]: opt.key }))}
                    style={{ padding: '4px 10px', background: s === opt.key ? '#7c3aed' : '#f3f4f6', color: s === opt.key ? 'white' : '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {s === 'keiji' && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <select value={accounts[row.id] || KEIJI_ACCOUNTS[0]}
                    onChange={e => setAccounts(prev => ({ ...prev, [row.id]: e.target.value }))}
                    style={{ flex: 1, padding: '6px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px' }}>
                    {KEIJI_ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[0, 8, 10].map(r => (
                      <button key={r}
                        onClick={() => setTaxRates(prev => ({ ...prev, [row.id]: r }))}
                        style={{ padding: '6px 10px', background: (taxRates[row.id] ?? 10) === r ? '#dc2626' : '#f3f4f6', color: (taxRates[row.id] ?? 10) === r ? 'white' : '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                        {r}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                {s !== 'kataji' && (
                  <button onClick={() => approveRow(row)} disabled={isApproving}
                    style={{ flex: 1, padding: '10px', background: isApproving ? '#9ca3af' : '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: isApproving ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                    {isApproving ? '登録中...' : '✅ 承認'}
                  </button>
                )}
                <button onClick={() => deleteRow(row.id)}
                  style={{ padding: '10px 16px', background: s === 'kataji' ? '#6b7280' : '#e5e7eb', color: s === 'kataji' ? 'white' : '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  {s === 'kataji' ? '🗑 家事として削除' : '削除'}
                </button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
