"use client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, ArrowLeft, Sparkles } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

export default function PricingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const payAsYouGo = {
    name: "Pay per image",
    price: "$0.XX",
    unit: "per image processed",
    description: "Perfect for getting started and testing",
    features: [
      "No minimum commitment",
      "Pay only for successful processing",
      "Same enterprise-grade quality",
      "Full API access",
      "Community support",
    ],
  }

  const bulkPackages = [
    {
      name: "Starter Bundle",
      images: "1,000 images",
      price: "$XX",
      pricePerImage: "$0.XX each",
      savings: "Save XX%",
      popular: false,
    },
    {
      name: "Pro Bundle",
      images: "10,000 images",
      price: "$XXX",
      pricePerImage: "$0.XX each",
      savings: "Save XX%",
      popular: true,
    },
    {
      name: "Enterprise Bundle",
      images: "100,000 images",
      price: "$X,XXX",
      pricePerImage: "$0.XX each",
      savings: "Save XX%",
      popular: false,
    },
  ]

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Navigation - Mobile Optimized */}
      <nav className="border-b border-neutral-800 bg-neutral-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2 text-neutral-400 hover:text-white cursor-pointer">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to home</span>
              <span className="sm:hidden">Back</span>
            </Link>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg"></div>
              <span className="text-lg sm:text-xl font-semibold">openBGremover</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
        <div className="text-center mb-12 sm:mb-16 max-w-3xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4 sm:mb-6 text-white tracking-[-0.01em] leading-[1.12]">Pricing that makes sense</h1>
          <p className="text-lg sm:text-xl text-neutral-400 leading-[1.65] tracking-[0.005em] mb-6 sm:mb-8 px-4 sm:px-0">
            No subscriptions. No expiring packages. No bullshit. Just pay for what you process.
          </p>

          {/* Simple, clean free trial banner - Mobile Optimized */}
          <div className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-3 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-300 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 group">
            <Sparkles className="w-3 sm:w-4 h-3 sm:h-4 mr-2 text-orange-400 group-hover:rotate-12 transition-transform duration-300" />
            <span className="text-white font-semibold text-sm sm:text-base">50 free images</span>
            <span className="ml-2 text-sm sm:text-base">to get you started</span>
          </div>
        </div>

        {/* Pay per image - Mobile Optimized */}
        <div className="max-w-lg mx-auto mb-12 sm:mb-16">
          <Card className="bg-neutral-900 border-neutral-800 text-center shadow-xl">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl font-semibold text-white tracking-[-0.005em] leading-[1.15]">{payAsYouGo.name}</CardTitle>
              <div className="mt-3 sm:mt-4">
                <span className="text-3xl sm:text-4xl font-bold text-white">{payAsYouGo.price}</span>
                <span className="text-neutral-400 ml-2 text-sm sm:text-base tracking-[0.01em]">{payAsYouGo.unit}</span>
              </div>
              <p className="text-neutral-400 mt-2 text-sm sm:text-base leading-[1.6] tracking-[0.01em]">{payAsYouGo.description}</p>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <ul className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
                {payAsYouGo.features.map((feature) => (
                  <li key={feature} className="flex items-center text-neutral-300 text-sm sm:text-base leading-[1.6] tracking-[0.01em]">
                    <Check className="w-4 sm:w-5 h-4 sm:h-5 text-orange-400 mr-3 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="cursor-pointer">
                <Button className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-sm sm:text-base cursor-pointer tracking-[0.02em] transition-colors duration-200">
                  Start processing
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Bulk packages - Mobile Optimized */}
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-white tracking-[-0.01em] leading-[1.12]">Or buy in bulk and save</h2>
          <p className="text-base sm:text-lg text-neutral-400 leading-[1.65] tracking-[0.005em] px-4 sm:px-0">
            Pre-purchase image processing at discounted rates. Process whenever you want - packages never expire.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 mb-12 sm:mb-16">
          {bulkPackages.map((pkg) => (
            <Card
              key={pkg.name}
              className={`bg-neutral-900 border-neutral-800 shadow-xl ${
                pkg.popular ? "border-orange-500/50 shadow-orange-500/10" : ""
              }`}
            >
              {pkg.popular && (
                <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white text-center py-2 text-xs sm:text-sm font-medium">
                  Most Popular
                </div>
              )}
              <CardHeader className="text-center p-4 sm:p-6">
                <CardTitle className="text-lg sm:text-xl font-semibold text-white tracking-[-0.005em] leading-[1.15]">{pkg.name}</CardTitle>
                <div className="mt-3 sm:mt-4">
                  <div className="text-2xl sm:text-3xl font-bold text-white">{pkg.price}</div>
                  <div className="text-neutral-400 mt-1">
                    <div className="text-sm sm:text-base tracking-[0.01em] leading-[1.6]">{pkg.images}</div>
                    <div className="text-xs sm:text-sm tracking-[0.02em] leading-[1.6]">{pkg.pricePerImage}</div>
                  </div>
                  <div className="inline-block mt-2 px-2 sm:px-3 py-1 bg-orange-500/20 border border-orange-500/30 rounded-full text-orange-400 text-xs sm:text-sm">
                    {pkg.savings}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <ul className="space-y-2 sm:space-y-3 mb-4 sm:mb-6 text-neutral-300">
                  <li className="flex items-center text-sm sm:text-base leading-[1.6] tracking-[0.01em]">
                    <Check className="w-4 sm:w-5 h-4 sm:h-5 text-orange-400 mr-3 flex-shrink-0" />
                    <span>Images never expire</span>
                  </li>
                  <li className="flex items-center text-sm sm:text-base leading-[1.6] tracking-[0.01em]">
                    <Check className="w-4 sm:w-5 h-4 sm:h-5 text-orange-400 mr-3 flex-shrink-0" />
                    <span>Same API, better price</span>
                  </li>
                  <li className="flex items-center text-sm sm:text-base leading-[1.6] tracking-[0.01em]">
                    <Check className="w-4 sm:w-5 h-4 sm:h-5 text-orange-400 mr-3 flex-shrink-0" />
                    <span>Priority processing</span>
                  </li>
                  <li className="flex items-center text-sm sm:text-base leading-[1.6] tracking-[0.01em]">
                    <Check className="w-4 sm:w-5 h-4 sm:h-5 text-orange-400 mr-3 flex-shrink-0" />
                    <span>Email support</span>
                  </li>
                </ul>
                <Link href="/signup" className="cursor-pointer">
                  <Button
                    className={`w-full text-sm sm:text-base cursor-pointer tracking-[0.02em] ${
                      pkg.popular
                        ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white transition-colors duration-200"
                        : "bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700"
                    }`}
                  >
                    Buy {pkg.name}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center">
          <p className="text-neutral-400 mb-4 text-sm sm:text-base tracking-[0.01em]">Need more than 100,000 images?</p>
          <Link href="/contact" className="cursor-pointer">
            <Button
              variant="outline"
              className="border-neutral-600 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-500 hover:text-white text-sm sm:text-base cursor-pointer tracking-[0.02em]"
            >
              Contact us for volume pricing
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
