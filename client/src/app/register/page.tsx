'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, Mail, Lock, User, ArrowRight, Video, CheckCircle2 } from 'lucide-react';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, user, isLoading } = useAuth();
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const res = await api.post('/api/auth/register', { username, email, password });
      login(res.data.token, res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return null;
  }

  const passwordStrength = password.length > 0 ? Math.min(password.length / 6, 1) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4 shadow-lg shadow-blue-500/50"
          >
            <Video className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-4xl font-bold text-white mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            Genio AI
          </h1>
          <p className="text-slate-400">Create your account to get started</p>
        </div>

        <Card className="bg-slate-900/80 backdrop-blur-xl border-slate-800/50 shadow-2xl">
          <CardContent className="p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-white mb-2">Create account</h2>
              <p className="text-slate-400 text-sm">Join thousands of creators using AI video tools</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-slate-300 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Username
                </Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 h-12 focus:border-blue-500 focus:ring-blue-500/20"
                  placeholder="johndoe"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 h-12 focus:border-blue-500 focus:ring-blue-500/20"
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300 flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 h-12 focus:border-blue-500 focus:ring-blue-500/20"
                  placeholder="••••••••"
                />
                {password.length > 0 && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${passwordStrength * 100}%` }}
                        className={`h-full rounded-full ${
                          passwordStrength < 0.5
                            ? 'bg-red-500'
                            : passwordStrength < 0.8
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {password.length < 6 ? 'At least 6 characters required' : 'Password strength: Good'}
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm"
                >
                  {error}
                </motion.div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || password.length < 6}
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium shadow-lg shadow-blue-500/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Creating account...
                  </>
                ) : (
                  <>
                    Create account
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-800">
              <p className="text-center text-sm text-slate-400">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="text-blue-400 hover:text-blue-300 font-medium transition-colors inline-flex items-center gap-1"
                >
                  Sign in
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Benefits */}
        <div className="mt-8 space-y-3">
          <div className="flex items-center gap-3 p-4 bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-800/50">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            <p className="text-sm text-slate-300">AI-powered subtitle generation</p>
          </div>
          <div className="flex items-center gap-3 p-4 bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-800/50">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            <p className="text-sm text-slate-300">Unlimited video processing</p>
          </div>
          <div className="flex items-center gap-3 p-4 bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-800/50">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            <p className="text-sm text-slate-300">Professional video editing tools</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
