import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const base = process.env.GO_GATEWAY_URL || process.env.NEXT_PUBLIC_GO_GATEWAY_URL
    const key = process.env.TRIAL_INTERNAL_API_KEY
    if (!base || !key) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 })
    }

    const contentType = req.headers.get("content-type") || ""

    // Normalize incoming to { image_data: base64, format, resize_options, quality }
    let forwarded: any = { format: "png", resize_options: { max_width: 1400, max_height: 1400 }, quality: "auto" }

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      const file = form.get("file") as File | null
      if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 })
      if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 })
      const buf = Buffer.from(await file.arrayBuffer())
      const b64 = buf.toString("base64")
      forwarded.image_data = b64
      const fmt = (form.get("format") as string) || "png"
      forwarded.format = fmt
      const width = parseInt((form.get("width") as string) || "0", 10)
      const height = parseInt((form.get("height") as string) || "0", 10)
      const keepAspect = String(form.get("keep_aspect") || "true") === "true"
      if (width > 0 && height > 0) {
        forwarded.resize_options = { width, height, keep_aspect: keepAspect }
      } else {
        forwarded.resize_options = { max_width: 1400, max_height: 1400 }
      }
      const q = (form.get("quality") as string) || "auto"
      forwarded.quality = q
    } else if (contentType.startsWith("image/") || contentType.startsWith("application/octet-stream")) {
      const buf = Buffer.from(await req.arrayBuffer())
      if (buf.length > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 })
      forwarded.image_data = buf.toString("base64")
    } else {
      // JSON path
      const payload = await req.json().catch(() => null)
      if (!payload || typeof payload !== "object") {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
      }
      if (!payload.image_data || typeof payload.image_data !== "string") {
        return NextResponse.json({ error: "image_data is required" }, { status: 400 })
      }
      forwarded = {
        image_data: payload.image_data,
        format: payload.format || "png",
        resize_options: payload.resize_options || { max_width: 1400, max_height: 1400 },
        quality: payload.quality || "auto",
      }
    }

    // Helper to fetch with timeout and proper headers
    const doFetch = async (payload: any) => {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 120_000) // 120s
      try {
        const r = await fetch(`${base}/api/v1/remove-background`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json",
            "X-Usage-Context": "trial",
            "Accept": "image/*,application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
          cache: "no-store",
        })
        return r
      } finally {
        clearTimeout(t)
      }
    }

    const resp = await doFetch(forwarded)

    let ct = resp.headers.get("content-type") || "application/json"
    if (resp.ok && ct.startsWith("image/")) {
      return new NextResponse(resp.body as any, { status: 200, headers: { "Content-Type": ct } })
    }

    // Fallback: retry as PNG if WebP not supported upstream
    const forwardedPng = { ...forwarded, format: "png" }
    const resp2 = await doFetch(forwardedPng)
    ct = resp2.headers.get("content-type") || "application/octet-stream"
    if (resp2.ok && ct.startsWith("image/")) {
      return new NextResponse(resp2.body as any, { status: 200, headers: { "Content-Type": ct } })
    }

    // Neither attempt produced an image; return the JSON/text error
    const text = await resp2.text().catch(async () => await resp.text().catch(() => ""))
    return new NextResponse(text || JSON.stringify({ error: "Processing failed" }), {
      status: resp2.status || resp.status || 500,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
