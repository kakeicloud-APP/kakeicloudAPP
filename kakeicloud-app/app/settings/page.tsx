// v2.2.21 app/settings/page.tsx ルール編集・口座編集・削除を編集内に移動・下部パディング追加
/**
 * kakeicloud v2.2.21 | 2026/05/24
 * kakeicloud-app/app/settings/page.tsx
 */

"use client"
import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { VERSION } from "../../lib/version"

type PaymentAccount = {
  id: string
  kind: string
  name: string
  person: string
  account_number?: string
  is_active: boolean
}

type Person = {
  id: string
  display_name: string
  full_name: string
  business_name: string
}

type ClassificationRule = {
  id: string
  keyword: string
  action: string
  account: string | null
  person: string
  priority: number
}

const KINDS = ["カード", "銀行", "電子マネー"]
const PERSONS = [
  { value: "hiroshi", label: "廣！" },
  { value: "wife", label: "妻" },
  { value: "both", label: "共通" },
]

const ALL_ACCOUNTS = {
  keiji: [
    '消耗品費', '通信費', '旅費交通費', '接待交際費', '地代家賃',
    '水道光熱費', '修繕費', '広告宣伝費', '外注費', '減価償却費',
    '車両費', '諸会費', '新聞図書費', '研修費', '支払手数料',
    '租税公課', '保険料', '雑費', '開業費償却'
  ],
  uriage: ['売上高'],
  kojyo: ['医療費', '寄附金', '社会保険料', '生命保険料', '地震保険料', '小規模企業共済'],
  sonota: ['普通預金', '現金', '未払金', '前払費用', '棚卸資産', '事業主貸', '事業主借', '雑収入'],
}

function AccountSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px" }}>
      <optgroup label="経費">
        {ALL_ACCOUNTS.keiji.map(a => <option key={a} value={a}>{a}</option>)}
      </optgroup>
      <optgroup label="売上">
        {ALL_ACCOUNTS.uriage.map(a => <option key={a} value={a}>{a}</option>)}
      </optgroup>
      <optgroup label="控除">
        {ALL_ACCOUNTS.kojyo.map(a => <option key={a} value={a}>{a}</option>)}
      </optgroup>
      <optgroup label="その他">
        {ALL_ACCOUNTS.sonota.map(a => <option key={a} value={a}>{a}</option>)}
      </optgroup>
    </select>
  )
}

