import { NextResponse } from "next/server"

export const runtime = "nodejs"

// A tiny 1x1 transparent PNG (base64, no header) to trigger model cold-start
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAA" +
  "AAC0lEQVR42mP8/wwAAwMBAe9qg6kAAAAASUVORK5CYII="

export async function POST() {
  try {
    const base = process.env.GO_GATEWAY_URL || process.env.NEXT_PUBLIC_GO_GATEWAY_URL
    const key = process.env.TRIAL_INTERNAL_API_KEY
    if (!base || !key) return NextResponse.json({ ok: false }, { status: 204 })

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 90_000)
    try {
      await fetch(`${base}/api/v1/remove-background`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Usage-Context": "trial",
          "Accept": "image/*,application/json",
        },
        body: JSON.stringify({
          image_data: TINY_PNG_BASE64,
          format: "png",
          resize_options: { max_width: 2, max_height: 2 },
          quality: "auto",
        }),
        signal: controller.signal,
        cache: "no-store",
      })
      // Intentionally ignore response; warmup only
    } catch {
      // ignore warmup errors
    } finally {
      clearTimeout(t)
    }

    return new NextResponse(null, { status: 204 })
  } catch {
    return new NextResponse(null, { status: 204 })
  }
}
