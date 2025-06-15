
"use client";

import type { Video } from '@/types';
import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, ExternalLink, CalendarDays, BarChart3, YoutubeIcon, ListPlus, ListX, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

interface VideoCardProps {
  video: Video;
  onMarkAsWatched: (videoId: string) => void;
  isWatched: boolean;
  onToggleWatchLater: (videoId: string, videoTitle: string) => void;
  isWatchLater: boolean;
  onHideOnMobile: (videoId: string, videoTitle: string) => void;
  isMobile: boolean;
}

export default function VideoCard({ video, onMarkAsWatched, isWatched, onToggleWatchLater, isWatchLater, onHideOnMobile, isMobile }: VideoCardProps) {
  const [showCard, setShowCard] = useState(!isWatched);
  const [publishedTimeAgo, setPublishedTimeAgo] = useState('');

  const videoTitle = String(video.title || 'Untitled Video'); // Ensure title is a string

  useEffect(() => {
    try {
      setPublishedTimeAgo(formatDistanceToNow(new Date(video.publishedDate), { addSuffix: true }));
    } catch (e) {
      console.error("Error formatting date:", e, video.publishedDate);
      setPublishedTimeAgo('Invalid date');
    }
  }, [video.publishedDate]);


  const handleMarkWatched = () => {
    setShowCard(false); 
    setTimeout(() => {
      onMarkAsWatched(video.id); 
    }, 300); 
  };

  const handleToggleWatchLater = () => {
    onToggleWatchLater(video.id, videoTitle);
  };

  const handleHideOnMobile = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    e.preventDefault();
    setShowCard(false);
    setTimeout(() => {
     onHideOnMobile(video.id, videoTitle);
    }, 300)
  }

  if (!showCard && (isWatched || (isMobile))) {
     return null; 
  }

  return (
    <Card 
      className={cn(
        "flex flex-col overflow-hidden shadow-lg hover:shadow-primary/50 transition-all duration-300 ease-in-out transform hover:-translate-y-1",
        !showCard ? "opacity-0 scale-95" : "opacity-100 scale-100",
        "bg-card border-border relative"
      )}
      style={{ transitionProperty: 'opacity, transform, box-shadow' }}
    >
      {isMobile && (
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-1 right-1 z-10 h-7 w-7 bg-black/50 hover:bg-black/70 text-white hover:text-red-400"
          onClick={handleHideOnMobile}
          aria-label="Remove from view on mobile"
          title="Remove from view on mobile"
        >
          <XCircle className="h-5 w-5" />
        </Button>
      )}
      <CardHeader className="p-0 relative">
        <a href={video.link} target="_blank" rel="noopener noreferrer" aria-label={`Watch ${videoTitle} on YouTube`}>
          <Image
            src={video.thumbnailUrl || `https://placehold.co/480x360.png?text=${encodeURIComponent(videoTitle)}`}
            alt={`Thumbnail for ${videoTitle}`}
            width={480}
            height={270}
            className="w-full h-auto object-cover aspect-video"
            data-ai-hint="video thumbnail"
          />
        </a>
      </CardHeader>
      <CardContent className="p-4 flex-grow">
        <a href={video.link} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
          <CardTitle className="text-lg font-headline mb-2 leading-tight line-clamp-2 text-card-foreground">{videoTitle}</CardTitle>
        </a>
        <div className="flex items-center text-sm text-muted-foreground mb-1">
          <YoutubeIcon className="h-4 w-4 mr-1.5 text-red-600"/> 
          <p className="line-clamp-1" title={video.channelName}>
            {video.channelName}
          </p>
        </div>
        <div className="flex items-center text-xs text-muted-foreground mb-3 space-x-3">
          <div className="flex items-center" title="Published date">
            <CalendarDays className="h-3.5 w-3.5 mr-1" />
            <span>{publishedTimeAgo || 'Loading time...'}</span>
          </div>
          <div className="flex items-center" title="Views">
            <BarChart3 className="h-3.5 w-3.5 mr-1" />
            <span>{video.views.toLocaleString()} views</span>
          </div>
        </div>
        <div className="flex items-center text-xs text-muted-foreground mb-1" title="Duration">
           <span className="mr-1">⏱️</span> {/* Simple clock emoji for duration */}
           <span>
             {Math.floor(video.durationSeconds / 60)}m {video.durationSeconds % 60}s
           </span>
        </div>
        <Badge variant="secondary" className="font-mono text-xs mt-2" title={`Calculated Rating: ${video.rating.toFixed(4)}`}>
          Rating: {video.rating.toFixed(2)}
        </Badge>
      </CardContent>
      <CardFooter className="p-4 pt-0 grid grid-cols-2 gap-2 items-center">
        <Button onClick={handleMarkWatched} variant="outline" size="sm" className="w-full">
          <Eye className="mr-2 h-4 w-4" /> Watched
        </Button>
        <Button onClick={handleToggleWatchLater} variant={isWatchLater ? "secondary" : "outline"} size="sm" className="w-full">
          {isWatchLater ? <ListX className="mr-2 h-4 w-4" /> : <ListPlus className="mr-2 h-4 w-4" />}
          {isWatchLater ? 'Unlist' : 'Later'}
        </Button>
        <Button asChild variant="default" size="sm" className="col-span-2 w-full">
          <a href={video.link} target="_blank" rel="noopener noreferrer">
            Watch on <YoutubeIcon className="ml-2 h-4 w-4" />
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}
