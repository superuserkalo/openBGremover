"use client"

import { motion } from "framer-motion"
import React from "react"

type ScissorIconProps = {
  size?: number
  strokeWidth?: number
  color?: string
  hovered?: boolean
  className?: string
}

// A compact, UI-friendly scissor icon with two animated blades.
// When hovered is true, the blades gently open/close in a looping motion.
export function ScissorIcon({
  size = 22,
  strokeWidth = 2,
  color = "currentColor",
  hovered = false,
  className,
}: ScissorIconProps) {
  // Blade animation: small open/close around hinge
  const bladeAnim = hovered
    ? {
        rotate: [8, -8, 8],
        transition: { duration: 1.2, ease: "easeInOut", repeat: Infinity },
      }
    : { rotate: 0, transition: { duration: 0.25 } }

  // Counter blade: mirror the motion
  const counterBladeAnim = hovered
    ? {
        rotate: [-8, 8, -8],
        transition: { duration: 1.2, ease: "easeInOut", repeat: Infinity },
      }
    : { rotate: 0, transition: { duration: 0.25 } }

  // SVG viewbox designed so hinge is at (12,12)
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Handles */}
      <circle cx="6.5" cy="7.5" r="3.2" stroke={color} strokeWidth={strokeWidth} />
      <circle cx="6.5" cy="16.5" r="3.2" stroke={color} strokeWidth={strokeWidth} />

      {/* Hinge */}
      <circle cx="12" cy="12" r="1.3" fill={color} />

      {/* Top blade */}
      <motion.g
        style={{ transformOrigin: "12px 12px", transformBox: "fill-box" as any }}
        animate={bladeAnim}
      >
        <path
          d="M12 12 L20.5 6.5"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </motion.g>

      {/* Bottom blade */}
      <motion.g
        style={{ transformOrigin: "12px 12px", transformBox: "fill-box" as any }}
        animate={counterBladeAnim}
      >
        <path
          d="M12 12 L20.5 17.5"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </motion.g>
    </motion.svg>
  )
}

export default ScissorIcon

