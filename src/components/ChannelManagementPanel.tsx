"use client";

import type { ChangeEvent, FormEvent } from 'react';
import { useState } from 'react';
import type { Channel } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { fetchChannelDetails } from '@/lib/youtubeDataApi';
import { PlusCircle, KeyRound, Settings, ListRestart } from 'lucide-react';
import ManageChannelsDialog from './ManageChannelsDialog'; // Import the new dialog

interface ChannelManagementPanelProps {
  channels: Channel[];
  onAddChannel: (channel: Channel) => boolean;
  onRemoveChannel: (channelId: string) => void;
  onReorderChannels: (sourceIndex: number, destinationIndex: number) => void;
  onRefreshVideos: () => void;
  apiKey: string;
  onSetApiKey: (key: string) => void;
  isLoadingVideos: boolean;
}

export default function ChannelManagementPanel({
  channels,
  onAddChannel,
  onRemoveChannel,
  onReorderChannels,
  onRefreshVideos,
  apiKey,
  onSetApiKey,
  isLoadingVideos
}: ChannelManagementPanelProps) {
  const [newChannelId, setNewChannelId] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [apiKeyInputValue, setApiKeyInputValue] = useState(apiKey);
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);

  const handleSetApiKey = () => {
    onSetApiKey(apiKeyInputValue);
    toast({ title: "API Key Updated", description: "Your YouTube API Key has been saved." });
  };
  
  const handleAddChannel = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast({ title: "API Key Required", description: "Please enter your YouTube Data API Key first.", variant: "destructive" });
      return;
    }
    if (!newChannelId.trim()) {
      toast({ title: "Channel ID Required", description: "YouTube Channel ID cannot be empty.", variant: "destructive" });
      return;
    }
    setIsAdding(true);
    try {
      // Attempt to parse channel ID from URL if a URL is pasted.
      // Basic parsing, focuses on /channel/ and /@handle formats for simplicity.
      let processedChannelId = newChannelId.trim();
      if (processedChannelId.includes('youtube.com/channel/')) {
        processedChannelId = processedChannelId.split('youtube.com/channel/')[1].split('/')[0].split('?')[0];
      } else if (processedChannelId.includes('youtube.com/@')) {
        // Fetching by handle requires an additional API step (search or custom logic) not implemented here for brevity.
        // For now, we'll assume if it's a handle, it's passed as the ID and fetchChannelDetails will try it.
        // A more robust solution would use the Search API to convert handle to channel ID.
        processedChannelId = processedChannelId.split('youtube.com/@')[1].split('/')[0].split('?')[0];
         toast({ title: "Using Handle", description: `Attempting to use "${processedChannelId}" as channel identifier. For best results, use the Channel ID (starts with UC).`, variant: "default" });
      }


      const channelDetails = await fetchChannelDetails(apiKey, processedChannelId);
      
      if (!channelDetails) {
        throw new Error(`Could not find channel details for ID: ${processedChannelId}. Please ensure it's a valid YouTube Channel ID (e.g., UC...). Custom URLs or handles may require specific API lookups.`);
      }
      
      const success = onAddChannel({
        id: channelDetails.id,
        name: channelDetails.snippet.title || 'Unnamed Channel',
        youtubeChannelId: channelDetails.id,
      });

      if (success) {
        toast({ title: "Channel Added", description: `${channelDetails.snippet.title} added successfully.` });
        setNewChannelId('');
      }
    } catch (error) {
      console.error("Failed to add channel:", error);
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({ title: "Error Adding Channel", description: message, variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Card className="w-full shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl font-headline flex items-center justify-between">
          <span>Channel Setup</span>
          <Button onClick={onRefreshVideos} variant="ghost" size="icon" aria-label="Refresh Videos" disabled={isLoadingVideos || !apiKey || channels.length === 0}>
            <ListRestart className="h-5 w-5 text-primary" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label htmlFor="apiKeyInput" className="block text-sm font-medium text-muted-foreground mb-1">YouTube Data API Key</label>
          <div className="flex space-x-2">
            <Input
              id="apiKeyInput"
              type="password"
              placeholder="Enter your API Key"
              value={apiKeyInputValue}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setApiKeyInputValue(e.target.value)}
              aria-label="YouTube API Key"
            />
            <Button onClick={handleSetApiKey} aria-label="Save API Key">
              <KeyRound className="mr-2 h-5 w-5" /> Save Key
            </Button>
          </div>
           <CardDescription className="text-xs mt-1">
            Your API key is stored locally in your browser. <a href="https://developers.google.com/youtube/v3/getting-started" target="_blank" rel="noopener noreferrer" className="underline">How to get an API key?</a>
            <br/><strong>Important:</strong> Restrict your API key in Google Cloud Console (HTTP referrers & API restrictions).
          </CardDescription>
        </div>

        <form onSubmit={handleAddChannel} className="space-y-2">
          <label htmlFor="channelIdInput" className="block text-sm font-medium text-muted-foreground mb-1">Add YouTube Channel</label>
          <div className="flex space-x-2">
            <Input
              id="channelIdInput"
              type="text"
              placeholder="Enter Channel ID (e.g., UC...)"
              value={newChannelId}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewChannelId(e.target.value)}
              disabled={isAdding || !apiKey}
              aria-label="New Channel ID"
            />
            <Button type="submit" disabled={isAdding || !apiKey} aria-label="Add Channel">
              <PlusCircle className="mr-2 h-5 w-5" /> {isAdding ? 'Adding...' : 'Add'}
            </Button>
          </div>
          {!apiKey && <p className="text-xs text-destructive">API Key is required to add channels.</p>}
        </form>
        
        <ManageChannelsDialog
            channels={channels}
            onRemoveChannel={onRemoveChannel}
            onReorderChannels={onReorderChannels}
            open={isManageDialogOpen}
            onOpenChange={setIsManageDialogOpen}
        />

      </CardContent>
    </Card>
  );
}
