"use client";

import type { Channel } from '@/types';
import useLocalStorage from './useLocalStorage';
import { toast } from '@/hooks/use-toast';

const CHANNELS_STORAGE_KEY = 'youtubeChannels';

export function useChannels() {
  const [channels, setChannels] = useLocalStorage<Channel[]>(CHANNELS_STORAGE_KEY, []);

  const addChannel = (newChannel: Channel) => {
    if (channels.find(channel => channel.rssUrl === newChannel.rssUrl)) {
      toast({
        title: "Channel exists",
        description: `${newChannel.name} is already in your list.`,
        variant: "default",
      });
      return false;
    }
    setChannels(prevChannels => [...prevChannels, newChannel]);
    return true;
  };

  const removeChannel = (rssUrl: string) => {
    setChannels(prevChannels => prevChannels.filter(channel => channel.rssUrl !== rssUrl));
  };

  const reorderChannels = (sourceIndex: number, destinationIndex: number) => {
    setChannels(prevChannels => {
      const newChannels = Array.from(prevChannels);
      const [removed] = newChannels.splice(sourceIndex, 1);
      newChannels.splice(destinationIndex, 0, removed);
      return newChannels;
    });
  };

  return { channels, addChannel, removeChannel, reorderChannels, setChannels };
}
