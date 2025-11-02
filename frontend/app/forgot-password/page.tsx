"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { ArrowLeft, Mail } from "lucide-react"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        setError(error.message)
      } else {
        setSuccess(true)
      }
    } catch (err) {
      setError("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-neutral-900 border-neutral-800 shadow-xl">
          <CardContent className="text-center p-8">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-500/25">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-4 text-white tracking-[-0.01em] leading-[1.12]">Check your email</h2>
            <p className="text-neutral-400 mb-6 leading-[1.65] tracking-[0.01em]">
              We've sent a password reset link to <span className="text-white font-medium">{email}</span>
            </p>
            <Link href="/login">
              <Button
                variant="outline"
                className="border-neutral-600 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-500 hover:text-white cursor-pointer tracking-[0.02em]"
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
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/login" className="inline-flex items-center space-x-2 text-neutral-400 hover:text-white mb-6 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to login</span>
          </Link>
          
          <h1 className="text-3xl font-bold text-white mb-2 tracking-[-0.01em] leading-[1.12]">Reset your password</h1>
          <p className="text-neutral-400 tracking-[0.01em]">Enter your email to receive a reset link</p>
        </div>

        <Card className="bg-neutral-900 border-neutral-800 shadow-xl">
          <CardContent className="p-8">
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <Label htmlFor="email" className="text-neutral-300">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500 focus:border-orange-500 focus:ring-orange-500/20"
                  placeholder="you@example.com"
                />
              </div>
              {error && (
                <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3 tracking-[0.01em]">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white transition-colors duration-200 cursor-pointer tracking-[0.02em]"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                ) : null}
                Send reset link
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
