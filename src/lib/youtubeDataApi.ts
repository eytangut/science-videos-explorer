import type { YouTubeChannelDetails, YouTubePlaylistItem, YouTubeVideoDetails } from '@/types';

const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';

export function parseISO8601Duration(durationString: string): number {
  if (!durationString || !durationString.startsWith('PT')) {
    return 0;
  }
  let remaining = durationString.substring(2);
  let totalSeconds = 0;

  const timeRegex = /(\d+)([HMS])/g;
  let match;
  while ((match = timeRegex.exec(remaining)) !== null) {
    const value = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === 'H') {
      totalSeconds += value * 3600;
    } else if (unit === 'M') {
      totalSeconds += value * 60;
    } else if (unit === 'S') {
      totalSeconds += value;
    }
  }
  return totalSeconds;
}

export async function fetchChannelDetails(apiKey: string, channelId: string): Promise<YouTubeChannelDetails | null> {
  try {
    const response = await fetch(
      `${YOUTUBE_API_BASE_URL}/channels?part=snippet,contentDetails&id=${channelId}&key=${apiKey}`
    );
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error fetching channel details:', errorData);
      throw new Error(errorData.error?.message || `Failed to fetch channel details: ${response.statusText}`);
    }
    const data = await response.json();
    return data.items && data.items.length > 0 ? data.items[0] : null;
  } catch (error) {
    console.error('Error in fetchChannelDetails:', error);
    throw error;
  }
}


export async function fetchChannelUploadsPlaylistId(apiKey: string, channelId: string): Promise<string | null> {
  const channelDetails = await fetchChannelDetails(apiKey, channelId);
  return channelDetails?.contentDetails?.relatedPlaylists?.uploads || null;
}

export async function fetchPlaylistVideos(
  apiKey: string,
  playlistId: string,
  maxResults = 15 // YouTube API default is 5, max is 50
): Promise<YouTubePlaylistItem[]> {
  try {
    const response = await fetch(
      `${YOUTUBE_API_BASE_URL}/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=${maxResults}&key=${apiKey}`
    );
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error fetching playlist videos:', errorData);
      throw new Error(errorData.error?.message ||`Failed to fetch playlist videos: ${response.statusText}`);
    }
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error in fetchPlaylistVideos:', error);
    throw error;
  }
}

export async function fetchVideosDetails(apiKey: string, videoIds: string[]): Promise<YouTubeVideoDetails[]> {
  if (videoIds.length === 0) return [];
  try {
    const response = await fetch(
      `${YOUTUBE_API_BASE_URL}/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(',')}&key=${apiKey}`
    );
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error fetching video details:', errorData);
      throw new Error(errorData.error?.message || `Failed to fetch video details: ${response.statusText}`);
    }
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error in fetchVideosDetails:', error);
    throw error;
  }
}
