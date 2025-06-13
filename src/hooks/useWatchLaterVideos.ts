
"use client";

import useLocalStorage from './useLocalStorage';
import { toast } from '@/hooks/use-toast';

const WATCH_LATER_STORAGE_KEY = 'watchLaterVideoIds';

export function useWatchLaterVideos() {
  const [watchLaterVideoIds, setWatchLaterVideoIds] = useLocalStorage<string[]>(WATCH_LATER_STORAGE_KEY, []);

  const toggleWatchLater = (videoId: string, videoTitle: string) => {
    setWatchLaterVideoIds(prevIds => {
      if (prevIds.includes(videoId)) {
        toast({ title: "Removed from Watch Later", description: `"${videoTitle}" removed.` });
        return prevIds.filter(id => id !== videoId);
      } else {
        toast({ title: "Added to Watch Later", description: `"${videoTitle}" added.` });
        return [...prevIds, videoId];
      }
    });
  };

  const isVideoWatchLater = (videoId: string): boolean => {
    return watchLaterVideoIds.includes(videoId);
  };

  return { watchLaterVideoIds, toggleWatchLater, isVideoWatchLater };
}
