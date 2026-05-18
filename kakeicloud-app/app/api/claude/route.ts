/**
 * kakeicloud v1.6.1 | 2026/05/18
 * kakeicloud-app/app/api/claude/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, imageBase64, mediaType } = body

    let prompt = ''
    if (type === 'receipt') {
      prompt = `このレシート・領収書から以下の情報をJSONのみで返してください。説明文不要。
{
  "date": "YYYY-MM-DD",
  "store_name": "店舗名",
  "amount": 税込金額（数値）,
  "tax_amount": 消費税額（数値）,
  "tax_rate": 税率（0/8/10）,
  "invoice_no": "登録番号T+13桁（なければnull）",
  "memo": "品目の簡潔な説明",
  "account": "勘定科目（消耗品費/通信費/旅費交通費/接待交際費/地代家賃/水道光熱費/修繕費/広告宣伝費/外注費/雑費から選択）"
}`
    } else if (type === 'pdf') {
      prompt = `この銀行・カード明細から取引一覧をJSONのみで返してください。説明文不要。
支出のみ抽出し、入金・振込は除外してください。
[
  {
    "date": "YYYY-MM-DD",
    "description": "摘要・店舗名",
    "amount": 金額（数値・正の値）
  }
]`
    }

    const isPdf = mediaType === 'application/pdf'

    const content: any[] = [
      {
        type: isPdf ? 'document' : 'image',
        source: {
          type: 'base64',
          media_type: mediaType || 'image/jpeg',
          data: imageBase64,
        },
      },
      { type: 'text', text: prompt },
    ]

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content }],
      }),
    })

    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    const jsonMatch = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null

    return NextResponse.json({ success: true, data: parsed })
  } catch (error: any) {
    console.error('Claude API error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
