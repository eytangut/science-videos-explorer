
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

  // Determine if the identifier looks like a channel ID (starts with UC) or should be treated as a username/handle
  if (cleanedIdentifier.startsWith('UC') && cleanedIdentifier.length > 20) { // Heuristic for Channel ID
    apiUrl = `${YOUTUBE_API_BASE_URL}/channels?part=snippet,contentDetails&id=${cleanedIdentifier}&key=${apiKey}`;
  } else {
    // Assume it's a username/handle for the forUsername parameter
    // Note: forUsername works with legacy usernames. Modern @handles might not always resolve this way.
    // A more robust solution for @handles would use the Search API, but this is a common first attempt.
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
      // Response was OK, but no items found (e.g., username doesn't exist or ID is invalid)
      console.warn(`Channel not found for identifier: '${cleanedIdentifier}' using ${apiUrl.split('?')[0]}. API returned no items.`);
      return null; // To be handled by the calling function (e.g., in ChannelManagementPanel)
    }
  } catch (error) {
    // This catches network errors or errors re-thrown from the !response.ok block.
    console.error(`Exception during fetchChannelDetails for identifier '${cleanedIdentifier}':`, error);
    throw error; // Re-throw to be caught by handleAddChannel in the UI component
  }
}


export async function fetchChannelUploadsPlaylistId(apiKey: string, channelId: string): Promise<string | null> {
  // This function assumes channelId is a valid UC... format ID,
  // as it should be if obtained from a prior successful fetchChannelDetails call.
  const channelDetails = await fetchChannelDetails(apiKey, channelId);
  return channelDetails?.contentDetails?.relatedPlaylists?.uploads || null;
}

export async function fetchPlaylistVideos(
  apiKey: string,
  playlistId: string,
  maxResults = 20 // Updated from 15 to 20
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