export default function Settings() {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [persons, setPersons] = useState<Person[]>([])
  const [rules, setRules] = useState<ClassificationRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showAddRule, setShowAddRule] = useState(false)
  const [newKind, setNewKind] = useState("カード")
  const [newName, setNewName] = useState("")
  const [newAccountNumber, setNewAccountNumber] = useState("")
  const [newPerson, setNewPerson] = useState("hiroshi")
  const [bulkPerson, setBulkPerson] = useState<"hiroshi" | "wife">("hiroshi")
  const [bulkLoading, setBulkLoading] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [editingRule, setEditingRule] = useState<ClassificationRule | null>(null)  // ⬅️ v2.2.21
  const [editingAccount, setEditingAccount] = useState<PaymentAccount | null>(null)  // ⬅️ v2.2.21
  const [ruleKeyword, setRuleKeyword] = useState("")
  const [ruleAction, setRuleAction] = useState("keiji")
  const [ruleAccount, setRuleAccount] = useState("消耗品費")
  const [rulePerson, setRulePerson] = useState("both")
  const [openingDateHiroshi, setOpeningDateHiroshi] = useState("2025-01-01")
  const [openingDateWife, setOpeningDateWife] = useState("")
  const [savingDates, setSavingDates] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: a }, { data: p }, { data: r }, { data: s }] = await Promise.all([
      supabase.from("payment_accounts").select("*").order("kind").order("name"),
      supabase.from("persons").select("*"),
      supabase.from("classification_rules").select("*").order("priority", { ascending: false }).order("keyword"),
      supabase.from("settings").select("*"),
    ])
    setAccounts(a || [])
    setPersons(p || [])
    setRules(r || [])
    if (s) {
      const dh = s.find((row: any) => row.key === "opening_date_hiroshi")
      const dw = s.find((row: any) => row.key === "opening_date_wife")
      if (dh) setOpeningDateHiroshi(dh.value)
      if (dw) setOpeningDateWife(dw.value)
    }
    setLoading(false)
  }

  async function saveOpeningDates() {
    setSavingDates(true)
    try {
      await supabase.from("settings").upsert({ key: "opening_date_hiroshi", value: openingDateHiroshi })
      await supabase.from("settings").upsert({ key: "opening_date_wife", value: openingDateWife || "" })
      alert("開業日を保存しました！")
    } catch (e: any) {
      alert("保存エラー: " + e.message)
    } finally {
      setSavingDates(false)
    }
  }

  async function savePerson() {
    if (!editingPerson) return
    await supabase.from("persons").update({
      display_name: editingPerson.display_name,
      full_name: editingPerson.full_name,
      business_name: editingPerson.business_name,
    }).eq("id", editingPerson.id)
    setEditingPerson(null)
    fetchAll()
  }

  async function addAccount() {
    if (!newName.trim()) { alert("名前を入力してください"); return }
    await supabase.from("payment_accounts").insert({
      kind: newKind, name: newName,
      account_number: newAccountNumber || null,
      person: newPerson, is_active: true,
    })
    setNewName(""); setNewAccountNumber("")
    setShowAdd(false); fetchAll()
  }

  // ⬇️ v2.2.21: 口座編集
  async function updateAccount() {
    if (!editingAccount) return
    await supabase.from("payment_accounts").update({
      name: editingAccount.name,
      kind: editingAccount.kind,
      account_number: editingAccount.account_number || null,
      person: editingAccount.person,
    }).eq("id", editingAccount.id)
    setEditingAccount(null)
    fetchAll()
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from("payment_accounts").update({ is_active: !current }).eq("id", id)
    fetchAll()
  }

  // ⬇️ v2.2.21: 削除は編集画面内から呼ぶ
  async function deleteAccount(id: string) {
    if (!confirm("削除しますか？この操作は元に戻せません。")) return
    await supabase.from("payment_accounts").delete().eq("id", id)
    setEditingAccount(null)
    fetchAll()
  }

  async function addRule() {
    if (!ruleKeyword.trim()) { alert("キーワードを入力してください"); return }
    await supabase.from("classification_rules").insert({
      keyword: ruleKeyword, action: ruleAction,
      account: ruleAction === "keiji" ? ruleAccount : null,
      person: rulePerson, priority: 5,
    })
    setRuleKeyword(""); setRuleAction("keiji"); setRuleAccount("消耗品費")
    setShowAddRule(false); fetchAll()
  }

  // ⬇️ v2.2.21: ルール編集（keywordは変更不可）
  async function updateRule() {
    if (!editingRule) return
    await supabase.from("classification_rules").update({
      action: editingRule.action,
      account: editingRule.action === "keiji" ? editingRule.account : null,
      person: editingRule.person,
      priority: editingRule.priority,
    }).eq("id", editingRule.id)
    setEditingRule(null)
    fetchAll()
  }

  // ⬇️ v2.2.21: 削除は編集画面内から
  async function deleteRule(id: string) {
    if (!confirm("削除しますか？この操作は元に戻せません。")) return
    await supabase.from("classification_rules").delete().eq("id", id)
    setEditingRule(null)
    fetchAll()
  }

  async function bulkAssignVoucherNo() {
    const { data: unassigned } = await supabase
      .from("transactions").select("id, date, year")
      .eq("person", bulkPerson).is("voucher_no", null)
      .order("date", { ascending: true })
    if (!unassigned || unassigned.length === 0) { alert("採番が必要なデータはありません"); return }
    if (!confirm(`${bulkPerson === "hiroshi" ? "廣！" : "妻"}の${unassigned.length}件に採番します。よろしいですか？`)) return
    setBulkLoading(true)
    const prefix = bulkPerson === "hiroshi" ? "H" : "W"
    const years = [...new Set(unassigned.map((r: any) => r.year))]
    for (const year of years) {
      const { data: existing } = await supabase
        .from("transactions").select("voucher_no")
        .eq("person", bulkPerson).eq("year", year)
        .not("voucher_no", "is", null)
        .order("voucher_no", { ascending: false }).limit(1)
      let counter = 1
      if (existing && existing.length > 0 && existing[0].voucher_no) {
        counter = parseInt(existing[0].voucher_no.split("-")[1]) + 1
      }
      for (const record of unassigned.filter((r: any) => r.year === year)) {
        const voucherNo = `${prefix}${year}-${String(counter).padStart(4, "0")}`
        await supabase.from("transactions").update({ voucher_no: voucherNo }).eq("id", record.id)
        counter++
      }
    }
    setBulkLoading(false)
    alert("採番完了しました！")
  }

  const personLabel = (p: string) => p === "hiroshi" ? "廣！" : p === "wife" ? "妻" : "共通"

  const actionLabel = (a: string) => {
    if (a === "keiji") return { label: "経費", color: "#16a34a", bg: "#f0fdf4" }
    if (a === "kataji") return { label: "家事", color: "#6b7280", bg: "#f3f4f6" }
    return { label: "要確認", color: "#d97706", bg: "#fffbeb" }
  }

  return (
    // ⬇️ v2.2.21: paddingBottom追加（フローティングボタン対策）
    <div style={{ padding: "16px", fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto", paddingBottom: "120px" }}>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <a href="/" style={{ padding: "8px 16px", background: "#e5e7eb", borderRadius: "6px", textDecoration: "none", color: "black", fontSize: "14px" }}>← 戻る</a>
        <h1 style={{ margin: 0, fontSize: "20px" }}>設定</h1>
        <span style={{ fontSize: "11px", color: "#9ca3af", marginLeft: "auto" }}>{VERSION}</span>
      </div>

      {/* 人物マスター */}
      <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "15px", color: "#374151" }}>👤 人物マスター</h2>
        {persons.map(p => (
          <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px", marginBottom: "8px", background: "white" }}>
            {editingPerson?.id === p.id ? (
              <>
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ display: "block", fontSize: "11px", color: "#6b7280", marginBottom: "2px" }}>表示名</label>
                  <input value={editingPerson.display_name} onChange={e => setEditingPerson({ ...editingPerson, display_name: e.target.value })}
                    style={{ width: "100%", padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: "6px", boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ display: "block", fontSize: "11px", color: "#6b7280", marginBottom: "2px" }}>正式氏名（帳票用）</label>
                  <input value={editingPerson.full_name} onChange={e => setEditingPerson({ ...editingPerson, full_name: e.target.value })}
                    style={{ width: "100%", padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: "6px", boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "11px", color: "#6b7280", marginBottom: "2px" }}>屋号</label>
                  <input value={editingPerson.business_name} onChange={e => setEditingPerson({ ...editingPerson, business_name: e.target.value })}
                    placeholder="例：高鳥フェニックス"
                    style={{ width: "100%", padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: "6px", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={savePerson} style={{ flex: 1, padding: "8px", background: "#2563eb", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>保存</button>
                  <button onClick={() => setEditingPerson(null)} style={{ flex: 1, padding: "8px", background: "#e5e7eb", border: "none", borderRadius: "6px", cursor: "pointer" }}>キャンセル</button>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "15px", fontWeight: "bold" }}>{p.display_name}</div>
                  <div style={{ fontSize: "12px", color: "#374151", marginTop: "2px" }}>
                    {p.full_name && <span>氏名：{p.full_name}　</span>}
                    {p.business_name && <span>屋号：{p.business_name}</span>}
                  </div>
                </div>
                <button onClick={() => setEditingPerson(p)}
                  style={{ padding: "6px 16px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>編集</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 開業日マスター */}
      <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: "15px", color: "#374151" }}>📅 開業日マスター</h2>
        <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "16px" }}>開業日より前の仕訳は開業費として扱います</div>
        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", fontSize: "12px", color: "#374151", marginBottom: "4px", fontWeight: "bold" }}>廣！の開業日</label>
          <input type="date" value={openingDateHiroshi} onChange={e => setOpeningDateHiroshi(e.target.value)}
            style={{ width: "100%", padding: "10px", border: "1px solid #fed7aa", borderRadius: "8px", boxSizing: "border-box", fontSize: "15px" }} />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "12px", color: "#374151", marginBottom: "4px", fontWeight: "bold" }}>妻の開業日（任意）</label>
          <input type="date" value={openingDateWife} onChange={e => setOpeningDateWife(e.target.value)}
            style={{ width: "100%", padding: "10px", border: "1px solid #fed7aa", borderRadius: "8px", boxSizing: "border-box", fontSize: "15px" }} />
          <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>未設定の場合は空欄のままでOK</div>
        </div>
        <button onClick={saveOpeningDates} disabled={savingDates}
          style={{ width: "100%", padding: "12px", background: savingDates ? "#9ca3af" : "#f97316", color: "white", border: "none", borderRadius: "8px", cursor: savingDates ? "default" : "pointer", fontWeight: "bold", fontSize: "14px" }}>
          {savingDates ? "保存中..." : "💾 開業日を保存"}
        </button>
      </div>

      {/* 操作セクション */}
      <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "15px", color: "#374151" }}>📋 操作</h2>
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "8px" }}>一括採番</div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
            <button onClick={() => setBulkPerson("hiroshi")}
              style={{ flex: 1, padding: "8px", background: bulkPerson === "hiroshi" ? "#2563eb" : "#e5e7eb", color: bulkPerson === "hiroshi" ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer" }}>廣！</button>
            <button onClick={() => setBulkPerson("wife")}
              style={{ flex: 1, padding: "8px", background: bulkPerson === "wife" ? "#2563eb" : "#e5e7eb", color: bulkPerson === "wife" ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer" }}>妻</button>
          </div>
          <button onClick={bulkAssignVoucherNo} disabled={bulkLoading}
            style={{ width: "100%", padding: "10px", background: bulkLoading ? "#9ca3af" : "#f59e0b", color: "white", border: "none", borderRadius: "8px", cursor: bulkLoading ? "default" : "pointer", fontWeight: "bold" }}>
            {bulkLoading ? "採番中..." : "一括採番を実行"}
          </button>
        </div>
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "16px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "8px" }}>証憑票印刷</div>
          <a href="/" style={{ display: "block", width: "100%", padding: "10px", background: "#7c3aed", color: "white", borderRadius: "8px", fontWeight: "bold", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
            メイン画面の証憑票印刷へ →
          </a>
        </div>
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "16px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "8px" }}>インポート</div>
          <a href="/import" style={{ display: "block", width: "100%", padding: "10px", background: "#2563eb", color: "white", borderRadius: "8px", fontWeight: "bold", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
            インポート画面へ →
          </a>
        </div>
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "8px" }}>補助簿・明細帳</div>
          <a href="/ledger" style={{ display: "block", width: "100%", padding: "10px", background: "#0891b2", color: "white", borderRadius: "8px", fontWeight: "bold", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
            口座別明細帳へ →
          </a>
        </div>
      </div>

      {/* 消費税 */}
      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "15px", color: "#374151" }}>消費税設定</h2>
        <div style={{ fontSize: "13px", color: "#374151" }}>デフォルト税率：<strong style={{ fontSize: "16px", color: "#16a34a" }}>10%</strong></div>
        <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>入力フォームで0%/8%/10%に変更可能</div>
      </div>

      {/* 自動分類ルール */}
      <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "15px", color: "#374151" }}>自動分類ルール</h2>
        {!showAddRule && (
          <button onClick={() => setShowAddRule(true)}
            style={{ width: "100%", padding: "10px", background: "#7c3aed", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: "14px", marginBottom: "12px" }}>
            ＋ ルールを追加
          </button>
        )}
        {showAddRule && (
          <div style={{ border: "2px solid #7c3aed", borderRadius: "12px", padding: "16px", marginBottom: "12px", background: "white" }}>
            <div style={{ marginBottom: "10px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>キーワード</label>
              <input value={ruleKeyword} onChange={e => setRuleKeyword(e.target.value)} placeholder="例：ドコモ、AMAZON"
                style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: "10px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>アクション</label>
              <div style={{ display: "flex", gap: "8px" }}>
                {[
                  { value: "keiji", label: "経費", color: "#16a34a" },
                  { value: "kataji", label: "家事", color: "#6b7280" },
                  { value: "confirm", label: "要確認", color: "#d97706" },
                ].map(a => (
                  <button key={a.value} onClick={() => setRuleAction(a.value)}
                    style={{ flex: 1, padding: "8px", background: ruleAction === a.value ? a.color : "#e5e7eb", color: ruleAction === a.value ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>{a.label}</button>
                ))}
              </div>
            </div>
            {ruleAction === "keiji" && (
              <div style={{ marginBottom: "10px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>勘定科目</label>
                <AccountSelect value={ruleAccount} onChange={setRuleAccount} />
              </div>
            )}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>適用者</label>
              <div style={{ display: "flex", gap: "8px" }}>
                {PERSONS.map(p => (
                  <button key={p.value} onClick={() => setRulePerson(p.value)}
                    style={{ flex: 1, padding: "8px", background: rulePerson === p.value ? "#2563eb" : "#e5e7eb", color: rulePerson === p.value ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>{p.label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={addRule} style={{ flex: 1, padding: "10px", background: "#7c3aed", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>保存</button>
              <button onClick={() => { setShowAddRule(false); setRuleKeyword("") }} style={{ flex: 1, padding: "10px", background: "#e5e7eb", border: "none", borderRadius: "8px", cursor: "pointer" }}>キャンセル</button>
            </div>
          </div>
        )}

        {loading ? <div>読み込み中...</div> : (
          <>
            {["keiji", "kataji", "confirm"].map(action => {
              const filtered = rules.filter(r => r.action === action)
              if (filtered.length === 0) return null
              const al = actionLabel(action)
              return (
                <div key={action} style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "bold", color: al.color, marginBottom: "6px", paddingBottom: "4px", borderBottom: `1px solid ${al.color}` }}>
                    {al.label}
                  </div>
                  {filtered.map(r => (
                    <div key={r.id}>
                      {/* ⬇️ v2.2.21: ルール編集モード */}
                      {editingRule?.id === r.id ? (
                        <div style={{ border: "2px solid #7c3aed", borderRadius: "8px", padding: "12px", marginBottom: "6px", background: "white" }}>
                          <div style={{ marginBottom: "8px", padding: "6px 10px", background: "#f3f4f6", borderRadius: "6px", fontSize: "13px" }}>
                            <span style={{ color: "#6b7280", fontSize: "11px" }}>キーワード（変更不可）</span><br />
                            <strong>{r.keyword}</strong>
                          </div>
                          <div style={{ marginBottom: "8px" }}>
                            <label style={{ display: "block", fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>アクション</label>
                            <div style={{ display: "flex", gap: "6px" }}>
                              {[
                                { value: "keiji", label: "経費", color: "#16a34a" },
                                { value: "kataji", label: "家事", color: "#6b7280" },
                                { value: "confirm", label: "要確認", color: "#d97706" },
                              ].map(a => (
                                <button key={a.value} onClick={() => setEditingRule({ ...editingRule, action: a.value })}
                                  style={{ flex: 1, padding: "6px", background: editingRule.action === a.value ? a.color : "#e5e7eb", color: editingRule.action === a.value ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>{a.label}</button>
                              ))}
                            </div>
                          </div>
                          {editingRule.action === "keiji" && (
                            <div style={{ marginBottom: "8px" }}>
                              <label style={{ display: "block", fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>勘定科目</label>
                              <AccountSelect value={editingRule.account || "消耗品費"} onChange={v => setEditingRule({ ...editingRule, account: v })} />
                            </div>
                          )}
                          <div style={{ marginBottom: "10px" }}>
                            <label style={{ display: "block", fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>適用者</label>
                            <div style={{ display: "flex", gap: "6px" }}>
                              {PERSONS.map(p => (
                                <button key={p.value} onClick={() => setEditingRule({ ...editingRule, person: p.value })}
                                  style={{ flex: 1, padding: "6px", background: editingRule.person === p.value ? "#2563eb" : "#e5e7eb", color: editingRule.person === p.value ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>{p.label}</button>
                              ))}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button onClick={updateRule} style={{ flex: 2, padding: "8px", background: "#7c3aed", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "13px" }}>保存</button>
                            <button onClick={() => setEditingRule(null)} style={{ flex: 1, padding: "8px", background: "#e5e7eb", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>キャンセル</button>
                            <button onClick={() => deleteRule(r.id)} style={{ flex: 1, padding: "8px", background: "#fef2f2", border: "1px solid #dc2626", borderRadius: "6px", cursor: "pointer", fontSize: "13px", color: "#dc2626" }}>削除</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", padding: "8px 10px", background: al.bg, border: `1px solid ${al.color}30`, borderRadius: "8px", marginBottom: "4px" }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: "13px", fontWeight: "bold" }}>{r.keyword}</span>
                            {r.account && <span style={{ fontSize: "12px", color: "#6b7280", marginLeft: "8px" }}>→ {r.account}</span>}
                            <span style={{ fontSize: "11px", color: "#9ca3af", marginLeft: "8px" }}>（{personLabel(r.person)}）</span>
                          </div>
                          {/* ⬇️ v2.2.21: 削除→編集ボタンに変更 */}
                          <button onClick={() => setEditingRule(r)}
                            style={{ padding: "3px 12px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "6px", cursor: "pointer", fontSize: "11px", color: "#374151" }}>編集</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
            {rules.length === 0 && (
              <div style={{ textAlign: "center", color: "#9ca3af", padding: "20px", fontSize: "13px" }}>ルールが登録されていません</div>
            )}
          </>
        )}
      </div>

      {/* 口座管理 */}
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "15px", color: "#374151", marginBottom: "12px" }}>口座管理</h2>
        {!showAdd && (
          <button onClick={() => setShowAdd(true)}
            style={{ width: "100%", padding: "12px", background: "#16a34a", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: "14px", marginBottom: "16px" }}>
            ＋ 口座を追加
          </button>
        )}
        {showAdd && (
          <div style={{ border: "2px solid #16a34a", borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: "14px" }}>新規口座追加</h3>
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>種別</label>
              <div style={{ display: "flex", gap: "8px" }}>
                {KINDS.map(k => (
                  <button key={k} onClick={() => setNewKind(k)}
                    style={{ flex: 1, padding: "8px", background: newKind === k ? "#0891b2" : "#e5e7eb", color: newKind === k ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>{k}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>名前</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：楽天カード"
                style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>カード番号下4桁（任意）</label>
              <input value={newAccountNumber} onChange={e => setNewAccountNumber(e.target.value)} placeholder="例：1234"
                style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>名義</label>
              <div style={{ display: "flex", gap: "8px" }}>
                {PERSONS.map(p => (
                  <button key={p.value} onClick={() => setNewPerson(p.value)}
                    style={{ flex: 1, padding: "8px", background: newPerson === p.value ? "#2563eb" : "#e5e7eb", color: newPerson === p.value ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>{p.label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={addAccount} style={{ flex: 1, padding: "12px", background: "#16a34a", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>保存</button>
              <button onClick={() => { setShowAdd(false); setNewName(""); setNewAccountNumber("") }} style={{ flex: 1, padding: "12px", background: "#e5e7eb", border: "none", borderRadius: "8px", cursor: "pointer" }}>キャンセル</button>
            </div>
          </div>
        )}

        {loading ? <div>読み込み中...</div> : (
          <>
            {KINDS.map(kind => {
              const filtered = accounts.filter(a => a.kind === kind)
              if (filtered.length === 0) return null
              return (
                <div key={kind} style={{ marginBottom: "20px" }}>
                  <h3 style={{ fontSize: "13px", color: "#6b7280", borderBottom: "1px solid #e5e7eb", paddingBottom: "6px", marginBottom: "8px" }}>{kind}</h3>
                  {filtered.map(a => (
                    <div key={a.id}>
                      {/* ⬇️ v2.2.21: 口座編集モード */}
                      {editingAccount?.id === a.id ? (
                        <div style={{ border: "2px solid #2563eb", borderRadius: "10px", padding: "14px", marginBottom: "8px", background: "white" }}>
                          <div style={{ marginBottom: "10px" }}>
                            <label style={{ display: "block", fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>種別</label>
                            <div style={{ display: "flex", gap: "6px" }}>
                              {KINDS.map(k => (
                                <button key={k} onClick={() => setEditingAccount({ ...editingAccount, kind: k })}
                                  style={{ flex: 1, padding: "6px", background: editingAccount.kind === k ? "#0891b2" : "#e5e7eb", color: editingAccount.kind === k ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>{k}</button>
                              ))}
                            </div>
                          </div>
                          <div style={{ marginBottom: "10px" }}>
                            <label style={{ display: "block", fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>名前</label>
                            <input value={editingAccount.name} onChange={e => setEditingAccount({ ...editingAccount, name: e.target.value })}
                              style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px", boxSizing: "border-box", fontSize: "14px" }} />
                          </div>
                          <div style={{ marginBottom: "10px" }}>
                            <label style={{ display: "block", fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>番号下4桁（任意）</label>
                            <input value={editingAccount.account_number || ""} onChange={e => setEditingAccount({ ...editingAccount, account_number: e.target.value })}
                              placeholder="例：1234"
                              style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px", boxSizing: "border-box", fontSize: "14px" }} />
                          </div>
                          <div style={{ marginBottom: "12px" }}>
                            <label style={{ display: "block", fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>名義</label>
                            <div style={{ display: "flex", gap: "6px" }}>
                              {PERSONS.map(p => (
                                <button key={p.value} onClick={() => setEditingAccount({ ...editingAccount, person: p.value })}
                                  style={{ flex: 1, padding: "6px", background: editingAccount.person === p.value ? "#2563eb" : "#e5e7eb", color: editingAccount.person === p.value ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>{p.label}</button>
                              ))}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button onClick={updateAccount} style={{ flex: 2, padding: "10px", background: "#2563eb", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: "14px" }}>保存</button>
                            <button onClick={() => setEditingAccount(null)} style={{ flex: 1, padding: "10px", background: "#e5e7eb", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px" }}>キャンセル</button>
                            <button onClick={() => deleteAccount(a.id)} style={{ flex: 1, padding: "10px", background: "#fef2f2", border: "1px solid #dc2626", borderRadius: "8px", cursor: "pointer", fontSize: "13px", color: "#dc2626" }}>削除</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", marginBottom: "6px", background: a.is_active ? "white" : "#f9fafb", opacity: a.is_active ? 1 : 0.6 }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: "14px", fontWeight: "bold" }}>{a.name}</span>
                            {a.account_number && <span style={{ fontSize: "11px", color: "#9ca3af", marginLeft: "6px" }}>{a.account_number}</span>}
                            <span style={{ fontSize: "12px", color: a.person === "hiroshi" ? "#2563eb" : a.person === "wife" ? "#dc2626" : "#6b7280", marginLeft: "6px" }}>
                              （{personLabel(a.person)}）
                            </span>
                          </div>
                          {/* ⬇️ v2.2.21: 有効・編集ボタン（削除は編集画面内） */}
                          <button onClick={() => toggleActive(a.id, a.is_active)}
                            style={{ marginRight: "8px", padding: "4px 10px", background: a.is_active ? "#f0fdf4" : "#f3f4f6", border: `1px solid ${a.is_active ? "#16a34a" : "#9ca3af"}`, borderRadius: "6px", cursor: "pointer", fontSize: "12px", color: a.is_active ? "#16a34a" : "#9ca3af" }}>
                            {a.is_active ? "有効" : "無効"}
                          </button>
                          <button onClick={() => setEditingAccount(a)}
                            style={{ padding: "4px 12px", background: "#eff6ff", border: "1px solid #2563eb", borderRadius: "6px", cursor: "pointer", fontSize: "12px", color: "#2563eb" }}>編集</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
            {accounts.length === 0 && (
              <div style={{ textAlign: "center", color: "#9ca3af", padding: "40px", fontSize: "14px" }}>口座が登録されていません</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
