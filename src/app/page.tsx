
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
import { fetchChannelUploadsPlaylistId, fetchPlaylistVideos, fetchVideosDetails, parseISO8601Duration } from '@/lib/youtubeDataApi';
import useLocalStorage from '@/hooks/useLocalStorage';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from 'lucide-react';

type SortOption = {
  property: keyof Pick<Video, 'rating' | 'views' | 'publishedDate' | 'title'>;
  direction: 'asc' | 'desc';
};

type DurationFilter = 'all' | 'short' | 'medium' | 'long'; // short <10m, medium 10-30m, long >30m
type WatchLaterFilter = 'all' | 'watchLaterOnly' | 'notWatchLater';

// Fisher-Yates (Knuth) Shuffle
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array]; // Create a copy to avoid mutating the original
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
  
  const [allVideos, setAllVideos] = useLocalStorage<Video[]>('allVideosCache', []);
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
    if (newApiKey && channels.length > 0) {
      aggregateAndSortVideos(false, newApiKey);
    } else if (!newApiKey) {
      setAllVideos([]);
      setError("API Key removed. Please set your YouTube API Key to fetch videos.");
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

    const playlistItems = await fetchPlaylistVideos(currentApiKey, uploadsPlaylistId, 20);
    
    const videoIds = playlistItems.map(item => item.contentDetails.videoId).filter(id => !!id);
    if (videoIds.length === 0) return [];

    const videoDetailsList = await fetchVideosDetails(currentApiKey, videoIds);

    return videoDetailsList
      .map(details => {
        const playlistItem = playlistItems.find(pi => pi.contentDetails.videoId === details.id);
        if (!playlistItem) return null;

        const durationSeconds = parseISO8601Duration(details.contentDetails.duration);
        if (durationSeconds <= 180) { // Filter out videos <= 3 minutes
          return null;
        }

        const views = parseInt(details.statistics.viewCount, 10) || 0;
        const publishedDateTime = new Date(details.snippet.publishedAt).getTime();
        const hoursSincePosting = Math.max(0.1, (Date.now() - publishedDateTime) / (1000 * 60 * 60)); 
        const rating = views / (Math.pow(hoursSincePosting + 10, 0.8));
        
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

    const currentChannelIds = new Set(channels.map(c => c.youtubeChannelId));
    
    const allChannelsHaveSomeCachedVideos = channels.every(channel => 
      allVideos.some(video => video.channelId === channel.youtubeChannelId)
    );
    
    const canUseExistingData = !forceRefresh && allVideos.length > 0 && allChannelsHaveSomeCachedVideos &&
      channels.every(c => allVideos.some(v => currentChannelIds.has(v.channelId) && v.channelId === c.youtubeChannelId));


    if (canUseExistingData) {
      const videosFromCurrentChannels = allVideos.filter(v => currentChannelIds.has(v.channelId));
      const refreshedAndFiltered = videosFromCurrentChannels
        .filter(v => v.durationSeconds > 180) 
        .map(v => {
          const publishedDateTime = new Date(v.publishedDate).getTime();
          const hoursSincePosting = Math.max(0.1, (Date.now() - publishedDateTime) / (1000 * 60 * 60));
          return { ...v, rating: v.views / (Math.pow(hoursSincePosting + 10, 0.8)) };
        }); 
      setAllVideos(refreshedAndFiltered);
      setIsLoading(false);
      return;
    }

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
        toast({ title: "No Videos Found", description: "The selected channels might not have any videos longer than 3 minutes, or feeds are empty." });
      }
      
      const uniqueVideosFromAPI = Array.from(new Map(fetchedVideosFromAPI.map(video => [video.id, video])).values());
      const finalUniqueVideos = uniqueVideosFromAPI.filter(v => v.durationSeconds > 180); 

      setAllVideos(finalUniqueVideos);

    } catch (e) {
      console.error("Error aggregating videos:", e);
      const message = e instanceof Error ? e.message : "An unknown error occurred during video aggregation.";
      setError(message);
      setAllVideos([]);
    } finally {
      setIsLoading(false);
    }
  }, [channels, fetchVideosForChannel, apiKey, allVideos, setAllVideos]);


  useEffect(() => {
    if (!isClientMounted) return;

    const currentChannelIds = new Set(channels.map(c => c.youtubeChannelId));

    if (apiKey && channels.length > 0) {
        const videosFromCurrentChannelsInCache = allVideos.filter(v => currentChannelIds.has(v.channelId));
        const allCurrentlySelectedChannelsRepresentedInCache = channels.every(c => 
            videosFromCurrentChannelsInCache.some(v => v.channelId === c.youtubeChannelId)
        );

        if (!allCurrentlySelectedChannelsRepresentedInCache && allVideos.length > 0) { 
           aggregateAndSortVideos(false); 
        } else if (allVideos.length === 0){ 
           aggregateAndSortVideos(false); 
        } else { 
            const refreshedAndFiltered = allVideos
              .filter(v => currentChannelIds.has(v.channelId)) 
              .filter(v => v.durationSeconds > 180)
              .map(v => {
                const publishedDateTime = new Date(v.publishedDate).getTime();
                const hoursSincePosting = Math.max(0.1, (Date.now() - publishedDateTime) / (1000 * 60 * 60));
                return { ...v, rating: v.views / (Math.pow(hoursSincePosting + 10, 0.8)) };
              });
            setAllVideos(refreshedAndFiltered);
        }
    } else if (!apiKey && channels.length > 0) {
        setError("YouTube API Key is not set. Please add it in the Channel Setup panel to fetch videos.");
        setAllVideos([]);
    } else if (channels.length === 0) {
        setAllVideos([]);
        setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, apiKey, isClientMounted]); 

  const handleRefreshVideos = () => {
    if (!apiKey) {
      toast({ title: "API Key Required", description: "Please set your YouTube API Key before refreshing.", variant: "destructive"});
      return;
    }
    toast({ title: "Refreshing Videos...", description: "Fetching the latest videos from all channels." });
    aggregateAndSortVideos(true);
  }

  const handleClearCache = () => {
    setAllVideos([]); 
    toast({ title: "Video Cache Cleared", description: "Local video cache has been emptied." });
    if (apiKey && channels.length > 0) {
      aggregateAndSortVideos(true); 
    } else if (!apiKey) {
      setError("API Key is not set. Please add it to fetch videos.");
    } else {
      setError(null); 
    }
  };


  const memoizedFilteredVideos = useMemo(() => {
    if (!isClientMounted) return []; 

    let videosToProcess = allVideos.filter(video => !isVideoWatched(video.id));
    if (isMobile) {
      videosToProcess = videosToProcess.filter(video => !isVideoHiddenOnMobile(video.id));
    }

    const videosByChannel = new Map<string, Video[]>();
    for (const video of videosToProcess) {
      if (!videosByChannel.has(video.channelId)) {
        videosByChannel.set(video.channelId, []);
      }
      if (channels.some(ch => ch.youtubeChannelId === video.channelId)) {
          videosByChannel.get(video.channelId)!.push(video);
      }
    }

    // Sort videos within each channel based on the global sortOption
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
    
    let interwovenVideosUnshuffled: Video[] = [];
    let videoIndex = 0;
    let moreVideosToProcessFromAnyChannel = true;
    const activeChannelIdsInOrder = channels.map(c => c.youtubeChannelId); 

    while (moreVideosToProcessFromAnyChannel) {
      moreVideosToProcessFromAnyChannel = false; 
      for (const channelId of activeChannelIdsInOrder) {
        const channelVideoList = videosByChannel.get(channelId);
        if (channelVideoList && videoIndex < channelVideoList.length) {
          interwovenVideosUnshuffled.push(channelVideoList[videoIndex]);
          moreVideosToProcessFromAnyChannel = true; 
        }
      }
      if (moreVideosToProcessFromAnyChannel) {
        videoIndex++; 
      }
    }
    
    const interwovenVideos = shuffleArray(interwovenVideosUnshuffled);

    let filteredAndInterwoven = interwovenVideos;
    if (durationFilter !== 'all') {
      filteredAndInterwoven = filteredAndInterwoven.filter(video => {
        const duration = video.durationSeconds;
        if (durationFilter === 'short') return duration < 600; 
        if (durationFilter === 'medium') return duration >= 600 && duration <= 1800; 
        if (durationFilter === 'long') return duration > 1800; 
        return true;
      });
    }

    if (watchLaterFilter === 'watchLaterOnly') {
        filteredAndInterwoven = filteredAndInterwoven.filter(video => isVideoWatchLater(video.id));
    } else if (watchLaterFilter === 'notWatchLater') {
        filteredAndInterwoven = filteredAndInterwoven.filter(video => !isVideoWatchLater(video.id));
    }

    // Removed the final global sort to preserve interleaved order
    return filteredAndInterwoven;

  }, [allVideos, isVideoWatched, isMobile, isVideoHiddenOnMobile, channels, durationFilter, watchLaterFilter, sortOption, isVideoWatchLater, isClientMounted]);

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
    
    
    

    

    





