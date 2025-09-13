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
    if (!contentType.includes("application/json")) {
      return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 })
    }

    const payload = await req.json().catch(() => null)
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    if (!payload.image_data || typeof payload.image_data !== "string") {
      return NextResponse.json({ error: "image_data is required" }, { status: 400 })
    }

    const resp = await fetch(`${base}/api/v1/remove-background`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Usage-Context": "trial",
      },
      body: JSON.stringify(payload),
    })

    const ct = resp.headers.get("content-type") || "application/json"
    if (!resp.body) {
      const text = await resp.text().catch(() => "")
      return new NextResponse(text || JSON.stringify({ error: "Upstream has no body" }), {
        status: resp.status,
        headers: { "Content-Type": ct },
      })
    }
    // Stream upstream response directly to the client to avoid buffering large payloads
    return new NextResponse(resp.body as any, { status: resp.status, headers: { "Content-Type": ct } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
