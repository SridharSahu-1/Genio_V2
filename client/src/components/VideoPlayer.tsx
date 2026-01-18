'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface VideoPlayerProps {
  videoUrl: string;
  subtitleUrl?: string | null;
  title: string;
  onClose?: () => void;
}

export default function VideoPlayer({ videoUrl, subtitleUrl, title, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const subtitleContainerRef = useRef<HTMLDivElement>(null);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [subtitleText, setSubtitleText] = useState<string>('');
  const [subtitleData, setSubtitleData] = useState<any[]>([]);

  // Load and parse ASS subtitle file
  useEffect(() => {
    if (!subtitlesEnabled || !subtitleUrl) {
      setSubtitleText('');
      setSubtitleData([]);
      return;
    }

    const loadSubtitles = async () => {
      try {
        const response = await fetch(subtitleUrl);
        const text = await response.text();
        
        // Simple ASS parser - extract dialogue lines
        const lines = text.split('\n');
        const dialogues: any[] = [];
        let inEvents = false;

        for (const line of lines) {
          if (line.startsWith('[Events]')) {
            inEvents = true;
            continue;
          }
          if (inEvents && line.startsWith('Dialogue:')) {
            // Parse ASS dialogue format: Dialogue: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
            const parts = line.substring(9).split(',');
            if (parts.length >= 4) {
              const start = parts[1].trim();
              const end = parts[2].trim();
              const text = parts.slice(9).join(','); // Text may contain commas
              
              // Convert ASS time to seconds
              const startSeconds = parseAssTime(start);
              const endSeconds = parseAssTime(end);
              
              // Remove ASS formatting codes (basic cleanup)
              const cleanText = text
                .replace(/\\N/g, '\n')
                .replace(/\{[^}]*\}/g, '') // Remove ASS codes like {\k100}
                .trim();

              dialogues.push({
                start: startSeconds,
                end: endSeconds,
                text: cleanText,
              });
            }
          }
        }

        setSubtitleData(dialogues);
      } catch (error) {
        console.error('Failed to load subtitles:', error);
        setSubtitleText('Failed to load subtitles');
      }
    };

    loadSubtitles();
  }, [subtitlesEnabled, subtitleUrl]);

  // Update subtitle display based on video time
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !subtitlesEnabled || subtitleData.length === 0) {
      setSubtitleText('');
      return;
    }

    const updateSubtitle = () => {
      const currentTime = video.currentTime;
      const activeSubtitle = subtitleData.find(
        (sub) => currentTime >= sub.start && currentTime <= sub.end
      );
      setSubtitleText(activeSubtitle ? activeSubtitle.text : '');
    };

    video.addEventListener('timeupdate', updateSubtitle);
    return () => {
      video.removeEventListener('timeupdate', updateSubtitle);
    };
  }, [subtitlesEnabled, subtitleData]);

  const parseAssTime = (timeStr: string): number => {
    // ASS format: H:MM:SS.CC (hours:minutes:seconds.centiseconds)
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

  const toggleSubtitles = () => {
    setSubtitlesEnabled(!subtitlesEnabled);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>{title}</CardTitle>
          <div className="flex gap-2">
            {subtitleUrl && (
              <Button
                variant={subtitlesEnabled ? 'default' : 'outline'}
                size="sm"
                onClick={toggleSubtitles}
              >
                {subtitlesEnabled ? 'Subtitles: ON' : 'Subtitles: OFF'}
              </Button>
            )}
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <video
            ref={videoRef}
            controls
            className="absolute top-0 left-0 w-full h-full rounded-lg"
            style={{ backgroundColor: '#000' }}
          >
            <source src={videoUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          {subtitlesEnabled && subtitleText && (
            <div
              ref={subtitleContainerRef}
              className="absolute bottom-16 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-black bg-opacity-75 text-white text-center rounded max-w-4xl"
              style={{
                pointerEvents: 'none',
                zIndex: 10,
              }}
            >
              <p className="text-lg whitespace-pre-line">{subtitleText}</p>
            </div>
          )}
        </div>
        {!subtitleUrl && (
          <p className="text-sm text-gray-500 mt-2">No subtitles available for this video.</p>
        )}
      </CardContent>
    </Card>
  );
}
