import type { ParsedFeed, ParsedVideoItem } from '@/types';

export function parseYouTubeRss(xmlText: string): ParsedFeed {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "application/xml");

  const errorNode = xmlDoc.querySelector("parsererror");
  if (errorNode) {
    console.error("Error parsing XML:", errorNode.textContent);
    throw new Error("Failed to parse XML feed.");
  }
  
  const channelTitleElement = xmlDoc.querySelector("feed > title");
  const channelTitle = channelTitleElement?.textContent || "Unknown Channel";
  
  const entries = xmlDoc.querySelectorAll("feed > entry");
  const videos: ParsedVideoItem[] = [];

  entries.forEach(entry => {
    try {
      const ytVideoIdElement = entry.getElementsByTagNameNS("http://www.youtube.com/xml/schemas/2015", "videoId")[0];
      const videoId = ytVideoIdElement?.textContent;

      const titleElement = entry.querySelector("title");
      const title = titleElement?.textContent;

      const linkElement = entry.querySelector("link[rel='alternate']");
      const link = linkElement?.getAttribute("href");

      const publishedElement = entry.querySelector("published");
      const publishedDate = publishedElement?.textContent;

      const mediaGroup = entry.getElementsByTagNameNS("http://search.yahoo.com/mrss/", "group")[0];
      let thumbnailUrl: string | undefined | null;
      let views = 0;

      if (mediaGroup) {
        const mediaThumbnail = mediaGroup.getElementsByTagNameNS("http://search.yahoo.com/mrss/", "thumbnail")[0];
        thumbnailUrl = mediaThumbnail?.getAttribute("url");
        
        const mediaCommunity = mediaGroup.getElementsByTagNameNS("http://search.yahoo.com/mrss/", "community")[0];
        if (mediaCommunity) {
          const mediaStatistics = mediaCommunity.getElementsByTagNameNS("http://search.yahoo.com/mrss/", "statistics")[0];
          if (mediaStatistics) {
            const viewsAttr = mediaStatistics.getAttribute("views");
            if (viewsAttr) {
              views = parseInt(viewsAttr, 10);
            }
          }
        }
      }
      
      if (videoId && title && link && publishedDate && thumbnailUrl) {
        videos.push({
          id: videoId,
          title,
          link,
          publishedDate,
          views: views || 0, // Ensure views is a number
          thumbnailUrl,
        });
      } else {
         console.warn("Skipping entry due to missing data:", { videoId, title, link, publishedDate, thumbnailUrl }, entry);
      }
    } catch (e) {
      console.warn("Skipping an entry due to parsing error:", e, entry);
    }
  });

  return { channelTitle, videos };
}
