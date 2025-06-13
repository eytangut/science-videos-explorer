"use client";

import useLocalStorage from './useLocalStorage';

const WATCHED_VIDEOS_STORAGE_KEY = 'watchedVideoIds';

export function useWatchedVideos() {
  const [watchedVideoIds, setWatchedVideoIds] = useLocalStorage<string[]>(WATCHED_VIDEOS_STORAGE_KEY, []);

  const addWatchedVideo = (videoId: string) => {
    if (!watchedVideoIds.includes(videoId)) {
      setWatchedVideoIds(prevIds => [...prevIds, videoId]);
    }
  };

  const isVideoWatched = (videoId: string): boolean => {
    return watchedVideoIds.includes(videoId);
  };

  return { watchedVideoIds, addWatchedVideo, isVideoWatched };
}
