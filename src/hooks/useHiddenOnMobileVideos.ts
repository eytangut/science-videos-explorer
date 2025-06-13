
"use client";

import useLocalStorage from './useLocalStorage';
import { toast } from './use-toast';

const HIDDEN_ON_MOBILE_STORAGE_KEY = 'hiddenOnMobileVideoIds';

export function useHiddenOnMobileVideos() {
  const [hiddenOnMobileVideoIds, setHiddenOnMobileVideoIds] = useLocalStorage<string[]>(HIDDEN_ON_MOBILE_STORAGE_KEY, []);

  const addHiddenOnMobileVideo = (videoId: string, videoTitle: string) => {
    if (!hiddenOnMobileVideoIds.includes(videoId)) {
      setHiddenOnMobileVideoIds(prevIds => [...prevIds, videoId]);
      toast({ title: "Video Hidden on Mobile", description: `"${videoTitle}" will be hidden on this mobile device.`});
    }
  };

  const isVideoHiddenOnMobile = (videoId: string): boolean => {
    return hiddenOnMobileVideoIds.includes(videoId);
  };

  // Optional: Function to clear all hidden videos for mobile
  const clearHiddenOnMobileVideos = () => {
    setHiddenOnMobileVideoIds([]);
    toast({ title: "Mobile Hidden Videos Cleared", description: "All videos previously hidden on mobile will now be shown."});
  }

  return { hiddenOnMobileVideoIds, addHiddenOnMobileVideo, isVideoHiddenOnMobile, clearHiddenOnMobileVideos };
}
