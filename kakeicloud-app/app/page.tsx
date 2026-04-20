'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Transaction = {
  id: string
  person: string
  date: string
  account: string
  amount: number
  tax_type: string
  method: string
  memo: string
  year: number
  is_closing: boolean
}

export default function Home() {
  const [person, setPerson] = useState<'hiroshi' | 'wife'>('hiroshi')
  const [rows, setRows] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Transaction | null>(null)

  useEffect(() => {
    fetchData()
  }, [person])

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('person', person)
      .order('date', { ascending: true })
    setRows(data || [])
    setLoading(false)
  }

  async function saveEdit() {
    if (!editing) return
    await supabase
      .from('transactions')
      .update({
        date: editing.date,
        account: editing.account,
        amount: editing.amount,
        memo: editing.memo,
        person: editing.person,
      })
      .eq('id', editing.id)
    setEditing(null)
    fetchData()
  }

  async function deleteRow(id: string) {
    if (!confirm('削除しますか？')) return
    await supabase.from('transactions').delete().eq('id', id)
    fetchData()
  }

  const total = rows.reduce((sum, r) => {
    if (r.account === '売上' || r.account === '仕入返品') return sum
    return sum + r.amount
  }, 0)

  const income = rows.reduce((sum, r) => {
    if (r.account === '売上') return sum + r.amount
    return sum
  }, 0)

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '20px', marginBottom: '16px' }}>kakeicloud 仕訳台帳</h1>

      {/* 人切り替え */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setPerson('hiroshi')}
          style={{ padding: '8px 16px', background: person === 'hiroshi' ? '#2563eb' : '#e5e7eb', color: person === 'hiroshi' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >廣！</button>
        <button
          onClick={() => setPerson('wife')}
          style={{ padding: '8px 16px', background: person === 'wife' ? '#2563eb' : '#e5e7eb', color: person === 'wife' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >妻</button>
      </div>

      {/* サマリー */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div style={{ background: '#fef2f2', padding: '12px 20px', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#666' }}>経費合計</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626' }}>△{total.toLocaleString()}円</div>
        </div>
        <div style={{ background: '#f0fdf4', padding: '12px 20px', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#666' }}>売上合計</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#16a34a' }}>{income.toLocaleString()}円</div>
        </div>
        <div style={{ background: '#eff6ff', padding: '12px 20px', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#666' }}>件数</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{rows.length}件</div>
        </div>
      </div>

      {/* 一覧テーブル */}
      {loading ? <div>読み込み中...</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e5e7eb' }}>日付</th>
              <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e5e7eb' }}>科目</th>
              <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #e5e7eb' }}>金額</th>
              <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e5e7eb' }}>摘要</th>
              <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #e5e7eb' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{r.date}</td>
                <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb' }}>{r.account}</td>
                <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb', textAlign: 'right' }}>{r.amount.toLocaleString()}</td>
                <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.memo}</td>
                <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button onClick={() => setEditing(r)} style={{ marginRight: '4px', padding: '2px 8px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>編集</button>
                  <button onClick={() => deleteRow(r.id)} style={{ padding: '2px 8px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 編集モーダル */}
      {editing && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '360px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '16px' }}>仕訳編集</h2>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>日付</label>
              <input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })}
                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px' }} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>科目</label>
              <input value={editing.account} onChange={e => setEditing({ ...editing, account: e.target.value })}
                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px' }} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>金額</label>
              <input type="number" value={editing.amount} onChange={e => setEditing({ ...editing, amount: parseInt(e.target.value) })}
                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px' }} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>担当</label>
              <select value={editing.person} onChange={e => setEditing({ ...editing, person: e.target.value })}
                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                <option value="hiroshi">廣！</option>
                <option value="wife">妻</option>
              </select>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>摘要</label>
              <input value={editing.memo} onChange={e => setEditing({ ...editing, memo: e.target.value })}
                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={saveEdit} style={{ flex: 1, padding: '10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>保存</button>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: '10px', background: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

