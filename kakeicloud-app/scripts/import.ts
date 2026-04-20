import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function main() {
  const file = fs.readFileSync(path.join(__dirname, 'yayoi_all.csv'), 'utf-8')
  const lines = file.split('\n').filter(l => l.trim())
  const records: any[] = []

  for (const line of lines) {
    const r = line.split(',').map(v => v.replace(/^"|"$/g, '').trim())
    if (r.length < 10) continue
    const code = r[0]
    const date = r[3]
    const debit = r[4]
    const amount = parseInt(r[8])
    const credit = r[10] || ''
    const memo = r[16] || ''
    const taxType = r[7] || ''
    const isClosing = r[2] === '本決'
    if (!date || isNaN(amount)) continue
    if (debit === '事業主貸') continue
    const account =
      credit === '売上' ? '売上' :
      credit === '仕入返品' ? '仕入返品' : debit
    if (!account) continue
    records.push({
      person: 'hiroshi',
      date,
      account,
      amount,
      tax_type: taxType,
      method: code === '2110' ? '現金(50%按分)' : '',
      memo,
      year: 2025,
      is_closing: isClosing
    })
  }

  console.log(`インポート対象: ${records.length}件`)
  const { error } = await supabase.from('transactions').insert(records)
  if (error) console.error('エラー:', error)
  else console.log('インポート完了！')
}

main()
