/**
 * kakeicloud v1.3.2 | 2026/05/18
 * kakeicloud-app/components/MemoPanel.tsx
 */

'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Memo = {
  id: string
  category: string
  title: string
  body: string
  created_at: string
}

const CATEGORIES = ['会計ルール', 'バグ']

export default function MemoPanel() {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('会計ルール')
  const [memos, setMemos] = useState<Memo[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { if (open) fetchMemos() }, [open, category])

  async function fetchMemos() {
    const { data } = await supabase
      .from('memos')
      .select('*')
      .eq('category', category)
      .order('created_at', { ascending: false })
    setMemos(data || [])
  }

  async function addMemo() {
    if (!newTitle.trim()) { alert('タイトルを入力してください'); return }
    const { error } = await supabase.from('memos').insert({ category, title: newTitle, body: newBody })
    if (error) { alert('保存エラー：' + error.message); return }
    setNewTitle('')
    setNewBody('')
    setShowAdd(false)
    fetchMemos()
  }

  async function deleteMemo(id: string) {
    if (!confirm('削除しますか？')) return
    await supabase.from('memos').delete().eq('id', id)
    fetchMemos()
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ position: 'fixed', bottom: '32px', right: '16px', zIndex: 500, width: '48px', height: '48px', borderRadius: '50%', background: '#7c3aed', color: 'white', border: 'none', fontSize: '22px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>📝</button>

      {open && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '360px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* ヘッダ */}
            <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', fontSize: '16px' }}>📝 メモ</span>
              <button onClick={() => { setOpen(false); setShowAdd(false) }}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}>✕</button>
            </div>

            {/* タブ */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => { setCategory(c); setShowAdd(false) }}
                  style={{ flex: 1, padding: '10px', border: 'none', background: category === c ? '#7c3aed' : 'white', color: category === c ? 'white' : '#666', cursor: 'pointer', fontSize: '13px', fontWeight: category === c ? 'bold' : 'normal' }}>{c}</button>
              ))}
            </div>

            {/* スクロールエリア */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
              {memos.length === 0 && !showAdd && (
                <div style={{ color: '#9ca3af', textAlign: 'center', padding: '24px', fontSize: '13px' }}>メモがありません</div>
              )}
              {memos.map(m => (
                <div key={m.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '8px', overflow: 'hidden' }}>
                  <div onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb' }}>
                    <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{m.title}</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>{expanded === m.id ? '▲' : '▼'}</span>
                      <button onClick={e => { e.stopPropagation(); deleteMemo(m.id) }}
                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '12px' }}>削除</button>
                    </div>
                  </div>
                  {expanded === m.id && m.body && (
                    <div style={{ padding: '10px 12px', fontSize: '13px', color: '#374151', whiteSpace: 'pre-wrap', borderTop: '1px solid #e5e7eb' }}>{m.body}</div>
                  )}
                </div>
              ))}

              {/* 追加フォーム（入力欄のみ） */}
              {showAdd && (
                <div style={{ border: '1px solid #7c3aed', borderRadius: '8px', padding: '12px' }}>
                  <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="タイトル"
                    style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px', marginBottom: '8px', boxSizing: 'border-box', fontSize: '13px' }} />
                  <textarea value={newBody} onChange={e => setNewBody(e.target.value)} placeholder="内容（任意）" rows={4}
                    style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px', boxSizing: 'border-box', fontSize: '13px', resize: 'vertical' }} />
                </div>
              )}
            </div>

            {/* フッター（スクロール外・常に表示） */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb', background: 'white' }}>
              {showAdd ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={addMemo}
                    style={{ flex: 1, padding: '12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>保存</button>
                  <button onClick={() => setShowAdd(false)}
                    style={{ flex: 1, padding: '12px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>キャンセル</button>
                </div>
              ) : (
                <button onClick={() => setShowAdd(true)}
                  style={{ width: '100%', padding: '12px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>＋ メモを追加</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
