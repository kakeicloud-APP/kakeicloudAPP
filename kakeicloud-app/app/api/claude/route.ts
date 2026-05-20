/**
 * kakeicloud v1.7.8 | 2026/05/20
 * kakeicloud-app/app/api/claude/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

async function callClaude(body: object, isPdf = false) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
      ...(isPdf ? { 'anthropic-beta': 'pdfs-2024-09-25' } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || 'Claude API エラー')
  }
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const { type, imageBase64, mediaType } = await req.json()

    if (type === 'pdf') {
      const result = await callClaude({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: `このPDFはクレジットカードまたは銀行の明細書です。
取引明細を全件抽出してJSON配列のみを返してください。
説明文・マークダウン記号は不要です。

形式：
[
  {"date": "2025-10-26", "description": "利用先名", "amount": 1330},
  ...
]

ルール：
- dateはYYYY-MM-DD形式（令和7年=2025年、令和8年=2026年）
- amountは正の整数（円）
- descriptionは利用先名をそのまま記載`,
              },
            ],
          },
        ],
      }, true)

      const text = result.content[0].text
      const clean = text.replace(/```json\n?|\n?```/g, '').trim()
      const data = JSON.parse(clean)
      return NextResponse.json({ data })

    } else if (type === 'receipt') {
      const result = await callClaude({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [
          {
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
              {
                type: 'text',
                text: `このレシートから情報を抽出してJSONオブジェクトのみを返してください。
説明文・マークダウン記号は不要です。

形式：
{
  "store_name": "店名",
  "date": "YYYY-MM-DD",
  "amount": 税込金額（整数）,
  "tax_amount": 消費税額（整数）,
  "tax_rate": 税率（8または10）,
  "memo": "摘要として使う短い説明",
  "account": "推定科目（消耗品費/通信費/旅費交通費/接待交際費/雑費など）",
  "invoice_no": "適格請求書番号（T+13桁、なければ空文字）"
}`,
              },
            ],
          },
        ],
      })

      const text = result.content[0].text
      const clean = text.replace(/```json\n?|\n?```/g, '').trim()
      const data = JSON.parse(clean)
      return NextResponse.json({ data })
    }

    return NextResponse.json({ error: '不明なtype' }, { status: 400 })

  } catch (error: any) {
    console.error('Claude API error:', error)
    return NextResponse.json(
      { error: error.message || 'Claude API エラー' },
      { status: 500 }
    )
  }
}
