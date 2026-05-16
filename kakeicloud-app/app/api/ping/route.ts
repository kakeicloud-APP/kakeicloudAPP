import { supabase } from '../../../lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  await supabase.from('transactions').select('id').limit(1)
  return NextResponse.json({ ok: true, time: new Date().toISOString() })
}
