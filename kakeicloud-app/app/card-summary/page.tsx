// v2.2.3 app/card-summary/page.tsx 全面作り直し・staging承認統合
/**
 * kakeicloud v2.2.3 | 2026/05/22
 * kakeicloud-app/app/card-summary/page.tsx
 */

'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { VERSION } from '../../lib/version'

type CardImport = {
  id: string
  card_type: string
  billing_month: string
  billing_total: number
  honcard_total: number
  kazoku_total: number
  etc_total: number
}

type StagingItem = {
  id: string
  person: string
  date: string
  description: string
  amount: number
  source_name: string
  card_import_id: string
}

type TxRow = {
  id: string
  person: string
  date: string
  account: string
  amount: number
  memo: string
  voucher_no?: string
  card_import_id: string
}

const KEIJI_ACCOUNTS = [
  '消耗品費', '通信費', '旅費交通費', '接待交際費', '地代家賃',
  '水道光熱費', '修繕費', '広告宣伝費', '外注費', '減価償却費',
  '車両費', '諸会費', '新聞図書費', '研修費', '支払手数料',
  '租税公課', '保険料', '雑費', '開業費償却'
]

export default function CardSummaryPage() {
  const [summaries, setSummaries] = useState<CardImport[]>([])
  const [stagingMap, setStagingMap] = useState<Record<string, StagingItem[]>>({})
  const [approvedMap, setApprovedMap] = useState<Record<string, TxRow[]>>({})
  const [accountMap, setAccountMap] = useState<Record<string, string>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data: ci } = await supabase
      .from('card_imports')
      .select('id, card_type, billing_month, billing_total, honcard_total, kazoku_total, etc_total')
      .eq('is_summary', true)
      .order('billing_month', { ascending: false })

    const summaryList = ci || []
    setSummaries(summaryList)
    if (summaryList.length === 0) { setLoading(false); return }

    const ids = summaryList.map(s => s.id)
    const [{ data: stagingData }, { data: txData }] = await Promise.all([
      supabase.from('import_staging')
        .select('id, person, date, description, amount, source_name, card_import_id')
        .in('card_import_id', ids).order('date'),
      supabase.from('transactions')
        .select('id, person, date, account, amount, memo, voucher_no, card_import_id')
        .in('card_import_id', ids).eq('is_void', false).order('date'),
    ])

    const sm: Record<string, StagingItem[]> = {}
    const am: Record<string, TxRow[]> = {}
    const acm: Record<string, string> = {}

    for (const item of (stagingData || [])) {
      if (!sm[item.card_import_id]) sm[item.card_import_id] = []
      sm[item.card_import_id].push(item)
      acm[item.id] = '消耗品費'
    }
    for (const tx of (txData || [])) {
      if (!am[tx.card_import_id]) am[tx.card_import_id] = []
      am[tx.card_import_id].push(tx)
    }

    setStagingMap(sm)
    setApprovedMap(am)
    setAccountMap(acm)
    setLoading(false)
  }

  async function generateVoucherNo(person: string, year: number): Promise<string> {
    const prefix = person === 'hiroshi' ? 'H' : 'W'
    const { data } = await supabase
      .from('transactions').select('voucher_no')
      .eq('person', person).eq('year', year)
      .not('voucher_no', 'is', null)
      .order('voucher_no', { ascending: false }).limit(1)
    let nextNum = 1
    if (data && data.length > 0 && data[0].voucher_no) {
      nextNum = parseInt(data[0].voucher_no.split('-')[1]) + 1
    }
    return `${prefix}${year}-${String(nextNum).padStart(4, '0')}`
  }

  async function approveItem(item: StagingItem, summary: CardImport) {
    const account = accountMap[item.id] || '消耗品費'
    setApprovingId(item.id)
    try {
      const year = parseInt(item.date.split('-')[0])
      const voucherNo = await generateVoucherNo(item.person, year)
      const taxAmount = Math.round(item.amount * 10 / 110)
      const { error } = await supabase.from('transactions').insert({
        person: item.person,
        date: item.date,
        account,
        amount: item.amount,
        tax_type: '課税仕入',
        tax_rate: 10,
        tax_amount: taxAmount,
        method: '未払金',
        payment_account: item.source_name,
        memo: `カード：${item.description}`,
        year,
        is_closing: false,
        is_confirmed: false,
        is_void: false,
        is_printed: false,
        has_receipt: false,
        voucher_no: voucherNo,
        card_import_id: summary.id,
      })
      if (error) throw new Error(error.message)
      await supabase.from('import_staging').delete().eq('id', item.id)

      setStagingMap(prev => ({
        ...prev,
        [summary.id]: (prev[summary.id] || []).filter(s => s.id !== item.id)
      }))
      setApprovedMap(prev => ({
        ...prev,
        [summary.id]: [...(prev[summary.id] || []), {
          id: voucherNo, person: item.person, date: item.date,
          account, amount: item.amount,
          memo: `カード：${item.description}`,
          voucher_no: voucherNo,
          card_import_id: summary.id,
        }]
      }))
    } catch (e: any) {
      alert(`エラー: ${e.message}`)
    } finally {
      setApprovingId(null)
    }
  }

  async function skipItem(item: StagingItem, summary: CardImport) {
    if (!confirm(`「${item.description}」を家事として除外しますか？`)) return
    await supabase.from('import_staging').delete().eq('id', item.id)
    setStagingMap(prev => ({
      ...prev,
      [summary.id]: (prev[summary.id] || []).filter(s => s.id !== item.id)
    }))
  }

  const byCard = new Map<string, CardImport[]>()
  for (const s of summaries) {
    if (!byCard.has(s.card_type)) byCard.set(s.card_type, [])
    byCard.get(s.card_type)!.push(s)
  }

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <a href="/" className="no-print" style={{ padding: '8px 16px', background: '#e5e7eb', borderRadius: '6px', textDecoration: 'none', color: 'black', fontSize: '14px' }}>← 戻る</a>
        <h1 style={{ margin: 0, fontSize: '20px' }}>カード明細照合</h1>
        <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: 'auto' }}>{VERSION}</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>読み込み中...</div>
      ) : byCard.size === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '14px', lineHeight: 1.8 }}>
          サマリーデータがありません。<br />
          取込ページ → カードCSV → ステップ1のサマリーページを先に読み取ってください。
        </div>
      ) : (
        Array.from(byCard.entries()).map(([cardName, months]) => (
          <div key={cardName} style={{ marginBottom: '24px', border: '2px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>

            <div style={{ background: '#1e293b', color: 'white', padding: '14px 16px' }}>
              <div style={{ fontSize: '17px', fontWeight: 'bold' }}>💳 {cardName}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{months.length}ヶ月分</div>
            </div>

            {months.map(summary => {
              const staging = stagingMap[summary.id] || []
              const approved = approvedMap[summary.id] || []
              const wifeApproved = approved.filter(t => t.person === 'wife').reduce((sum, t) => sum + t.amount, 0)
              const hiroshiApproved = approved.filter(t => t.person === 'hiroshi').reduce((sum, t) => sum + t.amount, 0)
              const isExpanded = expandedId === summary.id
              const wifeDiff = (summary.honcard_total || 0) - wifeApproved
              const hiroshiDiff = (summary.kazoku_total || 0) - hiroshiApproved
              const allDone = staging.length === 0 && approved.length > 0

              return (
                <div key={summary.id} style={{ borderTop: '1px solid #e5e7eb' }}>

                  <div onClick={() => setExpandedId(isExpanded ? null : summary.id)}
                    style={{ padding: '14px 16px', cursor: 'pointer', background: isExpanded ? '#f8fafc' : 'white', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{summary.billing_month}</span>
                        {staging.length > 0 && (
                          <span style={{ fontSize: '11px', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                            承認待ち {staging.length}件
                          </span>
                        )}
                        {allDone && (
                          <span style={{ fontSize: '11px', background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '10px' }}>
                            ✅ 完了
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        請求合計 ¥{(summary.billing_total || 0).toLocaleString()}
                        　妻 ¥{(summary.honcard_total || 0).toLocaleString()}
                        　廣！¥{(summary.kazoku_total || 0).toLocaleString()}
                        {(summary.etc_total || 0) > 0 && `　ETC ¥${summary.etc_total.toLocaleString()}`}
                      </div>
                    </div>
                    <span style={{ color: '#9ca3af', fontSize: '14px' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0 16px 16px', background: '#f8fafc' }}>

                      {/* 照合結果 */}
                      <div style={{ marginBottom: '14px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>照合結果</div>
                        <div style={{ fontSize: '13px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#2563eb' }}>妻（本カード）</span>
                          <span>
                            ¥{wifeApproved.toLocaleString()} / ¥{(summary.honcard_total || 0).toLocaleString()}
                            <span style={{ marginLeft: '8px', fontWeight: 'bold', color: wifeDiff === 0 ? '#16a34a' : '#f59e0b' }}>
                              {wifeDiff === 0 ? '✅ 一致' : `残 ¥${wifeDiff.toLocaleString()}`}
                            </span>
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#7c3aed' }}>廣！（家族カード）</span>
                          <span>
                            ¥{hiroshiApproved.toLocaleString()} / ¥{(summary.kazoku_total || 0).toLocaleString()}
                            <span style={{ marginLeft: '8px', fontWeight: 'bold', color: hiroshiDiff === 0 ? '#16a34a' : '#f59e0b' }}>
                              {hiroshiDiff === 0 ? '✅ 一致' : `残 ¥${hiroshiDiff.toLocaleString()}`}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* 承認待ち */}
                      {staging.length > 0 && (
                        <div style={{ marginBottom: '14px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#92400e', marginBottom: '8px' }}>
                            承認待ち（{staging.length}件）
                          </div>
                          {staging.map(item => (
                            <div key={item.id} style={{ background: 'white', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', marginBottom: '6px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <div>
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
                                    <span style={{ fontSize: '11px', color: '#6b7280' }}>{item.date}</span>
                                    <span style={{ fontSize: '10px', background: item.person === 'wife' ? '#dbeafe' : '#ede9fe', color: item.person === 'wife' ? '#1d4ed8' : '#7c3aed', padding: '1px 6px', borderRadius: '4px' }}>
                                      {item.person === 'wife' ? '妻' : '廣！'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '13px' }}>{item.description}</div>
                                </div>
                                <div style={{ fontWeight: 'bold', fontSize: '15px', flexShrink: 0, marginLeft: '8px' }}>
                                  ¥{item.amount.toLocaleString()}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <select
                                  value={accountMap[item.id] || '消耗品費'}
                                  onChange={e => setAccountMap(prev => ({ ...prev, [item.id]: e.target.value }))}
                                  style={{ flex: 1, padding: '6px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px' }}>
                                  {KEIJI_ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                                <button onClick={() => approveItem(item, summary)} disabled={!!approvingId}
                                  style={{ padding: '6px 16px', background: approvingId === item.id ? '#9ca3af' : '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: !!approvingId ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '13px', flexShrink: 0 }}>
                                  {approvingId === item.id ? '...' : '経費'}
                                </button>
                                <button onClick={() => skipItem(item, summary)} disabled={!!approvingId}
                                  style={{ padding: '6px 12px', background: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: !!approvingId ? 'default' : 'pointer', fontSize: '13px', flexShrink: 0 }}>
                                  家事
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 承認済 */}
                      {approved.length > 0 && (
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#065f46', marginBottom: '8px' }}>
                            承認済（{approved.length}件）
                          </div>
                          {approved.map((tx, idx) => (
                            <div key={idx} style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '8px 12px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                              <div style={{ flex: 1, overflow: 'hidden' }}>
                                <span style={{ color: '#6b7280', marginRight: '8px' }}>{tx.date}</span>
                                <span style={{ fontSize: '10px', background: tx.person === 'wife' ? '#dbeafe' : '#ede9fe', color: tx.person === 'wife' ? '#1d4ed8' : '#7c3aed', padding: '1px 5px', borderRadius: '3px', marginRight: '6px' }}>
                                  {tx.person === 'wife' ? '妻' : '廣！'}
                                </span>
                                <span style={{ color: '#16a34a', fontWeight: 'bold', marginRight: '6px' }}>{tx.account}</span>
                                <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.memo}</span>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, marginLeft: '8px' }}>
                                {tx.voucher_no && <span style={{ fontSize: '10px', color: '#6b7280' }}>{tx.voucher_no}</span>}
                                <span style={{ fontWeight: 'bold' }}>¥{tx.amount.toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {staging.length === 0 && approved.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '13px' }}>
                          明細データがありません。取込ページのステップ2から明細を読み取ってください。
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}
