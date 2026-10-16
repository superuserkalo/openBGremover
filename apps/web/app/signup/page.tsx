"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { Mail, ArrowLeft, Eye, EyeOff } from "lucide-react"
import { Github } from "@/components/brand/github-icon"

export default function SignupPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isGithubLoading, setIsGithubLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setIsLoading(false)

      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      setIsLoading(false)

      return
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      })

      if (error) {
        setError(error.message)
      } else {
        setSuccess(true)
      }
    } catch {
      setError("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGithubSignup = async () => {
    setIsGithubLoading(true)
    setError("")

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      })

      if (error) {
        setError(error.message)
        setIsGithubLoading(false)
      }
    } catch {
      setError("An unexpected error occurred")
      setIsGithubLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card border-border shadow-xl">
          <CardContent className="text-center p-8">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-500/25">
              <Mail className="w-8 h-8 text-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-4 text-foreground tracking-[-0.01em] leading-[1.12]">Check your email</h2>
            <p className="text-muted-foreground mb-6 leading-[1.65] tracking-[0.01em]">
              We've sent you a confirmation link at <span className="text-foreground font-medium">{email}</span>
            </p>
            <p className="text-sm text-muted-foreground mb-6 tracking-[0.02em]">
              Click the link in the email to complete your account setup and get started.
            </p>
            <Link href="/login">
              <Button
                variant="outline"
                className="border-input text-foreground hover:bg-muted hover:border-ring hover:text-foreground cursor-pointer tracking-[0.02em]"
              >
                Back to login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center space-x-2 text-muted-foreground hover:text-foreground mb-6 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to home</span>
          </Link>

          <h1 className="text-3xl font-bold text-foreground mb-2 tracking-[-0.01em] leading-[1.12]">Create your account</h1>
          <p className="text-muted-foreground tracking-[0.01em]">Your media workflow starts here</p>
        </div>

        <Card className="bg-card border-border shadow-xl">
          <CardContent className="p-8">
            {/* GitHub Sign Up */}
            <Button
              onClick={handleGithubSignup}
              disabled={isGithubLoading}
              className="w-full mb-6 bg-muted hover:bg-border text-foreground border border-input hover:border-input transition-all duration-200 cursor-pointer tracking-[0.02em]"
            >
              {isGithubLoading ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
              ) : (
                <Github className="w-4 h-4 mr-2" />
              )}
              Continue with GitHub
            </Button>

            <div className="relative mb-6">
              <Separator className="bg-border" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-card px-3 text-sm text-muted-foreground tracking-[0.02em]">or</span>
              </div>
            </div>

            {/* Email Sign Up */}
            <form onSubmit={handleEmailSignup} className="space-y-4">
              <div>
                <Label htmlFor="email" className="text-foreground">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1 bg-muted border-input text-foreground placeholder:text-muted-foreground focus:border-orange-500 focus:ring-orange-500/20"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <Label htmlFor="password" className="text-foreground">
                  Password
                </Label>
                <div className="mt-1 relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10 bg-muted border-input text-foreground placeholder:text-muted-foreground focus:border-orange-500 focus:ring-orange-500/20"
                    placeholder="At least 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label htmlFor="confirmPassword" className="text-foreground">
                  Confirm password
                </Label>
                <div className="mt-1 relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="pr-10 bg-muted border-input text-foreground placeholder:text-muted-foreground focus:border-orange-500 focus:ring-orange-500/20"
                    placeholder="Confirm your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {error && (
                <div className="text-destructive text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3 tracking-[0.01em]">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground transition-colors duration-200 cursor-pointer tracking-[0.02em]"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                ) : null}
                Create account
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-muted-foreground tracking-[0.01em]">
                Already have an account?{" "}
                <Link href="/login" className="text-primary hover:text-primary font-medium cursor-pointer">
                  Sign in
                </Link>
              </p>
            </div>

            <div className="mt-6 text-xs text-muted-foreground text-center tracking-[0.02em]">
              By creating an account, you agree to our{" "}
              <Link href="/terms" className="text-primary hover:text-primary cursor-pointer">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-primary hover:text-primary cursor-pointer">
                Privacy Policy
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
