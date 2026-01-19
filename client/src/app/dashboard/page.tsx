'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import VideoPlayer from '@/components/VideoPlayer';
import api from '@/lib/api';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import { toast } from 'sonner';

interface Video {
  _id: string;
  title: string
  status: string;
  createdAt: string;
  subtitleKey?: string;
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
  const [file, setFile] = useState<File | null>(null);
  const [playingVideo, setPlayingVideo] = useState<PlaybackData | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchVideos();

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

    socket.on('video-completed', ({ videoId }) => {
      setVideos((prev) => prev.map(v => v._id === videoId ? { ...v, status: 'completed', progress: 100 } : v));
      toast.success('Video processing completed!');
    });

    socket.on('video-failed', ({ videoId, reason }) => {
       console.error(`Video ${videoId} failed:`, reason); // Log to console for debugging
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
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return alert('Please select a file');
    setUploading(true);

    try {
      // DIRECT UPLOAD - Upload directly to server (bypasses S3)
      console.log(`📤 Uploading file directly to server: ${file.name}`);
      
      const formData = new FormData();
      formData.append('file', file);
      
      // Use api instance which has auth interceptor
      // For FormData, don't set Content-Type - browser will set it with boundary
      const uploadRes = await api.post('/api/videos/upload-direct', formData, {
        headers: {
          'Content-Type': undefined, // Let browser set Content-Type with boundary for multipart
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            console.log(`Upload progress: ${percentCompleted}%`);
          }
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      
      const { videoId } = uploadRes.data;
      console.log('✅ File uploaded successfully to server');
      console.log(`   Video ID: ${videoId}`);
      
      // Verify upload
      try {
        const verifyRes = await api.post('/api/videos/verify', { videoId });
        if (verifyRes.data.verified) {
          console.log('✅ Upload verified');
        }
      } catch (verifyError: any) {
        console.warn('⚠️  Verification failed:', verifyError.message);
        // Continue anyway - file is uploaded
      }
      
      // Start processing immediately
      try {
        await api.post('/api/videos/process', { videoId });
        toast.success('Video uploaded and processing started!');
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
        
        console.error(`Error details:`, {
          status,
          statusText,
          data,
        });
      } else if (uploadError.request) {
        console.error('No response received:', uploadError.request);
        errorMessage = 'Upload failed: No response from server. Check your network connection.';
      } else {
        errorMessage = `Upload failed: ${uploadError.message}`;
      }
      
      toast.error(errorMessage);
    } finally {
      setUploading(false);
      setFile(null);
    }
  };

  const handleDownload = async (subtitleKey: string) => {
    try {
      // Clean the key just in case, though backend handles it
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
      const res = await api.get(`/api/videos/playback/${videoId}`);
      setPlayingVideo({
        videoUrl: res.data.videoUrl,
        subtitleUrl: res.data.subtitleUrl,
        docId: res.data.docId,
        title: res.data.title,
      });
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to load video');
    }
  };

  return (
    <div className="p-8">
      {playingVideo ? (
        <div className="mb-8 animate-fadeIn">
          <VideoPlayer
            videoUrl={playingVideo.videoUrl}
            subtitleUrl={playingVideo.subtitleUrl}
            title={playingVideo.title}
            onClose={() => {
              // Animation will be handled by the component
              setPlayingVideo(null);
            }}
          />
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold">Welcome, {user?.username}</h1>
            <Button onClick={logout} variant="outline">Logout</Button>
          </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>New Project</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Video File</Label>
              <Input type="file" onChange={handleFileChange} accept="video/*" />
            </div>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload & Process'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Videos</CardTitle>
          </CardHeader>
          <CardContent>
            {videos.length === 0 ? (
              <p>No videos found.</p>
            ) : (
              <ul className="space-y-2">
                {videos.map((video) => (
                  <li key={video._id} className="p-4 border rounded flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                        <div>
                        <p className="font-semibold">{video.title}</p>
                        <p className="text-sm text-gray-500">{new Date(video.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                            video.status === 'completed' ? 'bg-green-100 text-green-800' :
                            video.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                            video.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                        }`}>
                            {video.status} {video.status === 'processing' && `(${video.progress || 0}%)`}
                        </span>
                        {video.status === 'completed' && (
                          <div className="flex gap-2">
                            <Button variant="default" size="sm" onClick={() => handleViewVideo(video._id)}>
                              View
                            </Button>
                            {video.subtitleKey && (
                              <Button variant="ghost" size="sm" onClick={() => handleDownload(video.subtitleKey!)}>
                                Download Subs
                              </Button>
                            )}
                          </div>
                        )}
                        </div>
                    </div>
                    
                    {/* Log Window */}
                    {logs[video._id] && logs[video._id].length > 0 && (
                        <div className="bg-black text-green-400 text-xs p-2 rounded h-32 overflow-y-auto font-mono">
                            {logs[video._id].map((log, i) => (
                                <div key={i}>{log}</div>
                            ))}
                        </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
        </>
      )}
    </div>
  );
}

