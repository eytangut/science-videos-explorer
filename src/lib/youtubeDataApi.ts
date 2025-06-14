
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

export async function fetchChannelDetails(apiKey: string, identifier: string): Promise<YouTubeChannelDetails | null> {
  const cleanedIdentifier = identifier.startsWith('@') ? identifier.substring(1) : identifier.trim();
  let apiUrl = '';

  if (cleanedIdentifier.startsWith('UC') && cleanedIdentifier.length > 20) { 
    apiUrl = `${YOUTUBE_API_BASE_URL}/channels?part=snippet,contentDetails&id=${cleanedIdentifier}&key=${apiKey}`;
  } else {
    apiUrl = `${YOUTUBE_API_BASE_URL}/channels?part=snippet,contentDetails&forUsername=${cleanedIdentifier}&key=${apiKey}`;
  }

  try {
    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: `API request failed with status ${response.status} and non-JSON response.` } }));
      console.error(`Failed to fetch channel details for '${cleanedIdentifier}' using ${apiUrl.split('?')[0]}. Status: ${response.status}`, errorData);
      throw new Error(errorData.error?.message || `Failed to fetch channel details for '${cleanedIdentifier}': ${response.statusText}`);
    }

    const data = await response.json();
    if (data.items && data.items.length > 0) {
      return data.items[0];
    } else {
      console.warn(`Channel not found for identifier: '${cleanedIdentifier}' using ${apiUrl.split('?')[0]}. API returned no items.`);
      return null; 
    }
  } catch (error) {
    console.error(`Exception during fetchChannelDetails for identifier '${cleanedIdentifier}':`, error);
    throw error; 
  }
}

export async function fetchChannelPopularVideoIdsFromSearch(apiKey: string, channelId: string, maxResults = 20): Promise<string[]> {
  try {
    const response = await fetch(
      `${YOUTUBE_API_BASE_URL}/search?part=snippet&channelId=${channelId}&order=viewCount&type=video&maxResults=${maxResults}&key=${apiKey}`
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({error: {message: `API request failed with status ${response.status} and non-JSON response.`}}));
      console.error('Error fetching popular videos from search:', errorData);
      throw new Error(errorData.error?.message || `Failed to fetch popular videos: ${response.statusText}`);
    }
    const data = await response.json();
    return data.items?.map((item: any) => item.id?.videoId).filter((id: string | undefined) => !!id) || [];
  } catch (error) {
    console.error('Error in fetchChannelPopularVideoIdsFromSearch:', error);
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

// fetchChannelUploadsPlaylistId and fetchPlaylistVideos are no longer directly used by the main video aggregation logic
// but are kept for potential future use or alternative fetching strategies.
export async function fetchChannelUploadsPlaylistId(apiKey: string, channelId: string): Promise<string | null> {
  const channelDetails = await fetchChannelDetails(apiKey, channelId);
  return channelDetails?.contentDetails?.relatedPlaylists?.uploads || null;
}

export async function fetchPlaylistVideos(
  apiKey: string,
  playlistId: string,
  maxResults = 20
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
