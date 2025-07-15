"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { LogOut, Key, BarChart3, CreditCard, Github, Star, Coffee, Menu, X, Activity, Settings, Expand } from "lucide-react"

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState("dashboard")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedCharts, setExpandedCharts] = useState<Set<string>>(new Set())
  const [lastExpandedChart, setLastExpandedChart] = useState<string | null>(null)
  const [apiKeyName, setApiKeyName] = useState("")
  const [isGeneratingKey, setIsGeneratingKey] = useState(false)
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const router = useRouter()

  const toggleChart = (chartId: string) => {
    setExpandedCharts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(chartId)) {
        newSet.delete(chartId)
      } else {
        newSet.add(chartId)
        setLastExpandedChart(chartId)
      }
      return newSet
    })
  }

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setUser(user)
      setLoading(false)
    }

    getUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push("/login")
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
  }

  const handleGenerateAPIKey = async (e: React.FormEvent) => {
    console.log("Attempting to generate API key...")
    e.preventDefault()
    setIsGeneratingKey(true)
    setNewlyGeneratedKey(null)
    setApiKeyError(null)

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        setApiKeyError("Authentication required to generate API key.")
        setIsGeneratingKey(false)
        return
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_GO_GATEWAY_URL}/api/v1/keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: apiKeyName }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to generate API key.")
      }

      setNewlyGeneratedKey(data.api_key)
      setApiKeyName("") // Clear input after successful generation
    } catch (err: any) {
      setApiKeyError(err.message || "An unexpected error occurred during API key generation.")
    } finally {
      setIsGeneratingKey(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Enhanced Navigation Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-neutral-950 border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link href="/dashboard" className="flex items-center space-x-3 group cursor-pointer">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg shadow-lg shadow-orange-500/25 group-hover:shadow-orange-500/40 transition-all duration-300 group-hover:scale-110"></div>
              <span className="text-xl font-semibold text-white group-hover:text-orange-100 transition-colors duration-300">
                openBGremover
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center space-x-8">
              <Link
                href="/pricing"
                className="text-neutral-400 hover:text-white transition-all duration-300 hover:scale-105 relative group cursor-pointer"
              >
                Pricing
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-orange-400 transition-all duration-300 group-hover:w-full"></span>
              </Link>
              <Link
                href="/docs"
                className="text-neutral-400 hover:text-white transition-all duration-300 hover:scale-105 relative group cursor-pointer"
              >
                Documentation
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-orange-400 transition-all duration-300 group-hover:w-full"></span>
              </Link>
              <Link
                href="https://github.com/your-repo/openbgremover"
                className="flex items-center space-x-1 text-neutral-400 hover:text-white transition-all duration-300 hover:scale-105 group cursor-pointer"
              >
                <Github className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
                <span>GitHub</span>
                <Star className="w-3 h-3 group-hover:scale-125 transition-transform duration-300" />
              </Link>
            </div>

            {/* Desktop User Menu */}
            <div className="hidden lg:flex items-center space-x-3">
              <Link href="https://ko-fi.com/openbgremover" target="_blank">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-neutral-500 hover:text-orange-400 hover:bg-neutral-900 text-xs px-2 py-1 h-7 transition-all duration-300 hover:scale-105 cursor-pointer"
                >
                  <Coffee className="w-3 h-3 mr-1 hover:rotate-12 transition-transform duration-300" />
                  <span className="hidden xl:inline">Coffee</span>
                </Button>
              </Link>
              <span className="text-neutral-400 text-sm">{user?.email || user?.user_metadata?.full_name || "User"}</span>
              <Button
                onClick={handleSignOut}
                variant="ghost"
                size="sm"
                className="text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all duration-300 hover:scale-105 cursor-pointer"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <div className="lg:hidden">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-neutral-400 hover:text-white p-2 cursor-pointer"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden border-t border-neutral-800 py-4 space-y-4 animate-fade-in-up">
              <Link
                href="/pricing"
                className="block text-neutral-400 hover:text-white transition-colors duration-300 py-2 cursor-pointer"
                onClick={() => setMobileMenuOpen(false)}
              >
                Pricing
              </Link>
              <Link
                href="/docs"
                className="block text-neutral-400 hover:text-white transition-colors duration-300 py-2 cursor-pointer"
                onClick={() => setMobileMenuOpen(false)}
              >
                Documentation
              </Link>
              <Link
                href="https://github.com/your-repo/openbgremover"
                className="flex items-center space-x-2 text-neutral-400 hover:text-white transition-colors duration-300 py-2 cursor-pointer"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Github className="w-4 h-4" />
                <span>GitHub</span>
                <Star className="w-3 h-3" />
              </Link>
              <div className="border-t border-neutral-800 pt-4 space-y-3">
                <Link href="https://ko-fi.com/openbgremover" target="_blank" onClick={() => setMobileMenuOpen(false)}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-neutral-500 hover:text-orange-400 hover:bg-neutral-900 justify-start cursor-pointer"
                  >
                    <Coffee className="w-3 h-3 mr-2" />
                    Buy us a coffee
                  </Button>
                </Link>
                <div className="text-neutral-400 text-sm px-3 py-2">
                  {user?.email || user?.user_metadata?.full_name || "User"}
                </div>
                <Button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    handleSignOut()
                  }}
                  variant="ghost"
                  className="w-full text-neutral-400 hover:text-white hover:bg-neutral-800 justify-start cursor-pointer"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </Button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Main Layout with Sidebar */}
      <div className="flex pt-16">
        {/* Sidebar */}
        <aside className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 bg-neutral-900 border-r border-neutral-800 transform transition-transform duration-300 z-40 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}>
          <nav className="p-4 space-y-2">
            {[
              { id: "dashboard", name: "Dashboard", icon: BarChart3 },
              { id: "activity", name: "Recent Activity", icon: Activity },
              { id: "apikeys", name: "API Keys", icon: Key },
              { id: "settings", name: "Settings", icon: Settings }
            ].map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSection(item.id)
                    setSidebarOpen(false)
                  }}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                    activeSection === item.id
                      ? 'bg-orange-500/20 text-orange-400'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 lg:ml-64">
          {/* Mobile sidebar toggle */}
          <div className="lg:hidden p-4 border-b border-neutral-800">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="text-neutral-400 hover:text-white cursor-pointer"
            >
              <Menu className="w-5 h-5 mr-2" />
              Menu
            </Button>
          </div>

          <div className="p-4 sm:p-6 lg:p-8">
            {activeSection === "dashboard" && (
              <div>
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
                  <p className="text-neutral-400">Welcome back! Here's an overview of your background removal API usage.</p>
                </div>

                {/* Stats Cards */}
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                  <Card className="bg-neutral-900 border-neutral-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-neutral-400">Images Processed</CardTitle>
                      <BarChart3 className="h-4 w-4 text-orange-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">0</div>
                      <p className="text-xs text-neutral-500">This month</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-neutral-900 border-neutral-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-neutral-400">API Calls</CardTitle>
                      <Key className="h-4 w-4 text-orange-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">0</div>
                      <p className="text-xs text-neutral-500">Total requests</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-neutral-900 border-neutral-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-neutral-400">Credits Remaining</CardTitle>
                      <CreditCard className="h-4 w-4 text-orange-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">$5.00</div>
                      <p className="text-xs text-neutral-500">Pay-as-you-go balance</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Usage Charts */}
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-white mb-4">Usage Analytics</h2>
                  
                  {expandedCharts.size === 0 ? (
                    // 0 expanded: Grid side-by-side
                    <div className="grid lg:grid-cols-2 gap-6">
                      {/* Images Processed Chart */}
                      <Card className={`bg-neutral-900 border-neutral-800 transition-all duration-500 relative ${
                        expandedCharts.has('images') ? 'pb-8' : 'hover:border-neutral-700'
                      }`}>
                        <CardHeader>
                          <CardTitle className="text-white flex items-center justify-between">
                            Images Processed Over Time
                            <BarChart3 className="h-5 w-5 text-orange-400" />
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className={`flex items-end justify-between space-x-1 transition-all duration-500 ${
                            expandedCharts.has('images') ? 'h-64' : 'h-32'
                          }`}>
                            {[12, 8, 15, 22, 18, 25, 30, 28, 35, 20, 15, 10].map((height, index) => (
                              <div key={index} className="flex-1 bg-gradient-to-t from-orange-500/60 to-orange-400/80 rounded-t-sm relative group">
                                <div 
                                  className="w-full rounded-t-sm transition-all duration-300 group-hover:from-orange-400 group-hover:to-orange-300"
                                  style={{ height: `${height * (expandedCharts.has('images') ? 4 : 2)}px` }}
                                />
                                <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {height}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-between text-xs text-neutral-500 mt-2">
                            <span>Jan</span>
                            <span>Dec</span>
                          </div>
                          {expandedCharts.has('images') && (
                            <div className="mt-6 space-y-4 animate-fade-in">
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div className="bg-neutral-800 p-3 rounded">
                                  <p className="text-neutral-400">Peak Month</p>
                                  <p className="text-white font-medium">September (35)</p>
                                </div>
                                <div className="bg-neutral-800 p-3 rounded">
                                  <p className="text-neutral-400">Average</p>
                                  <p className="text-white font-medium">20.5 images</p>
                                </div>
                                <div className="bg-neutral-800 p-3 rounded">
                                  <p className="text-neutral-400">Growth</p>
                                  <p className="text-green-400 font-medium">+15% MoM</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                        <button
                          onClick={() => toggleChart('images')}
                          className={`absolute right-3 p-1 text-neutral-400 hover:text-white transition-all duration-500 cursor-pointer z-10 ${
                            expandedCharts.has('images') ? 'bottom-[-9px]' : 'bottom-3'
                          }`}
                        >
                          <Expand className={`w-4 h-4 transition-transform duration-300 ${
                            expandedCharts.has('images') ? 'rotate-180' : ''
                          }`} />
                        </button>
                      </Card>

                      {/* API Response Times */}
                      <Card className={`bg-neutral-900 border-neutral-800 transition-all duration-500 relative ${
                        expandedCharts.has('response') ? 'pb-8' : 'hover:border-neutral-700'
                      }`}>
                        <CardHeader>
                          <CardTitle className="text-white flex items-center justify-between">
                            Average Response Time
                            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className={`flex items-end justify-between space-x-1 transition-all duration-500 ${
                            expandedCharts.has('response') ? 'h-64' : 'h-32'
                          }`}>
                            {[85, 92, 78, 88, 95, 82, 90, 87, 93, 89, 91, 86].map((height, index) => (
                              <div key={index} className="flex-1 bg-gradient-to-t from-green-500/60 to-green-400/80 rounded-t-sm relative group">
                                <div 
                                  className="w-full rounded-t-sm transition-all duration-300"
                                  style={{ height: `${height * (expandedCharts.has('response') ? 2.5 : 1)}px` }}
                                />
                                <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {height}ms
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-between text-xs text-neutral-500 mt-2">
                            <span>Jan</span>
                            <span>Dec</span>
                          </div>
                          <div className="mt-3 text-sm text-neutral-400">
                            Current: <span className="text-green-400 font-medium">87ms</span>
                          </div>
                          {expandedCharts.has('response') && (
                            <div className="mt-6 space-y-4 animate-fade-in">
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div className="bg-neutral-800 p-3 rounded">
                                  <p className="text-neutral-400">Best Time</p>
                                  <p className="text-green-400 font-medium">78ms (March)</p>
                                </div>
                                <div className="bg-neutral-800 p-3 rounded">
                                  <p className="text-neutral-400">Average</p>
                                  <p className="text-white font-medium">87.5ms</p>
                                </div>
                                <div className="bg-neutral-800 p-3 rounded">
                                  <p className="text-neutral-400">Uptime</p>
                                  <p className="text-green-400 font-medium">99.9%</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                        <button
                          onClick={() => toggleChart('response')}
                          className={`absolute right-3 p-1 text-neutral-400 hover:text-white transition-all duration-500 cursor-pointer z-10 ${
                            expandedCharts.has('response') ? 'bottom-[-9px]' : 'bottom-3'
                          }`}
                        >
                          <Expand className={`w-4 h-4 transition-transform duration-300 ${
                            expandedCharts.has('response') ? 'rotate-180' : ''
                          }`} />
                        </button>
                      </Card>
                    </div>
                  ) : expandedCharts.size === 1 ? (
                    // 1 expanded: Dynamic positioning - expanded one on top, other pushed down
                    <div className="space-y-6">
                      {['images', 'response'].sort((a, b) => {
                        const aExpanded = expandedCharts.has(a)
                        const bExpanded = expandedCharts.has(b)
                        
                        if (aExpanded && !bExpanded) return -1
                        if (bExpanded && !aExpanded) return 1
                        
                        return a === 'images' ? -1 : 1
                      }).map((chartId) => {
                        const isImagesChart = chartId === 'images'
                        const isExpanded = expandedCharts.has(chartId)
                        
                        return (
                          <Card key={chartId} className={`bg-neutral-900 border-neutral-800 transition-all duration-500 relative ${
                            isExpanded ? 'pb-8' : 'hover:border-neutral-700'
                          }`}>
                            <CardHeader>
                              <CardTitle className="text-white flex items-center justify-between">
                                {isImagesChart ? 'Images Processed Over Time' : 'Average Response Time'}
                                {isImagesChart ? (
                                  <BarChart3 className="h-5 w-5 text-orange-400" />
                                ) : (
                                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                                )}
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className={`flex items-end justify-between space-x-1 transition-all duration-500 ${
                                isExpanded ? 'h-64' : 'h-32'
                              }`}>
                                {(isImagesChart 
                                  ? [12, 8, 15, 22, 18, 25, 30, 28, 35, 20, 15, 10]
                                  : [85, 92, 78, 88, 95, 82, 90, 87, 93, 89, 91, 86]
                                ).map((height, index) => (
                                  <div key={index} className={`flex-1 rounded-t-sm relative group ${
                                    isImagesChart 
                                      ? 'bg-gradient-to-t from-orange-500/60 to-orange-400/80'
                                      : 'bg-gradient-to-t from-green-500/60 to-green-400/80'
                                  }`}>
                                    <div 
                                      className="w-full rounded-t-sm transition-all duration-300"
                                      style={{ 
                                        height: `${height * (isExpanded ? (isImagesChart ? 4 : 2.5) : (isImagesChart ? 2 : 1))}px` 
                                      }}
                                    />
                                    <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {height}{isImagesChart ? '' : 'ms'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-between text-xs text-neutral-500 mt-2">
                                <span>Jan</span>
                                <span>Dec</span>
                              </div>
                              {!isImagesChart && (
                                <div className="mt-3 text-sm text-neutral-400">
                                  Current: <span className="text-green-400 font-medium">87ms</span>
                                </div>
                              )}
                              {isExpanded && (
                                <div className="mt-6 space-y-4 animate-fade-in">
                                  <div className="grid grid-cols-3 gap-4 text-sm">
                                    {isImagesChart ? (
                                      <>
                                        <div className="bg-neutral-800 p-3 rounded">
                                          <p className="text-neutral-400">Peak Month</p>
                                          <p className="text-white font-medium">September (35)</p>
                                        </div>
                                        <div className="bg-neutral-800 p-3 rounded">
                                          <p className="text-neutral-400">Average</p>
                                          <p className="text-white font-medium">20.5 images</p>
                                        </div>
                                        <div className="bg-neutral-800 p-3 rounded">
                                          <p className="text-neutral-400">Growth</p>
                                          <p className="text-green-400 font-medium">+15% MoM</p>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <div className="bg-neutral-800 p-3 rounded">
                                          <p className="text-neutral-400">Best Time</p>
                                          <p className="text-green-400 font-medium">78ms (March)</p>
                                        </div>
                                        <div className="bg-neutral-800 p-3 rounded">
                                          <p className="text-neutral-400">Average</p>
                                          <p className="text-white font-medium">87.5ms</p>
                                        </div>
                                        <div className="bg-neutral-800 p-3 rounded">
                                          <p className="text-neutral-400">Uptime</p>
                                          <p className="text-green-400 font-medium">99.9%</p>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}
                            </CardContent>
                            <button
                              onClick={() => toggleChart(chartId)}
                              className={`absolute right-3 p-1 text-neutral-400 hover:text-white transition-all duration-500 cursor-pointer z-10 ${
                                isExpanded ? 'bottom-[-9px]' : 'bottom-3'
                              }`}
                            >
                              <Expand className={`w-4 h-4 transition-transform duration-300 ${
                                isExpanded ? 'rotate-180' : ''
                              }`} />
                            </button>
                          </Card>
                        )
                      })}
                    </div>
                  ) : (
                    // 2 expanded: Stack with first expanded on top, last expanded on bottom
                    <div className="space-y-6">
                      {['images', 'response'].sort((a, b) => {
                        if (lastExpandedChart === b) return -1
                        if (lastExpandedChart === a) return 1
                        return a === 'images' ? -1 : 1
                      }).map((chartId) => {
                        const isImagesChart = chartId === 'images'
                        const isExpanded = expandedCharts.has(chartId)
                        
                        return (
                          <Card key={chartId} className={`bg-neutral-900 border-neutral-800 transition-all duration-500 relative ${
                            isExpanded ? 'pb-8' : 'hover:border-neutral-700'
                          }`}>
                            <CardHeader>
                              <CardTitle className="text-white flex items-center justify-between">
                                {isImagesChart ? 'Images Processed Over Time' : 'Average Response Time'}
                                {isImagesChart ? (
                                  <BarChart3 className="h-5 w-5 text-orange-400" />
                                ) : (
                                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                                )}
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className={`flex items-end justify-between space-x-1 transition-all duration-500 ${
                                isExpanded ? 'h-64' : 'h-32'
                              }`}>
                                {(isImagesChart 
                                  ? [12, 8, 15, 22, 18, 25, 30, 28, 35, 20, 15, 10]
                                  : [85, 92, 78, 88, 95, 82, 90, 87, 93, 89, 91, 86]
                                ).map((height, index) => (
                                  <div key={index} className={`flex-1 rounded-t-sm relative group ${
                                    isImagesChart 
                                      ? 'bg-gradient-to-t from-orange-500/60 to-orange-400/80'
                                      : 'bg-gradient-to-t from-green-500/60 to-green-400/80'
                                  }`}>
                                    <div 
                                      className="w-full rounded-t-sm transition-all duration-300"
                                      style={{ 
                                        height: `${height * (isExpanded ? (isImagesChart ? 4 : 2.5) : (isImagesChart ? 2 : 1))}px` 
                                      }}
                                    />
                                    <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {height}{isImagesChart ? '' : 'ms'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-between text-xs text-neutral-500 mt-2">
                                <span>Jan</span>
                                <span>Dec</span>
                              </div>
                              {!isImagesChart && (
                                <div className="mt-3 text-sm text-neutral-400">
                                  Current: <span className="text-green-400 font-medium">87ms</span>
                                </div>
                              )}
                              {isExpanded && (
                                <div className="mt-6 space-y-4 animate-fade-in">
                                  <div className="grid grid-cols-3 gap-4 text-sm">
                                    {isImagesChart ? (
                                      <>
                                        <div className="bg-neutral-800 p-3 rounded">
                                          <p className="text-neutral-400">Peak Month</p>
                                          <p className="text-white font-medium">September (35)</p>
                                        </div>
                                        <div className="bg-neutral-800 p-3 rounded">
                                          <p className="text-neutral-400">Average</p>
                                          <p className="text-white font-medium">20.5 images</p>
                                        </div>
                                        <div className="bg-neutral-800 p-3 rounded">
                                          <p className="text-neutral-400">Growth</p>
                                          <p className="text-green-400 font-medium">+15% MoM</p>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <div className="bg-neutral-800 p-3 rounded">
                                          <p className="text-neutral-400">Best Time</p>
                                          <p className="text-green-400 font-medium">78ms (March)</p>
                                        </div>
                                        <div className="bg-neutral-800 p-3 rounded">
                                          <p className="text-neutral-400">Average</p>
                                          <p className="text-white font-medium">87.5ms</p>
                                        </div>
                                        <div className="bg-neutral-800 p-3 rounded">
                                          <p className="text-neutral-400">Uptime</p>
                                          <p className="text-green-400 font-medium">99.9%</p>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}
                            </CardContent>
                            <button
                              onClick={() => toggleChart(chartId)}
                              className={`absolute right-3 p-1 text-neutral-400 hover:text-white transition-all duration-500 cursor-pointer z-10 ${
                                isExpanded ? 'bottom-[-9px]' : 'bottom-3'
                              }`}
                            >
                              <Expand className={`w-4 h-4 transition-transform duration-300 ${
                                isExpanded ? 'rotate-180' : ''
                              }`} />
                            </button>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="bg-neutral-900 border-neutral-800">
                    <CardHeader>
                      <CardTitle className="text-white">Quick Actions</CardTitle>
                      <p className="text-neutral-400 text-sm">Common tasks and shortcuts</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button 
                        onClick={() => setActiveSection("apikeys")}
                        className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white cursor-pointer"
                      >
                        <Key className="w-4 h-4 mr-2" />
                        Manage API Keys
                      </Button>
                      <Button 
                        onClick={() => setActiveSection("activity")}
                        variant="outline" 
                        className="w-full border-neutral-600 text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                      >
                        <Activity className="w-4 h-4 mr-2" />
                        View Activity Log
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="bg-neutral-900 border-neutral-800 flex flex-col">
                    <CardHeader className="flex-1">
                      <CardTitle className="text-white">Purchase Images</CardTitle>
                      <p className="text-neutral-400 text-sm">Buy bulk image processing packages at discounted rates</p>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Button
                        variant="outline"
                        className="w-full border-neutral-600 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-500 hover:text-white cursor-pointer"
                      >
                        <CreditCard className="w-4 h-4 mr-2" />
                        Purchase More Images
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {activeSection === "activity" && (
              <div>
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-white mb-2">Activity Log</h1>
                  <p className="text-neutral-400">Complete history of your API usage and account activity.</p>
                </div>

                <Card className="bg-neutral-900 border-neutral-800">
                  <CardContent className="p-0">
                    <div className="divide-y divide-neutral-800">
                      {[
                        { action: "Background removed", file: "product_photo_1.jpg", time: "2 minutes ago", status: "success" },
                        { action: "API key generated", file: "dashboard", time: "1 hour ago", status: "info" },
                        { action: "Background removed", file: "portrait_image.png", time: "3 hours ago", status: "success" },
                        { action: "Bulk images purchased", file: "100 images", time: "1 day ago", status: "purchase" },
                        { action: "Background removed", file: "product_photo_2.webp", time: "2 days ago", status: "success" },
                        { action: "API key deleted", file: "old-test-key", time: "3 days ago", status: "warning" },
                        { action: "Background removed", file: "headshot_final.jpg", time: "3 days ago", status: "success" },
                        { action: "Account settings updated", file: "profile", time: "1 week ago", status: "info" }
                      ].map((activity, index) => (
                        <div key={index} className="p-4 hover:bg-neutral-800/50 transition-colors cursor-pointer">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`w-2 h-2 rounded-full ${
                                activity.status === 'success' ? 'bg-green-400' : 
                                activity.status === 'purchase' ? 'bg-orange-400' : 
                                activity.status === 'warning' ? 'bg-red-400' : 'bg-blue-400'
                              }`}></div>
                              <div>
                                <p className="text-white text-sm font-medium">{activity.action}</p>
                                <p className="text-neutral-400 text-xs">{activity.file}</p>
                              </div>
                            </div>
                            <span className="text-neutral-500 text-xs">{activity.time}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === "apikeys" && (
              <div>
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-white mb-2">API Key Management</h1>
                  <p className="text-neutral-400">Create and manage your API keys for authentication.</p>
                </div>

                <Card className="bg-neutral-900 border-neutral-800 mb-6">
                  <CardHeader>
                    <CardTitle className="text-white">Generate New API Key</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleGenerateAPIKey} className="space-y-4">
                      <div>
                        <Label htmlFor="apiKeyName" className="text-neutral-300">
                          Key Name
                        </Label>
                        <Input
                          id="apiKeyName"
                          type="text"
                          value={apiKeyName}
                          onChange={(e) => setApiKeyName(e.target.value)}
                          required
                          className="mt-1 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500 focus:border-orange-500 focus:ring-orange-500/20"
                          placeholder="e.g., My Production Key"
                        />
                      </div>
                      <Button
                        type="submit"
                        className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white cursor-pointer"
                        disabled={isGeneratingKey}
                      >
                        {isGeneratingKey ? (
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                        ) : (
                          <Key className="w-4 h-4 mr-2" />
                        )}
                        Generate New Key
                      </Button>
                    </form>
                    {newlyGeneratedKey && (
                      <div className="mt-4 p-3 bg-green-400/10 border border-green-400/20 rounded-lg text-green-400 text-sm break-all">
                        <p className="font-medium mb-2">Your new API Key (save this now!):</p>
                        <code className="block bg-green-400/20 p-2 rounded">{newlyGeneratedKey}</code>
                      </div>
                    )}
                    {apiKeyError && (
                      <div className="mt-4 p-3 bg-red-400/10 border border-red-400/20 rounded-lg text-red-400 text-sm">
                        {apiKeyError}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-neutral-900 border-neutral-800">
                  <CardContent className="p-0">
                    <div className="divide-y divide-neutral-800">
                      {[
                        { name: "Production API Key", key: "bg_live_sk_1234567890abcdef", created: "Dec 15, 2024", lastUsed: "2 minutes ago", status: "active" },
                        { name: "Development Key", key: "bg_test_sk_abcdef1234567890", created: "Dec 10, 2024", lastUsed: "1 hour ago", status: "active" },
                        { name: "Mobile App Key", key: "bg_live_sk_fedcba0987654321", created: "Dec 5, 2024", lastUsed: "1 day ago", status: "inactive" }
                      ].map((apiKey, index) => (
                        <div key={index} className="p-6 hover:bg-neutral-800/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <h3 className="text-white font-medium">{apiKey.name}</h3>
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  apiKey.status === 'active' ? 'bg-green-400/20 text-green-400' : 'bg-neutral-600/20 text-neutral-400'
                                }`}>
                                  {apiKey.status}
                                </span>
                              </div>
                              <div className="flex items-center space-x-4 text-sm text-neutral-400">
                                <span className="font-mono bg-neutral-800 px-2 py-1 rounded">
                                  {apiKey.key.substring(0, 20)}...
                                </span>
                                <span>Created {apiKey.created}</span>
                                <span>Last used {apiKey.lastUsed}</span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Button variant="ghost" size="sm" className="text-neutral-400 hover:text-white cursor-pointer">
                                Copy
                              </Button>
                              <Button variant="ghost" size="sm" className="text-neutral-400 hover:text-red-400 cursor-pointer">
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === "settings" && (
              <div>
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
                  <p className="text-neutral-400">Configure your account preferences and usage alerts.</p>
                </div>

                <div className="grid gap-6">
                  <Card className="bg-neutral-900 border-neutral-800">
                    <CardHeader>
                      <CardTitle className="text-white">Usage Alerts</CardTitle>
                      <p className="text-neutral-400 text-sm">Set limits and get notified about your usage</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-300">Daily limit alert</span>
                        <input 
                          type="number" 
                          placeholder="100 images" 
                          className="w-[120px] px-2 py-1 text-sm bg-neutral-800 border border-neutral-700 rounded text-white"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-300">Monthly spend alert</span>
                        <input 
                          type="number" 
                          placeholder="50 $" 
                          className="w-[70px] px-2 py-1 text-sm bg-neutral-800 border border-neutral-700 rounded text-white"
                        />
                      </div>
                      <Button variant="outline" size="sm" className="w-full border-neutral-600 text-neutral-300 hover:bg-neutral-800 cursor-pointer">
                        Save Settings
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
