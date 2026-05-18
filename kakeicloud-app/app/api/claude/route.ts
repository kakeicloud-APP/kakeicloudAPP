/**
 * kakeicloud v1.6.0 | 2026/05/18
 * kakeicloud-app/app/api/claude/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, imageBase64, mediaType, text } = body

    let prompt = ''

    if (type === 'receipt') {
      prompt = `このレシート・領収書から以下の情報をJSON形式で抽出してください。
必ずJSONのみを返し、説明文は不要です。

{
  "date": "YYYY-MM-DD",
  "store_name": "店舗名",
  "amount": 金額（数値・税込）,
  "tax_amount": 消費税額（数値）,
  "tax_rate": 税率（0, 8, 10のいずれか）,
  "invoice_no": "登録番号（T+13桁、なければnull）",
  "memo": "品目・内容の簡潔な説明",
  "account": "勘定科目（消耗品費/通信費/旅費交通費/接待交際費/地代家賃/水道光熱費/修繕費/広告宣伝費/外注費/雑費から最適なもの）"
}`
    } else if (type === 'pdf') {
      prompt = `この銀行・カード明細から取引一覧をJSON形式で抽出してください。
必ずJSONのみを返し、説明文は不要です。

[
  {
    "date": "YYYY-MM-DD",
    "description": "摘要・店舗名",
    "amount": 金額（数値・正の値）,
    "type": "支出"または"入金"
  }
]`
    }

    const messages: any[] = []

    if (imageBase64) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType || 'image/jpeg',
              data: imageBase64,
            },
          },
          { type: 'text', text: prompt },
        ],
      })
    } else if (text) {
      messages.push({
        role: 'user',
        content: prompt + '\n\nデータ：\n' + text,
      })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages,
      }),
    })

    const data = await response.json()
    const content = data.content?.[0]?.text || ''

    // JSONを抽出
    const jsonMatch = content.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null

    return NextResponse.json({ success: true, data: parsed })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
