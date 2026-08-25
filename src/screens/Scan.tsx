import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { Camera, ChevronLeft, Keyboard } from 'lucide-react'
import { Button, Card, IconButton, Input, Screen, Spinner } from '../components/ui'
import { PortionSheet } from './AddFood'
import { findByBarcode, upsertFood } from '../lib/repo'
import type { Food } from '../lib/types'
import { OffError, lookupBarcode } from '../services/openfoodfacts'

/**
 * Barcode scanning.
 *
 * `BarcodeDetector` is not usable on iOS — it is disabled by default and the
 * underlying WebKit bug is still open — so this uses ZXing compiled to JS and
 * never touches the native API. There is also a manual-entry fallback, because
 * camera access inside an installed iOS web app is historically unreliable and
 * a dead scanner with no way forward is worse than a keyboard.
 */
export default function Scan() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'blocked'>('idle')
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [found, setFound] = useState<Food | null>(null)

  const handleCode = useCallback(async (code: string) => {
    controlsRef.current?.stop()
    setStatus('idle')
    setBusy(true)
    setError(null)
    try {
      // A barcode we have seen before resolves instantly and offline.
      const cached = await findByBarcode(code)
      if (cached) {
        setFound(cached)
        return
      }
      const product = await lookupBarcode(code)
      if (!product) {
        setError(`Barcode ${code} is not in the database. You can add the product yourself.`)
        return
      }
      await upsertFood(product.food)
      setFound(product.food)
    } catch (e) {
      setError(e instanceof OffError ? e.message : 'Lookup failed')
    } finally {
      setBusy(false)
    }
  }, [])

  const start = useCallback(async () => {
    setStatus('starting')
    setError(null)
    try {
      const hints = new Map()
      // Restricting formats to retail barcodes makes decoding markedly faster.
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)
      const reader = new BrowserMultiFormatReader(hints)

      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: 'environment', width: { ideal: 1280 } } },
        videoRef.current!,
        (result) => {
          if (result) void handleCode(result.getText())
        },
      )
      controlsRef.current = controls
      setStatus('scanning')
    } catch {
      setStatus('blocked')
      setError(
        'The camera could not be started. On iPhone this is unreliable inside installed web apps — just type the barcode instead.',
      )
    }
  }, [handleCode])

  useEffect(() => () => controlsRef.current?.stop(), [])

  return (
    <Screen
      title="Scan barcode"
      left={
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} />
        </IconButton>
      }
    >
      <Card className="mt-2 overflow-hidden">
        <div className="relative aspect-[4/3] bg-black">
          <video
            ref={videoRef}
            className="size-full object-cover"
            muted
            playsInline
            autoPlay
          />
          {status === 'scanning' && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="h-24 w-[70%] rounded-lg border-2 border-brand-text/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
            </div>
          )}
          {status !== 'scanning' && (
            <div className="absolute inset-0 grid place-items-center gap-3">
              {status === 'starting' ? (
                <Spinner className="size-6 text-txt-2" />
              ) : (
                <Button variant="primary" onClick={() => void start()}>
                  <Camera size={17} /> Start camera
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {busy && (
        <div className="mt-4 flex items-center justify-center gap-2 text-[0.8125rem] text-txt-2">
          <Spinner className="size-4" /> Looking up the product…
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-tile border border-warn/25 bg-warn/8 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-warn">
          {error}
        </p>
      )}

      <Card className="mt-4 p-4">
        <label className="mb-2 flex items-center gap-2 text-[0.8125rem] font-medium text-txt-2">
          <Keyboard size={15} /> Type the barcode
        </label>
        <div className="flex gap-2">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="4062139000012"
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))}
            className="flex-1"
          />
          <Button
            variant="primary"
            disabled={manual.length < 8 || busy}
            onClick={() => void handleCode(manual)}
          >
            Look up
          </Button>
        </div>
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-txt-3">
          The 13 digits under the stripes. German products usually start 40–44.
        </p>
      </Card>

      {found && (
        <PortionSheet
          food={found}
          onClose={() => setFound(null)}
          onDone={() => navigate('/')}
        />
      )}
    </Screen>
  )
}
