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
  voucher_no?: string
}

const ACCOUNTS = {
  経費: ['消耗品費', '通信費', '旅費交通費', '接待交際費', '地代家賃', '水道光熱費', '修繕費', '広告宣伝費', '外注費', '減価償却費', '雑費', '開業費償却'],
  売上: ['売上高'],
  その他: ['普通預金', '現金', '未払金', '前払費用', '雑収入'],
}

const METHOD_TO_CREDIT: Record<string, string> = {
  '現金': '現金',
  '銀行振込': '普通預金',
  'クレジットカード': '未払金',
  'PayPay': '未払金',
}

const TAX_TYPE: Record<string, string> = {
  経費: '課税仕入',
  売上: '課税売上',
  その他: '対象外',
}

export default function Home() {
  const [person, setPerson] = useState<'hiroshi' | 'wife'>('hiroshi')
  const [rows, setRows] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [savedVoucherNo, setSavedVoucherNo] = useState<string | null>(null)

  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0])
  const [newKind, setNewKind] = useState<'経費' | '売上' | 'その他'>('経費')
  const [newAccount, setNewAccount] = useState('消耗品費')
  const [newAmount, setNewAmount] = useState('')
  const [newMethod, setNewMethod] = useState('現金')
  const [newMemo, setNewMemo] = useState('')

  useEffect(() => { fetchData() }, [person])
  useEffect(() => { setNewAccount(ACCOUNTS[newKind][0]) }, [newKind])

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

  async function generateVoucherNo(p: string, year: number): Promise<string> {
    const prefix = p === 'hiroshi' ? 'H' : 'W'
    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('person', p)
      .eq('year', year)
    const num = String((count || 0) + 1).padStart(3, '0')
    return `${prefix}${year}-${num}`
  }

  async function saveNew() {
    if (!newAmount || parseInt(newAmount) <= 0) {
      alert('金額を入力してください')
      return
    }
    const year = parseInt(newDate.split('-')[0])
    const voucherNo = await generateVoucherNo(person, year)
    await supabase.from('transactions').insert({
      person,
      date: newDate,
      account: newAccount,
      amount: parseInt(newAmount),
      tax_type: TAX_TYPE[newKind],
      method: METHOD_TO_CREDIT[newMethod] || newMethod,
      memo: newMemo,
      year,
      is_closing: false,
      voucher_no: voucherNo,
    })
    setSavedVoucherNo(voucherNo)
    setShowForm(false)
    setNewDate(new Date().toISOString().split('T')[0])
    setNewKind('経費')
    setNewAmount('')
    setNewMethod('現金')
    setNewMemo('')
    fetchData()
  }

  async function saveEdit() {
    if (!editing) return
    await supabase.from('transactions').update({
      date: editing.date,
      account: editing.account,
      amount: editing.amount,
      memo: editing.memo,
      person: editing.person,
    }).eq('id', editing.id)
    setEditing(null)
    fetchData()
  }

  async function deleteRow(id: string) {
    if (!confirm('削除しますか？')) return
    await supabase.from('transactions').delete().eq('id', id)
    fetchData()
  }

  const total = rows.reduce((sum, r) => {
    if (r.account === '売上高' || r.account === '売上' || r.account === '仕入返品') return sum
    return sum + r.amount
  }, 0)

  const income = rows.reduce((sum, r) => {
    if (r.account === '売上高' || r.account === '売上') return sum + r.amount
    return sum
  }, 0)

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '20px', marginBottom: '16px' }}>kakeicloud 仕訳台帳</h1>

      {/* タブ＋新規ボタン */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
        <button onClick={() => setPerson('hiroshi')}
          style={{ padding: '8px 16px', background: person === 'hiroshi' ? '#2563eb' : '#e5e7eb', color: person === 'hiroshi' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>廣！</button>
        <button onClick={() => setPerson('wife')}
          style={{ padding: '8px 16px', background: person === 'wife' ? '#2563eb' : '#e5e7eb', color: person === 'wife' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>妻</button>
        <button onClick={() => setShowForm(true)}
          style={{ marginLeft: 'auto', padding: '8px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>＋ 新規入力</button>
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

      {/* 一覧 */}
      {loading ? <div>読み込み中...</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e5e7eb' }}>証憑番号</th>
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
                <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb', fontSize: '11px', color: '#6b7280' }}>{r.voucher_no || '－'}</td>
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

      {/* 新規入力モーダル */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '360px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '16px' }}>新規仕訳入力</h2>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>対象者</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setPerson('hiroshi')}
                  style={{ flex: 1, padding: '8px', background: person === 'hiroshi' ? '#2563eb' : '#e5e7eb', color: person === 'hiroshi' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>廣！</button>
                <button onClick={() => setPerson('wife')}
                  style={{ flex: 1, padding: '8px', background: person === 'wife' ? '#2563eb' : '#e5e7eb', color: person === 'wife' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>妻</button>
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>日付</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>種別</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['経費', '売上', 'その他'] as const).map(k => (
                  <button key={k} onClick={() => setNewKind(k)}
                    style={{ flex: 1, padding: '8px', background: newKind === k ? '#7c3aed' : '#e5e7eb', color: newKind === k ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>{k}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>科目</label>
              <select value={newAccount} onChange={e => setNewAccount(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                {ACCOUNTS[newKind].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>金額</label>
              <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="0"
                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>支払方法</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {Object.keys(METHOD_TO_CREDIT).map(m => (
                  <button key={m} onClick={() => setNewMethod(m)}
                    style={{ padding: '6px 12px', background: newMethod === m ? '#0891b2' : '#e5e7eb', color: newMethod === m ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>{m}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>摘要</label>
              <input value={newMemo} onChange={e => setNewMemo(e.target.value)} placeholder="例：Amazon 文房具"
                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>

            {/* 仕訳プレビュー */}
            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px' }}>
              <div style={{ color: '#666', marginBottom: '4px' }}>仕訳プレビュー</div>
              <div>借方: <strong>{newAccount}</strong> / 貸方: <strong>{METHOD_TO_CREDIT[newMethod]}</strong></div>
              <div>税区分: <strong>{TAX_TYPE[newKind]}</strong></div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={saveNew}
                style={{ flex: 1, padding: '12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>保存</button>
              <button onClick={() => setShowForm(false)}
                style={{ flex: 1, padding: '12px', background: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* 証憑番号表示モーダル */}
      {savedVoucherNo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: 'white', padding: '32px', borderRadius: '12px', width: '300px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>保存完了！証憑番号</div>
            <div style={{ fontSize: '36px', fontWeight: 'bold', letterSpacing: '2px', marginBottom: '20px', color: '#1e293b' }}>{savedVoucherNo}</div>
            <button onClick={() => { navigator.clipboard.writeText(savedVoucherNo); alert('コピーしました！') }}
              style={{ width: '100%', padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', marginBottom: '8px' }}>📋 コピー</button>
            <button onClick={() => setSavedVoucherNo(null)}
              style={{ width: '100%', padding: '10px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>閉じる</button>
          </div>
        </div>
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
