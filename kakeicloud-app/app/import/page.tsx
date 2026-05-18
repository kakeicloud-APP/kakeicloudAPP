/**
 * kakeicloud v1.6.0 | 2026/05/18
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
  status: 'pending' | 'kataji' | 'matched' | 'unmatched' | 'imported'
  matchedVoucher?: string
  account?: string
  memo?: string
}

const TABS = ['弥生CSV', 'カードCSV', 'PDF', 'レシート']

export default function ImportPage() {
  const [tab, setTab] = useState('弥生CSV')
  const [person, setPerson] = useState<'hiroshi' | 'wife'>('hiroshi')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [threshold, setThreshold] = useState(10000)
  const [swipeStart, setSwipeStart] = useState<{ id: string; x: number } | null>(null)
  const [swipeOffset, setSwipeOffset] = useState<{ [id: string]: number }>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  // 既存仕訳を取得してマッチング
  async function matchWithExisting(importRows: ImportRow[]): Promise<ImportRow[]> {
    const { data: existing } = await supabase
      .from('transactions')
      .select('date, amount, voucher_no')
      .eq('person', person)

    return importRows.map(r => {
      if (r.amount < threshold) return { ...r, status: 'pending' }
      const match = existing?.find(e =>
        e.date === r.date && Math.abs(e.amount - r.amount) <= 10
      )
      if (match) return { ...r, status: 'matched', matchedVoucher: match.voucher_no }
      return { ...r, status: 'unmatched' }
    })
  }

  // 弥生CSV解析
  function parseYayoiCSV(text: string): ImportRow[] {
    const lines = text.split('\n').filter(l => l.trim())
    const result: ImportRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim())
      if (!cols[0]) continue
      result.push({
        id: `yayoi-${i}`,
        date: cols[0],
        description: cols[4] || '',
        amount: parseInt(cols[2] || cols[3] || '0') || 0,
        status: 'pending',
        account: cols[1] || '',
        memo: cols[4] || '',
      })
    }
    return result
  }

  // カードCSV解析（楽天カード形式）
  function parseCardCSV(text: string): ImportRow[] {
    const lines = text.split('\n').filter(l => l.trim())
    const result: ImportRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim())
      if (!cols[0]) continue
      const amount = parseInt(cols[3]?.replace(/[^0-9-]/g, '') || '0') || 0
      if (amount <= 0) continue
      result.push({
        id: `card-${i}`,
        date: cols[0].replace(/\//g, '-'),
        description: cols[1] || cols[2] || '',
        amount,
        status: 'pending',
      })
    }
    return result
  }

  // ファイル選択処理
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)

    if (tab === 'レシート') {
      await handleReceipt(file)
      setLoading(false)
      return
    }

    const text = await file.text()

    let parsed: ImportRow[] = []
    if (tab === '弥生CSV') {
      parsed = parseYayoiCSV(text)
    } else if (tab === 'カードCSV') {
      parsed = parseCardCSV(text)
      parsed = await matchWithExisting(parsed)
    } else if (tab === 'PDF') {
      parsed = await handlePDF(file)
      parsed = await matchWithExisting(parsed)
    }

    setRows(parsed)
    setLoading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // PDF処理（Claude API）
  async function handlePDF(file: File): Promise<ImportRow[]> {
    const base64 = await fileToBase64(file)
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'pdf',
        imageBase64: base64,
        mediaType: 'application/pdf',
      }),
    })
    const { data } = await res.json()
    if (!Array.isArray(data)) return []
    return data.map((d: any, i: number) => ({
      id: `pdf-${i}`,
      date: d.date || '',
      description: d.description || '',
      amount: Math.abs(d.amount || 0),
      status: 'pending' as const,
    }))
  }

  // レシート処理（Claude API）
  async function handleReceipt(file: File) {
    const base64 = await fileToBase64(file)
    const mediaType = file.type || 'image/jpeg'
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'receipt', imageBase64: base64, mediaType }),
    })
    const { data } = await res.json()
    if (!data) { alert('読み取りに失敗しました'); return }
    // フォームに自動入力するためURLパラメータで渡す
    const params = new URLSearchParams({
      date: data.date || '',
      amount: String(data.amount || ''),
      tax_amount: String(data.tax_amount || ''),
      tax_rate: String(data.tax_rate || 10),
      memo: data.memo || data.store_name || '',
      account: data.account || '',
      invoice_no: data.invoice_no || '',
    })
    window.location.href = `/?${params.toString()}&openForm=1`
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // スワイプ処理
  function onTouchStart(id: string, x: number) {
    setSwipeStart({ id, x })
  }

  function onTouchMove(id: string, x: number) {
    if (!swipeStart || swipeStart.id !== id) return
    const diff = x - swipeStart.x
    if (diff > 0) {
      setSwipeOffset(prev => ({ ...prev, [id]: Math.min(diff, 120) }))
    }
  }

  function onTouchEnd(id: string) {
    const offset = swipeOffset[id] || 0
    if (offset > 60) {
      setRows(prev => prev.map(r => r.id === id ? { ...r, status: 'kataji' } : r))
    }
    setSwipeOffset(prev => ({ ...prev, [id]: 0 }))
    setSwipeStart(null)
  }

  function undoKataji(id: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, status: 'pending' } : r))
  }

  // 取込実行
  async function importAll() {
    const targets = rows.filter(r => r.status !== 'kataji')
    if (targets.length === 0) { alert('取込対象がありません'); return }
    if (!confirm(`${targets.length}件を取込みます。よろしいですか？`)) return

    setLoading(true)
    const year = new Date().getFullYear()

    for (const r of targets) {
      await supabase.from('transactions').insert({
        person,
        date: r.date,
        account: r.account || '雑費',
        amount: r.amount,
        tax_type: '課税仕入',
        tax_rate: 10,
        tax_amount: Math.round(r.amount * 10 / 110),
        memo: r.description || r.memo || '',
        method: '未払金',
        year: parseInt(r.date.split('-')[0]) || year,
        is_closing: false,
        is_confirmed: false,
      })
    }

    setLoading(false)
    alert(`${targets.length}件を取込みました！`)
    setRows([])
  }

  const statusColor = (status: ImportRow['status'], amount: number) => {
    if (status === 'kataji') return '#f3f4f6'
    if (status === 'unmatched') return '#fef2f2'
    if (status === 'matched') return '#f0fdf4'
    if (amount >= threshold) return '#fffbeb'
    return 'white'
  }

  const statusBar = (status: ImportRow['status'], amount: number) => {
    if (status === 'kataji') return { color: '#9ca3af', label: '家事' }
    if (status === 'unmatched') return { color: '#dc2626', label: '未一致' }
    if (status === 'matched') return { color: '#16a34a', label: '一致' }
    if (amount >= threshold) return { color: '#f59e0b', label: '要確認' }
    return null
  }

  const pendingCount = rows.filter(r => r.status !== 'kataji').length
  const katajiCount = rows.filter(r => r.status === 'kataji').length

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>

      {/* ヘッダ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <a href="/" style={{ padding: '8px 16px', background: '#e5e7eb', borderRadius: '6px', textDecoration: 'none', color: 'black', fontSize: '14px' }}>← 戻る</a>
        <h1 style={{ margin: 0, fontSize: '20px' }}>📥 インポート</h1>
      </div>

      {/* 対象者 */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
        <button onClick={() => setPerson('hiroshi')}
          style={{ padding: '8px 20px', background: person === 'hiroshi' ? '#2563eb' : '#e5e7eb', color: person === 'hiroshi' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>廣！</button>
        <button onClick={() => setPerson('wife')}
          style={{ padding: '8px 20px', background: person === 'wife' ? '#2563eb' : '#e5e7eb', color: person === 'wife' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>妻</button>
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setRows([]) }}
            style={{ padding: '8px 16px', background: tab === t ? '#7c3aed' : '#e5e7eb', color: tab === t ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '13px' }}>{t}</button>
        ))}
      </div>

      {/* 金額閾値（カード・PDFのみ） */}
      {(tab === 'カードCSV' || tab === 'PDF') && (
        <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: '#92400e' }}>マッチング閾値：</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[5000, 10000, 30000].map(v => (
              <button key={v} onClick={() => setThreshold(v)}
                style={{ padding: '4px 10px', background: threshold === v ? '#f59e0b' : 'white', color: threshold === v ? 'white' : '#92400e', border: '1px solid #f59e0b', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                ¥{v.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ファイル選択 */}
      {tab !== 'レシート' && (
        <div style={{ marginBottom: '16px' }}>
          <input ref={fileRef} type="file"
            accept={tab === 'PDF' ? '.pdf' : '.csv'}
            onChange={handleFile}
            style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={loading}
            style={{ width: '100%', padding: '14px', background: loading ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
            {loading ? '解析中...' : `📁 ${tab}ファイルを選択`}
          </button>
        </div>
      )}

      {/* レシート */}
      {tab === 'レシート' && (
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

      {/* 凡例 */}
      {rows.length > 0 && (tab === 'カードCSV' || tab === 'PDF') && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap', fontSize: '11px' }}>
          <span>🟢 証憑一致</span>
          <span>🔴 未一致（¥{threshold.toLocaleString()}以上）</span>
          <span>🟡 要確認</span>
          <span>⬜ 家事除外</span>
          <span style={{ color: '#6b7280' }}>← 右スワイプで家事除外</span>
        </div>
      )}

      {/* 一覧 */}
      {rows.length > 0 && (
        <>
          <div style={{ marginBottom: '8px', fontSize: '13px', color: '#6b7280' }}>
            取込予定：{pendingCount}件　家事除外：{katajiCount}件
          </div>

          {rows.map(r => {
            const bar = statusBar(r.status, r.amount)
            const offset = swipeOffset[r.id] || 0
            return (
              <div key={r.id} style={{ position: 'relative', marginBottom: '6px', overflow: 'hidden', borderRadius: '8px' }}>
                {/* 家事ラベル（スワイプ時に出る） */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '80px', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#6b7280', fontWeight: 'bold', borderRadius: '8px' }}>
                  家事 →
                </div>

                {/* メインコンテンツ */}
                <div
                  onTouchStart={e => onTouchStart(r.id, e.touches[0].clientX)}
                  onTouchMove={e => onTouchMove(r.id, e.touches[0].clientX)}
                  onTouchEnd={() => onTouchEnd(r.id)}
                  style={{
                    transform: `translateX(${offset}px)`,
                    transition: offset === 0 ? 'transform 0.2s' : 'none',
                    background: statusColor(r.status, r.amount),
                    border: '1px solid #e5e7eb',
                    borderLeft: bar ? `4px solid ${bar.color}` : '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    opacity: r.status === 'kataji' ? 0.5 : 1,
                    position: 'relative',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '2px' }}>
                        <span style={{ fontSize: '11px', color: '#6b7280' }}>{r.date}</span>
                        {bar && (
                          <span style={{ fontSize: '10px', background: bar.color, color: 'white', padding: '1px 6px', borderRadius: '4px' }}>{bar.label}</span>
                        )}
                        {r.matchedVoucher && (
                          <span style={{ fontSize: '10px', color: '#16a34a' }}>{r.matchedVoucher}</span>
                        )}
                      </div>
                      <div style={{ fontSize: '13px' }}>{r.description || r.memo}</div>
                      {r.account && <div style={{ fontSize: '11px', color: '#6b7280' }}>{r.account}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 'bold' }}>¥{r.amount.toLocaleString()}</div>
                      {r.status === 'kataji' && (
                        <button onClick={() => undoKataji(r.id)}
                          style={{ fontSize: '11px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>戻す</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* 取込ボタン */}
          <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
            <button onClick={importAll} disabled={loading || pendingCount === 0}
              style={{ flex: 1, padding: '14px', background: pendingCount === 0 ? '#9ca3af' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: pendingCount === 0 ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
              ✅ {pendingCount}件を取込む
            </button>
            <button onClick={() => setRows([])}
              style={{ padding: '14px 20px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>クリア</button>
          </div>
        </>
      )}
    </div>
  )
}
