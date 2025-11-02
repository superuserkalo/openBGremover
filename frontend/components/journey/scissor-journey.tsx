"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import ScissorIconAnime from "@/components/brand/scissor-icon-anime"
import { animate, svg } from "animejs"

function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null

  const debounced = (...args: Parameters<F>) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => func(...args), waitFor)
  }

  return debounced as (...args: Parameters<F>) => void
}

type Props = { className?: string }

// Anime.js v4 implementation: fixed overlay journey with dashed orthogonal path
export default function ScissorJourney({ className }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Path 1 refs (Value -> Demo)
  const pathBaseRef1 = useRef<SVGPathElement | null>(null)
  const pathDrawRef1 = useRef<SVGPathElement | null>(null)
  const maskPathRef1 = useRef<SVGPathElement | null>(null)
  const followerGRef1 = useRef<SVGGElement | null>(null)
  const scissorStartOffsetRef1 = useRef<number>(40)
  // Path 2 refs (Why -> Code box)
  const pathBaseRef2 = useRef<SVGPathElement | null>(null)
  const pathDrawRef2 = useRef<SVGPathElement | null>(null)
  const maskPathRef2 = useRef<SVGPathElement | null>(null)
  const followerGRef2 = useRef<SVGGElement | null>(null)
  const scissorStartOffsetRef2 = useRef<number>(40)
  const [visible, setVisible] = useState(true)
  const [pressed, setPressed] = useState(false)
  const lastLenRef1 = useRef(0)
  const lastLenRef2 = useRef(0)

  // Dynamic path string in site pixel coordinates
  const [d1, setD1] = useState<string>("")
  const [d2, setD2] = useState<string>("")
  const recomputePath = () => {
    if (rootRef.current) {
      rootRef.current.classList.remove("opacity-0")
      rootRef.current.classList.add("opacity-100")
    }
    const site = document.getElementById("site")
    const value = document.getElementById("value")
    const demo = document.getElementById("demo")
    const why = document.getElementById("why")
    const code = document.getElementById("codebox")
    if (!site || !value || !demo || !why) return
    const siteRect = site.getBoundingClientRect()
    const toLocal = (r: DOMRect) => ({
      left: r.left - siteRect.left,
      top: r.top - siteRect.top,
      right: r.right - siteRect.left,
      bottom: r.bottom - siteRect.top,
      width: r.width,
      height: r.height,
      cx: r.left - siteRect.left + r.width / 2,
      cy: r.top - siteRect.top + r.height / 2,
    })
    const v = toLocal(value.getBoundingClientRect())
    const dmo = toLocal(demo.getBoundingClientRect())
    const wy = toLocal(why.getBoundingClientRect())
    const cb = code ? toLocal(code.getBoundingClientRect()) : null
    // Path 1: Value -> Demo (only)
    const p1: Array<[number, number]> = []
    const startX1 = v.left + 32
    const yMidDemo = dmo.cy
    p1.push([startX1, v.bottom])
    p1.push([startX1, yMidDemo])
    const entryX1 = Math.max(dmo.left + 12, startX1 + 12)
    p1.push([entryX1, yMidDemo])
    // Enter demo horizontally and stop at its center (no tail going down)
    p1.push([dmo.cx, yMidDemo])
    if (p1.length >= 2) {
      let s1 = `M ${p1[0][0]} ${p1[0][1]}`
      for (let i = 1; i < p1.length; i++) s1 += ` L ${p1[i][0]} ${p1[i][1]}`
      setD1(s1)
    }

    // Path 2: Why (right side) -> Code box center (stop at center, no exit)
    if (cb) {
      const p2: Array<[number, number]> = []
      const xWhyRight = wy.right - 24
      p2.push([xWhyRight, wy.top + 24])
      p2.push([xWhyRight, cb.cy])
      p2.push([cb.cx, cb.cy])
      if (p2.length >= 2) {
        let s2 = `M ${p2[0][0]} ${p2[0][1]}`
        for (let i = 1; i < p2.length; i++) s2 += ` L ${p2[i][0]} ${p2[i][1]}`
        setD2(s2)
      }
    } else {
      setD2("")
    }
  }

  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)")
    if (reduce && reduce.matches) setVisible(false)
  }, [])

  // Keep viewBox in sync with #site size and recompute the path
  const update = useMemo(() => {
    const updateFn = () => {
      const site = document.getElementById("site")
      const svgEl = svgRef.current
      if (site && svgEl) {
        const rect = site.getBoundingClientRect()
        svgEl.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`)
      }
      recomputePath()
    }
    return debounce(updateFn, 100)
  }, [recomputePath])

  useEffect(() => {
    if (!visible) return
    update()
    window.addEventListener("resize", update)
    const t = window.setTimeout(update, 200)

    // Observe #site size changes (e.g., demo container expands on upload)
    const siteEl = document.getElementById("site")
    const ro = (typeof ResizeObserver !== 'undefined' && siteEl)
      ? new ResizeObserver(update)
      : null
    if (ro && siteEl) ro.observe(siteEl)
    return () => {
      window.removeEventListener("resize", update)
      window.clearTimeout(t)
      if (ro) ro.disconnect()
    }
  }, [visible, update])

  useEffect(() => {
    if (!visible) return
    if (!d1 && !d2) return
    // Re-select after potential viewBox update
    const svgEl2 = svgRef.current
    const pathEl1 = pathBaseRef1.current
    const maskPath1 = maskPathRef1.current
    const followG1 = followerGRef1.current
    const pathEl2 = pathBaseRef2.current
    const maskPath2 = maskPathRef2.current
    const followG2 = followerGRef2.current
    if (!svgEl2) return

    // Prepare drawable proxies and motions for each path that exists
    const duration = 1200
    const anims: Array<{
      pathEl: SVGPathElement
      drawAnim: any
      motion: any
      lastLenRef: React.MutableRefObject<number>
      offsetRef: React.MutableRefObject<number>
    }> = []

    if (pathEl1 && maskPath1 && followG1) {
      const [drawable1] = svg.createDrawable(maskPath1 as any)
      const drawAnim1 = animate(drawable1 as any, {
        draw: ["0 0", "0 1"],
        ease: "linear",
        duration,
        autoplay: false,
      })
      const motion1 = animate(followG1 as any, {
        ease: "linear",
        duration,
        autoplay: false,
        ...svg.createMotionPath(pathEl1 as any),
      })
      anims.push({ pathEl: pathEl1, drawAnim: drawAnim1, motion: motion1, lastLenRef: lastLenRef1, offsetRef: scissorStartOffsetRef1 })
    }

    if (pathEl2 && maskPath2 && followG2) {
      const [drawable2] = svg.createDrawable(maskPath2 as any)
      const drawAnim2 = animate(drawable2 as any, {
        draw: ["0 0", "0 1"],
        ease: "linear",
        duration,
        autoplay: false,
      })
      const motion2 = animate(followG2 as any, {
        ease: "linear",
        duration,
        autoplay: false,
        ...svg.createMotionPath(pathEl2 as any),
      })
      anims.push({ pathEl: pathEl2, drawAnim: drawAnim2, motion: motion2, lastLenRef: lastLenRef2, offsetRef: scissorStartOffsetRef2 })
    }

    if (anims.length === 0) return

    // Map site section scroll to [0..1] progress
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const site = document.getElementById("site")
        if (!site) return
        const rect = site.getBoundingClientRect()
        const vh = window.innerHeight || document.documentElement.clientHeight
        const total = Math.max(1, rect.height - vh)
        const raw = (-rect.top) / total
        const p = Math.max(0, Math.min(1, raw))

        const valueEl = document.getElementById("value")
        const demoEl = document.getElementById("demo")
        const whyEl = document.getElementById("why")
        const codeEl = document.getElementById("codebox")
        const siteHeight = site.scrollHeight

        let p1_start = 0,
          p1_end = 1,
          p2_start = 0,
          p2_end = 1

        if (valueEl && demoEl && siteHeight > 0) {
          p1_start = valueEl.offsetTop / siteHeight
          p1_end = demoEl.offsetTop / siteHeight
        }
        if (whyEl && codeEl && siteHeight > 0) {
          p2_start = whyEl.offsetTop / siteHeight
          p2_end = codeEl.offsetTop / siteHeight
        }

        let snipped = false
        for (const a of anims) {
          const totalLen = a.pathEl.getTotalLength()

          let effectiveP = p
          if (a.offsetRef === scissorStartOffsetRef1) {
            if (p1_end > p1_start) {
              const p1 = (p - p1_start) / (p1_end - p1_start)
              effectiveP = Math.max(0, Math.min(1, p1))
            }
          } else if (a.offsetRef === scissorStartOffsetRef2) {
            if (p2_end > p2_start) {
              const p2 = (p - p2_start) / (p2_end - p2_start)
              effectiveP = Math.max(0, Math.min(1, p2))
            }
          }

          const curLen = totalLen * effectiveP
          const pScissor = Math.max(0, Math.min(1, (curLen + a.offsetRef.current) / totalLen))
          a.drawAnim.seek(pScissor * duration)
          a.motion.seek(pScissor * duration)
          if (!snipped && Math.abs(curLen - a.lastLenRef.current) > 24) {
            a.lastLenRef.current = curLen
            snipped = true
          }
        }
        if (snipped) {
          setPressed(true)
          window.setTimeout(() => setPressed(false), 160)
        }
      })
    }

    const site = document.getElementById("site")
    let io: IntersectionObserver | null = null
    if (site) {
      io = new IntersectionObserver((entries) => {
        const e = entries[0]
        if (!e) return
        if (e.isIntersecting) {
          window.addEventListener("scroll", onScroll, { passive: true })
          onScroll()
        } else {
          window.removeEventListener("scroll", onScroll as any)
        }
      })
      io.observe(site)
    } else {
      // Fallback: attach anyway
      window.addEventListener("scroll", onScroll, { passive: true })
      onScroll()
    }

    return () => {
      if (io) io.disconnect()
      window.removeEventListener("scroll", onScroll as any)
      cancelAnimationFrame(raf)
      // No explicit .pause() needed as animations are manual seek
    }
  }, [visible, d1, d2])

  // Use ScissorIconAnime's own pressed prop for snip feedback

  if (!visible) return null

  return (
    <div ref={rootRef} className={"absolute inset-0 hidden lg:block pointer-events-none z-0 opacity-0 transition-opacity duration-300 " + (className || "")} aria-hidden>
      <svg ref={svgRef} className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="journeyAhead" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fb923c" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.95" />
          </linearGradient>
          {/* Mask 1: reveals traveled portion along the path while keeping dashed styling */}
          <mask id="journeyMask1">
            <path
              ref={maskPathRef1}
              d={d1}
              stroke="#ffffff"
              strokeWidth={9}
              strokeLinecap="round"
              fill="none"
            />
          </mask>
          {/* Mask 2 */}
          <mask id="journeyMask2">
            <path
              ref={maskPathRef2}
              d={d2}
              stroke="#ffffff"
              strokeWidth={9}
              strokeLinecap="round"
              fill="none"
            />
          </mask>
        </defs>

        {/* PATH 1: Value -> Demo */}
        <path ref={pathBaseRef1} d={d1} stroke="#fb923c" strokeOpacity="0.12" strokeWidth={3} fill="none" strokeDasharray="18 12" vectorEffect="non-scaling-stroke" />
        <path d={d1} stroke="url(#journeyAhead)" strokeWidth={5} fill="none" strokeDasharray="18 12" vectorEffect="non-scaling-stroke" />
        <path
          ref={pathDrawRef1}
          d={d1}
          stroke="#94a3b8"
          strokeWidth={5}
          fill="none"
          strokeDasharray="18 12"
          vectorEffect="non-scaling-stroke"
          mask="url(#journeyMask1)"
        />
        <g ref={followerGRef1} style={{ transformBox: "fill-box", transformOrigin: "center" } as any}>
          <foreignObject x={-24} y={-24} width={48} height={48} pointerEvents="none">
            <div xmlns="http://www.w3.org/1999/xhtml" style={{ pointerEvents: "none" }}>
              <ScissorIconAnime size={48} strokeWidth={2.25} color="#ffffff" pressed={pressed} />
            </div>
          </foreignObject>
        </g>

        {/* PATH 2: Why -> Code center */}
        <path ref={pathBaseRef2} d={d2} stroke="#fb923c" strokeOpacity="0.12" strokeWidth={3} fill="none" strokeDasharray="18 12" vectorEffect="non-scaling-stroke" />
        <path d={d2} stroke="url(#journeyAhead)" strokeWidth={5} fill="none" strokeDasharray="18 12" vectorEffect="non-scaling-stroke" />
        <path
          ref={pathDrawRef2}
          d={d2}
          stroke="#94a3b8"
          strokeWidth={5}
          fill="none"
          strokeDasharray="18 12"
          vectorEffect="non-scaling-stroke"
          mask="url(#journeyMask2)"
        />
        <g ref={followerGRef2} style={{ transformBox: "fill-box", transformOrigin: "center" } as any}>
          <foreignObject x={-24} y={-24} width={48} height={48} pointerEvents="none">
            <div xmlns="http://www.w3.org/1999/xhtml" style={{ pointerEvents: "none" }}>
              <ScissorIconAnime size={48} strokeWidth={2.25} color="#ffffff" pressed={pressed} />
            </div>
          </foreignObject>
        </g>
      </svg>
    </div>
  )
}
