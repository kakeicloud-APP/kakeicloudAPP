/**
 * kakeicloud v1.7.4 | 2026/05/19
 * kakeicloud-app/app/api/claude/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
// @ts-ignore
import * as pdfParse from 'pdf-parse'

export const maxDuration = 60

function extractTransactionLines(text: string): string {
  const lines = text.split('\n').filter(l => l.trim().length > 2)
  const transactionLines = lines.filter(line => {
    const hasDate =
      /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(line) ||
      /\d{1,2}[\/\-]\d{1,2}/.test(line) ||
      /\d{2,4}年\d{1,2}月\d{1,2}日/.test(line)
    const hasAmount = /[\d,]{3,}/.test(line)
    return hasDate && hasAmount
  })
  return transactionLines.filter(l => l.length < 200).slice(0, 100).join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, imageBase64, mediaType } = body

    if (type === 'receipt') {
      const prompt = `このレシート・領収書から以下の情報をJSONのみで返してください。説明文不要。
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
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
              { type: 'text', text: prompt },
            ],
          }],
        }),
      })
      const data = await response.json()
      if (!response.ok) return NextResponse.json({ success: false, error: data.error?.message }, { status: 500 })
      const text = data.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
      return NextResponse.json({ success: true, data: parsed })
    }

    if (type === 'pdf') {
      const buffer = Buffer.from(imageBase64, 'base64')
      // @ts-ignore
      const pdfFn = (pdfParse as any).default ?? pdfParse
      const pdfData = await pdfFn(buffer)
      const filteredText = extractTransactionLines(pdfData.text)

      if (!filteredText.trim()) {
        return NextResponse.json({
          success: false,
          error: 'PDFから取引データを抽出できませんでした。CSVでのインポートをお試しください。'
        }, { status: 400 })
      }

      const prompt = `以下は銀行・カード明細の取引行データです。
JSONのみで返してください。説明文不要。
支出（引き落とし）のみ抽出し、入金・振込は除外してください。

[
  {
    "date": "YYYY-MM-DD",
    "description": "摘要・店舗名",
    "amount": 金額（数値・正の値）
  }
]

データ：
${filteredText}`

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
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await response.json()
      if (!response.ok) return NextResponse.json({ success: false, error: data.error?.message }, { status: 500 })
      const text = data.content?.[0]?.text || ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
      return NextResponse.json({ success: true, data: parsed })
    }

    return NextResponse.json({ success: false, error: '不明なタイプです' }, { status: 400 })

  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
