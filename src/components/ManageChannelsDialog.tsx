
"use client";

import type { Channel } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, ArrowUp, ArrowDown, Settings } from 'lucide-react';

interface ManageChannelsDialogProps {
  channels: Channel[];
  onRemoveChannel: (channelId: string) => void;
  onReorderChannels: (sourceIndex: number, destinationIndex: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isClientMounted: boolean;
}

export default function ManageChannelsDialog({
  channels,
  onRemoveChannel,
  onReorderChannels,
  open,
  onOpenChange,
  isClientMounted
}: ManageChannelsDialogProps) {
  
  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      onReorderChannels(index, index - 1);
    } else if (direction === 'down' && index < channels.length - 1) {
      onReorderChannels(index, index + 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!isClientMounted}>
            <Settings className="mr-2 h-5 w-5" /> Manage Added Channels
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline">Manage Your Channels</DialogTitle>
        </DialogHeader>
        {!isClientMounted ? (
          <p className="text-muted-foreground py-4">Loading channel list...</p>
        ) : channels.length === 0 ? (
          <p className="text-muted-foreground py-4">No channels added yet. Add one using the panel.</p>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-3 my-4">
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
                    <Button variant="ghost" size="icon" onClick={() => onRemoveChannel(channel.id)} aria-label="Remove Channel">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

