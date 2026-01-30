'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import VideoPlayer from '@/components/VideoPlayer';
import VideoEditor from '@/components/VideoEditor';
import SubtitleGenerationAnimation from '@/components/SubtitleGenerationAnimation';
import ThreeBackground from '@/components/ThreeBackground';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { 
  Upload, 
  Link as LinkIcon, 
  Play, 
  Download, 
  LogOut, 
  Video,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileVideo,
  X,
  Sparkles,
  ArrowRight,
  FileCheck,
  Edit3,
  Crop,
  Scissors,
  Zap,
  TrendingUp,
  BarChart3,
  Settings,
  Image as ImageIcon
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

interface Video {
  _id: string;
  title: string;
  status: string;
  createdAt: string;
  subtitleKey?: string;
  subtitleS3Key?: string;
  progress?: number;
  docId?: string;
}

interface PlaybackData {
  videoUrl: string;
  subtitleUrl: string | null;
  docId: string;
  title: string;
}

export default function Dashboard() {
  const { user, logout, isLoading } = useAuth();
  const [videos, setVideos] = useState<Video[]>([]);
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [playingVideo, setPlayingVideo] = useState<PlaybackData | null>(null);
  const [editingVideo, setEditingVideo] = useState<PlaybackData | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.8]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // Set up socket connection when user is authenticated
  useEffect(() => {
    if (!user || isLoading) return;

    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001');

    socket.on('video-progress', ({ videoId, progress, message }) => {
      setVideos((prev) => prev.map(v => v._id === videoId ? { ...v, status: 'processing', progress } : v));
      if (message) {
        setLogs(prev => ({
            ...prev,
            [videoId]: [...(prev[videoId] || []), message]
        }));
      }
    });

    socket.on('video-completed', ({ videoId, subtitleS3Key }) => {
      console.log(`✅ Video ${videoId} completed, subtitleS3Key:`, subtitleS3Key);
      console.log(`   SubtitleS3Key type: ${typeof subtitleS3Key}`);
      console.log(`   SubtitleS3Key value: "${subtitleS3Key}"`);
      
      setVideos((prev) => prev.map(v => 
        v._id === videoId 
          ? { ...v, status: 'completed', progress: 100, subtitleS3Key: subtitleS3Key || v.subtitleS3Key } 
          : v
      ));
      
      setTimeout(() => {
        fetchVideos();
      }, 500);
      
      if (subtitleS3Key) {
        toast.success('Video processing completed! Subtitles are ready.');
      } else {
        toast.warning('Video processing completed, but subtitle key not found. Please refresh.');
      }
    });

    socket.on('video-failed', ({ videoId, reason }) => {
       console.error(`Video ${videoId} failed:`, reason);
       setVideos((prev) => prev.map(v => v._id === videoId ? { ...v, status: 'failed', progress: 0 } : v));
       toast.error(`Video processing failed: ${reason || 'Unknown error'}`);
    });

    return () => {
      socket.disconnect();
    };
  }, [user, isLoading]);

  // GSAP animations on mount
  useEffect(() => {
    if (heroRef.current) {
      gsap.from(heroRef.current.children, {
        opacity: 0,
        y: 50,
        stagger: 0.1,
        duration: 1,
        ease: 'power3.out',
      });
    }
  }, []);

  const fetchVideos = useCallback(async () => {
    try {
      const res = await api.get('/api/videos');
      setVideos(res.data);
      
      if (res.data.length === 0 && !showOnboarding) {
        setShowOnboarding(true);
      }
    } catch (err: any) {
      console.error('Failed to fetch videos:', err);
      // Error handling is done by api interceptor for 401
      if (err.response?.status !== 401) {
        toast.error('Failed to load videos');
      }
    }
  }, [showOnboarding]);

    // Fetch videos when user is loaded
    useEffect(() => {
      if (!user || isLoading) return;
      fetchVideos();
    }, [user, isLoading, fetchVideos]);
    
  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setUploadProgress(0);
      setUploadMode('file');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.webm', '.mov', '.avi', '.mkv']
    },
    multiple: false,
    disabled: uploading,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setUploadProgress(0);
    }
  };

  const handleUpload = async () => {
    if (uploadMode === 'file' && !file) {
      return toast.error('Please select a file');
    }
    if (uploadMode === 'url' && !videoUrl.trim()) {
      return toast.error('Please enter a video URL');
    }
    setUploading(true);
    setUploadProgress(0);

    try {
      let uploadRes;
      
      if (uploadMode === 'file') {
        console.log(`📤 Uploading file directly to server: ${file!.name}`);
        
        const formData = new FormData();
        formData.append('file', file!);
        
        uploadRes = await api.post('/api/videos/upload-direct', formData, {
          headers: {
            'Content-Type': undefined,
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(percentCompleted);
              console.log(`Upload progress: ${percentCompleted}%`);
            }
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      } else {
        // For URL upload, simulate progress
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => {
            if (prev >= 90) {
              clearInterval(progressInterval);
              return 90;
            }
            return prev + 10;
          });
        }, 200);
        
        console.log(`📤 Uploading video from URL: ${videoUrl}`);
        
        uploadRes = await api.post('/api/videos/upload-url', {
          url: videoUrl.trim(),
        });
        
        clearInterval(progressInterval);
        setUploadProgress(100);
      }
      
      const { videoId } = uploadRes.data;
      console.log('✅ File uploaded successfully to server');
      console.log(`   Video ID: ${videoId}`);
      
      try {
        const verifyRes = await api.post('/api/videos/verify', { videoId });
        if (verifyRes.data.verified) {
          console.log('✅ Upload verified');
        }
      } catch (verifyError: any) {
        console.warn('⚠️  Verification failed:', verifyError.message);
      }
      
      try {
        await api.post('/api/videos/process', { videoId });
        toast.success('Video uploaded! AI is now generating subtitles...');
        setUploadProgress(100);
        fetchVideos();
      } catch (processError: any) {
        console.error('❌ Failed to start processing:', processError);
        toast.error(`Upload successful but processing failed: ${processError.response?.data?.message || processError.message}`);
      }
    } catch (uploadError: any) {
      console.error('❌ Upload error:', uploadError);
      
      let errorMessage = 'Upload failed';
      
      if (uploadError.response) {
        const status = uploadError.response.status;
        const statusText = uploadError.response.statusText;
        const data = uploadError.response.data;
        
        errorMessage = `Upload failed: ${status} - ${statusText}`;
        
        if (status === 403) {
          errorMessage = 'Upload forbidden. Please check your authentication.';
        } else if (status === 404) {
          errorMessage = 'Server endpoint not found.';
        } else if (status === 400) {
          errorMessage = `Bad request: ${data?.message || statusText}.`;
        } else if (status === 413) {
          errorMessage = 'File too large. Maximum size is 500MB.';
        }
      } else if (uploadError.request) {
        errorMessage = 'Upload failed: No response from server. Check your network connection.';
      } else {
        errorMessage = `Upload failed: ${uploadError.message}`;
      }
      
      toast.error(errorMessage);
    } finally {
      setUploading(false);
      setTimeout(() => {
        setUploadProgress(0);
        setFile(null);
        setVideoUrl('');
      }, 2000);
    }
  };

  const handleDownload = async (subtitleS3Key: string) => {
    try {
      console.log(`📥 Downloading subtitle with S3 key: ${subtitleS3Key}`);
      
      // Encode the S3 key to handle special characters
      const encodedKey = encodeURIComponent(subtitleS3Key);
      const res = await api.get(`/api/videos/download/${encodedKey}`);
      
      if (res.data.url) {
        console.log(`✅ Got download URL, fetching file as blob`);
        
        // Fetch the file as a blob to ensure download instead of opening in browser
        const response = await fetch(res.data.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch subtitle: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const filename = res.data.filename || subtitleS3Key.split('/').pop() || 'subtitle.ass';
        
        // Create a blob URL and trigger download
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up the blob URL after a short delay
        setTimeout(() => {
          window.URL.revokeObjectURL(blobUrl);
        }, 100);
        
        toast.success('Subtitle downloaded successfully!');
      } else {
        throw new Error('No download URL received');
      }
    } catch (err: any) {
      console.error('❌ Download error:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Download failed';
      toast.error(`Failed to download subtitle: ${errorMessage}`);
    }
  };

  const handleViewVideo = async (videoId: string) => {
    try {
      console.log(`📥 Fetching playback URLs for video: ${videoId}`);
      
      const video = videos.find(v => v._id === videoId);
      console.log(`   Video from state:`, video);
      console.log(`   Video subtitleS3Key:`, video?.subtitleS3Key);
      
      const res = await api.get(`/api/videos/playback/${videoId}`);
      console.log('✅ Playback URLs received:', res.data);
      console.log('   Subtitle URL:', res.data.subtitleUrl);
      console.log('   Subtitle URL type:', typeof res.data.subtitleUrl);
      console.log('   Subtitle URL value:', res.data.subtitleUrl);
      
      let subtitleUrl: string | null = null;
      if (res.data.subtitleUrl && 
          res.data.subtitleUrl !== 'null' && 
          res.data.subtitleUrl !== null && 
          res.data.subtitleUrl !== undefined) {
        subtitleUrl = res.data.subtitleUrl;
      }
      
      console.log(`   Final subtitleUrl:`, subtitleUrl);
      
      setPlayingVideo({
        videoUrl: res.data.videoUrl,
        subtitleUrl: subtitleUrl,
        docId: res.data.docId,
        title: res.data.title,
      });
      
      if (!subtitleUrl) {
        if (video?.subtitleS3Key) {
          toast.warning('Subtitles exist but URL generation failed. Please try again.');
        } else {
          toast.info('Subtitles are still being processed for this video');
        }
      } else {
        toast.success('Video loaded with subtitles!');
      }
    } catch (err: any) {
      console.error('❌ Failed to load video:', err);
      toast.error(err.response?.data?.message || 'Failed to load video');
    }
  };

  const handleEditVideo = async (videoId: string) => {
    try {
      const res = await api.get(`/api/videos/playback/${videoId}`);
      const subtitleUrl = res.data.subtitleUrl === 'null' || res.data.subtitleUrl === null ? null : res.data.subtitleUrl;
      
      setEditingVideo({
        videoUrl: res.data.videoUrl,
        subtitleUrl: subtitleUrl,
        docId: res.data.docId,
        title: res.data.title,
      });
    } catch (err: any) {
      toast.error('Failed to load video for editing');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
          <p className="mt-4 text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (redirect will happen)
  if (!user) {
    return null;
  }

  const processingVideos = videos.filter(v => v.status === 'processing');
  const completedVideos = videos.filter(v => v.status === 'completed');
  const pendingVideos = videos.filter(v => v.status === 'pending');
  const failedVideos = videos.filter(v => v.status === 'failed');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white relative overflow-hidden">
        <ThreeBackground />
        
        <div ref={containerRef} className="relative z-10">
          {playingVideo ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="p-6 md:p-8 lg:p-12"
            >
              <VideoPlayer
                videoUrl={playingVideo.videoUrl}
                subtitleUrl={playingVideo.subtitleUrl}
                title={playingVideo.title}
                onClose={() => setPlayingVideo(null)}
              />
            </motion.div>
          ) : editingVideo ? (
            <VideoEditor
              videoUrl={editingVideo.videoUrl}
              onClose={() => setEditingVideo(null)}
            />
          ) : (
            <div className="p-6 md:p-8 lg:p-12 max-w-7xl mx-auto">
              {/* Hero Section */}
              <motion.div
                ref={heroRef}
                style={{ opacity, scale }}
                className="mb-16 text-center"
              >
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                  className="text-5xl md:text-7xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400"
                >
                  Transform Videos with AI
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="text-xl text-slate-400 max-w-2xl mx-auto"
                >
                  Professional video editing, AI-powered subtitles, and seamless workflow
                </motion.p>
              </motion.div>

              {/* Onboarding */}
              <AnimatePresence>
                {showOnboarding && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setShowOnboarding(false)}
                  >
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-2xl w-full shadow-2xl"
                    >
                      <div className="flex justify-between items-start mb-6">
                        <h2 className="text-2xl font-bold text-white">Welcome to Genio AI</h2>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowOnboarding(false)}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="w-5 h-5" />
                        </Button>
                      </div>
                      
                      <div className="space-y-6">
                        <div className="flex items-start gap-4">
                          <div className="p-3 bg-blue-500/20 rounded-lg">
                            <Upload className="w-6 h-6 text-blue-400" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-white mb-1">1. Upload Your Video</h3>
                            <p className="text-slate-400 text-sm">Drag & drop or paste a URL to get started</p>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-4">
                          <div className="p-3 bg-purple-500/20 rounded-lg">
                            <Sparkles className="w-6 h-6 text-purple-400" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-white mb-1">2. AI Generates Subtitles</h3>
                            <p className="text-slate-400 text-sm">Watch as AI automatically transcribes your video</p>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-4">
                          <div className="p-3 bg-green-500/20 rounded-lg">
                            <Play className="w-6 h-6 text-green-400" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-white mb-1">3. Edit & Export</h3>
                            <p className="text-slate-400 text-sm">Crop, trim, add effects, and export your video</p>
                          </div>
                        </div>
                      </div>
                      
                      <Button
                        onClick={() => setShowOnboarding(false)}
                        className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Get Started
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Modern Header */}
              <div className="mb-8">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <motion.h1
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-3xl md:text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400"
                    >
                      Welcome back, {user?.username}
                    </motion.h1>
                    <p className="text-slate-400">Transform your videos with AI-powered subtitles</p>
                  </div>
                  <Button 
                    onClick={logout} 
                    variant="outline"
                    className="bg-slate-900/50 hover:bg-slate-800/50 border-slate-700 text-slate-300 hover:text-white backdrop-blur-sm"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/50 rounded-xl p-4 hover:border-blue-500/50 transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Video className="w-5 h-5 text-blue-400" />
                      <span className="text-2xl font-bold text-white">{videos.length}</span>
                    </div>
                    <p className="text-xs text-slate-400">Total Videos</p>
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/50 rounded-xl p-4 hover:border-green-500/50 transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                      <span className="text-2xl font-bold text-white">{completedVideos.length}</span>
                    </div>
                    <p className="text-xs text-slate-400">Completed</p>
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/50 rounded-xl p-4 hover:border-purple-500/50 transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                      <span className="text-2xl font-bold text-white">{processingVideos.length}</span>
                    </div>
                    <p className="text-xs text-slate-400">Processing</p>
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/50 rounded-xl p-4 hover:border-red-500/50 transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <XCircle className="w-5 h-5 text-red-400" />
                      <span className="text-2xl font-bold text-white">{failedVideos.length}</span>
                    </div>
                    <p className="text-xs text-slate-400">Failed</p>
                  </motion.div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Upload Section */}
                <div className="lg:col-span-2 space-y-6">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <Card className="bg-slate-900/70 backdrop-blur-2xl border-slate-800/50 shadow-2xl hover:shadow-blue-500/10 transition-all">
                      <CardHeader className="border-b border-slate-800/50 pb-4">
                        <CardTitle className="text-xl font-semibold text-white flex items-center gap-3">
                          <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Upload className="w-5 h-5 text-blue-400" />
                          </div>
                          Upload Video
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6 space-y-6">
                      <div className="flex gap-3 p-1 bg-slate-800/50 rounded-lg">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setUploadMode('file')}
                          className={`flex-1 transition-all ${
                            uploadMode === 'file'
                              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/50'
                              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                          }`}
                        >
                          <FileVideo className="w-4 h-4 mr-2" />
                          File Upload
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setUploadMode('url')}
                          className={`flex-1 transition-all ${
                            uploadMode === 'url'
                              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/50'
                              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                          }`}
                        >
                          <LinkIcon className="w-4 h-4 mr-2" />
                          From URL
                        </Button>
                      </div>
                      
                      {uploadMode === 'file' ? (
                        <div className="space-y-4">
                          <div
                            {...getRootProps()}
                            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all relative overflow-hidden group ${
                              isDragActive
                                ? 'border-blue-500 bg-blue-500/20 scale-105'
                                : 'border-slate-700 hover:border-blue-500/50 bg-slate-800/30 hover:bg-slate-800/50'
                            }`}
                          >
                            <input {...getInputProps()} />
                            <div className="relative z-10">
                              <motion.div
                                animate={isDragActive ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
                                className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl mb-4"
                              >
                                <Upload className={`w-8 h-8 ${isDragActive ? 'text-blue-400' : 'text-slate-400'}`} />
                              </motion.div>
                              <p className="text-slate-200 font-medium mb-2 text-lg">
                                {isDragActive ? 'Drop your video here' : 'Drag & drop your video'}
                              </p>
                              <p className="text-sm text-slate-500">or click to browse files</p>
                              <p className="text-xs text-slate-600 mt-2">Supports MP4, WebM, MOV, AVI, MKV</p>
                            </div>
                            {isDragActive && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10"
                              />
                            )}
                            {file && (
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-4 p-3 bg-slate-800/50 rounded-lg"
                              >
                                <div className="flex items-center gap-2 text-sm text-slate-300">
                                  <FileCheck className="w-4 h-4 text-green-400" />
                                  {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                                </div>
                              </motion.div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label className="text-slate-300">Video URL</Label>
                          <Input
                            type="url"
                            placeholder="https://example.com/video.mp4"
                            value={videoUrl}
                            onChange={(e) => setVideoUrl(e.target.value)}
                            className="bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-500"
                          />
                        </div>
                      )}

                      {/* Real-time Upload Progress */}
                      {uploading && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-2"
                        >
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Uploading...</span>
                            <span className="text-slate-300 font-medium">{uploadProgress}%</span>
                          </div>
                          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden relative">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${uploadProgress}%` }}
                              transition={{ duration: 0.3, ease: 'easeOut' }}
                              className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full relative"
                            >
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
                            </motion.div>
                          </div>
                        </motion.div>
                      )}
                      
                      <Button 
                        onClick={handleUpload} 
                        disabled={uploading || (uploadMode === 'file' && !file) || (uploadMode === 'url' && !videoUrl.trim())}
                        className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium shadow-lg shadow-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Uploading {uploadProgress}%...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Upload & Generate Subtitles
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                  </motion.div>

                  {/* Processing Videos */}
                  {processingVideos.length > 0 && (
                    <Card className="bg-slate-900/80 backdrop-blur-xl border-slate-700/50 shadow-2xl">
                      <CardHeader className="border-b border-slate-700/50">
                        <CardTitle className="text-xl font-semibold text-white flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
                          Generating Subtitles
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6">
                        {processingVideos.map((video) => (
                          <div key={video._id} className="mb-6 last:mb-0">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-medium text-slate-300">{video.title}</span>
                              <span className="text-sm text-slate-400">{video.progress || 0}%</span>
                            </div>
                            <SubtitleGenerationAnimation 
                              progress={video.progress || 0} 
                              status={video.status}
                            />
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Video Library */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Card className="bg-slate-900/70 backdrop-blur-2xl border-slate-800/50 shadow-2xl h-full flex flex-col">
                    <CardHeader className="border-b border-slate-800/50 pb-4">
                      <CardTitle className="text-xl font-semibold text-white flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg">
                          <Video className="w-5 h-5 text-purple-400" />
                        </div>
                        Video Library
                        <span className="ml-auto text-sm font-normal text-slate-400 bg-slate-800/50 px-3 py-1 rounded-full">
                          {videos.length}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 flex-1 overflow-hidden flex flex-col">
                      {videos.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 flex-1 flex flex-col items-center justify-center">
                          <div className="w-20 h-20 bg-slate-800/50 rounded-2xl flex items-center justify-center mb-4">
                            <Video className="w-10 h-10 opacity-30" />
                          </div>
                          <p className="font-medium mb-1">No videos yet</p>
                          <p className="text-sm">Upload your first video to get started!</p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                          {videos.map((video, index) => (
                            <motion.div
                              key={video._id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.05 }}
                              whileHover={{ scale: 1.02, x: 4 }}
                              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-blue-500/50 hover:bg-slate-800/70 transition-all group cursor-pointer"
                              onClick={() => video.status === 'completed' && handleViewVideo(video._id)}
                            >
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="flex-shrink-0">
                                    {getStatusIcon(video.status)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-medium text-white truncate text-sm mb-1">{video.title}</h3>
                                    <span className="text-xs text-slate-500 flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {new Date(video.createdAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              
                              {video.status === 'completed' && (
                                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-700/50">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewVideo(video._id);
                                    }}
                                    className="flex-1 bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/50 text-blue-300 text-xs h-8"
                                  >
                                    <Play className="w-3 h-3 mr-1" />
                                    Play
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditVideo(video._id);
                                    }}
                                    className="flex-1 bg-purple-600/20 hover:bg-purple-600/30 border-purple-500/50 text-purple-300 text-xs h-8"
                                  >
                                    <Edit3 className="w-3 h-3 mr-1" />
                                    Edit
                                  </Button>
                                  {video.subtitleS3Key && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownload(video.subtitleS3Key!);
                                      }}
                                      className="bg-slate-700/50 hover:bg-slate-700 border-slate-600 text-slate-300 text-xs h-8 px-3"
                                      title="Download subtitles"
                                    >
                                      <Download className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              )}
                              
                              {video.status === 'processing' && video.progress !== undefined && (
                                <div className="mt-3 pt-3 border-t border-slate-700/50">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-slate-400">Processing...</span>
                                    <span className="text-xs text-purple-400 font-medium">{video.progress}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${video.progress}%` }}
                                      className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                                    />
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}
