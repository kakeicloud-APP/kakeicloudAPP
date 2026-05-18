/**
 * kakeicloud v1.5.0 | 2026/05/18
 * kakeicloud-app/app/settings/page.tsx
 */

'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type PaymentAccount = {
  id: string
  kind: string
  name: string
  person: string
  is_active: boolean
}

const KINDS = ['カード', '銀行', '電子マネー']
const PERSONS = [
  { value: 'hiroshi', label: '廣！' },
  { value: 'wife', label: '妻' },
  { value: 'both', label: '共通' },
]

export default function Settings() {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newKind, setNewKind] = useState('カード')
  const [newName, setNewName] = useState('')
  const [newPerson, setNewPerson] = useState('hiroshi')

  useEffect(() => { fetchAccounts() }, [])

  async function fetchAccounts() {
    setLoading(true)
    const { data } = await supabase
      .from('payment_accounts')
      .select('*')
      .order('kind').order('name')
    setAccounts(data || [])
    setLoading(false)
  }

  async function addAccount() {
    if (!newName.trim()) { alert('名前を入力してください'); return }
    await supabase.from('payment_accounts').insert({
      kind: newKind, name: newName, person: newPerson, is_active: true,
    })
    setNewName('')
    setShowAdd(false)
    fetchAccounts()
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('payment_accounts').update({ is_active: !current }).eq('id', id)
    fetchAccounts()
  }

  async function deleteAccount(id: string) {
    if (!confirm('削除しますか？')) return
    await supabase.from('payment_accounts').delete().eq('id', id)
    fetchAccounts()
  }

  const personLabel = (p: string) => PERSONS.find(x => x.value === p)?.label || p

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <a href="/" style={{ padding: '8px 16px', background: '#e5e7eb', borderRadius: '6px', textDecoration: 'none', color: 'black', fontSize: '14px' }}>← 戻る</a>
        <h1 style={{ margin: 0, fontSize: '20px' }}>⚙️ 支払口座管理</h1>
      </div>

      {!showAdd && (
        <button onClick={() => setShowAdd(true)}
          style={{ width: '100%', padding: '12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', marginBottom: '16px' }}>
          ＋ 口座を追加
        </button>
      )}

      {showAdd && (
        <div style={{ border: '2px solid #16a34a', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>新規口座追加</h3>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>種別</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {KINDS.map(k => (
                <button key={k} onClick={() => setNewKind(k)}
                  style={{ flex: 1, padding: '8px', background: newKind === k ? '#0891b2' : '#e5e7eb', color: newKind === k ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>{k}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>名前</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：楽天カード"
              style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>名義</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {PERSONS.map(p => (
                <button key={p.value} onClick={() => setNewPerson(p.value)}
                  style={{ flex: 1, padding: '8px', background: newPerson === p.value ? '#2563eb' : '#e5e7eb', color: newPerson === p.value ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>{p.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={addAccount}
              style={{ flex: 1, padding: '12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>保存</button>
            <button onClick={() => { setShowAdd(false); setNewName('') }}
              style={{ flex: 1, padding: '12px', background: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>キャンセル</button>
          </div>
        </div>
      )}

      {loading ? <div>読み込み中...</div> : (
        <>
          {KINDS.map(kind => {
            const filtered = accounts.filter(a => a.kind === kind)
            if (filtered.length === 0) return null
            return (
              <div key={kind} style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '14px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px', marginBottom: '8px' }}>{kind}</h2>
                {filtered.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '6px', background: a.is_active ? 'white' : '#f9fafb', opacity: a.is_active ? 1 : 0.6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{a.name}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>{personLabel(a.person)}</div>
                    </div>
                    <button onClick={() => toggleActive(a.id, a.is_active)}
                      style={{ marginRight: '8px', padding: '4px 10px', background: a.is_active ? '#f0fdf4' : '#f3f4f6', border: `1px solid ${a.is_active ? '#16a34a' : '#9ca3af'}`, borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: a.is_active ? '#16a34a' : '#9ca3af' }}>
                      {a.is_active ? '有効' : '無効'}
                    </button>
                    <button onClick={() => deleteAccount(a.id)}
                      style={{ padding: '4px 10px', background: '#fef2f2', border: '1px solid #dc2626', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#dc2626' }}>削除</button>
                  </div>
                ))}
              </div>
            )
          })}
          {accounts.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px', fontSize: '14px' }}>口座が登録されていません</div>
          )}
        </>
      )}
    </div>
  )
}
