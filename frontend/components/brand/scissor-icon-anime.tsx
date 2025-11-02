"use client"

import React, { useEffect, useRef } from "react"
import { animate, createSpring } from "animejs"

type ScissorIconAnimeProps = {
  size?: number
  strokeWidth?: number
  color?: string
  hovered?: boolean
  pressed?: boolean
  className?: string
}

// Anime.js-powered scissor icon with two blades that open/close on hover.
export default function ScissorIconAnime({
  size = 26,
  strokeWidth = 2,
  color = "currentColor",
  hovered = false,
  pressed = false,
  className,
}: ScissorIconAnimeProps) {
  const root = useRef<HTMLDivElement | null>(null)
  const topRef = useRef<SVGGElement | null>(null)
  const bottomRef = useRef<SVGGElement | null>(null)

  useEffect(() => {
    const top = topRef.current
    const bottom = bottomRef.current
    if (!top || !bottom) return
    const OPEN = 18
    const HOVER = 10
    const CLOSED = 0

    // cancel previous scoped animations without nuking DOM
    // we simply animate to new targets; animejs will overwrite

    if (pressed) {
      // Snip: close quickly then settle based on hover
      const springFast = createSpring({ stiffness: 500, damping: 20 })
      animate(top, {
        rotate: CLOSED,
        transformOrigin: "12px 12px",
        duration: 150,
        ease: springFast,
        complete: () => {
          animate(top, {
            rotate: hovered ? HOVER : OPEN,
            transformOrigin: "12px 12px",
            duration: 220,
            ease: createSpring({ stiffness: 220, damping: 25 }),
          })
        },
      })
      animate(bottom, {
        rotate: CLOSED,
        transformOrigin: "12px 12px",
        duration: 150,
        ease: springFast,
        complete: () => {
          animate(bottom, {
            rotate: hovered ? -HOVER : -OPEN,
            transformOrigin: "12px 12px",
            duration: 220,
            ease: createSpring({ stiffness: 220, damping: 25 }),
          })
        },
      })
    } else if (hovered) {
      // Slightly closed preview
      animate(top, {
        rotate: HOVER,
        transformOrigin: "12px 12px",
        duration: 220,
        ease: createSpring({ stiffness: 220, damping: 25 }),
      })
      animate(bottom, {
        rotate: -HOVER,
        transformOrigin: "12px 12px",
        duration: 220,
        ease: createSpring({ stiffness: 220, damping: 25 }),
      })
    } else {
      // Rest open
      animate(top, {
        rotate: OPEN,
        transformOrigin: "12px 12px",
        duration: 220,
        ease: createSpring({ stiffness: 180, damping: 22 }),
      })
      animate(bottom, {
        rotate: -OPEN,
        transformOrigin: "12px 12px",
        duration: 220,
        ease: createSpring({ stiffness: 180, damping: 22 }),
      })
    }
  }, [hovered, pressed])

  return (
    <div ref={root} className={className} aria-hidden>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Handles */}
        <circle cx="6.25" cy="7.25" r="3.1" stroke={color} strokeWidth={strokeWidth} />
        <circle cx="6.25" cy="16.75" r="3.1" stroke={color} strokeWidth={strokeWidth} />

        {/* Bridge */}
        <path d="M9 9 L11 11 M9 15 L11 13" stroke={color} strokeWidth={strokeWidth - 0.5} strokeLinecap="round" />

        {/* Hinge */}
        <circle cx="12" cy="12" r="1.25" fill={color} />

        {/* Blades */}
        <g ref={topRef} className="blade-top" style={{ transformOrigin: "12px 12px" as any }}>
          <path d="M12 12 L20.5 6.25" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </g>
        <g ref={bottomRef} className="blade-bottom" style={{ transformOrigin: "12px 12px" as any }}>
          <path d="M12 12 L20.5 17.75" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </g>
      </svg>
    </div>
  )
}
