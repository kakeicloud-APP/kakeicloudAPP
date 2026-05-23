This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
## 2026/05/24 Supabase変更履歴

-- card_importsテーブルに追加
ALTER TABLE card_imports ADD COLUMN billing_total integer;
ALTER TABLE card_imports ADD COLUMN honcard_total integer;
ALTER TABLE card_imports ADD COLUMN kazoku_total integer;
ALTER TABLE card_imports ADD COLUMN etc_total integer;
ALTER TABLE card_imports ADD COLUMN is_summary boolean DEFAULT false;

-- import_stagingテーブルに追加
ALTER TABLE import_staging ADD COLUMN card_import_id uuid REFERENCES card_imports(id);

-- transactionsテーブルに追加
ALTER TABLE transactions ADD COLUMN card_import_id uuid REFERENCES card_imports(id);

-- データ修正
UPDATE card_imports 
SET card_type = '楽天カード'
WHERE is_summary = true 
AND billing_month = '2025-06';

