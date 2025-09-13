"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Upload, Download, Loader2, Sparkles } from "lucide-react"
import { useDropzone } from "react-dropzone"

export function BackgroundRemovalDemo() {
  const [originalImage, setOriginalImage] = useState<string | null>(null)
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    const blobUrl = URL.createObjectURL(file)
    setOriginalImage(blobUrl)
    setProcessedImage(null)
    setIsProcessing(true)

    try {
      // Convert to base64 data URL
      const toBase64 = (f: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = reject
          reader.readAsDataURL(f)
        })

      const imageData = await toBase64(file)
      const resp = await fetch("/api/trial/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data: imageData, quality: "auto", format: "png" }),
      })

      if (!resp.ok) {
        // Show simple failure state
        setProcessedImage(null)
        setIsProcessing(false)
        return
      }

      const ct = resp.headers.get("content-type") || ""
      if (ct.startsWith("image/")) {
        const blob = await resp.blob()
        const url = URL.createObjectURL(blob)
        setProcessedImage(url)
      } else {
        const json = await resp.json().catch(() => null as any)
        const result = json?.result_image || json?.ResultImage || json?.image || null
        if (typeof result === "string" && result.length > 0) {
          const isDataURL = result.startsWith("data:image/")
          setProcessedImage(isDataURL ? result : `data:image/png;base64,${result}`)
        } else {
          setProcessedImage(null)
        }
      }
    } catch (_) {
      setProcessedImage(null)
    } finally {
      setIsProcessing(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".webp"],
    },
    multiple: false,
  })

  return (
    <div className="max-w-6xl mx-auto">
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
              <Button className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 transition-all duration-300 hover:scale-105 hover:-translate-y-1 cursor-pointer">
                Choose Image
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
          <Card className="bg-neutral-900 border-neutral-800 shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 group">
            <CardContent className="p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-white group-hover:text-orange-100 transition-colors duration-300">
                Original
              </h3>
              <div className="aspect-square bg-neutral-800 rounded-lg overflow-hidden group-hover:ring-2 group-hover:ring-orange-500/20 transition-all duration-300">
                <img src={originalImage || "/placeholder.svg"} alt="Original" className="w-full h-full object-cover" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800 shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 group">
            <CardContent className="p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-white group-hover:text-orange-100 transition-colors duration-300">
                Background Removed
              </h3>
              <div className="aspect-square bg-neutral-800 rounded-lg overflow-hidden relative group-hover:ring-2 group-hover:ring-orange-500/20 transition-all duration-300">
                {isProcessing ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="w-6 sm:w-8 h-6 sm:h-8 animate-spin text-orange-400 mx-auto mb-2" />
                      <p className="text-sm sm:text-base text-neutral-400">Processing...</p>
                      <div className="mt-3 sm:mt-4 w-24 sm:w-32 h-1 bg-neutral-700 rounded-full mx-auto overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                ) : processedImage ? (
                  <img src={processedImage || "/placeholder.svg"} alt="Processed" className="w-full h-full object-contain bg-[conic-gradient(at_50%_50%,_rgba(255,255,255,0.05),_rgba(0,0,0,0.05)_25%,_rgba(255,255,255,0.05)_50%,_rgba(0,0,0,0.05)_75%,_rgba(255,255,255,0.05))]" />
                ) : null}
              </div>
              {processedImage && !isProcessing && (
                <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row gap-2">
                  <Button className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 transition-all duration-300 hover:scale-105 hover:-translate-y-1 group text-sm sm:text-base cursor-pointer">
                    <Download className="w-3 sm:w-4 h-3 sm:h-4 mr-2 group-hover:scale-110 transition-transform duration-300" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    className="border-neutral-600 text-neutral-300 hover:bg-neutral-800 hover:border-orange-500/50 hover:text-white transition-all duration-300 hover:scale-105 hover:-translate-y-1 text-sm sm:text-base cursor-pointer"
                    onClick={() => {
                      setOriginalImage(null)
                      setProcessedImage(null)
                    }}
                  >
                    Try Another
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
