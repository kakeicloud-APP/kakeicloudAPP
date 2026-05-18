/**
 * kakeicloud v1.7.0 | 2026/05/19
 * kakeicloud-app/app/ledger/page.tsx
 */

'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type StagingRow = {
  id: string
  person: string
  source_type: string
  source_name: string
  date: string
  description: string
  amount: number
  status: string
  transaction_id: string | null
}

const STATUS_OPTIONS = [
  { value: 'keiji', label: '経費', color: '#16a34a', bg: '#f0fdf4' },
  { value: 'kataji', label: '家事', color: '#6b7280', bg: '#f3f4f6' },
  { value: 'confirm', label: '要確認', color: '#d97706', bg: '#fffbeb' },
  { value: 'pending', label: '未分類', color: '#374151', bg: 'white' },
]

export default function LedgerPage() {
  const [person, setPerson] = useState<'hiroshi' | 'wife'>('hiroshi')
  const [rows, setRows] = useState<StagingRow[]>([])
  const [sources, setSources] = useState<string[]>([])
  const [selectedSource, setSelectedSource] = useState<string>('すべて')
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [showPrint, setShowPrint] = useState(false)

  useEffect(() => { fetchData() }, [person, selectedSource])

  async function fetchData() {
    setLoading(true)
    let query = supabase
      .from('import_staging')
      .select('*')
      .eq('person', person)
      .order('date', { ascending: true })

    if (selectedSource !== 'すべて') {
      query = query.eq('source_name', selectedSource)
    }

    const { data } = await query
    setRows(data || [])

    // 口座一覧取得
    const { data: all } = await supabase
      .from('import_staging')
      .select('source_name')
      .eq('person', person)
    const unique = [...new Set((all || []).map(r => r.source_name))]
    setSources(unique)
    setLoading(false)
  }

  async function changeStatus(id: string, status: string) {
    await supabase.from('import_staging').update({ status }).eq('id', id)
    setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r))
  }

  async function confirmKeiji() {
    const keijiRows = rows.filter(r => r.status === 'keiji' && !r.transaction_id)
    if (keijiRows.length === 0) { alert('確定する経費データがありません'); return }
    if (!confirm(`${keijiRows.length}件を経費として仕訳台帳に登録します。よろしいですか？`)) return

    setConfirming(true)
    for (const r of keijiRows) {
      const year = parseInt(r.date.split('-')[0]) || new Date().getFullYear()
      const { data: inserted } = await supabase.from('transactions').insert({
        person: r.person,
        date: r.date,
        account: '消耗品費',
        amount: r.amount,
        tax_type: '課税仕入',
        tax_rate: 10,
        tax_amount: Math.round(r.amount * 10 / 110),
        memo: r.description,
        method: '未払金',
        payment_account: r.source_name,
        year,
        is_closing: false,
        is_confirmed: false,
      }).select().single()

      if (inserted) {
        await supabase.from('import_staging')
          .update({ status: 'confirmed', transaction_id: inserted.id })
          .eq('id', r.id)
      }
    }

    setConfirming(false)
    alert(`${keijiRows.length}件を仕訳台帳に登録しました！`)
    fetchData()
  }

  async function deleteRow(id: string) {
    if (!confirm('削除しますか？')) return
    await supabase.from('import_staging').delete().eq('id', id)
    fetchData()
  }

  const printRows = selectedSource === 'すべて' ? rows : rows.filter(r => r.source_name === selectedSource)
  const keijiTotal = rows.filter(r => r.status === 'keiji').reduce((sum, r) => sum + r.amount, 0)
  const katajiTotal = rows.filter(r => r.status === 'kataji').reduce((sum, r) => sum + r.amount, 0)
  const confirmCount = rows.filter(r => r.status === 'confirm' || r.status === 'pending').length
  const keijiNotConfirmed = rows.filter(r => r.status === 'keiji' && !r.transaction_id).length

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>

      {/* ヘッダ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <a href="/settings" style={{ padding: '8px 16px', background: '#e5e7eb', borderRadius: '6px', textDecoration: 'none', color: 'black', fontSize: '14px' }}>← 設定</a>
        <h1 style={{ margin: 0, fontSize: '20px' }}>📒 口座別明細帳</h1>
      </div>

      {/* 対象者 */}
      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
        <button onClick={() => { setPerson('hiroshi'); setSelectedSource('すべて') }}
          style={{ padding: '8px 16px', background: person === 'hiroshi' ? '#2563eb' : '#e5e7eb', color: person === 'hiroshi' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>廣！</button>
        <button onClick={() => { setPerson('wife'); setSelectedSource('すべて') }}
          style={{ padding: '8px 16px', background: person === 'wife' ? '#2563eb' : '#e5e7eb', color: person === 'wife' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>妻</button>
      </div>

      {/* 口座フィルター */}
      <div style={{ marginBottom: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {['すべて', ...sources].map(s => (
          <button key={s} onClick={() => setSelectedSource(s)}
            style={{ padding: '6px 14px', background: selectedSource === s ? '#0891b2' : '#e5e7eb', color: selectedSource === s ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>{s}</button>
        ))}
      </div>

      {/* サマリー */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ background: '#f0fdf4', padding: '10px 16px', borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>経費合計</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#16a34a' }}>¥{keijiTotal.toLocaleString()}</div>
        </div>
        <div style={{ background: '#f3f4f6', padding: '10px 16px', borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>家事合計</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#6b7280' }}>¥{katajiTotal.toLocaleString()}</div>
        </div>
        {confirmCount > 0 && (
          <div style={{ background: '#fffbeb', padding: '10px 16px', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>未分類・要確認</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#d97706' }}>{confirmCount}件</div>
          </div>
        )}
      </div>

      {/* アクションボタン */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {keijiNotConfirmed > 0 && (
          <button onClick={confirmKeiji} disabled={confirming}
            style={{ padding: '10px 20px', background: confirming ? '#9ca3af' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: confirming ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
            {confirming ? '処理中...' : `✅ 経費${keijiNotConfirmed}件を仕訳台帳へ`}
          </button>
        )}
        <button onClick={() => setShowPrint(true)}
          style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
          🖨 補助簿印刷
        </button>
      </div>

      {/* 一覧 */}
      {loading ? <div>読み込み中...</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e5e7eb' }}>日付</th>
              <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e5e7eb' }}>摘要</th>
              <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e5e7eb' }}>口座</th>
              <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #e5e7eb' }}>金額</th>
              <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #e5e7eb' }}>区分</th>
              <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #e5e7eb' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const s = STATUS_OPTIONS.find(o => o.value === r.status) || STATUS_OPTIONS[3]
              const isKataji = r.status === 'kataji'
              return (
                <tr key={r.id} style={{ background: s.bg, opacity: isKataji ? 0.5 : 1 }}>
                  <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb', color: isKataji ? '#9ca3af' : '#374151' }}>{r.date}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isKataji ? '#9ca3af' : '#374151', fontStyle: isKataji ? 'italic' : 'normal' }}>{r.description}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb', fontSize: '11px', color: '#6b7280' }}>{r.source_name}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb', textAlign: 'right', color: isKataji ? '#9ca3af' : '#374151' }}>¥{r.amount.toLocaleString()}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                    <select value={r.status} onChange={e => changeStatus(r.id, e.target.value)}
                      style={{ padding: '3px 6px', border: `1px solid ${s.color}`, borderRadius: '4px', background: s.bg, color: s.color, fontSize: '12px', cursor: 'pointer' }}>
                      {STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                    {r.transaction_id && <span style={{ fontSize: '11px', color: '#16a34a', marginRight: '6px' }}>✅確定済</span>}
                    <button onClick={() => deleteRow(r.id)}
                      style={{ padding: '2px 8px', background: '#fef2f2', border: '1px solid #dc2626', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#dc2626' }}>削除</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {rows.length === 0 && !loading && (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '60px', fontSize: '14px' }}>
          データがありません。インポート画面からデータを取り込んでください。
        </div>
      )}

      {/* 補助簿印刷モーダル */}
      {showPrint && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'white', zIndex: 1000, overflow: 'auto' }}>
          <style>{`
            @media print {
              .no-print { display: none !important; }
              @page { size: A4 portrait; margin: 15mm; }
              body { margin: 0; }
              .kataji-row { color: #9ca3af !important; font-style: italic; }
            }
          `}</style>

          <div className="no-print" style={{ padding: '12px 16px', display: 'flex', gap: '8px', alignItems: 'center', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
            <span style={{ fontWeight: 'bold' }}>🖨 補助簿印刷プレビュー</span>
            <button onClick={() => window.print()}
              style={{ marginLeft: 'auto', padding: '8px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>印刷・PDF</button>
            <button onClick={() => setShowPrint(false)}
              style={{ padding: '8px 16px', background: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>閉じる</button>
          </div>

          <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
            {/* タイトル */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', margin: '0 0 4px' }}>
                {selectedSource === 'すべて' ? '口座別明細帳' : `${selectedSource} 明細帳`}
              </h2>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                {person === 'hiroshi' ? '廣！' : '妻'}　/　{printRows[0]?.date?.substring(0, 4) || ''}年
              </div>
            </div>

            {/* 集計 */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
              <div><span style={{ fontSize: '12px', color: '#6b7280' }}>経費合計：</span><strong>¥{keijiTotal.toLocaleString()}</strong></div>
              <div><span style={{ fontSize: '12px', color: '#6b7280' }}>家事合計：</span><span style={{ color: '#9ca3af' }}>¥{katajiTotal.toLocaleString()}</span></div>
            </div>

            {/* 明細テーブル */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', border: '1px solid #ccc' }}>日付</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', border: '1px solid #ccc' }}>摘要</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', border: '1px solid #ccc' }}>口座</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', border: '1px solid #ccc' }}>金額</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #ccc' }}>区分</th>
                </tr>
              </thead>
              <tbody>
                {printRows.map(r => {
                  const isKataji = r.status === 'kataji'
                  return (
                    <tr key={r.id} className={isKataji ? 'kataji-row' : ''} style={{ color: isKataji ? '#9ca3af' : '#000' }}>
                      <td style={{ padding: '5px 8px', border: '1px solid #ccc', fontStyle: isKataji ? 'italic' : 'normal' }}>{r.date}</td>
                      <td style={{ padding: '5px 8px', border: '1px solid #ccc', fontStyle: isKataji ? 'italic' : 'normal' }}>{isKataji ? `[家事] ${r.description}` : r.description}</td>
                      <td style={{ padding: '5px 8px', border: '1px solid #ccc', fontSize: '11px' }}>{r.source_name}</td>
                      <td style={{ padding: '5px 8px', border: '1px solid #ccc', textAlign: 'right' }}>¥{r.amount.toLocaleString()}</td>
                      <td style={{ padding: '5px 8px', border: '1px solid #ccc', textAlign: 'center', fontSize: '11px' }}>
                        {isKataji ? '家事' : r.status === 'keiji' ? '経費' : '要確認'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                  <td colSpan={3} style={{ padding: '6px 8px', border: '1px solid #ccc', textAlign: 'right' }}>経費合計</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #ccc', textAlign: 'right' }}>¥{keijiTotal.toLocaleString()}</td>
                  <td style={{ border: '1px solid #ccc' }}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
