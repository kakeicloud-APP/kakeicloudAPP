// v2.1.9 app/card-summary/page.tsx カード明細照合ページ新規作成
/**
 * kakeicloud v2.1.9 | 2026/05/22
 * kakeicloud-app/app/card-summary/page.tsx
 */

'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { VERSION } from '../../lib/version'

type TxRow = {
  id: string
  date: string
  account: string
  amount: number
  payment_account: string
  memo: string
}

type CardImport = {
  id: string
  card_type: string
  billing_month: string
  raw_text: string
}

type MonthlySummary = {
  payment_account: string
  month: string
  transactions: TxRow[]
  keiji_total: number
  keiji_count: number
  total: number
}

const KEIJI_ACCOUNTS = [
  '消耗品費', '通信費', '旅費交通費', '接待交際費', '地代家賃',
  '水道光熱費', '修繕費', '広告宣伝費', '外注費', '減価償却費',
  '車両費', '諸会費', '新聞図書費', '研修費', '支払手数料',
  '租税公課', '保険料', '雑費', '開業費償却'
]

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 2019 }, (_, i) => CURRENT_YEAR - i)

export default function CardSummaryPage() {
  const [person, setPerson] = useState<'hiroshi' | 'wife'>('hiroshi')
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR)
  const [transactions, setTransactions] = useState<TxRow[]>([])
  const [cardImports, setCardImports] = useState<CardImport[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [showRawText, setShowRawText] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [person, selectedYear])

  async function fetchData() {
    setLoading(true)
    const [{ data: txData }, { data: ciData }] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, date, account, amount, payment_account, memo')
        .eq('person', person)
        .eq('year', selectedYear)
        .eq('is_void', false)
        .not('payment_account', 'is', null)
        .order('date'),
      supabase
        .from('card_imports')
        .select('id, card_type, billing_month, raw_text')
        .order('billing_month', { ascending: false }),
    ])
    setTransactions(txData || [])
    setCardImports(ciData || [])
    setLoading(false)
  }

  // 月別集計
  const summaryMap = new Map<string, MonthlySummary>()
  for (const tx of transactions) {
    if (!tx.payment_account) continue
    const month = tx.date.slice(0, 7)
    const key = `${tx.payment_account}__${month}`
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        payment_account: tx.payment_account, month,
        transactions: [], keiji_total: 0, keiji_count: 0, total: 0,
      })
    }
    const s = summaryMap.get(key)!
    s.transactions.push(tx)
    s.total += tx.amount
    if (KEIJI_ACCOUNTS.includes(tx.account)) {
      s.keiji_total += tx.amount
      s.keiji_count++
    }
  }

  const summaries = Array.from(summaryMap.values())
    .sort((a, b) => a.payment_account !== b.payment_account
      ? a.payment_account.localeCompare(b.payment_account)
      : b.month.localeCompare(a.month))

  const byCard = new Map<string, MonthlySummary[]>()
  for (const s of summaries) {
    if (!byCard.has(s.payment_account)) byCard.set(s.payment_account, [])
    byCard.get(s.payment_account)!.push(s)
  }

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <a href="/" className="no-print" style={{ padding: '8px 16px', background: '#e5e7eb', borderRadius: '6px', textDecoration: 'none', color: 'black', fontSize: '14px' }}>← 戻る</a>
        <h1 style={{ margin: 0, fontSize: '20px' }}>カード明細照合</h1>
        <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: 'auto' }}>{VERSION}</span>
      </div>

      <div className="no-print" style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setPerson('hiroshi')}
          style={{ padding: '8px 20px', background: person === 'hiroshi' ? '#2563eb' : '#e5e7eb', color: person === 'hiroshi' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>廣！</button>
        <button onClick={() => setPerson('wife')}
          style={{ padding: '8px 20px', background: person === 'wife' ? '#2563eb' : '#e5e7eb', color: person === 'wife' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>妻</button>
        {YEARS.map(y => (
          <button key={y} onClick={() => setSelectedYear(y)}
            style={{ padding: '6px 14px', background: selectedYear === y ? '#1e293b' : '#f3f4f6', color: selectedYear === y ? 'white' : '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
            {y}
          </button>
        ))}
        <button onClick={() => window.print()}
          style={{ marginLeft: 'auto', padding: '8px 16px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
          🖨 印刷
        </button>
      </div>

      {loading ? <div>読み込み中...</div> : byCard.size === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>カード取引データがありません</div>
      ) : (
        Array.from(byCard.entries()).map(([cardName, months]) => {
          const cardTotal = months.reduce((sum, m) => sum + m.total, 0)
          const cardKeiji = months.reduce((sum, m) => sum + m.keiji_total, 0)
          const keijiRate = cardTotal > 0 ? Math.round(cardKeiji / cardTotal * 100) : 0

          return (
            <div key={cardName} style={{ marginBottom: '20px', border: '2px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>

              {/* カードヘッダー */}
              <div style={{ background: '#1e293b', color: 'white', padding: '12px 16px' }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '6px' }}>💳 {cardName}</div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', flexWrap: 'wrap' }}>
                  <span style={{ color: '#86efac' }}>経費計：¥{cardKeiji.toLocaleString()}</span>
                  <span style={{ color: '#cbd5e1' }}>合計：¥{cardTotal.toLocaleString()}</span>
                  <span style={{ color: keijiRate >= 30 ? '#86efac' : '#fca5a5', fontWeight: 'bold' }}>経費率：{keijiRate}%</span>
                </div>
              </div>

              {/* 月別行 */}
              {months.map(m => {
                const key = `${cardName}__${m.month}`
                const isExpanded = expandedKey === key
                const pct = m.total > 0 ? Math.round(m.keiji_total / m.total * 100) : 0
                const relatedImports = cardImports.filter(ci =>
                  ci.billing_month === m.month &&
                  ci.card_type.includes(cardName.split('（')[0].trim())
                )

                return (
                  <div key={m.month} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <div onClick={() => setExpandedKey(isExpanded ? null : key)}
                      style={{ padding: '12px 16px', cursor: 'pointer', background: isExpanded ? '#f8fafc' : 'white', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '15px' }}>{m.month}</span>
                          {relatedImports.length > 0 && (
                            <span style={{ fontSize: '10px', background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px' }}>📄 原本あり</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#6b7280', flexWrap: 'wrap' }}>
                          <span style={{ color: '#16a34a', fontWeight: 'bold' }}>経費 ¥{m.keiji_total.toLocaleString()}（{m.keiji_count}件）</span>
                          <span>合計 ¥{m.total.toLocaleString()}（{m.transactions.length}件）</span>
                          <span style={{ fontWeight: 'bold', color: pct >= 30 ? '#16a34a' : '#6b7280' }}>経費率 {pct}%</span>
                        </div>
                        {/* 経費率バー */}
                        <div style={{ marginTop: '6px', height: '4px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: '#16a34a', borderRadius: '2px' }} />
                        </div>
                      </div>
                      <span style={{ color: '#9ca3af', fontSize: '14px' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>

                        {/* 原本テキスト */}
                        {relatedImports.map(ci => (
                          <div key={ci.id} style={{ marginBottom: '10px' }}>
                            <button onClick={() => setShowRawText(showRawText === ci.id ? null : ci.id)}
                              style={{ padding: '6px 12px', background: '#eff6ff', border: '1px solid #3b82f6', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#1d4ed8' }}>
                              📄 原本明細（{ci.card_type}）{showRawText === ci.id ? ' ▲' : ' ▼'}
                            </button>
                            {showRawText === ci.id && (
                              <div style={{ marginTop: '6px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '10px', fontSize: '11px', color: '#374151', maxHeight: '200px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {ci.raw_text}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* 取引明細 */}
                        <div style={{ fontSize: '12px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>経費算入取引一覧</div>
                          {m.transactions
                            .filter(tx => KEIJI_ACCOUNTS.includes(tx.account))
                            .map(tx => (
                              <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', marginBottom: '2px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '4px' }}>
                                <div>
                                  <span style={{ color: '#6b7280', marginRight: '8px' }}>{tx.date}</span>
                                  <span style={{ color: '#16a34a', fontWeight: 'bold', marginRight: '6px' }}>{tx.account}</span>
                                  <span>{tx.memo}</span>
                                </div>
                                <span style={{ fontWeight: 'bold', flexShrink: 0, marginLeft: '8px' }}>¥{tx.amount.toLocaleString()}</span>
                              </div>
                            ))}
                          {m.transactions.filter(tx => !KEIJI_ACCOUNTS.includes(tx.account)).length > 0 && (
                            <>
                              <div style={{ fontWeight: 'bold', margin: '8px 0 6px', color: '#374151' }}>その他取引</div>
                              {m.transactions
                                .filter(tx => !KEIJI_ACCOUNTS.includes(tx.account))
                                .map(tx => (
                                  <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', marginBottom: '2px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                                    <div>
                                      <span style={{ color: '#6b7280', marginRight: '8px' }}>{tx.date}</span>
                                      <span style={{ color: '#6b7280', marginRight: '6px' }}>{tx.account}</span>
                                      <span>{tx.memo}</span>
                                    </div>
                                    <span style={{ flexShrink: 0, marginLeft: '8px' }}>¥{tx.amount.toLocaleString()}</span>
                                  </div>
                                ))}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })
      )}
    </div>
  )
}
