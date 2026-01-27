'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { motion } from 'framer-motion';
import { Video, Sparkles, Zap, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return null; // Redirect will happen
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-4xl mx-auto"
        >
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl mb-8 shadow-2xl shadow-blue-500/50"
          >
            <Video className="w-10 h-10 text-white" />
          </motion.div>

          {/* Hero Text */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-5xl md:text-7xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400"
          >
            Transform Videos with
            <br />
            <span className="inline-flex items-center gap-3">
              AI-Powered
              <Sparkles className="w-12 h-12 md:w-16 md:h-16 text-purple-400 animate-pulse" />
            </span>
            <br />
            Subtitles
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-xl md:text-2xl text-slate-300 mb-12 max-w-2xl mx-auto leading-relaxed"
          >
            Professional video editing, automatic subtitle generation, and seamless workflow.
            <br />
            All powered by cutting-edge AI technology.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16"
          >
            <Link href="/register">
              <Button
                size="lg"
                className="h-14 px-8 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold text-lg shadow-2xl shadow-blue-500/50 transition-all hover:scale-105"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/login">
              <Button
                size="lg"
                variant="outline"
                className="h-14 px-8 bg-slate-900/50 hover:bg-slate-800/50 border-slate-700 text-white font-semibold text-lg backdrop-blur-sm"
              >
                Sign In
              </Button>
            </Link>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto"
          >
            <div className="p-6 bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 rounded-2xl hover:border-blue-500/50 transition-all group">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-white">Lightning Fast</h3>
              <p className="text-slate-400 text-sm">Process videos in minutes, not hours. Our AI works at incredible speed.</p>
            </div>

            <div className="p-6 bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 rounded-2xl hover:border-purple-500/50 transition-all group">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-white">AI-Powered</h3>
              <p className="text-slate-400 text-sm">Advanced AI automatically generates accurate subtitles for your videos.</p>
            </div>

            <div className="p-6 bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 rounded-2xl hover:border-green-500/50 transition-all group">
              <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-white">Professional Quality</h3>
              <p className="text-slate-400 text-sm">Export broadcast-ready subtitles and videos with professional tools.</p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
