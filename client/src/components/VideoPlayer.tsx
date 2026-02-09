'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize,
  Settings,
  X,
  Subtitles,
  RotateCcw,
  RotateCw,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface VideoPlayerProps {
  videoUrl: string;
  subtitleUrl?: string | null;
  title: string;
  onClose?: () => void;
}

export default function VideoPlayer({ videoUrl, subtitleUrl, title, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [subtitleText, setSubtitleText] = useState<string>('');
  const [subtitleData, setSubtitleData] = useState<any[]>([]);
  const [subtitleLoaded, setSubtitleLoaded] = useState(false);
  const [wordTimings, setWordTimings] = useState<Array<{word: string, start: number, end: number}>>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if subtitle is available
  const hasSubtitles = subtitleUrl !== null && subtitleUrl !== undefined && subtitleUrl !== 'null';

  // Load and parse ASS subtitle file
  useEffect(() => {
    if (!subtitlesEnabled || !subtitleUrl || !hasSubtitles) {
      setSubtitleText('');
      setSubtitleData([]);
      setSubtitleLoaded(false);
      return;
    }

    const loadSubtitles = async () => {
      try {
        console.log('📥 Loading subtitles from:', subtitleUrl);
        setSubtitleLoaded(false);
        const response = await fetch(subtitleUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch subtitles: ${response.status} ${response.statusText}`);
        }
        
        const text = await response.text();
        console.log('✅ Subtitle file loaded, length:', text.length);
        
        if (!text || text.length === 0) {
          throw new Error('Subtitle file is empty');
        }
        
        // Enhanced ASS parser - extract dialogue lines with word-level timing
        const lines = text.split('\n');
        const dialogues: any[] = [];
        let inEvents = false;

        for (const line of lines) {
          if (line.startsWith('[Events]')) {
            inEvents = true;
            continue;
          }
          if (inEvents && line.startsWith('Dialogue:')) {
            const parts = line.substring(9).split(',');
            if (parts.length >= 4) {
              const start = parts[1].trim();
              const end = parts[2].trim();
              const text = parts.slice(9).join(',');
              
              const startSeconds = parseAssTime(start);
              const endSeconds = parseAssTime(end);
              
              // Parse word-level timing from ASS format
              // Format: [Speaker]: {\k{gap}}{\k{duration}}word {\k{duration}}word ...
              // Remove speaker prefix like [Speaker]: 
              let cleanText = text.replace(/^\[[^\]]+\]:\s*/, '').replace(/\\N/g, ' ');
              
              // Parse the timing tags and words sequentially
              // Format: [Speaker]: {\k{gap}}}{\k{duration}}word {\k{duration}}word ...
              const wordsWithTiming: Array<{word: string, start: number, end: number}> = [];
              let currentTime = startSeconds;
              
              // Find all {\k{value}} tags with their positions
              const kTagMatches: Array<{index: number, centiseconds: number, endIndex: number}> = [];
              const kTagRegex = /\{k(\d+)\}/g;
              let match;
              
              while ((match = kTagRegex.exec(cleanText)) !== null) {
                kTagMatches.push({
                  index: match.index,
                  centiseconds: parseInt(match[1], 10),
                  endIndex: match.index + match[0].length
                });
              }
              
              // Process each tag sequentially
              for (let i = 0; i < kTagMatches.length; i++) {
                const tag = kTagMatches[i];
                const nextTag = i + 1 < kTagMatches.length ? kTagMatches[i + 1] : null;
                const seconds = tag.centiseconds / 100;
                
                // Get text after this tag until the next tag or end of string
                const textStart = tag.endIndex;
                const textEnd = nextTag ? nextTag.index : cleanText.length;
                const textAfter = cleanText.substring(textStart, textEnd).trim();
                
                // Remove any remaining tags from the text
                const cleanWord = textAfter.replace(/\{[^}]*\}/g, '').trim();
                
                if (cleanWord) {
                  // This is a word with the specified duration
                  const words = cleanWord.split(/\s+/).filter(w => w.length > 0);
                  if (words.length === 1) {
                    wordsWithTiming.push({
                      word: words[0],
                      start: currentTime,
                      end: currentTime + seconds
                    });
                    currentTime += seconds;
                  } else if (words.length > 1) {
                    // Multiple words, divide duration equally
                    const wordDuration = seconds / words.length;
                    words.forEach((word, idx) => {
                      wordsWithTiming.push({
                        word: word,
                        start: currentTime + idx * wordDuration,
                        end: currentTime + (idx + 1) * wordDuration
                      });
                    });
                    currentTime += seconds;
                  }
                } else {
                  // No text, this is a gap
                  currentTime += seconds;
                }
              }
              
              // Fallback: if no word timings parsed, use simple text split
              const textWithoutTags = cleanText.replace(/\{[^}]*\}/g, '').trim();
              const wordsArray = textWithoutTags.split(/\s+/).filter(w => w.length > 0);
              
              if (wordsWithTiming.length > 0) {
                dialogues.push({
                  start: startSeconds,
                  end: endSeconds,
                  text: textWithoutTags,
                  words: wordsWithTiming
                });
              } else {
                // Fallback: distribute time evenly across words
                dialogues.push({
                  start: startSeconds,
                  end: endSeconds,
                  text: textWithoutTags,
                  words: wordsArray.map((word, idx) => {
                    const segmentDuration = (endSeconds - startSeconds) / wordsArray.length;
                    return {
                      word: word,
                      start: startSeconds + idx * segmentDuration,
                      end: startSeconds + (idx + 1) * segmentDuration
                    };
                  })
                });
              }
            }
          }
        }

        console.log(`✅ Parsed ${dialogues.length} subtitle entries`);
        setSubtitleData(dialogues);
        setSubtitleLoaded(true);
      } catch (error: any) {
        console.error('❌ Failed to load subtitles:', error);
        setSubtitleText(`Failed to load subtitles: ${error.message}`);
        setSubtitleLoaded(false);
      }
    };

    loadSubtitles();
  }, [subtitlesEnabled, subtitleUrl, hasSubtitles]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('volumechange', handleVolumeChange);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('volumechange', handleVolumeChange);
    };
  }, []);

  // Update subtitle display based on video time with word-level highlighting
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !subtitlesEnabled || subtitleData.length === 0) {
      setSubtitleText('');
      setWordTimings([]);
      setCurrentWordIndex(-1);
      return;
    }

    const updateSubtitle = () => {
      const currentTime = video.currentTime;
      const activeSubtitle = subtitleData.find(
        (sub) => currentTime >= sub.start && currentTime <= sub.end
      );
      
      if (activeSubtitle) {
        setSubtitleText(activeSubtitle.text);
        
        // Update word timings and find current word
        if (activeSubtitle.words && activeSubtitle.words.length > 0) {
          setWordTimings(activeSubtitle.words);
          
          // Find the word that should be highlighted
          const wordIndex = activeSubtitle.words.findIndex(
            (word: {word: string, start: number, end: number}) => 
              currentTime >= word.start && currentTime <= word.end
          );
          setCurrentWordIndex(wordIndex >= 0 ? wordIndex : -1);
        } else {
          setWordTimings([]);
          setCurrentWordIndex(-1);
        }
      } else {
        setSubtitleText('');
        setWordTimings([]);
        setCurrentWordIndex(-1);
      }
    };

    updateSubtitle();
    const interval = setInterval(updateSubtitle, 50); // Update more frequently for smooth highlighting
    return () => clearInterval(interval);
  }, [subtitlesEnabled, subtitleData]);

  // Auto-hide controls
  useEffect(() => {
    if (isHovered || !isPlaying) {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      if (isPlaying) {
        controlsTimeoutRef.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isHovered, isPlaying]);

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(Math.min(1, volume + 0.1));
          video.volume = Math.min(1, volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(Math.max(0, volume - 0.1));
          video.volume = Math.max(0, volume - 0.1);
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'c':
        case 'C':
          if (hasSubtitles) {
            setSubtitlesEnabled(!subtitlesEnabled);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [volume, hasSubtitles, subtitlesEnabled]);

  const parseAssTime = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length === 3) {
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const secondsParts = parts[2].split('.');
      const seconds = parseInt(secondsParts[0], 10);
      const centiseconds = parseInt(secondsParts[1] || '0', 10);
      return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
    }
    return 0;
  };

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const progressBar = e.currentTarget;
    if (!video || !progressBar) return;
    
    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    video.currentTime = percent * duration;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    video.muted = newVolume === 0;
  };

  const changePlaybackRate = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSettings(false);
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime += seconds;
  };

  const playbackRates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      className="relative w-full max-w-6xl mx-auto"
    >
      <Card className="overflow-hidden bg-slate-800/50 backdrop-blur-sm border border-slate-700 shadow-2xl">
        <CardHeader className="bg-slate-900/50 border-b border-slate-700">
        <div className="flex justify-between items-center">
            <CardTitle className="text-white text-xl font-semibold">
              {title}
            </CardTitle>
            <div className="flex items-center gap-3">
              {/* Subtitle Status Indicator */}
              {hasSubtitles ? (
                <motion.div 
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/50 rounded-lg"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-emerald-300">Subtitles Available</span>
                </motion.div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-300">No Subtitles</span>
                </div>
              )}
              
              {hasSubtitles && (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant={subtitlesEnabled ? 'default' : 'outline'}
                size="sm"
                    onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
                    className={subtitlesEnabled 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white border-0' 
                      : 'bg-slate-700/50 hover:bg-slate-700 border-slate-600 text-slate-300'
                    }
                  >
                    <Subtitles className="w-4 h-4 mr-2" />
                    {subtitlesEnabled ? 'ON' : 'OFF'}
              </Button>
                </motion.div>
            )}
            {onClose && (
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button 
                variant="ghost" 
                size="sm" 
                    onClick={onClose}
                    className="text-slate-400 hover:text-white hover:bg-slate-700/50"
              >
                    <X className="w-4 h-4" />
              </Button>
                </motion.div>
            )}
          </div>
        </div>
      </CardHeader>
        <CardContent className="p-0">
        <div 
            className="relative w-full bg-black group"
          style={{ paddingBottom: '56.25%' }}
            onMouseEnter={() => {
              setIsHovered(true);
              setShowControls(true);
            }}
          onMouseLeave={() => setIsHovered(false)}
            onMouseMove={() => {
              setShowControls(true);
              if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
              }
              if (isPlaying) {
                controlsTimeoutRef.current = setTimeout(() => {
                  setShowControls(false);
                }, 3000);
              }
            }}
        >
          <video
            ref={videoRef}
              className="absolute top-0 left-0 w-full h-full"
              onClick={togglePlay}
          >
            <source src={videoUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>

            {/* Subtitles Overlay */}
            <AnimatePresence>
              {subtitlesEnabled && subtitleText && subtitleLoaded && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-20 left-1/2 transform -translate-x-1/2 px-6 py-3 bg-black/85 backdrop-blur-sm text-white text-center rounded-lg max-w-4xl border border-white/20 shadow-2xl"
                  style={{ pointerEvents: 'none', zIndex: 10 }}
                >
                  {wordTimings.length > 0 ? (
                    <p className="text-lg font-medium whitespace-pre-line leading-relaxed">
                      {wordTimings.map((wordTiming, index) => (
                        <span
                          key={index}
                          className={index === currentWordIndex ? 'text-yellow-400 font-bold' : ''}
                        >
                          {wordTiming.word}
                          {index < wordTimings.length - 1 ? ' ' : ''}
                        </span>
                      ))}
                    </p>
                  ) : (
                    <p className="text-lg font-medium whitespace-pre-line leading-relaxed">{subtitleText}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Controls Overlay */}
            <AnimatePresence>
              {showControls && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none"
                >
                  {/* Top Controls */}
                  <div className="absolute top-0 left-0 right-0 p-4 flex justify-end gap-2 pointer-events-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSettings(!showSettings)}
                      className="text-white hover:bg-white/20 backdrop-blur-sm border-0"
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                    {showSettings && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        className="absolute top-12 right-4 bg-slate-900 border border-slate-700 rounded-lg p-3 pointer-events-auto shadow-2xl"
                      >
                        <div className="text-white text-sm mb-2 font-semibold">Playback Speed</div>
                        <div className="grid grid-cols-4 gap-1">
                          {playbackRates.map((rate) => (
                            <motion.button
                              key={rate}
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => changePlaybackRate(rate)}
                              className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                                playbackRate === rate
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600'
                              }`}
                            >
                              {rate}x
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    )}
            </div>

                  {/* Center Play Button */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={togglePlay}
                      className="w-20 h-20 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white shadow-2xl"
                    >
                      {isPlaying ? (
                        <Pause className="w-10 h-10" />
                      ) : (
                        <Play className="w-10 h-10 ml-1" />
                      )}
                    </motion.button>
                  </div>

                  {/* Bottom Controls */}
                  <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2 pointer-events-auto">
                    {/* Progress Bar */}
                    <div
                      className="w-full h-1.5 bg-white/20 rounded-full cursor-pointer group/progress hover:h-2 transition-all relative overflow-hidden"
                      onClick={handleSeek}
                    >
                      <motion.div
                        className="h-full bg-blue-600 rounded-full transition-all duration-150"
                        style={{ width: `${(currentTime / duration) * 100}%` }}
                      />
                    </div>

                    {/* Control Buttons */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => skip(-10)}
                          className="text-white hover:bg-white/20 border-0"
                          title="Rewind 10s (←)"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={togglePlay}
                          className="text-white hover:bg-white/20 border-0"
                          title="Play/Pause (Space)"
                        >
                          {isPlaying ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => skip(10)}
                          className="text-white hover:bg-white/20 border-0"
                          title="Forward 10s (→)"
                        >
                          <RotateCw className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-white text-sm font-mono">
                          {formatTime(currentTime)} / {formatTime(duration)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleMute}
                            className="text-white hover:bg-white/20 border-0"
                            title="Mute (M)"
                          >
                            {isMuted || volume === 0 ? (
                              <VolumeX className="w-4 h-4" />
                            ) : (
                              <Volume2 className="w-4 h-4" />
                            )}
                          </Button>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={handleVolumeChange}
                            className="w-20 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={toggleFullscreen}
                          className="text-white hover:bg-white/20 border-0"
                          title="Fullscreen (F)"
                        >
                          {isFullscreen ? (
                            <Minimize className="w-4 h-4" />
                          ) : (
                            <Maximize className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
        </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {/* Keyboard Shortcuts Help */}
          <div className="p-3 bg-slate-900/50 border-t border-slate-700">
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer hover:text-slate-300 font-medium transition-colors">⌨️ Keyboard Shortcuts</summary>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 font-mono">Space</kbd>
                  <span className="text-slate-400">Play/Pause</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 font-mono">←→</kbd>
                  <span className="text-slate-400">Seek</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 font-mono">↑↓</kbd>
                  <span className="text-slate-400">Volume</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 font-mono">M</kbd>
                  <span className="text-slate-400">Mute</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 font-mono">F</kbd>
                  <span className="text-slate-400">Fullscreen</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 font-mono">C</kbd>
                  <span className="text-slate-400">Subtitles</span>
                </div>
              </div>
            </details>
          </div>
      </CardContent>
    </Card>
    </motion.div>
  );
}
