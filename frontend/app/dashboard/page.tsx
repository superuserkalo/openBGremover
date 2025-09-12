"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { LogOut, Key, BarChart3, CreditCard, Github, Star, Coffee, Menu, X, Activity, Settings, Expand, Check, Shield, Zap } from "lucide-react"
import { toast } from "sonner"

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState("dashboard")
  const [billingPlan, setBillingPlan] = useState<'payg'|'bulk'>('payg')
  const [billingMessage, setBillingMessage] = useState<string | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedCharts, setExpandedCharts] = useState<Set<string>>(new Set())
  const [lastExpandedChart, setLastExpandedChart] = useState<string | null>(null)
  const [apiKeyName, setApiKeyName] = useState("")
  const [isGeneratingKey, setIsGeneratingKey] = useState(false)
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [activities, setActivities] = useState<Array<{
    id: number
    source: string
    was_successful: boolean
    error_message?: string
    processing_time_ms?: number
    credit_type?: string
    created_at: number
  }>>([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [apiKeys, setApiKeys] = useState<Array<{
    id: number
    name: string
    prefix: string
    is_active: boolean
    created_at: number
  }>>([])
  const [apiKeysLoading, setApiKeysLoading] = useState(false)
  const [apiActionMessage, setApiActionMessage] = useState<string | null>(null)
  const [stats, setStats] = useState<{
    api_calls_total: number
    images_processed: number
    images_this_month: number
    free_credits_remaining: number
    bulk_credits_remaining: number
    billing_model: string
  } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  // Feature flag: temporarily disable analytics charts for MVP
  const SHOW_USAGE_ANALYTICS = false
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

  // Billing actions (MVP)
  const upgradeBilling = async (plan: 'payg'|'bulk', pkg?: 'starter'|'pro'|'enterprise', recurring?: boolean) => {
    try {
      setBillingLoading(true)
      setBillingMessage(null)
      if (!process.env.NEXT_PUBLIC_GO_GATEWAY_URL) throw new Error("NEXT_PUBLIC_GO_GATEWAY_URL not configured")
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) throw new Error("Authentication required")

      const res = await fetch(`${process.env.NEXT_PUBLIC_GO_GATEWAY_URL}/api/v1/billing/upgrade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan, package: pkg, recurring: !!recurring }),
      })

      const ct = res.headers.get('content-type') || ''
      const json = ct.includes('application/json') ? await res.json() : { success: false, error: 'Non-JSON response' }
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update billing')

      setBillingMessage('Billing updated successfully')
      // Refresh stats to reflect credits/model
      fetchStats()
    } catch (e: any) {
      setBillingMessage(e?.message || 'Failed to update billing')
    } finally {
      setBillingLoading(false)
    }
  }
  // Delete account
  const handleDeleteAccount = async () => {
    try {
      if (!process.env.NEXT_PUBLIC_GO_GATEWAY_URL) throw new Error("NEXT_PUBLIC_GO_GATEWAY_URL not configured")
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) throw new Error("Authentication required")
      const res = await fetch(`${process.env.NEXT_PUBLIC_GO_GATEWAY_URL}/api/v1/account`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
      const ct = res.headers.get('content-type') || ''
      let ok = res.ok
      let errMsg = ''
      if (ct.includes('application/json')) {
        const text = await res.text()
        if (text && text.trim().length > 0) {
          try {
            const json = JSON.parse(text)
            ok = res.ok && json?.success !== false
            if (!ok) errMsg = json?.error || 'Failed to delete account'
          } catch {
            ok = res.ok
          }
        }
      }
      if (!ok) throw new Error(errMsg || 'Failed to delete account')
      toast.success('Account deleted')
      await supabase.auth.signOut()
      router.push('/')
    } catch (e: any) {
      toast.error('Delete failed', { description: String(e?.message || 'Please try again') })
    }
  }

  const handleGenerateAPIKey = async (e: React.FormEvent) => {
    console.log("Attempting to generate API key...")
    e.preventDefault()
    setIsGeneratingKey(true)
    setNewlyGeneratedKey(null)
    setApiKeyError(null)

    try {
      if (!process.env.NEXT_PUBLIC_GO_GATEWAY_URL) {
        throw new Error("NEXT_PUBLIC_GO_GATEWAY_URL not configured in .env.local")
      }
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

      let data: any
      const contentType = response.headers.get("content-type") || ""
      if (contentType.includes("application/json")) {
        data = await response.json()
      } else {
        const text = await response.text()
        throw new Error(`Unexpected response: ${text.slice(0, 120)}...`)
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to generate API key.")
      }

      setNewlyGeneratedKey(data.api_key)
      toast.success('API key created', { description: 'Copy and store it securely.' })
      setApiKeyName("") // Clear input after successful generation
      // Refresh keys list after successful generation
      fetchAPIKeys()
    } catch (err: any) {
      setApiKeyError(err.message || "An unexpected error occurred during API key generation.")
      toast.error('API key creation failed', { description: String(err?.message || 'Please try again') })
    } finally {
      setIsGeneratingKey(false)
    }
  }

  // Helper: format relative time from unix seconds
  const formatRelativeTime = (unixSeconds: number) => {
    const diffMs = Date.now() - unixSeconds * 1000
    const sec = Math.floor(diffMs / 1000)
    if (sec < 60) return `${sec}s ago`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}m ago`
    const hrs = Math.floor(min / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d ago`
    const weeks = Math.floor(days / 7)
    if (weeks < 4) return `${weeks}w ago`
    const d = new Date(unixSeconds * 1000)
    return d.toLocaleDateString()
  }

  // Fetch: Recent activity
  const fetchActivity = async () => {
    try {
      setActivitiesLoading(true)
      if (!process.env.NEXT_PUBLIC_GO_GATEWAY_URL) throw new Error("NEXT_PUBLIC_GO_GATEWAY_URL not configured")
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        throw new Error("Authentication required")
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_GO_GATEWAY_URL}/api/v1/activity?limit=50`, {
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
        },
      })
      const ct = res.headers.get("content-type") || ""
      const json = ct.includes("application/json") ? await res.json() : { success: false, error: "Non-JSON response" }
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to fetch activity")
      setActivities(Array.isArray(json.activities) ? json.activities : [])
    } catch (e) {
      // Surface minimal error feedback in UI state
      setActivities([])
    } finally {
      setActivitiesLoading(false)
    }
  }

  // Fetch: API keys list
  const fetchAPIKeys = async () => {
    try {
      setApiKeysLoading(true)
      if (!process.env.NEXT_PUBLIC_GO_GATEWAY_URL) throw new Error("NEXT_PUBLIC_GO_GATEWAY_URL not configured")
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        throw new Error("Authentication required")
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_GO_GATEWAY_URL}/api/v1/keys`, {
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
        },
      })
      const ct = res.headers.get("content-type") || ""
      const json = ct.includes("application/json") ? await res.json() : { success: false, error: "Non-JSON response" }
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to fetch API keys")
      const keys = Array.isArray(json.keys) ? json.keys : []
      setApiKeys(keys.filter((k: any) => k?.is_active))
    } catch (e) {
      setApiKeys([])
    } finally {
      setApiKeysLoading(false)
    }
  }

  // Fetch: Stats
  const fetchStats = async () => {
    try {
      setStatsLoading(true)
      if (!process.env.NEXT_PUBLIC_GO_GATEWAY_URL) throw new Error("NEXT_PUBLIC_GO_GATEWAY_URL not configured")
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) throw new Error("Authentication required")

      const res = await fetch(`${process.env.NEXT_PUBLIC_GO_GATEWAY_URL}/api/v1/stats`, {
        headers: { "Authorization": `Bearer ${session.access_token}` },
      })
      const ct = res.headers.get("content-type") || ""
      const json = ct.includes("application/json") ? await res.json() : { success: false, error: "Non-JSON response" }
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to fetch stats")
      setStats({
        api_calls_total: json.api_calls_total ?? 0,
        images_processed: json.images_processed ?? 0,
        images_this_month: json.images_this_month ?? 0,
        free_credits_remaining: json.free_credits_remaining ?? 0,
        bulk_credits_remaining: json.bulk_credits_remaining ?? 0,
        billing_model: json.billing_model ?? "",
      })
    } catch (e) {
      setStats(null)
    } finally {
      setStatsLoading(false)
    }
  }

  // Delete API key
  const handleDeleteAPIKey = async (keyId: number) => {
    // Optimistic remove from UI
    const prev = apiKeys
    setApiKeys(prev.filter(k => k.id !== keyId))
    try {
      setApiActionMessage(null)
      if (!process.env.NEXT_PUBLIC_GO_GATEWAY_URL) throw new Error("NEXT_PUBLIC_GO_GATEWAY_URL not configured")
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        throw new Error("Authentication required")
      }
      const res = await fetch(`${process.env.NEXT_PUBLIC_GO_GATEWAY_URL}/api/v1/keys/${keyId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
        },
      })
      const ct = res.headers.get("content-type") || ""
      const json = ct.includes("application/json") ? await res.json() : { success: false, error: "Non-JSON response" }
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to delete API key")
      toast.success('API key deleted')
      // Confirm with a refetch in background
      fetchAPIKeys()
    } catch (e: any) {
      // Revert on failure
      setApiKeys(prev)
      toast.error('Delete failed', { description: String(e?.message || 'Please try again') })
    }
  }

  // Copy helper
  const copyToClipboard = async (text: string) => {
    const setOk = () => {
      toast.success('Copied', { description: 'Prefix copied to clipboard.' })
      setTimeout(() => setApiActionMessage(null), 2000)
    }
    const setFail = () => toast.error('Copy failed')

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        setOk()
        return
      }
      // Fallback for non-secure contexts or where clipboard API is unavailable
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      textArea.style.top = '0'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      if (successful) setOk(); else setFail()
    } catch {
      setFail()
    }
  }

  // Auto-fetch when navigating to sections
  useEffect(() => {
    if (activeSection === "activity") fetchActivity()
    if (activeSection === "apikeys") fetchAPIKeys()
    if (activeSection === "dashboard") fetchStats()
  }, [activeSection])

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
              <Link href="https://ko-fi.com/tsarkalo" target="_blank">
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
                <Link href="https://ko-fi.com/tsarkalo" target="_blank" onClick={() => setMobileMenuOpen(false)}>
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
              { id: "billing", name: "Billing", icon: CreditCard },
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
                      <div className="text-2xl font-bold text-white">
                        {statsLoading ? <Skeleton className="h-6 w-16" /> : (stats?.images_this_month ?? 0)}
                      </div>
                      <p className="text-xs text-neutral-500">This month</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-neutral-900 border-neutral-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-neutral-400">API Calls</CardTitle>
                      <Key className="h-4 w-4 text-orange-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">
                        {statsLoading ? <Skeleton className="h-6 w-16" /> : (stats?.api_calls_total ?? 0)}
                      </div>
                      <p className="text-xs text-neutral-500">Total background removal requests</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-neutral-900 border-neutral-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-neutral-400">Credits Remaining</CardTitle>
                      <CreditCard className="h-4 w-4 text-orange-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">
                        {statsLoading ? <Skeleton className="h-6 w-24" /> : ((stats?.free_credits_remaining ?? 0) + (stats?.bulk_credits_remaining ?? 0))}
                      </div>
                      <p className="text-xs text-neutral-500">Free {stats?.free_credits_remaining ?? 0} • Bulk {stats?.bulk_credits_remaining ?? 0}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Usage Charts (temporarily disabled for MVP) */}
                {SHOW_USAGE_ANALYTICS && (
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
                )}

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
                        onClick={() => setActiveSection('billing')}
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

            {activeSection === "billing" && (
              <div>
                {/* Header */}
                <div className="mb-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-3xl font-bold text-white mb-2">Billing</h1>
                      <p className="text-neutral-400">Pick a plan, add credits, and keep building.</p>
                    </div>
                    <div className="hidden md:flex items-center gap-2 text-xs text-neutral-400 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-full">
                      <Shield className="w-3.5 h-3.5 text-green-400" />
                      Secure payments coming soon
                    </div>
                  </div>
                </div>

                {/* Segmented control */}
                <div className="mb-6 inline-flex p-1 rounded-lg bg-neutral-900 border border-neutral-800">
                  <button onClick={() => setBillingPlan('payg')} className={`px-3.5 py-1.5 rounded-md text-sm transition-colors ${billingPlan==='payg' ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white' : 'text-neutral-300 hover:text-white'}`}>Pay‑as‑you‑go</button>
                  <button onClick={() => setBillingPlan('bulk')} className={`px-3.5 py-1.5 rounded-md text-sm transition-colors ${billingPlan==='bulk' ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white' : 'text-neutral-300 hover:text-white'}`}>Bulk packages</button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Main column */}
                  <div className="lg:col-span-2 space-y-6">
                    {billingPlan === 'payg' && (
                      <Card className="bg-neutral-900/95 border-neutral-800 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-amber-500/5 pointer-events-none" />
                        <CardHeader>
                          <CardTitle className="text-white flex items-center gap-2">
                            <Zap className="w-4 h-4 text-orange-400" /> Enable Pay‑as‑you‑go
                          </CardTitle>
                          <p className="text-neutral-400 text-sm">Pay only for successful images. No expirations. Switch anytime.</p>
                        </CardHeader>
                        <CardContent>
                          <div className="grid sm:grid-cols-2 gap-4 mb-4">
                            {["No commitments", "Wallet-style balance", "Full API access", "Same SLA"].map(f => (
                              <div key={f} className="flex items-center gap-2 text-neutral-300 text-sm">
                                <Check className="w-4 h-4 text-orange-400" />
                                <span>{f}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <div className="text-sm text-neutral-400">Current model: <span className="text-white font-medium">{stats?.billing_model || 'free_tier'}</span></div>
                            <Button disabled={billingLoading} onClick={() => upgradeBilling('payg')} className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white cursor-pointer">
                              {billingLoading ? 'Saving…' : 'Enable PAYG'}
                            </Button>
                          </div>
                          {billingMessage && <div className="mt-3 text-xs text-neutral-400">{billingMessage}</div>}
                        </CardContent>
                      </Card>
                    )}

                    {billingPlan === 'bulk' && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[{name:'Starter', pkg:'starter', images:'1,000', desc:'Kickstart small projects', popular:false}, {name:'Pro', pkg:'pro', images:'10,000', desc:'Scale your workloads', popular:true}, {name:'Enterprise', pkg:'enterprise', images:'100,000', desc:'Serious volume', popular:false}].map((p) => (
                          <Card key={p.pkg} className={`bg-neutral-900 border-neutral-800 hover:border-neutral-700 transition-colors relative overflow-hidden ${p.popular ? 'ring-1 ring-orange-500/30' : ''}`}>
                            {p.popular && (
                              <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-center py-1.5 text-xs font-medium">Most popular</div>
                            )}
                            <CardHeader className="pt-6">
                              <CardTitle className="text-white">{p.name}</CardTitle>
                              <p className="text-neutral-400 text-sm">{p.desc}</p>
                            </CardHeader>
                            <CardContent>
                              <div className="mb-4">
                                <div className="text-2xl font-semibold text-white">{p.images} images</div>
                                <div className="text-xs text-neutral-500">Never expires</div>
                              </div>
                              <Button disabled={billingLoading} onClick={() => upgradeBilling('bulk', p.pkg as any, false)} className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white cursor-pointer">
                                {billingLoading ? 'Processing…' : `Buy ${p.name}`}
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Summary / Side column */}
                  <div className="space-y-6">
                    <Card className="bg-neutral-900 border-neutral-800">
                      <CardHeader>
                        <CardTitle className="text-white">Summary</CardTitle>
                        <p className="text-neutral-400 text-sm">Your current balances and limits</p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-neutral-400">Billing model</span>
                          <span className="text-white font-medium">{stats?.billing_model || 'free_tier'}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-neutral-400">Free credits</span>
                          <span className="text-white font-medium">{stats?.free_credits_remaining ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-neutral-400">Bulk credits</span>
                          <span className="text-white font-medium">{stats?.bulk_credits_remaining ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-neutral-400">Processed this month</span>
                          <span className="text-white font-medium">{stats?.images_this_month ?? 0}</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-neutral-900 border-neutral-800">
                      <CardHeader>
                        <CardTitle className="text-white">Receipts</CardTitle>
                        <p className="text-neutral-400 text-sm">History coming with payments integration</p>
                      </CardHeader>
                      <CardContent>
                        <div className="text-sm text-neutral-400">No receipts yet</div>
                      </CardContent>
                    </Card>
                  </div>
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
                      {activitiesLoading && (
                        <div className="p-4 space-y-2">
                          {[...Array(6)].map((_, i) => (
                            <div key={i} className="flex items-center justify-between py-2">
                              <div className="flex items-center gap-3">
                                <Skeleton className="h-2 w-2 rounded-full" />
                                <div className="space-y-1">
                                  <Skeleton className="h-3 w-40" />
                                  <Skeleton className="h-3 w-24" />
                                </div>
                              </div>
                              <Skeleton className="h-3 w-16" />
                            </div>
                          ))}
                        </div>
                      )}
                      {!activitiesLoading && activities.length === 0 && (
                        <div className="p-4 text-neutral-400 text-sm">No activity yet</div>
                      )}
                      {!activitiesLoading && activities.map((a) => {
                        // Derive action label by source
                        let action = ''
                        let dotClass = ''
                        if (a.source === 'api_keys') {
                          action = 'API key created'
                          dotClass = 'bg-blue-400'
                        } else if (a.source === 'api_keys_delete') {
                          action = 'API key deleted'
                          dotClass = 'bg-red-400'
                        } else {
                          action = a.was_successful ? 'Background removal' : 'Failed background removal'
                          dotClass = a.was_successful ? 'bg-green-400' : 'bg-red-400'
                        }

                        const detailParts = [a.credit_type ? `credit: ${a.credit_type}` : `source: ${a.source}`]
                        if (typeof a.processing_time_ms === 'number') detailParts.push(`${a.processing_time_ms}ms`)
                        if (a.error_message && !a.was_successful) detailParts.push(a.error_message)
                        const detail = detailParts.join(' • ')
                        return (
                          <div key={a.id} className="p-4 hover:bg-neutral-800/50 transition-colors cursor-pointer">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className={`w-2 h-2 rounded-full ${dotClass}`}></div>
                                <div>
                                  <p className="text-white text-sm font-medium">{action}</p>
                                  <p className="text-neutral-400 text-xs">{detail}</p>
                                </div>
                              </div>
                              <span className="text-neutral-500 text-xs">{formatRelativeTime(a.created_at)}</span>
                            </div>
                          </div>
                        )
                      })}
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
                    {/* Notifications moved to toasts */}
                    <div className="divide-y divide-neutral-800">
                      {apiKeysLoading && (
                        <div className="p-6 space-y-4">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex items-center justify-between">
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-40" />
                                <div className="flex items-center gap-4">
                                  <Skeleton className="h-4 w-32" />
                                  <Skeleton className="h-4 w-24" />
                                  <Skeleton className="h-4 w-28" />
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Skeleton className="h-7 w-16 rounded-md" />
                                <Skeleton className="h-7 w-16 rounded-md" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {!apiKeysLoading && apiKeys.length === 0 && (
                        <div className="p-6 text-neutral-400 text-sm">No API keys yet</div>
                      )}
                      {!apiKeysLoading && apiKeys.map((k) => (
                        <div key={k.id} className="p-6 hover:bg-neutral-800/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <h3 className="text-white font-medium">{k.name}</h3>
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  k.is_active ? 'bg-green-400/20 text-green-400' : 'bg-neutral-600/20 text-neutral-400'
                                }`}>
                                  {k.is_active ? 'active' : 'inactive'}
                                </span>
                              </div>
                              <div className="flex items-center flex-wrap gap-4 text-sm text-neutral-400">
                                <span className="font-mono bg-neutral-800 px-2 py-1 rounded">
                                  {k.prefix}...
                                </span>
                                <span>Created {formatRelativeTime(k.created_at)}</span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Button onClick={() => copyToClipboard(k.prefix)} variant="ghost" size="sm" className="text-neutral-400 hover:text-white cursor-pointer">
                                Copy Prefix
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-neutral-400 hover:text-red-400 cursor-pointer">
                                    Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete API key?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will deactivate the key immediately. You won’t be able to view it again.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteAPIKey(k.id)}>Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
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
                  <Card className="bg-neutral-900 border-neutral-800">
                    <CardHeader>
                      <CardTitle className="text-white">Danger Zone</CardTitle>
                      <p className="text-neutral-400 text-sm">This will permanently remove your data.</p>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-neutral-300">Delete account</p>
                          <p className="text-neutral-500 text-sm">Removes API keys, usage logs, and profile data.</p>
                        </div>
                        <AlertDialog onOpenChange={(open) => { if (!open) setDeleteConfirm("") }}>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="cursor-pointer">Delete account</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action deletes all your data. Type <span className="font-semibold text-white">DELETE</span> to confirm. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="mt-2">
                              <Input
                                value={deleteConfirm}
                                onChange={(e) => setDeleteConfirm(e.target.value)}
                                placeholder="Type DELETE to confirm"
                                className="bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500"
                              />
                            </div>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction disabled={deleteConfirm !== 'DELETE'} onClick={() => handleDeleteAccount()}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
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
