// v2.2.16 app/api/claude/route.ts ec_order・text_ec_order追加
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { type, imageBase64, mediaType, text } = body

    const model = 'claude-haiku-4-5-20251001'
    const maxTokens = 2000
    let messages: any[] = []

    if (type === 'receipt') {
      messages = [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: `このレシートから以下の情報をJSONで抽出してください。
{
  "store_name": "店名",
  "date": "YYYY-MM-DD",
  "amount": 金額（税込・数値）,
  "tax_amount": 消費税額（数値）,
  "tax_rate": 税率（8または10・数値）,
  "memo": "店名を簡潔に",
  "account": "消耗品費などの科目",
  "invoice_no": "インボイス登録番号（T始まり・なければnull）",
  "payment_card": "支払いカード名（例：楽天カード・VISAなど・なければnull）"
}
JSONのみ返してください。` }
        ]
      }]

    } else if (type === 'amazon') {
      // 後方互換性のため残す
      messages = [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: `このAmazonの注文確認画面から以下の情報をJSONで抽出してください。
{
  "date": "YYYY-MM-DD",
  "amount": 合計金額（数値）,
  "tax_amount": 消費税額（数値）,
  "tax_rate": 10,
  "order_no": "注文番号",
  "invoice_no": "インボイス番号（なければnull）",
  "memo": "商品名を20文字以内で簡潔に",
  "note": "商品名の詳細",
  "account": "消耗品費"
}
JSONのみ返してください。` }
        ]
      }]

    } else if (type === 'ec_order') {
      // ⬇️ v2.2.16: EC注文書共通タイプ（Amazon・楽天・Yahoo等すべて対応）
      messages = [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: `このEC注文書・注文確認画面から以下の情報をJSONで抽出してください。
Amazon・楽天市場・Yahoo!ショッピング等すべてのECサイトに対応します。
{
  "date": "YYYY-MM-DD",
  "amount": 合計金額（税込・数値）,
  "tax_amount": 消費税額（数値）,
  "tax_rate": 税率（8または10・数値）,
  "order_no": "注文番号（なければnull）",
  "invoice_no": "インボイス登録番号（T始まり13桁・なければnull）",
  "memo": "商品名を20文字以内で簡潔に",
  "note": "商品名の詳細",
  "account": "消耗品費"
}
JSONのみ返してください。` }
        ]
      }]

    } else if (type === 'pdf') {
      messages = [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageBase64 } },
          { type: 'text', text: `このPDFの明細から取引一覧をJSONで抽出してください。
ETCカード売上の次の行に乗り場・降り場情報がある場合は、noteフィールドに「乗り場→降り場」形式で入れてください。
ETCカード売上以外はnoteはnullにしてください。
インボイス登録番号（T始まり13桁）が記載されている場合はinvoice_noに入れてください。なければnullにしてください。
[{"date":"YYYY-MM-DD","description":"店名","amount":金額,"note":"乗り場→降り場またはnull","invoice_no":"T始まりの番号またはnull"}]
配列のみ返してください。` }
        ]
      }]

    } else if (type === 'card_image') {
      messages = [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: `このカード明細画像から取引一覧をJSONで抽出してください。
利用者欄が「本人」「本人*」の行はperson="wife"としてください。
利用者欄が「家族」「家族*」の行はperson="hiroshi"としてください。
利用者欄がない場合はperson="hiroshi"としてください。
マイナス金額（返金）は除外してください。
ETCカード売上の次の行に乗り場・降り場情報がある場合は、noteフィールドに「乗り場→降り場」形式で入れてください。
ETCカード売上以外はnoteはnullにしてください。
インボイス登録番号（T始まり13桁）が記載されている場合はinvoice_noに入れてください。なければnullにしてください。
[{"date":"YYYY-MM-DD","description":"店名","amount":金額,"person":"hiroshi または wife","note":"乗り場→降り場またはnull","invoice_no":"T始まりの番号またはnull"}]
配列のみ返してください。` }
        ]
      }]

    } else if (type === 'card_summary') {
      messages = [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: `このカードの請求金額サマリーページから以下の情報をJSONで抽出してください。
{
  "billing_month": "請求年月（YYYY-MM形式）",
  "billing_total": 請求金額合計（数値のみ）,
  "honcard_total": 本カード会員様利用分（数値のみ・なければ0）,
  "kazoku_total": 家族カード会員様利用分（数値のみ・なければ0）,
  "etc_total": ETCカード利用分（数値のみ・なければ0）
}
JSONのみ返してください。` }
        ]
      }]

    } else if (type === 'text_receipt') {
      messages = [{
        role: 'user',
        content: `以下のテキストはレシートの内容です。JSON形式で抽出してください。
${text}

{
  "store_name": "店名",
  "date": "YYYY-MM-DD",
  "amount": 金額（税込・数値）,
  "tax_amount": 消費税額（数値）,
  "tax_rate": 税率（8または10・数値）,
  "memo": "店名を簡潔に",
  "account": "消耗品費などの科目",
  "invoice_no": "インボイス登録番号（T始まり・なければnull）",
  "payment_card": "支払いカード名（例：楽天カード・VISAなど・なければnull）"
}
JSONのみ返してください。`
      }]

    } else if (type === 'text_amazon') {
      // 後方互換性のため残す
      messages = [{
        role: 'user',
        content: `以下のテキストはAmazonの注文情報です。JSON形式で抽出してください。
${text}

{
  "date": "YYYY-MM-DD",
  "amount": 合計金額（数値）,
  "tax_amount": 消費税額（数値）,
  "tax_rate": 10,
  "order_no": "注文番号",
  "invoice_no": "インボイス番号（なければnull）",
  "memo": "商品名を20文字以内で簡潔に",
  "note": "商品名の詳細",
  "account": "消耗品費"
}
JSONのみ返してください。`
      }]

    } else if (type === 'text_ec_order') {
      // ⬇️ v2.2.16: EC注文書テキスト共通タイプ
      messages = [{
        role: 'user',
        content: `以下のテキストはEC注文書・注文確認メールの内容です。JSON形式で抽出してください。
Amazon・楽天市場・Yahoo!ショッピング等すべてのECサイトに対応します。
${text}

{
  "date": "YYYY-MM-DD",
  "amount": 合計金額（税込・数値）,
  "tax_amount": 消費税額（数値）,
  "tax_rate": 税率（8または10・数値）,
  "order_no": "注文番号（なければnull）",
  "invoice_no": "インボイス登録番号（T始まり13桁・なければnull）",
  "memo": "商品名を20文字以内で簡潔に",
  "note": "商品名の詳細",
  "account": "消耗品費"
}
JSONのみ返してください。`
      }]

    } else if (type === 'text_card') {
      messages = [{
        role: 'user',
        content: `以下のテキストはカード明細のデータです。取引一覧をJSONで抽出してください。
${text}

[{"date":"YYYY-MM-DD","description":"店名","amount":金額}]
配列のみ返してください。マイナス金額（返金）は除外してください。`
      }]

    } else {
      return NextResponse.json({ error: `unknown type: ${type}` }, { status: 400 })
    }

    const response = await client.messages.create({ model, max_tokens: maxTokens, messages })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let data: any
    try {
      data = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: `parse error: ${cleaned.slice(0, 200)}` }, { status: 500 })
    }

    return NextResponse.json({ data })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
