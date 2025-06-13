"use client";

import type { ChangeEvent, FormEvent } from 'react';
import { useState } from 'react';
import type { Channel } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { parseYouTubeRss } from '@/lib/clientRssParser';
import { PlusCircle, Trash2, ArrowUp, ArrowDown, ListRestart } from 'lucide-react';

interface ChannelManagementPanelProps {
  channels: Channel[];
  onAddChannel: (channel: Channel) => boolean;
  onRemoveChannel: (rssUrl: string) => void;
  onReorderChannels: (sourceIndex: number, destinationIndex: number) => void;
  onRefreshVideos: () => void;
}

export default function ChannelManagementPanel({
  channels,
  onAddChannel,
  onRemoveChannel,
  onReorderChannels,
  onRefreshVideos
}: ChannelManagementPanelProps) {
  const [newRssUrl, setNewRssUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddChannel = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newRssUrl.trim()) {
      toast({ title: "Error", description: "RSS URL cannot be empty.", variant: "destructive" });
      return;
    }
    setIsAdding(true);
    try {
      const response = await fetch(`/api/fetch-rss?url=${encodeURIComponent(newRssUrl)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({error: "Failed to parse error response"}));
        throw new Error(errorData.error || `Network response was not ok: ${response.statusText}`);
      }
      const xmlText = await response.text();
      const parsedFeed = parseYouTubeRss(xmlText);
      
      const success = onAddChannel({
        id: newRssUrl, // Use RSS URL as ID for simplicity
        name: parsedFeed.channelTitle || 'Unnamed Channel',
        rssUrl: newRssUrl,
      });

      if (success) {
        toast({ title: "Channel Added", description: `${parsedFeed.channelTitle} added successfully.` });
        setNewRssUrl('');
      }
    } catch (error) {
      console.error("Failed to add channel:", error);
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({ title: "Error Adding Channel", description: message, variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      onReorderChannels(index, index - 1);
    } else if (direction === 'down' && index < channels.length - 1) {
      onReorderChannels(index, index + 1);
    }
  };

  return (
    <Card className="w-full md:w-1/3 lg:w-1/4 shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl font-headline flex items-center justify-between">
          <span>Manage Channels</span>
          <Button onClick={onRefreshVideos} variant="ghost" size="icon" aria-label="Refresh Videos">
            <ListRestart className="h-5 w-5 text-primary" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleAddChannel} className="space-y-4 mb-6">
          <div className="flex space-x-2">
            <Input
              type="url"
              placeholder="Enter YouTube Channel RSS URL"
              value={newRssUrl}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewRssUrl(e.target.value)}
              disabled={isAdding}
              aria-label="New RSS URL"
            />
            <Button type="submit" disabled={isAdding} aria-label="Add Channel">
              <PlusCircle className="mr-2 h-5 w-5" /> {isAdding ? 'Adding...' : 'Add'}
            </Button>
          </div>
        </form>
        <h3 className="text-lg font-semibold mb-2 text-muted-foreground">Your Channels:</h3>
        {channels.length === 0 ? (
          <p className="text-muted-foreground">No channels added yet. Add one above to get started!</p>
        ) : (
          <ScrollArea className="h-[calc(100vh-350px)] md:h-auto md:max-h-[60vh] pr-3">
            <ul className="space-y-3">
              {channels.map((channel, index) => (
                <li key={channel.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-md shadow">
                  <span className="truncate font-medium flex-1 mr-2" title={channel.name}>{channel.name}</span>
                  <div className="flex items-center space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => handleMove(index, 'up')} disabled={index === 0} aria-label="Move Up">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleMove(index, 'down')} disabled={index === channels.length - 1} aria-label="Move Down">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onRemoveChannel(channel.rssUrl)} aria-label="Remove Channel">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
