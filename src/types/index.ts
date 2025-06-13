export interface Channel {
  id: string; // RSS feed URL used as ID
  name: string;
  rssUrl: string;
}

export interface Video {
  id: string; // YouTube video ID
  title: string;
  link: string;
  thumbnailUrl: string;
  publishedDate: string; // ISO string
  views: number;
  channelName: string;
  channelRssUrl: string; // To identify the source channel
  rating: number;
}

export interface ParsedVideoItem {
  id: string;
  title: string;
  link: string;
  publishedDate: string;
  views: number;
  thumbnailUrl:string;
}

export interface ParsedFeed {
  channelTitle: string;
  videos: ParsedVideoItem[];
}
