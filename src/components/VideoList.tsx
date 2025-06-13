
"use client";

import type { Video } from '@/types';
import VideoCard from './VideoCard';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, Youtube, ListFilter, BarChartHorizontalBig, Clock, Star, SortAsc, SortDesc, Calendar, LucideIcon, CaseSensitive } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Button } from '@/components/ui/button';

type SortProperty = keyof Pick<Video, 'rating' | 'views' | 'publishedDate' | 'title'>;
interface SortOption {
  property: SortProperty;
  direction: 'asc' | 'desc';
}
type DurationFilter = 'all' | 'short' | 'medium' | 'long';
type WatchLaterFilter = 'all' | 'watchLaterOnly' | 'notWatchLater';

interface VideoListProps {
  videos: Video[];
  onMarkAsWatched: (videoId: string) => void;
  watchedVideoIds: string[];
  isLoading: boolean;
  error: string | null;
  hasChannels: boolean;
  apiKeyIsSet: boolean;
  sortOption: SortOption;
  onSortChange: (option: SortOption) => void;
  durationFilter: DurationFilter;
  onDurationFilterChange: (filter: DurationFilter) => void;
  watchLaterFilter: WatchLaterFilter;
  onWatchLaterFilterChange: (filter: WatchLaterFilter) => void;
  stats: { totalUnwatched: number; averageRating: string };
  onToggleWatchLater: (videoId: string, videoTitle: string) => void;
  watchLaterVideoIds: string[];
  onHideOnMobile: (videoId: string, videoTitle: string) => void;
  isMobile: boolean;
}

const sortOptionsConfig: { value: SortProperty; label: string; icon: LucideIcon }[] = [
  { value: 'rating', label: 'Rating', icon: Star },
  { value: 'views', label: 'Views', icon: BarChartHorizontalBig },
  { value: 'publishedDate', label: 'Date', icon: Calendar },
  { value: 'title', label: 'Title', icon: CaseSensitive },
];

const durationFilterOptions: { value: DurationFilter; label: string }[] = [
  { value: 'all', label: 'All Durations' },
  { value: 'short', label: '< 10 min' },
  { value: 'medium', label: '10-30 min' },
  { value: 'long', label: '> 30 min' },
];

const watchLaterFilterOptions: { value: WatchLaterFilter; label: string }[] = [
  { value: 'all', label: 'All Videos' },
  { value: 'watchLaterOnly', label: 'Watch Later Only' },
  { value: 'notWatchLater', label: 'Not Watch Later' },
];

export default function VideoList({
  videos,
  onMarkAsWatched,
  watchedVideoIds,
  isLoading,
  error,
  hasChannels,
  apiKeyIsSet,
  sortOption,
  onSortChange,
  durationFilter,
  onDurationFilterChange,
  watchLaterFilter,
  onWatchLaterFilterChange,
  stats,
  onToggleWatchLater,
  watchLaterVideoIds,
  onHideOnMobile,
  isMobile
}: VideoListProps) {

  const handleSortPropertyChange = (property: string) => {
    onSortChange({ ...sortOption, property: property as SortProperty });
  };

  const toggleSortDirection = () => {
    onSortChange({ ...sortOption, direction: sortOption.direction === 'asc' ? 'desc' : 'asc' });
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="bg-card p-4 rounded-lg shadow-lg animate-pulse">
            <div className="aspect-video bg-secondary rounded mb-4"></div>
            <div className="h-4 bg-secondary rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-secondary rounded w-1/2 mb-2"></div>
            <div className="h-3 bg-secondary rounded w-1/4"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
     return (
      <Alert variant="destructive" className="m-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Fetching Videos</AlertTitle>
        <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
      </Alert>
    );
  }
  
  const unWatchedVideos = videos; // Filtering for watched/hiddenOnMobile is now done in page.tsx's useMemo

  if (!apiKeyIsSet && hasChannels) { // Show if API key is missing but channels are present
     return null; // Main message shown in Home page
  }

  if (!hasChannels && apiKeyIsSet) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Youtube className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-headline mb-2">No Channels Added</h2>
        <p className="text-muted-foreground">Add some YouTube channels using their Channel ID to see videos here.</p>
      </div>
    );
  }
  
  return (
    <ScrollArea className="h-full">
      <div className="p-4 md:p-6 space-y-4 sticky top-0 bg-background z-10 border-b border-border">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-center">
          <div className="flex gap-2 w-full sm:w-auto">
            <Select value={sortOption.property} onValueChange={handleSortPropertyChange}>
              <SelectTrigger className="w-full sm:w-[150px] text-sm" aria-label="Sort by">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                {sortOptionsConfig.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <opt.icon className="h-4 w-4 text-muted-foreground" />
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={toggleSortDirection} aria-label="Toggle sort direction">
              {sortOption.direction === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
            </Button>
          </div>

          <Select value={durationFilter} onValueChange={(value) => onDurationFilterChange(value as DurationFilter)}>
            <SelectTrigger className="w-full sm:w-[160px] text-sm" aria-label="Filter by duration">
               <Clock className="h-4 w-4 mr-1 text-muted-foreground inline-block" />
              <SelectValue placeholder="Duration..." />
            </SelectTrigger>
            <SelectContent>
              {durationFilterOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={watchLaterFilter} onValueChange={(value) => onWatchLaterFilterChange(value as WatchLaterFilter)}>
            <SelectTrigger className="w-full sm:w-[180px] text-sm" aria-label="Filter by watch later status">
              <ListFilter className="h-4 w-4 mr-1 text-muted-foreground inline-block" />
              <SelectValue placeholder="Watch Later..." />
            </SelectTrigger>
            <SelectContent>
               {watchLaterFilterOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {apiKeyIsSet && hasChannels && (
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>Videos Displayed: {stats.totalUnwatched}</span>
            {stats.totalUnwatched > 0 && <span>Avg. Rating: {stats.averageRating}</span>}
          </div>
        )}
      </div>

      {unWatchedVideos.length === 0 && hasChannels && apiKeyIsSet && !isLoading && (
         <div className="flex flex-col items-center justify-center h-64 p-6 text-center">
            <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-headline mb-2">All Caught Up or No Matches!</h2>
            <p className="text-muted-foreground">No videos match your current filters, or all have been watched/hidden.</p>
         </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8 p-6">
        {unWatchedVideos.map(video => (
          <VideoCard
            key={`${video.channelId}-${video.id}`}
            video={video}
            onMarkAsWatched={onMarkAsWatched}
            isWatched={watchedVideoIds.includes(video.id)}
            onToggleWatchLater={onToggleWatchLater}
            isWatchLater={watchLaterVideoIds.includes(video.id)}
            onHideOnMobile={onHideOnMobile}
            isMobile={isMobile}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
