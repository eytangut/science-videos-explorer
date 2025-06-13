"use client";

import { useCallback, useEffect, useState, useMemo } from 'react';
import type { Channel, Video, YouTubePlaylistItem, YouTubeVideoDetails } from '@/types';
import { useChannels } from '@/hooks/useChannels';
import { useWatchedVideos } from '@/hooks/useWatchedVideos';
import ChannelManagementPanel from '@/components/ChannelManagementPanel';
import VideoList from '@/components/VideoList';
import { toast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { fetchChannelUploadsPlaylistId, fetchPlaylistVideos, fetchVideosDetails, parseISO8601Duration } from '@/lib/youtubeDataApi';
import useLocalStorage from '@/hooks/useLocalStorage';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from 'lucide-react';


export default function Home() {
  const { channels, addChannel, removeChannel, reorderChannels } = useChannels();
  const { watchedVideoIds, addWatchedVideo, isVideoWatched } = useWatchedVideos();
  const [allVideos, setAllVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useLocalStorage<string>('youtubeApiKey', '');

  const handleSetApiKey = (newApiKey: string) => {
    setApiKey(newApiKey);
    // Optionally, trigger a refresh or provide feedback
    if (newApiKey && channels.length > 0) {
      aggregateAndSortVideos(true, newApiKey);
    }
  };

  const fetchVideosForChannel = useCallback(async (channel: Channel, currentApiKey: string): Promise<Video[]> => {
    if (!currentApiKey) {
      throw new Error("API Key is not set. Please configure it in the Channel Setup panel.");
    }

    const uploadsPlaylistId = await fetchChannelUploadsPlaylistId(currentApiKey, channel.youtubeChannelId);
    if (!uploadsPlaylistId) {
      throw new Error(`Could not find uploads playlist for channel: ${channel.name}`);
    }

    const playlistItems: YouTubePlaylistItem[] = await fetchPlaylistVideos(currentApiKey, uploadsPlaylistId, 20); // Fetch more items
    
    const videoIds = playlistItems.map(item => item.contentDetails.videoId).filter(id => !!id);
    if (videoIds.length === 0) return [];

    const videoDetailsList: YouTubeVideoDetails[] = await fetchVideosDetails(currentApiKey, videoIds);

    return videoDetailsList
      .map(details => {
        const playlistItem = playlistItems.find(pi => pi.contentDetails.videoId === details.id);
        if (!playlistItem) return null;

        const publishedDate = new Date(details.snippet.publishedAt);
        const hoursSincePosting = Math.max(0.1, (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
        const views = parseInt(details.statistics.viewCount, 10) || 0;
        
        // New rating: views / (hoursSincePosting + 5)^0.7
        const rating = views / (Math.pow(hoursSincePosting + 5, 0.7));
        
        const durationSeconds = parseISO8601Duration(details.contentDetails.duration);

        // Filter out shorts (duration <= 60 seconds)
        if (durationSeconds <= 60) {
          return null;
        }

        return {
          id: details.id,
          title: details.snippet.title,
          link: `https://www.youtube.com/watch?v=${details.id}`,
          thumbnailUrl: details.snippet.thumbnails.medium?.url || details.snippet.thumbnails.standard?.url || `https://placehold.co/480x360.png?text=${encodeURIComponent(details.snippet.title)}`,
          publishedDate: details.snippet.publishedAt,
          views: views,
          channelName: details.snippet.channelTitle,
          channelId: details.snippet.channelId,
          rating: rating || 0,
          durationSeconds: durationSeconds,
        };
      })
      .filter(video => video !== null) as Video[];
  }, []);


  const aggregateAndSortVideos = useCallback(async (forceRefresh = false, currentApiKey = apiKey) => {
    if (!currentApiKey) {
      setError("YouTube API Key is not set. Please add it in the Channel Setup panel to fetch videos.");
      setAllVideos([]);
      setIsLoading(false);
      return;
    }
    if (channels.length === 0) {
      setAllVideos([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (!forceRefresh && allVideos.length > 0 &&
          channels.every(c => allVideos.some(v => v.channelId === c.youtubeChannelId)) &&
          allVideos.length >= channels.length 
         ) {
         const refreshedAndSorted = allVideos
            .map(v => { 
                const publishedDate = new Date(v.publishedDate);
                const hoursSincePosting = Math.max(0.1, (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
                const rating = v.views / (Math.pow(hoursSincePosting + 5, 0.7));
                return {...v, rating: rating || 0 };
            })
            .sort((a, b) => b.rating - a.rating);
         setAllVideos(refreshedAndSorted);
         setIsLoading(false);
         return;
      }

      const videoPromises = channels.map(channel => fetchVideosForChannel(channel, currentApiKey));
      const results = await Promise.allSettled(videoPromises);
      
      const fetchedVideos: Video[] = [];
      let fetchErrorOccurred = false;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          fetchedVideos.push(...result.value);
        } else {
          console.error(`Error fetching videos for ${channels[index].name}:`, result.reason);
          const reasonMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
          setError(prevError => prevError ? `${prevError}\nCould not load videos for ${channels[index].name}: ${reasonMessage}` : `Could not load videos for ${channels[index].name}: ${reasonMessage}`);
          fetchErrorOccurred = true;
        }
      });
      
      if (fetchedVideos.length === 0 && fetchErrorOccurred && channels.length > 0) {
        // setError is already populated
      } else if (fetchedVideos.length === 0 && channels.length > 0 && !fetchErrorOccurred) {
        toast({ title: "No Videos Found", description: "The selected channels might not have any (non-Short) videos or feeds are empty." });
      }

      const uniqueVideos = Array.from(new Map(fetchedVideos.map(video => [video.id, video])).values());
      const sortedVideos = uniqueVideos.sort((a, b) => b.rating - a.rating);
      setAllVideos(sortedVideos);

    } catch (e) {
      console.error("Error aggregating videos:", e);
      const message = e instanceof Error ? e.message : "An unknown error occurred during video aggregation.";
      setError(message);
      setAllVideos([]);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, fetchVideosForChannel, allVideos, apiKey]);


  useEffect(() => {
    if (apiKey && channels.length > 0) {
        aggregateAndSortVideos();
    } else if (!apiKey && channels.length > 0) {
        setError("YouTube API Key is not set. Please add it in the Channel Setup panel to fetch videos.");
        setAllVideos([]);
    } else if (apiKey && channels.length === 0) {
        setAllVideos([]); // Clear videos if API key exists but no channels
        setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, apiKey]); // Rerun when channels list or API key changes.

  const handleRefreshVideos = () => {
    if (!apiKey) {
      toast({ title: "API Key Required", description: "Please set your YouTube API Key before refreshing.", variant: "destructive"});
      return;
    }
    toast({ title: "Refreshing Videos...", description: "Fetching the latest videos from all channels." });
    aggregateAndSortVideos(true); // Pass true to force refresh
  }

  const memoizedFilteredVideos = useMemo(() => {
    return allVideos.filter(video => !isVideoWatched(video.id));
  }, [allVideos, isVideoWatched]);


  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background text-foreground">
      <header className="md:hidden p-4 border-b border-border sticky top-0 bg-background z-10">
        <h1 className="text-3xl font-headline text-primary">Science Video Viewer</h1>
      </header>
      <aside className="w-full md:w-[380px] lg:w-[420px] p-4 md:p-6 border-r border-border md:min-h-screen md:sticky md:top-0 shrink-0">
        <div className="hidden md:block mb-6">
         <h1 className="text-3xl font-headline text-primary">Science Video Viewer</h1>
         <p className="text-sm text-muted-foreground">Discover and rank science content from YouTube.</p>
        </div>
        <ChannelManagementPanel
          channels={channels}
          onAddChannel={addChannel}
          onRemoveChannel={removeChannel}
          onReorderChannels={reorderChannels}
          onRefreshVideos={handleRefreshVideos}
          apiKey={apiKey}
          onSetApiKey={handleSetApiKey}
          isLoadingVideos={isLoading}
        />
      </aside>
      <Separator orientation="vertical" className="hidden md:block h-auto sticky top-0" />
      <main className="flex-1 md:overflow-y-auto">
        {!apiKey && (
          <Alert variant="default" className="m-6 bg-primary/10 border-primary/30">
            <Info className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary">API Key Needed</AlertTitle>
            <AlertDescription>
              Please set your YouTube Data API Key in the &quot;Channel Setup&quot; panel on the left to start fetching videos.
              Make sure to restrict your API key in the Google Cloud Console for security.
            </AlertDescription>
          </Alert>
        )}
        <VideoList
          videos={memoizedFilteredVideos}
          onMarkAsWatched={addWatchedVideo}
          watchedVideoIds={watchedVideoIds}
          isLoading={isLoading && !!apiKey}
          error={error}
          hasChannels={channels.length > 0}
          apiKeyIsSet={!!apiKey}
        />
      </main>
    </div>
  );
}
