/**
 * kakeicloud v1.6.0 | 2026/05/18
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

type Person = {
  id: string
  display_name: string
  full_name: string
  business_name: string
}

const KINDS = ['カード', '銀行', '電子マネー']
const PERSONS = [
  { value: 'hiroshi', label: '廣！' },
  { value: 'wife', label: '妻' },
  { value: 'both', label: '共通' },
]

export default function Settings() {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [persons, setPersons] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newKind, setNewKind] = useState('カード')
  const [newName, setNewName] = useState('')
  const [newPerson, setNewPerson] = useState('hiroshi')
  const [bulkPerson, setBulkPerson] = useState<'hiroshi' | 'wife'>('hiroshi')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)

  useEffect(() => { fetchAccounts(); fetchPersons() }, [])

  async function fetchAccounts() {
    setLoading(true)
    const { data } = await supabase
      .from('payment_accounts').select('*')
      .order('kind').order('name')
    setAccounts(data || [])
    setLoading(false)
  }

  async function fetchPersons() {
    const { data } = await supabase.from('persons').select('*')
    setPersons(data || [])
  }

  async function savePerson() {
    if (!editingPerson) return
    await supabase.from('persons').update({
      display_name: editingPerson.display_name,
      full_name: editingPerson.full_name,
      business_name: editingPerson.business_name,
    }).eq('id', editingPerson.id)
    setEditingPerson(null)
    fetchPersons()
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

  async function bulkAssignVoucherNo() {
    const { data: unassigned } = await supabase
      .from('transactions').select('id, date, year')
      .eq('person', bulkPerson).is('voucher_no', null)
      .order('date', { ascending: true })
    if (!unassigned || unassigned.length === 0) { alert('採番が必要なデータはありません'); return }
    if (!confirm(`${bulkPerson === 'hiroshi' ? '廣！' : '妻'}の${unassigned.length}件に採番します。よろしいですか？`)) return
    setBulkLoading(true)
    const prefix = bulkPerson === 'hiroshi' ? 'H' : 'W'
    const years = [...new Set(unassigned.map((r: any) => r.year))]
    for (const year of years) {
      const { count } = await supabase
        .from('transactions').select('*', { count: 'exact', head: true })
        .eq('person', bulkPerson).eq('year', year).not('voucher_no', 'is', null)
      let counter = (count || 0) + 1
      for (const record of unassigned.filter((r: any) => r.year === year)) {
        const voucherNo = `${prefix}${year}-${String(counter).padStart(4, '0')}`
        await supabase.from('transactions').update({ voucher_no: voucherNo }).eq('id', record.id)
        counter++
      }
    }
    setBulkLoading(false)
    alert('採番完了しました！')
  }

  const personLabel = (p: string) => {
    if (p === 'hiroshi') return '廣！'
    if (p === 'wife') return '妻'
    return '共通'
  }

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>

      {/* ヘッダ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <a href="/" style={{ padding: '8px 16px', background: '#e5e7eb', borderRadius: '6px', textDecoration: 'none', color: 'black', fontSize: '14px' }}>← 戻る</a>
        <h1 style={{ margin: 0, fontSize: '20px' }}>⚙️ 設定</h1>
      </div>

      {/* 人物マスター */}
      <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '15px', color: '#374151' }}>👤 人物マスター</h2>
        {persons.map(p => (
          <div key={p.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', marginBottom: '8px', background: 'white' }}>
            {editingPerson?.id === p.id ? (
              <>
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>表示名</label>
                  <input value={editingPerson.display_name}
                    onChange={e => setEditingPerson({ ...editingPerson, display_name: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>正式氏名（帳票用）</label>
                  <input value={editingPerson.full_name}
                    onChange={e => setEditingPerson({ ...editingPerson, full_name: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>屋号</label>
                  <input value={editingPerson.business_name}
                    onChange={e => setEditingPerson({ ...editingPerson, business_name: e.target.value })}
                    placeholder="例：高鳥フェニックス"
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={savePerson}
                    style={{ flex: 1, padding: '8px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>保存</button>
                  <button onClick={() => setEditingPerson(null)}
                    style={{ flex: 1, padding: '8px', background: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>キャンセル</button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: 'bold' }}>{p.display_name}</div>
                  <div style={{ fontSize: '12px', color: '#374151', marginTop: '2px' }}>
                    {p.full_name && <span>氏名：{p.full_name}　</span>}
                    {p.business_name && <span>屋号：{p.business_name}</span>}
                  </div>
                </div>
                <button onClick={() => setEditingPerson(p)}
                  style={{ padding: '6px 16px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>編集</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 操作セクション */}
      <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '15px', color: '#374151' }}>📋 操作</h2>

        {/* 一括採番 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>一括採番</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button onClick={() => setBulkPerson('hiroshi')}
              style={{ flex: 1, padding: '8px', background: bulkPerson === 'hiroshi' ? '#2563eb' : '#e5e7eb', color: bulkPerson === 'hiroshi' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>廣！</button>
            <button onClick={() => setBulkPerson('wife')}
              style={{ flex: 1, padding: '8px', background: bulkPerson === 'wife' ? '#2563eb' : '#e5e7eb', color: bulkPerson === 'wife' ? 'white' : 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>妻</button>
          </div>
          <button onClick={bulkAssignVoucherNo} disabled={bulkLoading}
            style={{ width: '100%', padding: '10px', background: bulkLoading ? '#9ca3af' : '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: bulkLoading ? 'default' : 'pointer', fontWeight: 'bold' }}>
            {bulkLoading ? '採番中...' : '🔢 一括採番を実行'}
          </button>
        </div>

        {/* 証憑票印刷 */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>証憑票印刷</div>
          <a href="/"
            style={{ display: 'block', width: '100%', padding: '10px', background: '#7c3aed', color: 'white', borderRadius: '8px', fontWeight: 'bold', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
            🖨 メイン画面の証憑票印刷へ →
          </a>
        </div>

        {/* インポート */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>インポート</div>
          <a href="/import"
            style={{ display: 'block', width: '100%', padding: '10px', background: '#2563eb', color: 'white', borderRadius: '8px', fontWeight: 'bold', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
            📥 インポート画面へ →
          </a>
        </div>
      </div>

      {/* 税率 */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '15px', color: '#374151' }}>💴 消費税設定</h2>
        <div style={{ fontSize: '13px', color: '#374151' }}>
          デフォルト税率：<strong style={{ fontSize: '16px', color: '#16a34a' }}>10%</strong>
        </div>
        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>入力フォームで0%/8%/10%に変更可能</div>
      </div>

      {/* 口座管理 */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '15px', color: '#374151', marginBottom: '12px' }}>💳 口座管理</h2>
        {!showAdd && (
          <button onClick={() => setShowAdd(true)}
            style={{ width: '100%', padding: '12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', marginBottom: '16px' }}>
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
                  <h3 style={{ fontSize: '13px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px', marginBottom: '8px' }}>{kind}</h3>
                  {filtered.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '6px', background: a.is_active ? 'white' : '#f9fafb', opacity: a.is_active ? 1 : 0.6 }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{a.name}</span>
                        <span style={{ fontSize: '12px', color: a.person === 'hiroshi' ? '#2563eb' : a.person === 'wife' ? '#dc2626' : '#6b7280', marginLeft: '6px' }}>
                          （{personLabel(a.person)}）
                        </span>
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
    </div>
  )
}
