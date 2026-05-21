/**
 * kakeicloud v1.9.3 | 2026/05/20
 * kakeicloud-app/app/page.tsx
 */

"use client"
import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { VERSION } from "../lib/version"

type Transaction = {
  id: string
  person: string
  date: string
  account: string
  amount: number
  tax_type: string
  tax_rate?: number
  tax_amount?: number
  invoice_no?: string
  method: string
  payment_account?: string
  memo: string
  note?: string
  year: number
  is_closing: boolean
  is_confirmed: boolean
  voucher_no?: string
}

type PaymentAccount = {
  id: string
  kind: string
  name: string
  person: string
  is_active: boolean
}

const ACCOUNTS = {
  keiji: ["消耗品費", "通信費", "旅費交通費", "接待交際費", "地代家賃", "水道光熱費", "修繕費", "広告宣伝費", "外注費", "減価償却費", "雑費", "開業費償却"],
  uriage: ["売上高"],
  kojyo: ["医療費", "寄附金", "社会保険料", "生命保険料", "地震保険料", "小規模企業共済"],
  sonota: ["普通預金", "現金", "未払金", "前払費用", "雑収入"],
}

const ACCOUNT_LABELS: Record<string, string> = {
  keiji: "経費", uriage: "売上", kojyo: "控除", sonota: "その他"
}

const KIND_TO_METHOD: Record<string, string> = {
  genkin: "現金", card: "未払金", bank: "普通預金", emoney: "未払金",
}

const PAYMENT_KINDS = [
  { key: "genkin", label: "現金" },
  { key: "card", label: "カード" },
  { key: "bank", label: "銀行" },
  { key: "emoney", label: "電子マネー" },
]

const TAX_TYPE: Record<string, string> = {
  keiji: "課税仕入", uriage: "課税売上", kojyo: "対象外", sonota: "対象外",
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 2019 }, (_, i) => CURRENT_YEAR - i)

function calcTax(amount: number, rate: number): number {
  if (rate === 0) return 0
  return Math.round(amount * rate / (100 + rate))
}

function methodToKind(method: string): string {
  if (method === "現金") return "現金"
  if (method === "普通預金") return "銀行"
  return "カード"
}

