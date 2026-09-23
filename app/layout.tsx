import './globals.css'

export const metadata = {
  title: 'PassFlow',
  description: 'Privacy-first visual access control powered by Ring',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-passflow-ink antialiased">
        {children}
      </body>
    </html>
  )
}
