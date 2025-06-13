"use client";

import { useCallback, useEffect, useState, useMemo } from 'react';
import type { Channel, Video, ParsedFeed } from '@/types';
import { useChannels } from '@/hooks/useChannels';
import { useWatchedVideos } from '@/hooks/useWatchedVideos';
import ChannelManagementPanel from '@/components/ChannelManagementPanel';
import VideoList from '@/components/VideoList';
import { parseYouTubeRss } from '@/lib/clientRssParser';
import { toast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

export default function Home() {
  const { channels, addChannel, removeChannel, reorderChannels } = useChannels();
  const { watchedVideoIds, addWatchedVideo, isVideoWatched } = useWatchedVideos();
  const [allVideos, setAllVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVideosForChannel = useCallback(async (channel: Channel): Promise<Video[]> => {
    const response = await fetch(`/api/fetch-rss?url=${encodeURIComponent(channel.rssUrl)}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({error: "Failed to parse error response"}));
      throw new Error(`Failed to fetch feed for ${channel.name}: ${errorData.error || response.statusText}`);
    }
    const xmlText = await response.text();
    const parsedFeed: ParsedFeed = parseYouTubeRss(xmlText);

    return parsedFeed.videos.map(pv => {
      const publishedDate = new Date(pv.publishedDate);
      const hoursSincePosting = Math.max(0.1, (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60)); // Min 0.1 hour to avoid div by zero
      const rating = pv.views / hoursSincePosting;
      return {
        ...pv,
        channelName: parsedFeed.channelTitle || channel.name,
        channelRssUrl: channel.rssUrl,
        rating: rating || 0,
      };
    });
  }, []);

  const aggregateAndSortVideos = useCallback(async (forceRefresh = false) => {
    if (channels.length === 0) {
      setAllVideos([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Basic caching logic: if not force refreshing and videos exist, don't re-fetch.
      // A more robust cache would involve timestamps. For now, this simplifies.
      if (!forceRefresh && allVideos.length > 0 && 
          channels.every(c => allVideos.some(v => v.channelRssUrl === c.rssUrl)) &&
          allVideos.length >= channels.reduce((sum, c) => sum + 1, 0) // Heuristic: assume at least 1 video per channel
         ) {
         // If videos are already populated and channels haven't changed drastically, re-sort/filter
         // This simple check isn't perfect for new videos, forceRefresh handles that.
         const refreshedAndSorted = allVideos
            .map(v => { // Recalculate rating as time passes
                const publishedDate = new Date(v.publishedDate);
                const hoursSincePosting = Math.max(0.1, (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
                return {...v, rating: v.views / hoursSincePosting };
            })
            .sort((a, b) => b.rating - a.rating);
         setAllVideos(refreshedAndSorted);
         setIsLoading(false);
         return;
      }

      const videoPromises = channels.map(channel => fetchVideosForChannel(channel));
      const results = await Promise.allSettled(videoPromises);
      
      const fetchedVideos: Video[] = [];
      let fetchErrorOccurred = false;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          fetchedVideos.push(...result.value);
        } else {
          console.error(`Error fetching videos for ${channels[index].name}:`, result.reason);
          setError(prevError => prevError ? `${prevError}\nCould not load videos for ${channels[index].name}.` : `Could not load videos for ${channels[index].name}.`);
          fetchErrorOccurred = true;
        }
      });
      
      if (fetchedVideos.length === 0 && fetchErrorOccurred && channels.length > 0) {
         // If all fetches fail but there are channels, this is a total failure.
         // setError would be populated by individual errors.
      } else if (fetchedVideos.length === 0 && channels.length > 0 && !fetchErrorOccurred) {
        // No videos found but no errors (e.g., empty feeds)
        toast({ title: "No Videos Found", description: "The selected channels might not have any videos or feeds are empty." });
      }


      const sortedVideos = fetchedVideos.sort((a, b) => b.rating - a.rating);
      setAllVideos(sortedVideos);

    } catch (e) {
      console.error("Error aggregating videos:", e);
      const message = e instanceof Error ? e.message : "An unknown error occurred during video aggregation.";
      setError(message);
      setAllVideos([]); // Clear videos on major aggregation error
    } finally {
      setIsLoading(false);
    }
  }, [channels, fetchVideosForChannel, allVideos]);


  useEffect(() => {
    aggregateAndSortVideos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]); // Rerun when channels list (identities) changes. `aggregateAndSortVideos` itself has `channels` in its dep array.

  const handleRefreshVideos = () => {
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
      <aside className="w-full md:w-1/3 lg:w-1/4 p-4 md:p-6 border-r border-border md:min-h-screen md:sticky md:top-0">
        <div className="hidden md:block mb-6">
         <h1 className="text-3xl font-headline text-primary">Science Video Viewer</h1>
         <p className="text-sm text-muted-foreground">Discover and rank science content.</p>
        </div>
        <ChannelManagementPanel
          channels={channels}
          onAddChannel={addChannel}
          onRemoveChannel={removeChannel}
          onReorderChannels={reorderChannels}
          onRefreshVideos={handleRefreshVideos}
        />
      </aside>
      <Separator orientation="vertical" className="hidden md:block h-auto sticky top-0" />
      <main className="flex-1 md:overflow-y-auto">
        <VideoList
          videos={memoizedFilteredVideos}
          onMarkAsWatched={addWatchedVideo}
          watchedVideoIds={watchedVideoIds}
          isLoading={isLoading}
          error={error}
          hasChannels={channels.length > 0}
        />
      </main>
    </div>
  );
}
