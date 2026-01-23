'use client';

import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Crop, Scissors, Filter, Download, RotateCw, X, Play, Pause } from 'lucide-react';
import { toast } from 'sonner';

interface VideoEditorProps {
  videoUrl: string;
  onClose: () => void;
}

export default function VideoEditor({ videoUrl, onClose }: VideoEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [cropMode, setCropMode] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setEndTime(video.duration);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, []);

  const handleCrop = () => {
    toast.info('Crop feature coming soon! This will allow you to crop video dimensions.');
  };

  const handleTrim = () => {
    toast.info('Trim feature coming soon! This will allow you to cut video segments.');
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/95 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-7xl w-full max-h-[95vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Video Editor</h2>
          <Button variant="ghost" onClick={onClose} className="text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <div className="relative bg-black rounded-lg overflow-hidden mb-4">
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full"
                controls
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Timeline */}
            <div className="bg-slate-800 rounded-lg p-4">
              <div className="flex items-center gap-4 mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const video = videoRef.current;
                    if (video) {
                      if (video.paused) video.play();
                      else video.pause();
                    }
                  }}
                  className="bg-slate-700 hover:bg-slate-600 border-slate-600 text-white"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <span className="text-sm text-slate-300">{formatTime(currentTime)}</span>
                <div className="flex-1 h-2 bg-slate-700 rounded-full relative cursor-pointer">
                  <div
                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full -ml-2 cursor-grab active:cursor-grabbing"
                    style={{ left: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
                <span className="text-sm text-slate-300">{formatTime(duration)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Start: {formatTime(startTime)}</span>
                <span>End: {formatTime(endTime)}</span>
                <span>Duration: {formatTime(endTime - startTime)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-4">Edit Tools</h3>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start bg-slate-700 hover:bg-slate-600 border-slate-600 text-white"
                  onClick={() => setCropMode(!cropMode)}
                >
                  <Crop className="w-4 h-4 mr-2" />
                  Crop
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start bg-slate-700 hover:bg-slate-600 border-slate-600 text-white"
                  onClick={handleTrim}
                >
                  <Scissors className="w-4 h-4 mr-2" />
                  Trim
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start bg-slate-700 hover:bg-slate-600 border-slate-600 text-white"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Filters
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start bg-slate-700 hover:bg-slate-600 border-slate-600 text-white"
                >
                  <RotateCw className="w-4 h-4 mr-2" />
                  Rotate
                </Button>
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-4">Export</h3>
              <Button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white">
                <Download className="w-4 h-4 mr-2" />
                Export Video
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
