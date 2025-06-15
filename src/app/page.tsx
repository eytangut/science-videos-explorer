
"use client";

import { useCallback, useEffect, useState, useMemo } from 'react';
import type { Channel, Video } from '@/types';
import { useChannels } from '@/hooks/useChannels';
import { useWatchedVideos } from '@/hooks/useWatchedVideos';
import { useWatchLaterVideos } from '@/hooks/useWatchLaterVideos';
import { useHiddenOnMobileVideos } from '@/hooks/useHiddenOnMobileVideos';
import { useIsMobile } from '@/hooks/use-mobile';
import ChannelManagementPanel from '@/components/ChannelManagementPanel';
import VideoList from '@/components/VideoList';
import { toast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { fetchChannelPopularVideoIdsFromSearch, fetchVideosDetails } from '@/lib/youtubeDataApi';
import useLocalStorage from '@/hooks/useLocalStorage';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from 'lucide-react';

type SortOption = {
  property: keyof Pick<Video, 'rating' | 'views' | 'publishedDate' | 'title'>;
  direction: 'asc' | 'desc';
};

type DurationFilter = 'all' | 'short' | 'medium' | 'long';
type WatchLaterFilter = 'all' | 'watchLaterOnly' | 'notWatchLater';

// Fisher-Yates (Knuth) Shuffle
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

export default function Home() {
  const { channels, addChannel, removeChannel, reorderChannels } = useChannels();
  const { watchedVideoIds, addWatchedVideo, isVideoWatched } = useWatchedVideos();
  const { watchLaterVideoIds, toggleWatchLater, isVideoWatchLater } = useWatchLaterVideos();
  const { hiddenOnMobileVideoIds, addHiddenOnMobileVideo, isVideoHiddenOnMobile } = useHiddenOnMobileVideos();
  const isMobile = useIsMobile();
  
  const [cachedVideos, setCachedVideos] = useLocalStorage<Video[]>('allVideosCache', []);
  const [baseShuffledVideos, setBaseShuffledVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useLocalStorage<string>('youtubeApiKey', '');

  const [sortOption, setSortOption] = useState<SortOption>({ property: 'rating', direction: 'desc' });
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');
  const [watchLaterFilter, setWatchLaterFilter] = useState<WatchLaterFilter>('all');
  const [isClientMounted, setIsClientMounted] = useState(false);

  useEffect(() => {
    setIsClientMounted(true);
  }, []);


  const handleSetApiKey = (newApiKey: string) => {
    setApiKey(newApiKey);
    if (newApiKey && channels.length > 0 && cachedVideos.length === 0) {
      aggregateAndSortVideos(false, newApiKey);
    } else if (!newApiKey) {
      setError("API Key removed. Videos are shown from cache. Set API Key to fetch new videos.");
    }
  };

  const fetchVideosForChannel = useCallback(async (channel: Channel, currentApiKey: string): Promise<Video[]> => {
    if (!currentApiKey) {
      throw new Error("API Key is not set. Please configure it in the Channel Setup panel.");
    }
    const videoIds = await fetchChannelPopularVideoIdsFromSearch(currentApiKey, channel.youtubeChannelId, 20);
    if (videoIds.length === 0) return [];
    const videoDetailsList = await fetchVideosDetails(currentApiKey, videoIds);

    return videoDetailsList
      .map(details => {
        const durationSeconds = parseISO8601Duration(details.contentDetails.duration);
        const views = parseInt(details.statistics.viewCount, 10) || 0;
        // Rating is now just views
        const rating = views; 
        
        return {
          id: details.id,
          title: details.snippet.title,
          link: `https://www.youtube.com/watch?v=${details.id}`,
          thumbnailUrl: details.snippet.thumbnails.medium?.url || details.snippet.thumbnails.standard?.url || `https://placehold.co/480x360.png?text=${encodeURIComponent(details.snippet.title)}`,
          publishedDate: details.snippet.publishedAt,
          views: views,
          channelName: details.snippet.channelTitle,
          channelId: details.snippet.channelId,
          rating: rating,
          durationSeconds: durationSeconds,
        };
      })
      .filter(video => video !== null) as Video[];
  }, []);


  const aggregateAndSortVideos = useCallback(async (forceRefresh = false, currentApiKey = apiKey) => {
    if (!currentApiKey) {
      setError("YouTube API Key is not set. Please add it in the Channel Setup panel to fetch videos.");
      setIsLoading(false);
      return;
    }
    if (channels.length === 0) {
      setCachedVideos([]); 
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    if (forceRefresh || cachedVideos.length === 0) { 
        try {
          const videoPromises = channels.map(channel => fetchVideosForChannel(channel, currentApiKey));
          const results = await Promise.allSettled(videoPromises);
          
          const fetchedVideosFromAPI: Video[] = [];
          let fetchErrorOccurred = false;
          results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              fetchedVideosFromAPI.push(...result.value);
            } else {
              console.error(`Error fetching videos for ${channels[index].name}:`, result.reason);
              const reasonMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
              setError(prevError => prevError ? `${prevError}\nCould not load videos for ${channels[index].name}: ${reasonMessage}` : `Could not load videos for ${channels[index].name}: ${reasonMessage}`);
              fetchErrorOccurred = true;
            }
          });
          
          if (fetchedVideosFromAPI.length === 0 && fetchErrorOccurred && channels.length > 0) {
            // Error already set
          } else if (fetchedVideosFromAPI.length === 0 && channels.length > 0 && !fetchErrorOccurred) {
            toast({ title: "No Videos Found", description: "The selected channels might not have any videos, or all videos are shorter than 3 minutes." });
          }
          
          const uniqueVideosFromAPI = Array.from(new Map(fetchedVideosFromAPI.map(video => [video.id, video])).values());
          const finalUniqueVideos = uniqueVideosFromAPI.filter(v => v.durationSeconds > 180); 

          setCachedVideos(finalUniqueVideos); // This will trigger the useEffect for setBaseShuffledVideos

        } catch (e) {
          console.error("Error aggregating videos:", e);
          const message = e instanceof Error ? e.message : "An unknown error occurred during video aggregation.";
          setError(message);
          setCachedVideos([]); 
        } finally {
          setIsLoading(false);
        }
    } else {
        setIsLoading(false);
    }
  }, [channels, fetchVideosForChannel, apiKey, setCachedVideos, cachedVideos.length]);

  // Effect to fetch videos on initial mount if cache is empty, or when channels/API key change significantly
  useEffect(() => {
    if (!isClientMounted) return;
    if (apiKey && channels.length > 0) {
        if (cachedVideos.length === 0) { 
           aggregateAndSortVideos(false); // Initial fetch if cache is empty
        }
    } else if (!apiKey && channels.length > 0) {
        setError("YouTube API Key is not set. Please add it to fetch videos.");
    } else if (channels.length === 0) {
        setCachedVideos([]); 
        setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, channels.length, isClientMounted]); // Only re-evaluate core fetching logic on these changes, not cachedVideos itself


  // This useEffect hook is responsible for creating the base shuffled list.
  // It runs ONLY when `cachedVideos` (data from API/localStorage) or `channels` change.
  // The `sortOption` used here for per-channel sorting will be the one active
  // at the time this effect runs.
  useEffect(() => {
    if (!isClientMounted || cachedVideos.length === 0) {
      setBaseShuffledVideos([]);
      return;
    }
  
    const videosByChannel = new Map<string, Video[]>();
    for (const video of cachedVideos) {
      if (!videosByChannel.has(video.channelId)) {
        videosByChannel.set(video.channelId, []);
      }
      videosByChannel.get(video.channelId)!.push(video);
    }
  
    // Sort within each channel using the CURRENT sortOption
    // This defines what "top" means when picking from each channel for interleaving.
    videosByChannel.forEach(channelVideos => {
      channelVideos.sort((a, b) => {
        const valA = a[sortOption.property];
        const valB = b[sortOption.property];
        let comparison = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        } else if (typeof valA === 'string' && typeof valB === 'string') {
          comparison = valA.localeCompare(valB);
        } else if (sortOption.property === 'publishedDate') {
          comparison = new Date(valA as string).getTime() - new Date(valB as string).getTime();
        }
        return sortOption.direction === 'asc' ? comparison : -comparison;
      });
    });
  
    const activeChannelIdsInOrder = channels.map(c => c.youtubeChannelId);
    const combinedVideosForShuffle: Video[] = [];
    const channelVideoIndices = new Map<string, number>(activeChannelIdsInOrder.map(id => [id, 0]));
    const numActiveChannels = activeChannelIdsInOrder.length;
    
    if (numActiveChannels > 0) {
      let videosProcessedInBatch = 0;
      do {
        videosProcessedInBatch = 0;
        const currentBatch: Video[] = [];
        for (const channelId of activeChannelIdsInOrder) {
            const channelVideoList = videosByChannel.get(channelId);
            const currentIndex = channelVideoIndices.get(channelId) || 0;
            if (channelVideoList && currentIndex < channelVideoList.length) {
                currentBatch.push(channelVideoList[currentIndex]);
                channelVideoIndices.set(channelId, currentIndex + 1);
                videosProcessedInBatch++;
            }
        }
        if (currentBatch.length > 0) {
            combinedVideosForShuffle.push(...shuffleArray(currentBatch));
        }
      } while (videosProcessedInBatch > 0);
    }
    
    setBaseShuffledVideos(combinedVideosForShuffle);
  
  }, [cachedVideos, channels, sortOption, isClientMounted]); // sortOption is included here so that the *basis* for interleaving (what's "top" from each channel) is updated. The shuffle happens on this new base.

  const memoizedFilteredVideos = useMemo(() => {
    if (!isClientMounted) return []; 
  
    let videosToProcess = [...baseShuffledVideos]; 
  
    videosToProcess = videosToProcess.filter(video => !isVideoWatched(video.id));
    if (isMobile) {
      videosToProcess = videosToProcess.filter(video => !isVideoHiddenOnMobile(video.id));
    }
    
    // Filter by currently selected channels *after* shuffling the base list
    videosToProcess = videosToProcess.filter(video => 
      channels.some(ch => ch.youtubeChannelId === video.channelId)
    );
      
    if (durationFilter !== 'all') {
      videosToProcess = videosToProcess.filter(video => {
        const duration = video.durationSeconds;
        if (durationFilter === 'short') return duration < 600; 
        if (durationFilter === 'medium') return duration >= 600 && duration <= 1800; 
        if (durationFilter === 'long') return duration > 1800; 
        return true;
      });
    }
  
    if (watchLaterFilter === 'watchLaterOnly') {
        videosToProcess = videosToProcess.filter(video => isVideoWatchLater(video.id));
    } else if (watchLaterFilter === 'notWatchLater') {
        videosToProcess = videosToProcess.filter(video => !isVideoWatchLater(video.id));
    }
    
    // The final sort for display, operating on the already shuffled and filtered list.
    // This does NOT re-trigger the shuffleArray call on `baseShuffledVideos`.
    videosToProcess.sort((a, b) => {
      const valA = a[sortOption.property];
      const valB = b[sortOption.property];
      let comparison = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        comparison = valA.localeCompare(valB);
      } else if (sortOption.property === 'publishedDate') {
        comparison = new Date(valA as string).getTime() - new Date(valB as string).getTime();
      }
      return sortOption.direction === 'asc' ? comparison : -comparison;
    });
  
    return videosToProcess;
  
  }, [
    baseShuffledVideos, // The shuffle operation for this list is controlled by its own useEffect
    isVideoWatched,
    isMobile,
    isVideoHiddenOnMobile,
    channels, 
    durationFilter,
    watchLaterFilter,
    isVideoWatchLater,
    isClientMounted,
    sortOption // This is for the final display sort
  ]);

  const stats = useMemo(() => {
    if (!isClientMounted) return { totalUnwatched: 0, averageRating: "0.00" };
    const totalUnwatched = memoizedFilteredVideos.length;
    const averageRating = totalUnwatched > 0 
      ? memoizedFilteredVideos.reduce((sum, video) => sum + video.rating, 0) / totalUnwatched 
      : 0;
    return {
      totalUnwatched,
      averageRating: averageRating.toFixed(2)
    };
  }, [memoizedFilteredVideos, isClientMounted]);


  const handleRefreshVideos = () => {
    if (!apiKey) {
      toast({ title: "API Key Required", description: "Please set your YouTube API Key before refreshing.", variant: "destructive"});
      return;
    }
    toast({ title: "Refreshing Videos...", description: "Fetching the latest popular videos from all channels." });
    aggregateAndSortVideos(true);
  }

  const handleClearCache = () => {
    setCachedVideos([]); 
    toast({ title: "Video Cache Cleared", description: "Local video cache has been emptied." });
    if (apiKey && channels.length > 0) {
      aggregateAndSortVideos(false); 
    } else if (!apiKey && channels.length > 0) {
      setError("API Key is not set. Please add it to fetch videos.");
    } else {
      setError(null); 
    }
  };


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
          onClearCache={handleClearCache}
          apiKey={apiKey}
          onSetApiKey={handleSetApiKey}
          isLoadingVideos={isLoading}
          isClientMounted={isClientMounted}
        />
      </aside>
      <Separator orientation="vertical" className="hidden md:block h-auto sticky top-0" />
      <main className="flex-1 md:overflow-y-auto">
        {isClientMounted && !apiKey && channels.length > 0 && (
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
          sortOption={sortOption}
          onSortChange={setSortOption}
          durationFilter={durationFilter}
          onDurationFilterChange={setDurationFilter}
          watchLaterFilter={watchLaterFilter}
          onWatchLaterFilterChange={setWatchLaterFilter}
          stats={stats}
          onToggleWatchLater={toggleWatchLater}
          watchLaterVideoIds={watchLaterVideoIds}
          onHideOnMobile={addHiddenOnMobileVideo}
          isMobile={isMobile}
          isClientMounted={isClientMounted}
        />
      </main>
    </div>
  );
}

// Helper function
function parseISO8601Duration(durationString: string): number {
  if (!durationString || !durationString.startsWith('PT')) {
    return 0;
  }
  let remaining = durationString.substring(2);
  let totalSeconds = 0;

  const timeRegex = /(\d+)([HMS])/g;
  let match;
  while ((match = timeRegex.exec(remaining)) !== null) {
    const value = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === 'H') {
      totalSeconds += value * 3600;
    } else if (unit === 'M') {
      totalSeconds += value * 60;
    } else if (unit === 'S') {
      totalSeconds += value;
    }
  }
  return totalSeconds;
}