export default function Home() {
  const [person, setPerson] = useState<"hiroshi" | "wife">("hiroshi")
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR)
  const [rows, setRows] = useState<Transaction[]>([])
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [savedVoucherNo, setSavedVoucherNo] = useState<string | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [showPrint, setShowPrint] = useState(false)
  const [printPage, setPrintPage] = useState(0)

  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0])
  const [newKind, setNewKind] = useState("keiji")
  const [newAccount, setNewAccount] = useState("消耗品費")
  const [newAmount, setNewAmount] = useState("")
  const [newTaxRate, setNewTaxRate] = useState(10)
  const [newTaxAmount, setNewTaxAmount] = useState(0)
  const [newInvoiceNo, setNewInvoiceNo] = useState("")
  const [newPaymentKind, setNewPaymentKind] = useState("card")
  const [newPaymentAccount, setNewPaymentAccount] = useState("")
  const [newMemo, setNewMemo] = useState("")
  const [newNote, setNewNote] = useState("")

  useEffect(() => { fetchData(); fetchPaymentAccounts() }, [person, selectedYear])
  useEffect(() => {
    const keys = Object.keys(ACCOUNTS) as (keyof typeof ACCOUNTS)[]
    const key = keys.find(k => k === newKind) || "keiji"
    setNewAccount(ACCOUNTS[key][0])
  }, [newKind])
  useEffect(() => {
    const filtered = filteredPaymentAccounts(newPaymentKind)
    setNewPaymentAccount(filtered[0]?.name || "")
  }, [newPaymentKind, person, paymentAccounts])

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase
      .from("transactions").select("*")
      .eq("person", person)
      .eq("year", selectedYear)
      .order("date", { ascending: true })
    setRows(data || [])
    setLoading(false)
  }

  async function fetchPaymentAccounts() {
    const { data } = await supabase
      .from("payment_accounts").select("*")
      .eq("is_active", true).order("kind").order("name")
    setPaymentAccounts(data || [])
  }

  function filteredPaymentAccounts(kind: string) {
    const kindMap: Record<string, string> = { genkin: "現金", card: "カード", bank: "銀行", emoney: "電子マネー" }
    return paymentAccounts.filter(a =>
      a.kind === kindMap[kind] && (a.person === person || a.person === "both")
    )
  }

  const printableRows = rows.filter(r => r.voucher_no)
  const totalPrintPages = Math.ceil(printableRows.length / 8)

  function getPageRows(page: number): (Transaction | null)[] {
    const result: (Transaction | null)[] = []
    for (let i = 0; i < 8; i++) {
      const idx = page * 8 + i
      result.push(printableRows[idx] || null)
    }
    return result
  }

  async function generateVoucherNo(p: string, year: number): Promise<string> {
    const prefix = p === "hiroshi" ? "H" : "W"
    const { count } = await supabase
      .from("transactions").select("*", { count: "exact", head: true })
      .eq("person", p).eq("year", year)
    const num = String((count || 0) + 1).padStart(4, "0")
    return `${prefix}${year}-${num}`
  }

  async function bulkAssignVoucherNo() {
    const { data: unassigned } = await supabase
      .from("transactions").select("id, date, year")
      .eq("person", person).is("voucher_no", null)
      .order("date", { ascending: true })
    if (!unassigned || unassigned.length === 0) { alert("採番が必要なデータはありません"); return }
    if (!confirm(`${unassigned.length}件に証憑番号を採番します。よろしいですか？`)) return
    setBulkLoading(true)
    const prefix = person === "hiroshi" ? "H" : "W"
    const years = [...new Set(unassigned.map(r => r.year))]
    for (const year of years) {
      const { count } = await supabase
        .from("transactions").select("*", { count: "exact", head: true })
        .eq("person", person).eq("year", year).not("voucher_no", "is", null)
      let counter = (count || 0) + 1
      for (const record of unassigned.filter(r => r.year === year)) {
        const voucherNo = `${prefix}${year}-${String(counter).padStart(4, "0")}`
        await supabase.from("transactions").update({ voucher_no: voucherNo }).eq("id", record.id)
        counter++
      }
    }
    setBulkLoading(false)
    alert("採番完了しました！")
    fetchData()
  }

  function copyVoucher(r: Transaction) {
    const line1 = `${r.voucher_no}  ${r.date}`
    const line2 = `${r.account} ¥${r.amount.toLocaleString()}（¥${(r.tax_amount || 0).toLocaleString()}）`
    navigator.clipboard.writeText(`${line1}\n${line2}`)
    alert(`コピーしました！\n${line1}\n${line2}`)
  }

  async function saveNew() {
    if (!newAmount || parseInt(newAmount) <= 0) { alert("金額を入力してください"); return }
    const year = parseInt(newDate.split("-")[0])
    const voucherNo = await generateVoucherNo(person, year)
    const method = KIND_TO_METHOD[newPaymentKind]
    const { error } = await supabase.from("transactions").insert({
      person, date: newDate, account: newAccount,
      amount: parseInt(newAmount),
      tax_type: TAX_TYPE[newKind], tax_rate: newTaxRate, tax_amount: newTaxAmount,
      invoice_no: newInvoiceNo || null,
      method,
      payment_account: newPaymentKind !== "genkin" ? newPaymentAccount || null : null,
      memo: newMemo, note: newNote,
      year, is_closing: false, is_confirmed: false, voucher_no: voucherNo,
    })
    if (error) { alert("保存エラー: " + error.message); return }
    setShowForm(false)
    setNewDate(new Date().toISOString().split("T")[0])
    setNewKind("keiji"); setNewAmount(""); setNewTaxRate(10); setNewTaxAmount(0)
    setNewInvoiceNo(""); setNewPaymentKind("card"); setNewPaymentAccount("")
    setNewMemo(""); setNewNote("")
    fetchData()
    setSavedVoucherNo(voucherNo)
  }

  async function toggleConfirmed(id: string, current: boolean) {
    await supabase.from("transactions").update({ is_confirmed: !current }).eq("id", id)
    fetchData()
  }

  async function saveEdit() {
    if (!editing) return
    await supabase.from("transactions").update({
      date: editing.date, account: editing.account, amount: editing.amount,
      tax_rate: editing.tax_rate, tax_amount: editing.tax_amount,
      invoice_no: editing.invoice_no || null,
      method: editing.method, payment_account: editing.payment_account || null,
      memo: editing.memo, note: editing.note, person: editing.person,
    }).eq("id", editing.id)
    setEditing(null)
    fetchData()
  }

  async function deleteRow(id: string) {
    if (!confirm("削除しますか？")) return
    await supabase.from("transactions").delete().eq("id", id)
    fetchData()
  }

  const kojyoAccounts = ["医療費", "寄附金", "社会保険料", "生命保険料", "地震保険料", "小規模企業共済"]
  const total = rows.reduce((sum, r) => {
    if (r.account === "売上高") return sum
    if (kojyoAccounts.includes(r.account)) return sum
    return sum + r.amount
  }, 0)
  const income = rows.reduce((sum, r) => r.account === "売上高" ? sum + r.amount : sum, 0)
  const iryo = rows.reduce((sum, r) => r.account === "医療費" ? sum + r.amount : sum, 0)
  const noVoucherCount = rows.filter(r => !r.voucher_no).length

  const modalOverlay: React.CSSProperties = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.5)", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: 100,
  }
  const modalBox: React.CSSProperties = {
    background: "white", borderRadius: "12px", width: "360px",
    maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden",
  }
  const scrollArea: React.CSSProperties = {
    flex: 1, overflowY: "auto", padding: "16px 24px",
    WebkitOverflowScrolling: "touch" as any,
  }
  const modalFooter: React.CSSProperties = {
    padding: "12px 24px 20px", borderTop: "1px solid #e5e7eb", background: "white",
  }
  const gridStyle: React.CSSProperties = {
    display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gridTemplateRows: "1fr 1fr", gap: "6px", padding: "8px",
    height: "calc(100vh - 100px)", boxSizing: "border-box",
  }

  const currentKindAccounts = ACCOUNTS[newKind as keyof typeof ACCOUNTS] || ACCOUNTS.keiji

  return (
    <div style={{ padding: "16px", fontFamily: "sans-serif", maxWidth: "1000px", margin: "0 auto" }}>

      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "16px" }}>
        <h1 style={{ fontSize: "20px", margin: 0 }}>kakeicloud</h1>
        <span style={{ fontSize: "11px", color: "#9ca3af" }}>{VERSION}</span>
      </div>

      <div style={{ marginBottom: "12px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => setPerson("hiroshi")}
          style={{ padding: "8px 16px", background: person === "hiroshi" ? "#2563eb" : "#e5e7eb", color: person === "hiroshi" ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer" }}>廣！</button>
        <button onClick={() => setPerson("wife")}
          style={{ padding: "8px 16px", background: person === "wife" ? "#2563eb" : "#e5e7eb", color: person === "wife" ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer" }}>妻</button>
        <a href="/settings"
          style={{ padding: "8px 14px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "6px", textDecoration: "none", color: "#374151", fontSize: "14px" }}>設定</a>
        <a href="/import"
          style={{ padding: "8px 14px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "6px", textDecoration: "none", color: "#374151", fontSize: "14px" }}>取込</a>
        {printableRows.length > 0 && (
          <button onClick={() => { setPrintPage(0); setShowPrint(true) }}
            style={{ padding: "8px 14px", background: "#7c3aed", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>
            証憑票（{totalPrintPages}P）
          </button>
        )}
        <button onClick={() => setShowForm(true)}
          style={{ marginLeft: "auto", padding: "8px 20px", background: "#16a34a", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>＋ 新規</button>
      </div>

      {/* 年セレクター：降順・2段折り返し */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "12px", flexWrap: "wrap" }}>
        {YEARS.map(y => (
          <button key={y} onClick={() => setSelectedYear(y)}
            style={{ padding: "6px 14px", background: selectedYear === y ? "#1e293b" : "#f3f4f6", color: selectedYear === y ? "white" : "#374151", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: selectedYear === y ? "bold" : "normal" }}>
            {y}
          </button>
        ))}
      </div>

      {noVoucherCount > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: "8px", padding: "10px 16px", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "13px", color: "#92400e" }}>証憑番号なし（全年）：<strong>{noVoucherCount}件</strong></span>
          <button onClick={bulkAssignVoucherNo} disabled={bulkLoading}
            style={{ padding: "6px 16px", background: "#f59e0b", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "13px" }}>
            {bulkLoading ? "採番中..." : "一括採番"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ background: "#fef2f2", padding: "12px 20px", borderRadius: "8px" }}>
          <div style={{ fontSize: "12px", color: "#666" }}>経費合計</div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#dc2626" }}>△{total.toLocaleString()}円</div>
        </div>
        <div style={{ background: "#f0fdf4", padding: "12px 20px", borderRadius: "8px" }}>
          <div style={{ fontSize: "12px", color: "#666" }}>売上合計</div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#16a34a" }}>{income.toLocaleString()}円</div>
        </div>
        {iryo > 0 && (
          <div style={{ background: "#eff6ff", padding: "12px 20px", borderRadius: "8px" }}>
            <div style={{ fontSize: "12px", color: "#666" }}>医療費合計</div>
            <div style={{ fontSize: "18px", fontWeight: "bold", color: "#2563eb" }}>{iryo.toLocaleString()}円</div>
          </div>
        )}
        <div style={{ background: "#f8fafc", padding: "12px 20px", borderRadius: "8px" }}>
          <div style={{ fontSize: "12px", color: "#666" }}>件数</div>
          <div style={{ fontSize: "18px", fontWeight: "bold" }}>{rows.length}件</div>
        </div>
      </div>

      {loading ? <div>読み込み中...</div> : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#f3f4f6" }}>
              <th style={{ padding: "8px", textAlign: "center", border: "1px solid #e5e7eb" }}>✅</th>
              <th style={{ padding: "8px", textAlign: "left", border: "1px solid #e5e7eb" }}>証憑番号</th>
              <th style={{ padding: "8px", textAlign: "left", border: "1px solid #e5e7eb" }}>日付</th>
              <th style={{ padding: "8px", textAlign: "left", border: "1px solid #e5e7eb" }}>科目</th>
              <th style={{ padding: "8px", textAlign: "right", border: "1px solid #e5e7eb" }}>金額</th>
              <th style={{ padding: "8px", textAlign: "left", border: "1px solid #e5e7eb" }}>支払</th>
              <th style={{ padding: "8px", textAlign: "left", border: "1px solid #e5e7eb" }}>摘要</th>
              <th style={{ padding: "8px", textAlign: "center", border: "1px solid #e5e7eb" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid #e5e7eb", background: r.is_confirmed ? "#f0fdf4" : "white" }}>
                <td style={{ padding: "6px 8px", border: "1px solid #e5e7eb", textAlign: "center" }}>
                  <input type="checkbox" checked={r.is_confirmed} onChange={() => toggleConfirmed(r.id, r.is_confirmed)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                </td>
                <td style={{ padding: "6px 8px", border: "1px solid #e5e7eb", fontSize: "11px", whiteSpace: "nowrap", color: r.voucher_no ? "#6b7280" : "#f59e0b", fontWeight: r.voucher_no ? "normal" : "bold" }}>
                  {r.voucher_no || "未採番"}
                </td>
                <td style={{ padding: "6px 8px", border: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{r.date}</td>
                <td style={{ padding: "6px 8px", border: "1px solid #e5e7eb" }}>{r.account}</td>
                <td style={{ padding: "6px 8px", border: "1px solid #e5e7eb", textAlign: "right" }}>{r.amount.toLocaleString()}</td>
                <td style={{ padding: "6px 8px", border: "1px solid #e5e7eb", fontSize: "11px" }}>
                  <div>{methodToKind(r.method)}</div>
                  {r.payment_account && <div style={{ color: "#6b7280" }}>{r.payment_account}</div>}
                </td>
                <td style={{ padding: "6px 8px", border: "1px solid #e5e7eb", maxWidth: "160px" }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.memo}</div>
                  {r.note && <div style={{ fontSize: "11px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📝 {r.note}</div>}
                </td>
                <td style={{ padding: "6px 8px", border: "1px solid #e5e7eb", textAlign: "center", whiteSpace: "nowrap" }}>
                  {r.voucher_no && (
                    <button onClick={() => copyVoucher(r)}
                      style={{ marginRight: "4px", padding: "2px 8px", background: "#0891b2", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>🖨</button>
                  )}
                  <button onClick={() => setEditing(r)}
                    style={{ marginRight: "4px", padding: "2px 8px", background: "#2563eb", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>編集</button>
                  <button onClick={() => deleteRow(r.id)}
                    style={{ padding: "2px 8px", background: "#dc2626", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <div style={{ padding: "16px 24px 8px", borderBottom: "1px solid #e5e7eb" }}>
              <h2 style={{ margin: 0, fontSize: "16px" }}>新規仕訳入力</h2>
            </div>
            <div style={scrollArea}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>対象者</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => setPerson("hiroshi")} style={{ flex: 1, padding: "8px", background: person === "hiroshi" ? "#2563eb" : "#e5e7eb", color: person === "hiroshi" ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer" }}>廣！</button>
                  <button onClick={() => setPerson("wife")} style={{ flex: 1, padding: "8px", background: person === "wife" ? "#2563eb" : "#e5e7eb", color: person === "wife" ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer" }}>妻</button>
                </div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>日付</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                  style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>種別</label>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {Object.keys(ACCOUNTS).map(k => (
                    <button key={k} onClick={() => setNewKind(k)}
                      style={{ padding: "8px 12px", background: newKind === k ? "#7c3aed" : "#e5e7eb", color: newKind === k ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>
                      {ACCOUNT_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>科目</label>
                <select value={newAccount} onChange={e => setNewAccount(e.target.value)}
                  style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px" }}>
                  {currentKindAccounts.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>金額（税込）</label>
                <input type="number" value={newAmount}
                  onChange={e => { setNewAmount(e.target.value); setNewTaxAmount(calcTax(parseInt(e.target.value) || 0, newTaxRate)) }}
                  placeholder="0"
                  style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>税率</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[0, 8, 10].map(r => (
                    <button key={r} onClick={() => { setNewTaxRate(r); setNewTaxAmount(calcTax(parseInt(newAmount) || 0, r)) }}
                      style={{ flex: 1, padding: "8px", background: newTaxRate === r ? "#dc2626" : "#e5e7eb", color: newTaxRate === r ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>{r}%</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>消費税額（自動計算）</label>
                <input type="number" value={newTaxAmount} readOnly
                  style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px", background: "#f0f0f0", color: "#666" }} />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>支払種別</label>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {PAYMENT_KINDS.map(k => (
                    <button key={k.key} onClick={() => setNewPaymentKind(k.key)}
                      style={{ padding: "6px 12px", background: newPaymentKind === k.key ? "#0891b2" : "#e5e7eb", color: newPaymentKind === k.key ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>{k.label}</button>
                  ))}
                </div>
              </div>
              {newPaymentKind !== "genkin" && (
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>口座名</label>
                  {filteredPaymentAccounts(newPaymentKind).length > 0 ? (
                    <select value={newPaymentAccount} onChange={e => setNewPaymentAccount(e.target.value)}
                      style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px" }}>
                      {filteredPaymentAccounts(newPaymentKind).map(a => (
                        <option key={a.id} value={a.name}>{a.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ padding: "8px", background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: "6px", fontSize: "12px", color: "#92400e" }}>
                      設定から口座を登録してください
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>登録番号（任意）</label>
                <input value={newInvoiceNo} onChange={e => setNewInvoiceNo(e.target.value)} placeholder="T1234567890123"
                  style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>摘要</label>
                <input value={newMemo} onChange={e => setNewMemo(e.target.value)}
                  style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>備考</label>
                <input value={newNote} onChange={e => setNewNote(e.target.value)}
                  style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={modalFooter}>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={saveNew}
                  style={{ flex: 1, padding: "14px", background: "#16a34a", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: "16px" }}>保存</button>
                <button onClick={() => setShowForm(false)}
                  style={{ flex: 1, padding: "14px", background: "#e5e7eb", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}>キャンセル</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {savedVoucherNo && (
        <div style={{ ...modalOverlay, zIndex: 200 }}>
          <div style={{ background: "white", padding: "32px", borderRadius: "12px", width: "300px", textAlign: "center" }}>
            <div style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>保存完了！証憑番号</div>
            <div style={{ fontSize: "36px", fontWeight: "bold", letterSpacing: "2px", marginBottom: "20px", color: "#1e293b" }}>{savedVoucherNo}</div>
            <button onClick={() => { navigator.clipboard.writeText(savedVoucherNo); alert("コピーしました！") }}
              style={{ width: "100%", padding: "14px", background: "#2563eb", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "16px", marginBottom: "8px" }}>コピー</button>
            <button onClick={() => setSavedVoucherNo(null)}
              style={{ width: "100%", padding: "12px", background: "#e5e7eb", border: "none", borderRadius: "8px", cursor: "pointer" }}>閉じる</button>
          </div>
        </div>
      )}

      {editing && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <div style={{ padding: "16px 24px 8px", borderBottom: "1px solid #e5e7eb" }}>
              <h2 style={{ margin: 0, fontSize: "16px" }}>仕訳編集</h2>
            </div>
            <div style={scrollArea}>
              {editing.voucher_no && (
                <div style={{ background: "#eff6ff", padding: "10px 12px", borderRadius: "8px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "#6b7280" }}>証憑番号</div>
                    <div style={{ fontSize: "20px", fontWeight: "bold", color: "#1e293b" }}>{editing.voucher_no}</div>
                  </div>
                  <button onClick={() => copyVoucher(editing)}
                    style={{ padding: "8px 16px", background: "#2563eb", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "18px" }}>📋</button>
                </div>
              )}
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>日付</label>
                <input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })}
                  style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px" }} />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>科目</label>
                <input value={editing.account} onChange={e => setEditing({ ...editing, account: e.target.value })}
                  style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px" }} />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>金額（税込）</label>
                <input type="number" value={editing.amount} onChange={e => setEditing({ ...editing, amount: parseInt(e.target.value) || 0 })}
                  style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px" }} />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>税率</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[0, 8, 10].map(r => (
                    <button key={r} onClick={() => setEditing({ ...editing, tax_rate: r, tax_amount: calcTax(editing.amount, r) })}
                      style={{ flex: 1, padding: "8px", background: (editing.tax_rate ?? 10) === r ? "#dc2626" : "#e5e7eb", color: (editing.tax_rate ?? 10) === r ? "white" : "black", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>{r}%</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>消費税額</label>
                <input type="number" value={editing.tax_amount ?? 0} onChange={e => setEditing({ ...editing, tax_amount: parseInt(e.target.value) || 0 })}
                  style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px" }} />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>担当</label>
                <select value={editing.person} onChange={e => setEditing({ ...editing, person: e.target.value })}
                  style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px" }}>
                  <option value="hiroshi">廣！</option>
                  <option value="wife">妻</option>
                </select>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>摘要</label>
                <input value={editing.memo} onChange={e => setEditing({ ...editing, memo: e.target.value })}
                  style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>備考</label>
                <input value={editing.note || ""} onChange={e => setEditing({ ...editing, note: e.target.value })}
                  style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px" }} />
              </div>
            </div>
            <div style={modalFooter}>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={saveEdit}
                  style={{ flex: 1, padding: "14px", background: "#2563eb", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: "16px" }}>保存</button>
                <button onClick={() => setEditing(null)}
                  style={{ flex: 1, padding: "14px", background: "#e5e7eb", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}>キャンセル</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPrint && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "white", zIndex: 1000, overflow: "hidden" }}>
          <style>{`
            @media print {
              .no-print { display: none !important; }
              .print-only { display: block !important; }
              .print-page { page-break-after: always; }
              .print-page:last-child { page-break-after: avoid; }
              @page { size: A4 portrait; margin: 8mm; }
              body { margin: 0; }
            }
            @media screen { .print-only { display: none; } }
          `}</style>
          <div className="no-print" style={{ padding: "10px 16px", display: "flex", gap: "8px", alignItems: "center", borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
            <button onClick={() => setPrintPage(p => Math.max(0, p - 1))} disabled={printPage === 0}
              style={{ padding: "8px 16px", background: printPage === 0 ? "#e5e7eb" : "#2563eb", color: printPage === 0 ? "#999" : "white", border: "none", borderRadius: "6px", cursor: printPage === 0 ? "default" : "pointer", fontWeight: "bold", fontSize: "16px" }}>←</button>
            <span style={{ fontWeight: "bold", fontSize: "15px" }}>{printPage + 1} / {totalPrintPages}P</span>
            <button onClick={() => setPrintPage(p => Math.min(totalPrintPages - 1, p + 1))} disabled={printPage === totalPrintPages - 1}
              style={{ padding: "8px 16px", background: printPage === totalPrintPages - 1 ? "#e5e7eb" : "#2563eb", color: printPage === totalPrintPages - 1 ? "#999" : "white", border: "none", borderRadius: "6px", cursor: printPage === totalPrintPages - 1 ? "default" : "pointer", fontWeight: "bold", fontSize: "16px" }}>→</button>
            <button onClick={() => window.print()}
              style={{ marginLeft: "auto", padding: "8px 20px", background: "#7c3aed", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>
              全{totalPrintPages}P印刷
            </button>
            <button onClick={() => setShowPrint(false)}
              style={{ padding: "8px 16px", background: "#e5e7eb", border: "none", borderRadius: "6px", cursor: "pointer" }}>閉じる</button>
          </div>
          <div className="no-print" style={{ ...gridStyle }}>
            {getPageRows(printPage).map((r, i) => (
              <div key={i} style={{ border: "2px solid #000", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {r ? (
                  <>
                    <div style={{ padding: "4px 6px", borderBottom: "1px solid #999", background: "#f9f9f9" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", fontWeight: "bold" }}>
                        <span>{r.voucher_no}</span><span>{r.date}</span>
                      </div>
                      <div style={{ fontSize: "9px" }}>{r.account} ¥{r.amount.toLocaleString()}{r.tax_amount ? `（¥${r.tax_amount.toLocaleString()}）` : ""}</div>
                      {r.memo && <div style={{ fontSize: "8px", color: "#555", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{r.memo}</div>}
                    </div>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {r.method !== "現金" && (
                        <div style={{ textAlign: "center", fontSize: "11px", color: "#444", lineHeight: 1.6 }}>
                          <div style={{ fontWeight: "bold" }}>証憑無し</div>
                          <div>{r.payment_account || methodToKind(r.method)}より</div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#ddd", fontSize: "11px" }}>（空欄）</div>
                )}
              </div>
            ))}
          </div>
          <div className="print-only">
            {Array.from({ length: totalPrintPages }).map((_, pageIdx) => (
              <div key={pageIdx} className="print-page">
                <div style={{ textAlign: "right", fontSize: "8px", color: "#999", marginBottom: "4px" }}>{pageIdx + 1} / {totalPrintPages}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gap: "4mm", height: "270mm" }}>
                  {getPageRows(pageIdx).map((r, i) => (
                    <div key={i} style={{ border: "1.5px solid #000", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      {r ? (
                        <>
                          <div style={{ padding: "2mm 3mm", borderBottom: "0.5px solid #999", background: "#f5f5f5" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "7pt", fontWeight: "bold" }}>
                              <span>{r.voucher_no}</span><span>{r.date}</span>
                            </div>
                            <div style={{ fontSize: "7pt" }}>{r.account} ¥{r.amount.toLocaleString()}{r.tax_amount ? `（¥${r.tax_amount.toLocaleString()}）` : ""}</div>
                            {r.memo && <div style={{ fontSize: "6pt", color: "#555" }}>{r.memo}</div>}
                          </div>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {r.method !== "現金" && (
                              <div style={{ textAlign: "center", fontSize: "8pt", color: "#333", lineHeight: 1.8 }}>
                                <div style={{ fontWeight: "bold" }}>証憑無し</div>
                                <div>{r.payment_account || methodToKind(r.method)}より</div>
                              </div>
                            )}
                          </div>
                        </>
                      ) : <div style={{ flex: 1 }} />}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
