// commit: fix(claude): text_cardをSonnet化・楽天OCRノイズ対応 v2.0.4
/**
 * kakeicloud v2.0.4 | 2026/05/22
 * kakeicloud-app/app/api/claude/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

async function callClaude(body: object) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || JSON.stringify(err))
  }
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const { type, imageBase64, mediaType, text } = await req.json()

    if (type === 'pdf') {
      const result = await callClaude({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageBase64 } },
            { type: 'text', text: `このPDFはクレジットカードまたは銀行の明細書です。
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
- descriptionは利用先名をそのまま記載` },
          ],
        }],
      })
      const t = result.content[0].text
      const clean = t.replace(/```json\n?|\n?```/g, '').trim()
      return NextResponse.json({ data: JSON.parse(clean) })

    } else if (type === 'receipt') {
      const result = await callClaude({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: `このレシートから情報を抽出してJSONオブジェクトのみを返してください。
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
}` },
          ],
        }],
      })
      const t = result.content[0].text
      const clean = t.replace(/```json\n?|\n?```/g, '').trim()
      return NextResponse.json({ data: JSON.parse(clean) })

    } else if (type === 'amazon') {
      const result = await callClaude({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: `この画像はAmazonの注文情報または請求書です。
以下の情報を抽出してJSONオブジェクトのみを返してください。
説明文・マークダウン記号は不要です。

形式：
{
  "date": "YYYY-MM-DD",
  "amount": 税込合計金額（整数）,
  "tax_amount": 消費税額（整数）,
  "tax_rate": 税率（8または10）,
  "order_no": "注文番号（例：503-XXXXXXX-XXXXXXX、なければ空文字）",
  "invoice_no": "適格請求書番号（T+13桁、なければ空文字）",
  "memo": "商品名を簡潔に（複数の場合は代表品名＋件数）",
  "note": "商品名の詳細説明（フルの商品名・色・型番など）",
  "account": "推定科目（消耗品費/通信費/雑費など）"
}

ルール：
- dateはYYYY-MM-DD形式（令和7年=2025年、令和8年=2026年）
- amountは正の整数（円）
- 情報が読み取れない項目は空文字または0にする` },
          ],
        }],
      })
      const t = result.content[0].text
      const clean = t.replace(/```json\n?|\n?```/g, '').trim()
      return NextResponse.json({ data: JSON.parse(clean) })

    } else if (type === 'text_receipt') {
      const result = await callClaude({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `以下はレシートから手動で抽出したテキストです。
情報を解析してJSONオブジェクトのみを返してください。
説明文・マークダウン記号は不要です。

テキスト：
${text}

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
}

ルール：
- dateはYYYY-MM-DD形式（令和7年=2025年、令和8年=2026年）
- 日付が不明な場合は今日の日付
- amountは正の整数（円）`,
        }],
      })
      const t = result.content[0].text
      const clean = t.replace(/```json\n?|\n?```/g, '').trim()
      return NextResponse.json({ data: JSON.parse(clean) })

    } else if (type === 'text_amazon') {
      const result = await callClaude({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `以下はAmazonの注文情報または請求書から手動で抽出したテキストです。
情報を解析してJSONオブジェクトのみを返してください。
説明文・マークダウン記号は不要です。

テキスト：
${text}

形式：
{
  "date": "YYYY-MM-DD",
  "amount": 税込合計金額（整数）,
  "tax_amount": 消費税額（整数）,
  "tax_rate": 税率（8または10）,
  "order_no": "注文番号（例：503-XXXXXXX-XXXXXXX、なければ空文字）",
  "invoice_no": "適格請求書番号（T+13桁、なければ空文字）",
  "memo": "商品名を簡潔に（複数の場合は代表品名＋件数）",
  "note": "商品名の詳細説明（フルの商品名・色・型番など）",
  "account": "推定科目（消耗品費/通信費/雑費など）"
}

ルール：
- dateはYYYY-MM-DD形式（令和7年=2025年、令和8年=2026年）
- amountは正の整数（円）
- 情報が読み取れない項目は空文字または0にする`,
        }],
      })
      const t = result.content[0].text
      const clean = t.replace(/```json\n?|\n?```/g, '').trim()
      return NextResponse.json({ data: JSON.parse(clean) })

    } else if (type === 'text_card') {
      const result = await callClaude({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `以下は楽天カードなどクレジットカード明細のOCRテキストです。
取引明細を全件抽出してJSON配列のみを返してください。
説明文・マークダウン記号は不要です。

テキスト：
${text}

形式：
[
  {"date": "2025-10-26", "description": "利用先名", "amount": 1330},
  ...
]

ルール：
- dateはYYYY-MM-DD形式（令和7年=2025年、令和8年=2026年）
- amountは正の整数（円）。読み取れない場合は0にする
- descriptionは利用先名をそのまま記載
- AKAZON / AVAZON / AMAZON等の表記揺れはすべて「AMAZON CO.JP」に統一する
- 日付（YYYY/MM/DD形式）で始まる行のみを取引明細として扱う
- 「ご利用明細」「支払方法」「手数料」「ポイント」「リボ」等のヘッダー・フッター行は除外する
- 返金・取消はamountをマイナスにせず除外する
- 金額が次の行にある場合も正しく紐付けること`,
        }],
      })
      const t = result.content[0].text
      const clean = t.replace(/```json\n?|\n?```/g, '').trim()
      return NextResponse.json({ data: JSON.parse(clean) })
    }

    return NextResponse.json({ error: '不明なtype' }, { status: 400 })

  } catch (error: any) {
    console.error('Claude API error:', error)
    return NextResponse.json({ error: error.message || 'Claude API エラー' }, { status: 500 })
  }
}
