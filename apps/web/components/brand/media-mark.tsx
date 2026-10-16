import type { SVGProps } from "react";

export function MediaMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path d="M5 11V5h6M21 5h6v6M27 21v6h-6M11 27H5v-6" stroke="currentColor" strokeWidth="3.2" strokeLinecap="square" />
      <path d="m16 8 8 8-8 8-8-8 8-8Z" fill="currentColor" />
      <path d="m16 12 4 4-4 4-4-4 4-4Z" fill="var(--background)" />
    </svg>
  );
}
