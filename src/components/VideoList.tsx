"use client";

import type { Video } from '@/types';
import VideoCard from './VideoCard';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, Youtube } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


interface VideoListProps {
  videos: Video[];
  onMarkAsWatched: (videoId: string) => void;
  watchedVideoIds: string[];
  isLoading: boolean;
  error: string | null;
  hasChannels: boolean;
  apiKeyIsSet: boolean;
}

export default function VideoList({ videos, onMarkAsWatched, watchedVideoIds, isLoading, error, hasChannels, apiKeyIsSet }: VideoListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="bg-card p-4 rounded-lg shadow-lg animate-pulse">
            <div className="aspect-video bg-secondary rounded mb-4"></div>
            <div className="h-4 bg-secondary rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-secondary rounded w-1/2 mb-2"></div>
            <div className="h-3 bg-secondary rounded w-1/4"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
     return (
      <Alert variant="destructive" className="m-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Fetching Videos</AlertTitle>
        <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
      </Alert>
    );
  }
  
  const unWatchedVideos = videos.filter(video => !watchedVideoIds.includes(video.id));

  if (!apiKeyIsSet) {
     // Message for API key is shown in Home page, so this can be minimal or null
     return null;
  }

  if (!hasChannels && apiKeyIsSet) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Youtube className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-headline mb-2">No Channels Added</h2>
        <p className="text-muted-foreground">Add some YouTube channels using their Channel ID to see videos here.</p>
      </div>
    );
  }
  
  if (unWatchedVideos.length === 0 && hasChannels && apiKeyIsSet && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-headline mb-2">All Caught Up!</h2>
        <p className="text-muted-foreground">No new (non-Short) videos to display, or all videos have been marked as watched.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8 p-6">
        {unWatchedVideos.map(video => (
          <VideoCard
            key={`${video.channelId}-${video.id}`}
            video={video}
            onMarkAsWatched={onMarkAsWatched}
            isWatched={watchedVideoIds.includes(video.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
