"use client";

import type { Video } from '@/types';
import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, ExternalLink, CalendarDays, BarChart3 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

interface VideoCardProps {
  video: Video;
  onMarkAsWatched: (videoId: string) => void;
  isWatched: boolean;
}

export default function VideoCard({ video, onMarkAsWatched, isWatched }: VideoCardProps) {
  const [showCard, setShowCard] = useState(!isWatched);
  const [publishedTimeAgo, setPublishedTimeAgo] = useState('');

  useEffect(() => {
    // Defer date calculation to client-side to avoid hydration mismatch
    try {
      setPublishedTimeAgo(formatDistanceToNow(new Date(video.publishedDate), { addSuffix: true }));
    } catch (e) {
      setPublishedTimeAgo('Invalid date');
    }
  }, [video.publishedDate]);


  const handleMarkWatched = () => {
    setShowCard(false); // Start fade-out animation
    setTimeout(() => {
      onMarkAsWatched(video.id); // Actual state update after animation
    }, 300); // Match transition duration
  };

  if (!showCard && isWatched) { // if it's already marked as watched and we want to animate out, or it's just hidden
     return null; // Render nothing if marked watched and animation finished or if initially hidden
  }

  return (
    <Card 
      className={cn(
        "flex flex-col overflow-hidden shadow-lg hover:shadow-primary/50 transition-all duration-300 ease-in-out transform hover:-translate-y-1",
        !showCard ? "opacity-0 scale-95" : "opacity-100 scale-100"
      )}
      style={{ transitionProperty: 'opacity, transform, box-shadow' }}
    >
      <CardHeader className="p-0 relative">
        <a href={video.link} target="_blank" rel="noopener noreferrer" aria-label={`Watch ${video.title} on YouTube`}>
          <Image
            src={video.thumbnailUrl || `https://placehold.co/480x360.png?text=${encodeURIComponent(video.title)}`}
            alt={`Thumbnail for ${video.title}`}
            width={480}
            height={270}
            className="w-full h-auto object-cover aspect-video"
            unoptimized={video.thumbnailUrl?.includes('ytimg.com')} // Common for YouTube thumbnails
            data-ai-hint="video thumbnail"
          />
        </a>
      </CardHeader>
      <CardContent className="p-4 flex-grow">
        <a href={video.link} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
          <CardTitle className="text-lg font-headline mb-2 leading-tight line-clamp-2">{video.title}</CardTitle>
        </a>
        <p className="text-sm text-muted-foreground mb-1 line-clamp-1" title={video.channelName}>
          {video.channelName}
        </p>
        <div className="flex items-center text-xs text-muted-foreground mb-2 space-x-2">
          <div className="flex items-center" title="Published date">
            <CalendarDays className="h-3.5 w-3.5 mr-1" />
            <span>{publishedTimeAgo || 'Loading time...'}</span>
          </div>
          <div className="flex items-center" title="Views">
            <BarChart3 className="h-3.5 w-3.5 mr-1" />
            <span>{video.views.toLocaleString()} views</span>
          </div>
        </div>
        <Badge variant="secondary" className="font-mono text-xs" title="Calculated Rating">
          Rating: {video.rating.toFixed(2)}
        </Badge>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex justify-between items-center">
        <Button onClick={handleMarkWatched} variant="outline" size="sm">
          <Eye className="mr-2 h-4 w-4" /> Mark Watched
        </Button>
        <Button asChild variant="default" size="sm">
          <a href={video.link} target="_blank" rel="noopener noreferrer">
            Watch <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}
