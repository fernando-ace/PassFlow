'use client'

import { useEffect, useRef, useState } from 'react'
import { qrPresentationOptions } from '@/lib/credentials/qrPresentation.mjs'

export function QrPresentation({ token, name }: { token: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    let generation = 0
    const generate = async () => {
      const current = ++generation
      try {
        const available = Math.min(window.innerWidth - 32, window.innerHeight - 140)
        const QRCode = await import('qrcode')
        const modules = QRCode.create(token, { errorCorrectionLevel: 'M' }).modules.size
        const result = await QRCode.toDataURL(token, qrPresentationOptions(modules, available))
        if (!cancelled && current === generation) { setImage(result); setError(false) }
      } catch {
        if (!cancelled && current === generation) setError(true)
      }
    }
    void generate()
    window.addEventListener('resize', generate)
    return () => { cancelled = true; window.removeEventListener('resize', generate) }
  }, [open, token])
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])
  return <>
    <button type="button" className="control-button control-button-primary mt-4" onClick={() => {
      setImage(null)
      setError(false)
      setOpen(true)
      dialog.current?.showModal()
    }}>Present QR full screen</button>
    <dialog ref={dialog} aria-label={`Present QR for ${name}`} onClose={() => setOpen(false)}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-white p-4 text-black backdrop:bg-white">
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <button type="button" className="control-button control-button-secondary" onClick={() => dialog.current?.close()}>Close QR presentation</button>
        {error ? <p role="alert">QR presentation failed. Close and try again.</p>
          : image ? <img src={image} alt={`Full-screen QR credential for ${name}`} style={{ imageRendering: 'pixelated' }} /> : <p>Preparing QR…</p>}
        <p className="max-w-sm text-center text-sm">Hold steady with the entire code visible. Adjust brightness to avoid glare.</p>
      </div>
    </dialog>
  </>
}
