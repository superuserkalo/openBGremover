"use client"

import { motion, useReducedMotion } from "framer-motion"
import { useMemo } from "react"

function FloatingPaths({ position }: { position: number }) {
  const prefersReducedMotion = useReducedMotion()
  const total = 36

  const paths = useMemo(() => {
    return Array.from({ length: total }, (_, i) => {
      const d = `M-${380 - i * 5 * position} -${189 + i * 6}C-${
        380 - i * 5 * position
      } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
        152 - i * 5 * position
      } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
        684 - i * 5 * position
      } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`
      const width = 0.5 + i * 0.03
      const opacity = 0.03 + (i / (total - 1)) * 0.12 // dimmer than original
      const duration = 22 + (i % 6) * 0.6 // stable, slight variation
      return { id: i, d, width, opacity, duration }
    })
  }, [position])

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg className="w-full h-full text-slate-950 dark:text-white" viewBox="0 0 696 316" fill="none">
        <title>Background Paths</title>
        {paths.map((p) => (
          prefersReducedMotion ? (
            <path
              key={p.id}
              d={p.d}
              stroke="currentColor"
              strokeWidth={p.width}
              strokeOpacity={p.opacity}
            />
          ) : (
            <motion.path
              key={p.id}
              d={p.d}
              stroke="currentColor"
              strokeWidth={p.width}
              strokeOpacity={p.opacity}
              initial={{ pathLength: 0.3, opacity: 0.5 }}
              animate={{
                pathLength: [0.3, 1, 0.3],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{ duration: p.duration, repeat: Infinity, ease: "linear" }}
            />
          )
        ))}
      </svg>
    </div>
  )
}

export default function BackgroundPaths() {
  return (
    <div className="absolute inset-0 z-0">
      <FloatingPaths position={1} />
      <FloatingPaths position={-1} />
    </div>
  )
}
