"use client"

import { useEffect, useState } from "react"
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
import { LogOut, Key, BarChart3, CreditCard, Star, Coffee, Menu, X, Activity, Settings, Check, Shield, Zap } from "lucide-react"
import { Github } from "@/components/brand/github-icon"
import { toast } from "sonner"
import { ActivityResponse, CreateKeyResponse, KeysResponse, StatsResponse, Success, type Activity as UserActivity, type ApiKey, type Stats } from "@openbg/contracts"
import { apiRequest, errorMessage } from "@/lib/api"

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000)

    return () => clearInterval(interval)
  }, [])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState("dashboard")
  const [billingPlan, setBillingPlan] = useState<'payg'|'bulk'>('payg')
  const [billingMessage, setBillingMessage] = useState<string | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [apiKeyName, setApiKeyName] = useState("")
  const [isGeneratingKey, setIsGeneratingKey] = useState(false)
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [activities, setActivities] = useState<readonly UserActivity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(true)
  const [apiKeys, setApiKeys] = useState<readonly ApiKey[]>([])
  const [apiKeysLoading, setApiKeysLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const router = useRouter()


  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")

        return
      }

      setNow(Date.now())
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

  const upgradeBilling = async (plan: 'payg'|'bulk', pkg?: 'starter'|'pro'|'enterprise', recurring?: boolean) => {
    setBillingLoading(true)
    setBillingMessage(null)

    try {
      await apiRequest('/api/v1/billing/upgrade', Success, {
        method: 'POST', body: JSON.stringify({ plan, package: pkg, recurring: !!recurring }),
      })
      setBillingMessage('Billing updated')
      await fetchStats()
    } catch (cause) {
      setBillingMessage(errorMessage(cause))
    } finally {
      setBillingLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    try {
      await apiRequest('/api/v1/account', Success, { method: 'DELETE' })
      toast.success('Account deleted')
      await supabase.auth.signOut()
      router.push('/')
    } catch (cause) {
      toast.error('Delete failed', { description: errorMessage(cause) })
    }
  }

  const handleGenerateAPIKey = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsGeneratingKey(true)
    setNewlyGeneratedKey(null)
    setApiKeyError(null)

    try {
      const data = await apiRequest('/api/v1/keys', CreateKeyResponse, {
        method: 'POST', body: JSON.stringify({ name: apiKeyName }),
      })

      setNewlyGeneratedKey(data.api_key)
      setApiKeyName('')
      toast.success('API key created', { description: 'Copy and store it securely.' })
      await fetchAPIKeys()
    } catch (cause) {
      setApiKeyError(errorMessage(cause))
      toast.error('API key creation failed', { description: errorMessage(cause) })
    } finally {
      setIsGeneratingKey(false)
    }
  }

  // Helper: format relative time from unix seconds
  const formatRelativeTime = (unixSeconds: number) => {
    const diffMs = Math.max(0, now - unixSeconds * 1000)
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

  const fetchActivity = () => apiRequest('/api/v1/activity?limit=50', ActivityResponse)
    .then(response => setActivities(response.activities))
    .catch(cause => toast.error('Could not load activity', { description: errorMessage(cause) }))
    .finally(() => setActivitiesLoading(false))

  const fetchAPIKeys = () => apiRequest('/api/v1/keys', KeysResponse)
    .then(response => setApiKeys(response.keys))
    .catch(cause => toast.error('Could not load API keys', { description: errorMessage(cause) }))
    .finally(() => setApiKeysLoading(false))

  const fetchStats = () => apiRequest('/api/v1/stats', StatsResponse)
    .then(setStats)
    .catch(cause => toast.error('Could not load usage', { description: errorMessage(cause) }))
    .finally(() => setStatsLoading(false))

  const handleDeleteAPIKey = async (keyId: number) => {
    try {
      await apiRequest(`/api/v1/keys/${keyId}`, Success, { method: 'DELETE' })
      setApiKeys(keys => keys.filter(key => key.id !== keyId))
      toast.success('API key deleted')
    } catch (cause) {
      toast.error('Delete failed', { description: errorMessage(cause) })
    }
  }

  // Copy helper
  const copyToClipboard = async (text: string) => {
    const setOk = () => {
      toast.success('Copied', { description: 'Prefix copied to clipboard.' })
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

  const navigate = (section: string) => {
    setActiveSection(section)

    if (section === "activity") setActivitiesLoading(true)

    if (section === "apikeys") setApiKeysLoading(true)

    if (section === "dashboard") setStatsLoading(true)
  }

  // Auto-fetch when navigating to sections
  useEffect(() => {
    if (!user) return

    if (activeSection === "activity") fetchActivity()

    if (activeSection === "apikeys") fetchAPIKeys()

    if (activeSection === "dashboard") fetchStats()
  }, [activeSection, user])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Enhanced Navigation Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link href="/dashboard" className="flex items-center space-x-3 group cursor-pointer">
              <div className="w-8 h-8 bg-primary rounded-lg shadow-lg shadow-orange-500/25 group-hover:shadow-orange-500/40 transition-all duration-300 group-hover:scale-110"></div>
              <span className="text-xl font-semibold text-foreground group-hover:text-orange-100 transition-colors duration-300">
                openBGremover
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center space-x-8">
              <Link
                href="/pricing"
                className="text-muted-foreground hover:text-foreground transition-all duration-300 hover:scale-105 relative group cursor-pointer"
              >
                Pricing
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-orange-400 transition-all duration-300 group-hover:w-full"></span>
              </Link>
              <Link
                href="/docs"
                className="text-muted-foreground hover:text-foreground transition-all duration-300 hover:scale-105 relative group cursor-pointer"
              >
                Documentation
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-orange-400 transition-all duration-300 group-hover:w-full"></span>
              </Link>
              <Link
                href="https://github.com/superuserkalo/openBGremover"
                className="flex items-center space-x-1 text-muted-foreground hover:text-foreground transition-all duration-300 hover:scale-105 group cursor-pointer"
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
                  className="text-muted-foreground hover:text-primary hover:bg-card text-xs px-2 py-1 h-7 transition-all duration-300 hover:scale-105 cursor-pointer"
                >
                  <Coffee className="w-3 h-3 mr-1 hover:rotate-12 transition-transform duration-300" />
                  <span className="hidden xl:inline">Coffee</span>
                </Button>
              </Link>
              <span className="text-muted-foreground text-sm">{user?.email || user?.user_metadata?.full_name || "User"}</span>
              <Button
                onClick={handleSignOut}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-300 hover:scale-105 cursor-pointer"
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
                className="text-muted-foreground hover:text-foreground p-2 cursor-pointer"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden border-t border-border py-4 space-y-4 ">
              <Link
                href="/pricing"
                className="block text-muted-foreground hover:text-foreground transition-colors duration-300 py-2 cursor-pointer"
                onClick={() => setMobileMenuOpen(false)}
              >
                Pricing
              </Link>
              <Link
                href="/docs"
                className="block text-muted-foreground hover:text-foreground transition-colors duration-300 py-2 cursor-pointer"
                onClick={() => setMobileMenuOpen(false)}
              >
                Documentation
              </Link>
              <Link
                href="https://github.com/superuserkalo/openBGremover"
                className="flex items-center space-x-2 text-muted-foreground hover:text-foreground transition-colors duration-300 py-2 cursor-pointer"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Github className="w-4 h-4" />
                <span>GitHub</span>
                <Star className="w-3 h-3" />
              </Link>
              <div className="border-t border-border pt-4 space-y-3">
                <Link href="https://ko-fi.com/tsarkalo" target="_blank" onClick={() => setMobileMenuOpen(false)}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground hover:text-primary hover:bg-card justify-start cursor-pointer"
                  >
                    <Coffee className="w-3 h-3 mr-2" />
                    Buy us a coffee
                  </Button>
                </Link>
                <div className="text-muted-foreground text-sm px-3 py-2">
                  {user?.email || user?.user_metadata?.full_name || "User"}
                </div>
                <Button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    handleSignOut()
                  }}
                  variant="ghost"
                  className="w-full text-muted-foreground hover:text-foreground hover:bg-muted justify-start cursor-pointer"
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
        <aside className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 bg-card border-r border-border transform transition-transform duration-300 z-40 ${
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
                    navigate(item.id)
                    setSidebarOpen(false)
                  }}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                    activeSection === item.id
                      ? 'bg-orange-500/20 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
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
          <div className="lg:hidden p-4 border-b border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Menu className="w-5 h-5 mr-2" />
              Menu
            </Button>
          </div>

          <div className="p-4 sm:p-6 lg:p-8">
            {activeSection === "dashboard" && (
              <div>
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
                  <p className="text-muted-foreground">Welcome back! Here's an overview of your background removal API usage.</p>
                </div>

                {/* Stats Cards */}
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                  <Card className="bg-card border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Images Processed</CardTitle>
                      <BarChart3 className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-foreground">
                        {statsLoading ? <Skeleton className="h-6 w-16" /> : (stats?.images_this_month ?? 0)}
                      </div>
                      <p className="text-xs text-muted-foreground">This month</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">API Calls</CardTitle>
                      <Key className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-foreground">
                        {statsLoading ? <Skeleton className="h-6 w-16" /> : (stats?.api_calls_total ?? 0)}
                      </div>
                      <p className="text-xs text-muted-foreground">Total background removal requests</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Credits Remaining</CardTitle>
                      <CreditCard className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-foreground">
                        {statsLoading ? <Skeleton className="h-6 w-24" /> : ((stats?.free_credits_remaining ?? 0) + (stats?.bulk_credits_remaining ?? 0))}
                      </div>
                      <p className="text-xs text-muted-foreground">Free {stats?.free_credits_remaining ?? 0} • Bulk {stats?.bulk_credits_remaining ?? 0}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Quick Actions */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="bg-card border-border">
                    <CardHeader>
                      <CardTitle className="text-foreground">Quick Actions</CardTitle>
                      <p className="text-muted-foreground text-sm">Common tasks and shortcuts</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button asChild variant="outline" className="w-full">
                        <Link href="/playground">Open image tools</Link>
                      </Button>
                      <Button
                        onClick={() => navigate("apikeys")}
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
                      >
                        <Key className="w-4 h-4 mr-2" />
                        Manage API Keys
                      </Button>
                      <Button
                        onClick={() => navigate("activity")}
                        variant="outline"
                        className="w-full border-input text-foreground hover:bg-muted cursor-pointer"
                      >
                        <Activity className="w-4 h-4 mr-2" />
                        View Activity Log
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="bg-card border-border flex flex-col">
                    <CardHeader className="flex-1">
                      <CardTitle className="text-foreground">Purchase Images</CardTitle>
                      <p className="text-muted-foreground text-sm">Buy bulk image processing packages at discounted rates</p>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Button
                        onClick={() => navigate('billing')}
                        variant="outline"
                        className="w-full border-input text-foreground hover:bg-muted hover:border-ring hover:text-foreground cursor-pointer"
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
                      <h1 className="text-3xl font-bold text-foreground mb-2">Billing</h1>
                      <p className="text-muted-foreground">Pick a plan, add credits, and keep building.</p>
                    </div>
                    <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-card border border-border px-3 py-1.5 rounded-full">
                      <Shield className="w-3.5 h-3.5 text-green-400" />
                      Secure payments coming soon
                    </div>
                  </div>
                </div>

                {/* Segmented control */}
                <div className="mb-6 inline-flex p-1 rounded-lg bg-card border border-border">
                  <button onClick={() => setBillingPlan('payg')} className={`px-3.5 py-1.5 rounded-md text-sm transition-colors ${billingPlan==='payg' ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-foreground' : 'text-foreground hover:text-foreground'}`}>Pay‑as‑you‑go</button>
                  <button onClick={() => setBillingPlan('bulk')} className={`px-3.5 py-1.5 rounded-md text-sm transition-colors ${billingPlan==='bulk' ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-foreground' : 'text-foreground hover:text-foreground'}`}>Bulk packages</button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Main column */}
                  <div className="lg:col-span-2 space-y-6">
                    {billingPlan === 'payg' && (
                      <Card className="bg-card/95 border-border relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-amber-500/5 pointer-events-none" />
                        <CardHeader>
                          <CardTitle className="text-foreground flex items-center gap-2">
                            <Zap className="w-4 h-4 text-primary" /> Enable Pay‑as‑you‑go
                          </CardTitle>
                          <p className="text-muted-foreground text-sm">Pay only for successful images. No expirations. Switch anytime.</p>
                        </CardHeader>
                        <CardContent>
                          <div className="grid sm:grid-cols-2 gap-4 mb-4">
                            {["No commitments", "Wallet-style balance", "Full API access", "Same SLA"].map(f => (
                              <div key={f} className="flex items-center gap-2 text-foreground text-sm">
                                <Check className="w-4 h-4 text-primary" />
                                <span>{f}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <div className="text-sm text-muted-foreground">Current model: <span className="text-foreground font-medium">{stats?.billing_model || 'free_tier'}</span></div>
                            <Button disabled={billingLoading} onClick={() => upgradeBilling('payg')} className="bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer">
                              {billingLoading ? 'Saving…' : 'Enable PAYG'}
                            </Button>
                          </div>
                          {billingMessage && <div className="mt-3 text-xs text-muted-foreground">{billingMessage}</div>}
                        </CardContent>
                      </Card>
                    )}

                    {billingPlan === 'bulk' && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {([{name:'Starter', pkg:'starter', images:'1,000', desc:'Kickstart small projects', popular:false}, {name:'Pro', pkg:'pro', images:'10,000', desc:'Scale your workloads', popular:true}, {name:'Enterprise', pkg:'enterprise', images:'100,000', desc:'Serious volume', popular:false}] as const).map((p) => (
                          <Card key={p.pkg} className={`bg-card border-border hover:border-input transition-colors relative overflow-hidden ${p.popular ? 'ring-1 ring-orange-500/30' : ''}`}>
                            {p.popular && (
                              <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-orange-500 to-amber-500 text-foreground text-center py-1.5 text-xs font-medium">Most popular</div>
                            )}
                            <CardHeader className="pt-6">
                              <CardTitle className="text-foreground">{p.name}</CardTitle>
                              <p className="text-muted-foreground text-sm">{p.desc}</p>
                            </CardHeader>
                            <CardContent>
                              <div className="mb-4">
                                <div className="text-2xl font-semibold text-foreground">{p.images} images</div>
                                <div className="text-xs text-muted-foreground">Never expires</div>
                              </div>
                              <Button disabled={billingLoading} onClick={() => upgradeBilling('bulk', p.pkg, false)} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer">
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
                    <Card className="bg-card border-border">
                      <CardHeader>
                        <CardTitle className="text-foreground">Summary</CardTitle>
                        <p className="text-muted-foreground text-sm">Your current balances and limits</p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Billing model</span>
                          <span className="text-foreground font-medium">{stats?.billing_model || 'free_tier'}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Free credits</span>
                          <span className="text-foreground font-medium">{stats?.free_credits_remaining ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Bulk credits</span>
                          <span className="text-foreground font-medium">{stats?.bulk_credits_remaining ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Processed this month</span>
                          <span className="text-foreground font-medium">{stats?.images_this_month ?? 0}</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-card border-border">
                      <CardHeader>
                        <CardTitle className="text-foreground">Receipts</CardTitle>
                        <p className="text-muted-foreground text-sm">History coming with payments integration</p>
                      </CardHeader>
                      <CardContent>
                        <div className="text-sm text-muted-foreground">No receipts yet</div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "activity" && (
              <div>
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-foreground mb-2">Activity Log</h1>
                  <p className="text-muted-foreground">Complete history of your API usage and account activity.</p>
                </div>

                <Card className="bg-card border-border">
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
                        <div className="p-4 text-muted-foreground text-sm">No activity yet</div>
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

                        if (a.processing_time_ms != null) detailParts.push(`${a.processing_time_ms}ms`)

                        if (a.error_message && !a.was_successful) detailParts.push(a.error_message)
                        const detail = detailParts.join(' • ')

                        return (
                          <div key={a.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className={`w-2 h-2 rounded-full ${dotClass}`}></div>
                                <div>
                                  <p className="text-foreground text-sm font-medium">{action}</p>
                                  <p className="text-muted-foreground text-xs">{detail}</p>
                                </div>
                              </div>
                              <span className="text-muted-foreground text-xs">{formatRelativeTime(a.created_at)}</span>
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
                  <h1 className="text-3xl font-bold text-foreground mb-2">API Key Management</h1>
                  <p className="text-muted-foreground">Create and manage your API keys for authentication.</p>
                </div>

                <Card className="bg-card border-border mb-6">
                  <CardHeader>
                    <CardTitle className="text-foreground">Generate New API Key</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleGenerateAPIKey} className="space-y-4">
                      <div>
                        <Label htmlFor="apiKeyName" className="text-foreground">
                          Key Name
                        </Label>
                        <Input
                          id="apiKeyName"
                          type="text"
                          value={apiKeyName}
                          onChange={(e) => setApiKeyName(e.target.value)}
                          required
                          className="mt-1 bg-muted border-input text-foreground placeholder:text-muted-foreground focus:border-orange-500 focus:ring-orange-500/20"
                          placeholder="e.g., My Production Key"
                        />
                      </div>
                      <Button
                        type="submit"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
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
                      <div className="mt-4 p-3 bg-red-400/10 border border-red-400/20 rounded-lg text-destructive text-sm">
                        {apiKeyError}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-card border-border">
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
                        <div className="p-6 text-muted-foreground text-sm">No API keys yet</div>
                      )}
                      {!apiKeysLoading && apiKeys.map((k) => (
                        <div key={k.id} className="p-6 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <h3 className="text-foreground font-medium">{k.name}</h3>
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  k.is_active ? 'bg-green-400/20 text-green-400' : 'bg-neutral-600/20 text-muted-foreground'
                                }`}>
                                  {k.is_active ? 'active' : 'inactive'}
                                </span>
                              </div>
                              <div className="flex items-center flex-wrap gap-4 text-sm text-muted-foreground">
                                <span className="font-mono bg-muted px-2 py-1 rounded">
                                  {k.prefix}...
                                </span>
                                <span>Created {formatRelativeTime(k.created_at)}</span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Button onClick={() => copyToClipboard(k.prefix)} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground cursor-pointer">
                                Copy Prefix
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive cursor-pointer">
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
                  <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
                  <p className="text-muted-foreground">Configure your account preferences and usage alerts.</p>
                </div>

                <div className="grid gap-6">
                  <Card className="bg-card border-border">
                    <CardHeader>
                      <CardTitle className="text-foreground">Usage Alerts</CardTitle>
                      <p className="text-muted-foreground text-sm">Set limits and get notified about your usage</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-foreground">Daily limit alert</span>
                        <input
                          type="number"
                          placeholder="100 images"
                          className="w-[120px] px-2 py-1 text-sm bg-muted border border-input rounded text-foreground"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-foreground">Monthly spend alert</span>
                        <input
                          type="number"
                          placeholder="50 $"
                          className="w-[70px] px-2 py-1 text-sm bg-muted border border-input rounded text-foreground"
                        />
                      </div>
                      <Button variant="outline" size="sm" className="w-full border-input text-foreground hover:bg-muted cursor-pointer">
                        Save Settings
                      </Button>
                    </CardContent>
                  </Card>
                  <Card className="bg-card border-border">
                    <CardHeader>
                      <CardTitle className="text-foreground">Danger Zone</CardTitle>
                      <p className="text-muted-foreground text-sm">This will permanently remove your data.</p>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-foreground">Delete account</p>
                          <p className="text-muted-foreground text-sm">Removes API keys, usage logs, and profile data.</p>
                        </div>
                        <AlertDialog onOpenChange={(open) => { if (!open) setDeleteConfirm("") }}>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="cursor-pointer">Delete account</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action deletes all your data. Type <span className="font-semibold text-foreground">DELETE</span> to confirm. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="mt-2">
                              <Input
                                value={deleteConfirm}
                                onChange={(e) => setDeleteConfirm(e.target.value)}
                                placeholder="Type DELETE to confirm"
                                className="bg-muted border-input text-foreground placeholder:text-muted-foreground"
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
