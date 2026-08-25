/**
 * Image preparation for vision calls.
 *
 * Two jobs: make the photo cheap to send, and refuse photos that are going to
 * produce a bad estimate before spending a token on them.
 */

export interface PreparedImage {
  base64: string
  mediaType: 'image/jpeg'
  width: number
  height: number
  bytes: number
}

/**
 * Anthropic bills vision per 28x28 tile and caps the long edge at 2576 px.
 * 1024 px is the sweet spot: a 4K phone photo costs ~4784 tokens, the same
 * photo at 1024 px costs ~1300, and the estimate does not improve with the
 * extra pixels — the model cannot see a gram of oil at any resolution.
 */
const TARGET_LONG_EDGE = 1024
const JPEG_QUALITY = 0.85

export async function prepareImage(file: Blob, longEdge = TARGET_LONG_EDGE): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas nicht verfügbar')
    ctx.drawImage(bitmap, 0, 0, w, h)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) throw new Error('Bild konnte nicht kodiert werden')

    return {
      base64: await blobToBase64(blob),
      mediaType: 'image/jpeg',
      width: w,
      height: h,
      bytes: blob.size,
    }
  } finally {
    bitmap.close()
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the "data:image/jpeg;base64," prefix the API does not want.
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'))
    reader.readAsDataURL(blob)
  })
}

export interface ImageQuality {
  ok: boolean
  /** 0–1, mean relative luminance. */
  brightness: number
  /** Variance of the Laplacian — low means out of focus. */
  sharpness: number
  reason?: string
}

/**
 * Cheap client-side gate before spending an API call.
 *
 * A photo that is too dark or badly out of focus produces a confident-sounding
 * estimate from nothing, which is the worst possible outcome — better to ask
 * for another shot.
 */
export async function assessQuality(file: Blob): Promise<ImageQuality> {
  const bitmap = await createImageBitmap(file)
  try {
    // Downsample hard; we only need statistics, not detail.
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return { ok: true, brightness: 0.5, sharpness: 1 }

    ctx.drawImage(bitmap, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    const gray = new Float32Array(size * size)
    let sum = 0
    for (let i = 0; i < gray.length; i++) {
      const o = i * 4
      const g = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255
      gray[i] = g
      sum += g
    }
    const brightness = sum / gray.length

    // Laplacian variance: the standard blur detector.
    let lapSum = 0
    let lapSq = 0
    let n = 0
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = y * size + x
        const lap =
          4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - size] - gray[i + size]
        lapSum += lap
        lapSq += lap * lap
        n++
      }
    }
    const mean = lapSum / n
    const sharpness = lapSq / n - mean * mean

    if (brightness < 0.08)
      return { ok: false, brightness, sharpness, reason: 'Das Foto ist sehr dunkel — bitte mit mehr Licht wiederholen.' }
    if (brightness > 0.96)
      return { ok: false, brightness, sharpness, reason: 'Das Foto ist überbelichtet.' }
    if (sharpness < 0.00035)
      return { ok: false, brightness, sharpness, reason: 'Das Foto ist unscharf — bitte noch einmal versuchen.' }

    return { ok: true, brightness, sharpness }
  } finally {
    bitmap.close()
  }
}
