import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, Zap, ArrowRight } from "lucide-react"
import Link from "next/link"

export function PricingSection() {
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
    <section className="relative py-20 bg-gradient-to-b from-transparent to-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            Pricing that makes sense
          </h2>
          <p className="text-xl text-gray-400 mb-8 max-w-3xl mx-auto">
            No subscriptions. No expiring packages. No bullshit. Just pay for what you process.
          </p>
          <div className="inline-flex items-center px-6 py-3 rounded-full bg-gradient-to-r from-emerald-500/10 to-emerald-400/10 border border-emerald-500/20 text-emerald-400 font-medium hover:scale-105 transition-transform duration-300">
            <Zap className="w-4 h-4 mr-2" />
            All packages process forever - no expiration
          </div>
        </div>

        {/* Pay per image */}
        <div className="max-w-lg mx-auto mb-16">
          <Card className="bg-gradient-to-b from-white/5 to-white/10 border-white/10 backdrop-blur-sm text-center hover:scale-105 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl font-bold text-white">{payAsYouGo.name}</CardTitle>
              <div className="mt-6">
                <span className="text-5xl font-bold text-white">{payAsYouGo.price}</span>
                <span className="text-gray-400 ml-2 text-lg">{payAsYouGo.unit}</span>
              </div>
              <p className="text-gray-400 mt-4 text-lg">{payAsYouGo.description}</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4 mb-8">
                {payAsYouGo.features.map((feature) => (
                  <li key={feature} className="flex items-center text-gray-300">
                    <Check className="w-5 h-5 text-emerald-400 mr-3" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link href="/signup">
                <Button className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white border-0 shadow-lg hover:shadow-blue-500/25 transition-all duration-300 hover:scale-105">
                  Start processing images
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Bulk packages */}
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold mb-4 text-white">Or buy in bulk and save big</h3>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Pre-purchase image processing at discounted rates. Process whenever you want - packages never expire.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {bulkPackages.map((pkg) => (
            <Card
              key={pkg.name}
              className={`relative bg-gradient-to-b from-white/5 to-white/10 border-white/10 backdrop-blur-sm hover:scale-105 transition-all duration-300 ${
                pkg.popular
                  ? "border-blue-500/50 shadow-2xl shadow-blue-500/20"
                  : "hover:shadow-2xl hover:shadow-white/10"
              }`}
            >
              {pkg.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
                    Most Popular
                  </span>
                </div>
              )}
              <CardHeader className="text-center pb-4">
                <CardTitle className="text-2xl font-bold text-white">{pkg.name}</CardTitle>
                <div className="mt-6">
                  <div className="text-4xl font-bold text-white">{pkg.price}</div>
                  <div className="text-gray-400 mt-2">
                    <div className="text-lg">{pkg.images}</div>
                    <div className="text-sm">{pkg.pricePerImage}</div>
                  </div>
                  <div className="inline-block mt-3 px-4 py-1 bg-gradient-to-r from-emerald-500/20 to-emerald-400/20 border border-emerald-500/30 rounded-full text-emerald-400 text-sm font-medium">
                    {pkg.savings}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4 mb-8 text-gray-300">
                  <li className="flex items-center">
                    <Check className="w-5 h-5 text-emerald-400 mr-3" />
                    <span>Images never expire</span>
                  </li>
                  <li className="flex items-center">
                    <Check className="w-5 h-5 text-emerald-400 mr-3" />
                    <span>Same API, better price</span>
                  </li>
                  <li className="flex items-center">
                    <Check className="w-5 h-5 text-emerald-400 mr-3" />
                    <span>Priority processing</span>
                  </li>
                  <li className="flex items-center">
                    <Check className="w-5 h-5 text-emerald-400 mr-3" />
                    <span>Email support included</span>
                  </li>
                </ul>
                <Link href="/signup">
                  <Button
                    className={`w-full transition-all duration-300 hover:scale-105 ${
                      pkg.popular
                        ? "bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white border-0 shadow-lg hover:shadow-blue-500/25"
                        : "bg-white/10 hover:bg-white/20 text-white border border-white/20"
                    }`}
                  >
                    Buy {pkg.name}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-16">
          <p className="text-gray-400 mb-6 text-lg">Need more than 100,000 images?</p>
          <Link href="/contact">
            <Button
              variant="outline"
              className="border-white/20 text-gray-300 hover:bg-white/10 hover:border-white/30 transition-all duration-300 hover:scale-105"
            >
              Contact us for volume pricing
            </Button>
          </Link>
        </div>

        {/* Value props */}
        <div className="grid md:grid-cols-3 gap-8 mt-20">
          <div className="text-center group">
            <div className="text-3xl font-bold text-emerald-400 mb-2 group-hover:scale-110 transition-transform duration-300">
              Never expire
            </div>
            <div className="text-gray-400">Your image processing packages are yours forever</div>
          </div>
          <div className="text-center group">
            <div className="text-3xl font-bold text-blue-400 mb-2 group-hover:scale-110 transition-transform duration-300">
              No minimums
            </div>
            <div className="text-gray-400">Start with a single image or buy in bulk</div>
          </div>
          <div className="text-center group">
            <div className="text-3xl font-bold text-purple-400 mb-2 group-hover:scale-110 transition-transform duration-300">
              Full refunds
            </div>
            <div className="text-gray-400">Failed processing = no charge, guaranteed</div>
          </div>
        </div>
      </div>
    </section>
  )
}
