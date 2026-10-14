"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Schema } from "effect"
import { ApiFailure } from "@openbg/contracts"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Upload, Download, Loader2, Sparkles, ArrowLeftRight } from "lucide-react"
import { useDropzone } from "react-dropzone"
import Link from "next/link"

export function BackgroundRemovalDemo() {
  const [originalImage, setOriginalImage] = useState<string | null>(null)
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [slider, setSlider] = useState(50)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [boxSize, setBoxSize] = useState<{ w: number; h: number } | null>(null)
  const [downloadName, setDownloadName] = useState("")
  const [extension, setExtension] = useState("png")
  const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v))

  const startDragAtClientX = (clientX: number) => {
    const el = containerRef.current

    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setSlider(clamp(pct))
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => startDragAtClientX(e.clientX)

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) startDragAtClientX(e.touches[0].clientX)
    }

    const stop = () => setDragging(false)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", stop)
    window.addEventListener("touchmove", onTouchMove, { passive: false })
    window.addEventListener("touchend", stop)

    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", stop)
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", stop)
    }
  }, [dragging])

  // Measure image dimensions to set precise aspect ratio of the preview box
  useEffect(() => {
    const src = processedImage || originalImage

    if (!src) return

    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setImgDims({ w: img.naturalWidth, h: img.naturalHeight })
      }
    }

    img.src = src
  }, [originalImage, processedImage])

  // Compute a box that fits viewport height (70vh) and available width while preserving aspect.
  useEffect(() => {
    const recompute = () => {
      const frame = frameRef.current
      const ratio = imgDims ? imgDims.w / imgDims.h : 4 / 3 // width/height

      if (!frame) return
      const availableW = frame.clientWidth
      const maxH = Math.floor(window.innerHeight * 0.7)
      let width = availableW
      let height = Math.round(width / ratio)

      if (height > maxH) {
        height = maxH
        width = Math.round(height * ratio)
      }

      setBoxSize({ w: width, h: height })
    }

    recompute()
    window.addEventListener("resize", recompute)

    return () => window.removeEventListener("resize", recompute)
  }, [imgDims])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]

    if (!file) return

    const blobUrl = URL.createObjectURL(file)
    setOriginalImage(blobUrl)
    // Propose a default filename (without extension)
    const base = file.name.replace(/\.[^.]+$/, "")
    setDownloadName(base.slice(0, 64))
    setProcessedImage(null)
    setError(null)
    setIsProcessing(true)
    setProgress(4)
    let tick: ReturnType<typeof setInterval> | undefined

    try {
      // Preserve source pixels and metadata; the worker handles model preprocessing.
      const form = new FormData()
      form.append("file", file)
      form.append("format", "png")
      form.append("quality", "auto")
      tick = setInterval(() => {
        // Ease towards 92% while waiting
        setProgress((p) => (p < 92 ? Math.min(92, p + 2) : p))
      }, 500)
      const resp = await fetch("/api/trial/run", { method: "POST", body: form })

      if (!resp.ok) {
        if (resp.status === 413) throw new Error("This image exceeds the file-size limit. Choose a smaller file.")

        const failure = await resp.json().then(Schema.decodeUnknownSync(ApiFailure))
          .catch(() => ({ error: "Could not process this image. Please try again." }))

        throw new Error(failure.error)
      }

      const ct = resp.headers.get("content-type") || ""

      if (ct.startsWith("image/")) {
        const blob = await resp.blob()
        const url = URL.createObjectURL(blob)
        setExtension(ct.startsWith("image/gif") ? "gif" : "png")
        setProcessedImage(url)
        setProgress(100)
      } else {
        throw new Error("The server did not return an image")
      }
    } catch (cause) {
      setProcessedImage(null)
      setError(cause instanceof Error ? cause.message : "Could not process this image. Please try again.")
    } finally {
      clearInterval(tick)
      setIsProcessing(false)
      setTimeout(() => setProgress(0), 800)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".webp"],
    },
    multiple: false,
    maxSize: 10 * 1024 * 1024,
    onDropRejected: () => setError("Choose a JPEG, PNG, or WebP image up to 10 MB."),
  })

  const handleDownload = () => {
    if (!processedImage) return
    const sanitize = (s: string) => s.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "") || "image"
    const name = sanitize(downloadName || "result") + "-removed." + extension
    const anchor = document.createElement("a")
    anchor.href = processedImage
    anchor.download = name
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  return (
    <div className="max-w-6xl mx-auto">
      {error && <p role="alert" className="mb-4 text-sm text-red-400">{error}</p>}
      {!originalImage ? (
        <Card className="border-2 border-dashed border-neutral-700 hover:border-orange-500/50 transition-all duration-300 bg-neutral-900 shadow-xl hover:shadow-2xl hover:scale-105 group">
          <CardContent className="p-6 sm:p-8 lg:p-12">
            <div {...getRootProps()} className="text-center cursor-pointer">
              <input {...getInputProps()} />
              <div className="relative mb-4 sm:mb-6">
                <Upload className="w-8 sm:w-10 lg:w-12 h-8 sm:h-10 lg:h-12 text-neutral-500 mx-auto group-hover:text-orange-400 transition-all duration-300 group-hover:scale-110" />
                <Sparkles className="w-3 sm:w-4 h-3 sm:h-4 text-orange-400 absolute -top-1 -right-1 animate-pulse group-hover:scale-125 transition-transform duration-300" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-2 group-hover:text-orange-100 transition-colors duration-300">
                {isDragActive ? "Drop your image here" : "Upload an image to test"}
              </h3>
              <p className="text-sm sm:text-base text-neutral-400 mb-4 sm:mb-6 leading-relaxed group-hover:text-neutral-300 transition-colors duration-300 px-2 sm:px-0">
                Drag and drop an image, or click to select. See the magic happen in seconds.
              </p>
              <Button className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white transition-colors duration-300 cursor-pointer">
                Choose Image
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-neutral-900 border-neutral-800 shadow-xl hover:shadow-2xl transition-all duration-300 group">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 sm:mb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-base sm:text-lg font-semibold text-white group-hover:text-orange-100 transition-colors duration-300">Preview</h3>
                <span className="hidden sm:inline text-xs sm:text-sm text-neutral-400">Drag to compare</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400">File name:</span>
                <Input
                  value={downloadName}
                  onChange={(e) => setDownloadName(e.target.value)}
                  placeholder="my-image"
                  className="h-8 w-40 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500 focus:border-orange-500 focus:ring-orange-500/20"
                />
              </div>
            </div>

            <div ref={frameRef} className="w-full flex justify-center">
            <div
              ref={containerRef}
              className="relative w-full rounded-lg overflow-hidden bg-neutral-800 group-hover:ring-2 group-hover:ring-orange-500/20 transition-all duration-300"
              style={{
                width: boxSize ? `${boxSize.w}px` : "100%",
                height: boxSize ? `${boxSize.h}px` : undefined,
                backgroundImage:
                  "linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%)," +
                  "linear-gradient(-45deg, rgba(255,255,255,0.04) 25%, transparent 25%)," +
                  "linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.04) 75%)," +
                  "linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.04) 75%)",
                backgroundSize: "20px 20px",
                backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
              }}
              onMouseDown={(e) => {
                setDragging(true)
                startDragAtClientX(e.clientX)
              }}
              onTouchStart={(e) => {
                setDragging(true)

                if (e.touches && e.touches[0]) startDragAtClientX(e.touches[0].clientX)
              }}
            >
              {isProcessing ? (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <div className="text-center max-w-xs w-full">
                    <Loader2 className="w-7 h-7 animate-spin text-orange-400 mx-auto mb-3" />
                    <p className="text-sm text-neutral-300">Preparing preview…</p>
                    <p className="text-xs text-neutral-500 mt-1">Larger images and the first request after a pause can take longer.</p>
                    <div className="mt-4">
                      <Progress value={progress} />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Base: processed image covers full container */}
                  <img
                    src={processedImage || originalImage || "/placeholder.svg"}
                    alt="Processed"
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{ zIndex: 1 }}
                  />
                  {/* Overlay: original image clipped to left side by slider */}
                  <img
                    src={originalImage || "/placeholder.svg"}
                    alt="Original"
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{
                      zIndex: 2,
                      clipPath: `polygon(0 0, ${slider}% 0, ${slider}% 100%, 0 100%)`,
                      WebkitClipPath: `polygon(0 0, ${slider}% 0, ${slider}% 100%, 0 100%)`,
                    }}
                  />
                  {/* Divider handle */}
                  <div
                    className="absolute top-0 bottom-0 flex flex-col items-center cursor-col-resize select-none"
                    style={{ left: `${slider}%`, transform: "translateX(-50%)", zIndex: 3 }}
                  >
                    <div className="h-full w-px bg-white/70"></div>
                    <div className="absolute top-1/2 -translate-y-1/2 bg-white text-black rounded-full shadow-lg border border-black/10 w-9 h-9 flex items-center justify-center">
                      <ArrowLeftRight className="w-4 h-4" />
                    </div>
                  </div>
                </>
              )}
            </div>
            </div>

            {error && !isProcessing && (
              <Button variant="outline" className="mt-4" onClick={() => { setOriginalImage(null); setError(null) }}>
                Choose another image
              </Button>
            )}

            {processedImage && !isProcessing && (
              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                <Button onClick={handleDownload} className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white transition-colors duration-300 group text-sm sm:text-base cursor-pointer">
                  <Download className="w-3 sm:w-4 h-3 sm:h-4 mr-2 group-hover:scale-110 transition-transform duration-300" />
                  Download PNG
                </Button>
                <Link href="/signup" className="flex-1">
                  <Button
                    variant="outline"
                    className="w-full border-neutral-600 text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors duration-300 text-sm sm:text-base cursor-pointer"
                  >
                    Try Another
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
