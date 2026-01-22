'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import VideoPlayer from '@/components/VideoPlayer';
import SubtitleGenerationAnimation from '@/components/SubtitleGenerationAnimation';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
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
  FileCheck
} from 'lucide-react';

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
  const { user, logout } = useAuth();
  const [videos, setVideos] = useState<Video[]>([]);
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [playingVideo, setPlayingVideo] = useState<PlaybackData | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchVideos();
    
    // Show onboarding for first-time users (check from videos count)
    if (videos.length === 0) {
      // Will be set after videos are fetched
    }

    const socket = io('http://localhost:5001');

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
      
      // Update local state immediately with subtitleS3Key
      setVideos((prev) => prev.map(v => 
        v._id === videoId 
          ? { ...v, status: 'completed', progress: 100, subtitleS3Key: subtitleS3Key || v.subtitleS3Key } 
          : v
      ));
      
      // Refresh videos from database to get the latest subtitleS3Key
      setTimeout(() => {
        fetchVideos();
      }, 500); // Small delay to ensure DB is updated
      
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
  }, []);

  const fetchVideos = async () => {
    try {
      const res = await api.get('/api/videos');
      setVideos(res.data);
      
      // Show onboarding if no videos and first time
      if (res.data.length === 0 && !showOnboarding) {
        setShowOnboarding(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

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
        setUploadProgress(50); // URL upload is faster
        console.log(`📤 Uploading video from URL: ${videoUrl}`);
        
        uploadRes = await api.post('/api/videos/upload-url', {
          url: videoUrl.trim(),
        });
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
      }, 1000);
    }
  };

  const handleDownload = async (subtitleKey: string) => {
    try {
      const filename = subtitleKey.split('/').pop(); 
      const res = await api.get(`/api/videos/download/${filename}`);
      window.open(res.data.url, '_blank');
    } catch (err) {
      console.error(err);
      toast.error('Download failed');
    }
  };

  const handleViewVideo = async (videoId: string) => {
    try {
      console.log(`📥 Fetching playback URLs for video: ${videoId}`);
      
      // First, get the video from the list to check subtitleS3Key
      const video = videos.find(v => v._id === videoId);
      console.log(`   Video from state:`, video);
      console.log(`   Video subtitleS3Key:`, video?.subtitleS3Key);
      
      const res = await api.get(`/api/videos/playback/${videoId}`);
      console.log('✅ Playback URLs received:', res.data);
      console.log('   Subtitle URL:', res.data.subtitleUrl);
      console.log('   Subtitle URL type:', typeof res.data.subtitleUrl);
      console.log('   Subtitle URL value:', res.data.subtitleUrl);
      
      // Handle subtitle URL - check for null, undefined, or string "null"
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
        console.warn('⚠️  No subtitle URL provided for video');
        // Check if video has subtitleS3Key but URL generation failed
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

  const processingVideos = videos.filter(v => v.status === 'processing');
  const completedVideos = videos.filter(v => v.status === 'completed');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Subtle animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 p-6 md:p-8 lg:p-12 max-w-7xl mx-auto">
        {playingVideo ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="mb-8"
          >
            <VideoPlayer
              videoUrl={playingVideo.videoUrl}
              subtitleUrl={playingVideo.subtitleUrl}
              title={playingVideo.title}
              onClose={() => setPlayingVideo(null)}
            />
          </motion.div>
        ) : (
          <>
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold mb-2 text-white">
                  Welcome back, {user?.username}
                </h1>
                <p className="text-slate-400">AI-powered video subtitle generation</p>
              </div>
              <Button 
                onClick={logout} 
                variant="outline"
                className="bg-slate-800/50 hover:bg-slate-700/50 border-slate-700 text-white"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>

            {/* Onboarding Modal */}
            <AnimatePresence>
              {showOnboarding && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                  onClick={() => {
                    setShowOnboarding(false);
                  }}
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
                      onClick={() => {
                        setShowOnboarding(false);
                      }}
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
                          <p className="text-slate-400 text-sm">Upload a video file or paste a URL to get started</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-purple-500/20 rounded-lg">
                          <Sparkles className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-white mb-1">2. AI Generates Subtitles</h3>
                          <p className="text-slate-400 text-sm">Our AI automatically transcribes and generates accurate subtitles</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-green-500/20 rounded-lg">
                          <Play className="w-6 h-6 text-green-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-white mb-1">3. Watch with Subtitles</h3>
                          <p className="text-slate-400 text-sm">Play your video with synchronized subtitles and download them</p>
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      onClick={() => {
                        setShowOnboarding(false);
                        localStorage.setItem('hasSeenOnboarding', 'true');
                      }}
                      className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Get Started
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Upload Section */}
              <div className="lg:col-span-2">
                <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-xl">
                  <CardHeader className="border-b border-slate-700">
                    <CardTitle className="text-xl font-semibold text-white flex items-center gap-2">
                      <Upload className="w-5 h-5 text-blue-400" />
                      Upload Video
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <div className="flex gap-2">
                      <Button
                        variant={uploadMode === 'file' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setUploadMode('file')}
                        className={`flex-1 ${
                          uploadMode === 'file'
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-slate-700/50 hover:bg-slate-700 border-slate-600 text-slate-300'
                        }`}
                      >
                        <FileVideo className="w-4 h-4 mr-2" />
                        File
                      </Button>
                      <Button
                        variant={uploadMode === 'url' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setUploadMode('url')}
                        className={`flex-1 ${
                          uploadMode === 'url'
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-slate-700/50 hover:bg-slate-700 border-slate-600 text-slate-300'
                        }`}
                      >
                        <LinkIcon className="w-4 h-4 mr-2" />
                        URL
                      </Button>
                    </div>
                    
                    {uploadMode === 'file' ? (
                      <div className="space-y-2">
                        <Label className="text-slate-300">Video File</Label>
                        <Input 
                          type="file" 
                          onChange={handleFileChange} 
                          accept="video/*"
                          className="bg-slate-900/50 border-slate-600 text-white file:bg-blue-600 file:text-white file:border-0 file:rounded file:px-4 file:py-2"
                        />
                        {file && (
                          <p className="text-sm text-slate-400 flex items-center gap-2">
                            <FileCheck className="w-4 h-4 text-green-400" />
                            {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label className="text-slate-300">Video URL</Label>
                        <Input
                          type="url"
                          placeholder="https://example.com/video.mp4"
                          value={videoUrl}
                          onChange={(e) => setVideoUrl(e.target.value)}
                          className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                        />
                      </div>
                    )}

                    {/* Upload Progress */}
                    {uploading && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">Uploading...</span>
                          <span className="text-slate-300 font-medium">{uploadProgress}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${uploadProgress}%` }}
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                          />
                        </div>
                      </div>
                    )}
                    
                    <Button 
                      onClick={handleUpload} 
                      disabled={uploading}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload & Generate Subtitles
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Processing Videos */}
                {processingVideos.length > 0 && (
                  <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-xl mt-6">
                    <CardHeader className="border-b border-slate-700">
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
              <div>
                <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-xl h-full">
                  <CardHeader className="border-b border-slate-700">
                    <CardTitle className="text-xl font-semibold text-white flex items-center gap-2">
                      <Video className="w-5 h-5 text-blue-400" />
                      Your Videos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {videos.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <Video className="w-16 h-16 mx-auto mb-4 opacity-30" />
                        <p>No videos yet. Upload your first video!</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                        {videos.map((video) => (
                          <motion.div
                            key={video._id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {getStatusIcon(video.status)}
                                <h3 className="font-medium text-white truncate text-sm">{video.title}</h3>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between mt-3">
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(video.createdAt).toLocaleDateString()}
                              </span>
                              
                              {video.status === 'completed' && (
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleViewVideo(video._id)}
                                    className="bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/50 text-blue-300 text-xs px-2 py-1 h-auto"
                                  >
                                    <Play className="w-3 h-3 mr-1" />
                                    Play
                                  </Button>
                                  {video.subtitleS3Key && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDownload(video.subtitleS3Key!)}
                                      className="bg-slate-700/50 hover:bg-slate-700 border-slate-600 text-slate-300 text-xs px-2 py-1 h-auto"
                                    >
                                      <Download className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
