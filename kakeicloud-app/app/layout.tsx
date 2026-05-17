/**
 * kakeicloud v1.4.0 | 2026/05/18
 * kakeicloud-app/app/layout.tsx
 */

import type { Metadata } from 'next'
import MemoPanel from '../components/MemoPanel'

export const metadata: Metadata = {
  title: 'kakeicloud',
  description: '個人事業主向け会計SaaS',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, padding: 0 }}>
        {children}
        <MemoPanel />
        <div style={{ position: 'fixed', bottom: '8px', right: '8px', fontSize: '10px', color: '#9ca3af', zIndex: 400 }}>
          kakeicloud v1.4.0
        </div>
      </body>
    </html>
  )
}
