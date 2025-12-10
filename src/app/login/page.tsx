
"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, AlertCircle } from 'lucide-react'

// Dummy domain for username-based login
const DOMAIN = 'novelarchitect.com';

export default function LoginPage() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isSignUp, setIsSignUp] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const router = useRouter()
    const supabase = createClient()

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)
        setMessage(null)

        // If user typed a real email, use it. Otherwise append domain.
        const isEmail = username.includes('@');
        const email = isEmail ? username : `${username}@${DOMAIN}`;

        try {
            if (isSignUp) {
                const { error, data } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { username: isEmail ? username.split('@')[0] : username }
                    }
                })
                if (error) throw error

                // If checking for admin/admin or no email confirmation needed
                if (data.session) {
                    // Auto logged in (Email confirmation disabled)
                    router.push('/')
                    router.refresh()
                } else {
                    setMessage('Account created! Please check your email to confirm.')
                }
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (error) throw error
                router.push('/')
                router.refresh()
            }
        } catch (err: any) {
            console.error("Login error:", err);
            let errorMessage = 'An unexpected error occurred';

            if (err) {
                if (typeof err === 'string') {
                    errorMessage = err;
                } else if (err.message) {
                    errorMessage = err.message;
                } else {
                    try {
                        errorMessage = JSON.stringify(err);
                        if (errorMessage === '{}') errorMessage = 'Error: Empty error object returned from Supabase';
                    } catch (e) {
                        errorMessage = 'Unknown error object';
                    }
                }
            }

            if (errorMessage.includes('Email not confirmed')) {
                setError('Email confirmation is still enabled in Supabase. Please go to Supabase > Auth > Providers > Email, disable "Confirm email", delete this user in Supabase, and Sign Up again.')
            } else {
                setError(errorMessage)
            }
        } finally {
            setIsLoading(false)
        }
    }

    const handleOAuth = async (provider: 'github' | 'google') => {
        setIsLoading(true)
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${location.origin}/auth/callback`,
            },
        })
        if (error) setError(error.message)
        // Note: Redirects away, so isLoading stays true technically
    }

    return (
        <div className="flex h-screen w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
            <div className="w-full max-w-md space-y-8 px-4">
                <div className="text-center">
                    <h1 className="text-3xl font-bold tracking-tight">
                        {isSignUp ? 'Create an account' : 'Welcome back'}
                    </h1>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        Sign in to your NovelArchitect account to sync your projects.
                    </p>
                </div>

                <div className="bg-white dark:bg-zinc-900 p-8 shadow-md rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <form className="space-y-6" onSubmit={handleAuth}>
                        <div>
                            <label
                                htmlFor="username"
                                className="block text-sm font-medium leading-6 mb-2"
                            >
                                Username
                            </label>
                            <Input
                                id="username"
                                name="username"
                                type="text"
                                autoComplete="username"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="password"
                                className="block text-sm font-medium leading-6 mb-2"
                            >
                                Password
                            </label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500"
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                <AlertCircle className="h-4 w-4" />
                                <p>{error}</p>
                            </div>
                        )}

                        {message && (
                            <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                <p>{message}</p>
                            </div>
                        )}

                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isSignUp ? 'Sign up' : 'Sign in'}
                        </Button>
                    </form>

                    <div className="mt-6">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-zinc-300 dark:border-zinc-700" />
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="bg-white dark:bg-zinc-900 px-2 text-zinc-500">
                                    Or continue with
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <Button
                                variant="outline"
                                onClick={() => handleOAuth('github')}
                                disabled={isLoading}
                                className="dark:bg-zinc-950 dark:text-zinc-100 dark:border-zinc-700"
                            >
                                Github
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => handleOAuth('google')}
                                disabled={isLoading}
                                className="dark:bg-zinc-950 dark:text-zinc-100 dark:border-zinc-700"
                            >
                                Google
                            </Button>
                        </div>
                    </div>

                    <div className="mt-6 text-center text-sm">
                        <button
                            type="button"
                            className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                            onClick={() => setIsSignUp(!isSignUp)}
                        >
                            {isSignUp
                                ? 'Already have an account? Sign in'
                                : "Don't have an account? Sign up"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
