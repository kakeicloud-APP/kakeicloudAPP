/* ============================================================
kakeicloud v2.2.29 | 2026/11/23
ファイル: kakeicloud-app/app/api/keepalive/route.ts
概要: Supabase無料プランの自動停止を防ぐヘルスチェックAPI。
      Vercel Cron（1日1回）と GitHub Actions（1日4回）から呼ばれ、
      主要テーブルを順に読んで「DB利用あり」の状態を保つ。読み取りのみ。
============================================================ */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// プロジェクトで使っている主要テーブル（コード内の出現回数が多い順に7つ）
const TABLES = [
  'transactions',
  'import_staging',
  'payment_accounts',
  'card_details',
  'classification_rules',
  'memos',
  'settings',
]

// service_roleキーがあれば優先（RLS対策）。なければ既存と同じ anon キーを使う
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''
).trim()

export async function GET(req: Request) {
  // CRON_SECRETを設定した場合のみ認証する（Vercel Cronは自動で Bearer を付けて送る）
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const results: Record<string, string> = {}
  for (const t of TABLES) {
    const { error } = await supabase.from(t).select('*', { count: 'exact', head: true })
    results[t] = error ? `error: ${error.message}` : 'ok'
  }
  const ok = Object.values(results).some((r) => r === 'ok')
  return NextResponse.json(
    { ok, results, at: new Date().toISOString() },
    { status: ok ? 200 : 500 }
  )
}
