export interface Channel {
  id: string; // YouTube Channel ID (e.g., UCxxxxxxxxxxxx)
  name: string;
  youtubeChannelId: string; // Explicitly store YouTube Channel ID
}

export interface Video {
  id: string; // YouTube video ID
  title: string;
  link: string;
  thumbnailUrl: string;
  publishedDate: string; // ISO string
  views: number;
  channelName: string;
  channelId: string; // YouTube Channel ID of the video's channel
  rating: number;
  durationSeconds: number; // Video duration in seconds
}

// Types for YouTube API responses (simplified)
export interface YouTubeChannelDetails {
  id: string;
  snippet: {
    title: string;
    customUrl?: string;
  };
  contentDetails: {
    relatedPlaylists: {
      uploads: string; // Playlist ID for uploads
    };
  };
}

export interface YouTubePlaylistItem {
  snippet: {
    publishedAt: string;
    channelId: string;
    title:string;
    description: string;
    thumbnails: {
      medium: { url: string };
      high?: { url: string };
      standard?: { url: string };
      maxres?: { url: string };
    };
    resourceId: {
      videoId: string;
    };
    channelTitle: string;
  };
  contentDetails: {
    videoId: string;
    videoPublishedAt: string; // May differ from playlist item publish date
  };
}

export interface YouTubeVideoDetails {
  id: string;
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: {
      medium: { url: string };
      high?: { url: string };
      standard?: { url: string };
      maxres?: { url: string };
    };
    channelTitle: string;
  };
  contentDetails: {
    duration: string; // ISO 8601 duration (e.g., PT1M30S)
  };
  statistics: {
    viewCount: string; // Note: it's a string
    likeCount?: string;
    commentCount?: string;
  };
}
