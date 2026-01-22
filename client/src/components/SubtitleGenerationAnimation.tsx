'use client';

import { motion } from 'framer-motion';
import { Sparkles, Mic, FileText, CheckCircle2 } from 'lucide-react';

interface SubtitleGenerationAnimationProps {
  progress: number;
  status: string;
}

export default function SubtitleGenerationAnimation({ progress, status }: SubtitleGenerationAnimationProps) {
  const steps = [
    { icon: Mic, label: 'Transcribing', color: 'from-blue-500 to-cyan-500' },
    { icon: Sparkles, label: 'AI Processing', color: 'from-purple-500 to-pink-500' },
    { icon: FileText, label: 'Generating Subtitles', color: 'from-indigo-500 to-blue-500' },
    { icon: CheckCircle2, label: 'Complete', color: 'from-green-500 to-emerald-500' },
  ];

  const currentStep = Math.floor((progress / 100) * (steps.length - 1));
  const stepProgress = ((progress % (100 / (steps.length - 1))) / (100 / (steps.length - 1))) * 100;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = index <= currentStep;
          const isCurrent = index === currentStep && status === 'processing';
          
          return (
            <div key={index} className="flex-1 flex flex-col items-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ 
                  scale: isActive ? 1 : 0.6,
                  opacity: isActive ? 1 : 0.4
                }}
                className={`w-12 h-12 rounded-full bg-gradient-to-r ${step.color} flex items-center justify-center mb-2 shadow-lg ${
                  isCurrent ? 'ring-4 ring-offset-2 ring-offset-slate-900 ring-white/50' : ''
                }`}
              >
                <Icon className="w-6 h-6 text-white" />
              </motion.div>
              <span className={`text-xs font-medium ${isActive ? 'text-white' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      
      <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full"
        />
        <motion.div
          animate={{
            x: ['-100%', '100%'],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
        />
      </div>
      
      <div className="mt-2 text-center">
        <span className="text-sm text-gray-300 font-medium">{progress}% Complete</span>
      </div>
    </div>
  );
}
