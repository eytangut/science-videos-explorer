"use client";

import type { Video } from '@/types';
import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, ExternalLink, CalendarDays, BarChart3, YoutubeIcon } from 'lucide-react'; // Changed BarChart to BarChart3 for consistency
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

  if (!showCard && isWatched) {
     return null; 
  }

  return (
    <Card 
      className={cn(
        "flex flex-col overflow-hidden shadow-lg hover:shadow-primary/50 transition-all duration-300 ease-in-out transform hover:-translate-y-1",
        !showCard ? "opacity-0 scale-95" : "opacity-100 scale-100",
        "bg-card border-border"
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
            data-ai-hint="video thumbnail"
            // unoptimized={true} // Already set globally in next.config.js
          />
        </a>
      </CardHeader>
      <CardContent className="p-4 flex-grow">
        <a href={video.link} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
          <CardTitle className="text-lg font-headline mb-2 leading-tight line-clamp-2 text-card-foreground">{video.title}</CardTitle>
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
        <Badge variant="secondary" className="font-mono text-xs" title={`Calculated Rating: ${video.rating.toFixed(4)}`}>
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
