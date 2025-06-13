import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rssUrl = searchParams.get('url');

  if (!rssUrl) {
    return NextResponse.json({ error: 'RSS URL is required' }, { status: 400 });
  }

  try {
    // Validate URL format (basic)
    new URL(rssUrl);
  } catch (error) {
    return NextResponse.json({ error: 'Invalid RSS URL format' }, { status: 400 });
  }

  try {
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'ScienceVideoViewer/1.0 (Next.js App)',
        'Accept': 'application/xml, text/xml',
      },
      // Add a timeout if running in Node.js environments that support AbortController
      // signal: AbortSignal.timeout(10000) // 10 seconds, example
    });

    if (!response.ok) {
      console.error(`Failed to fetch RSS feed from ${rssUrl}: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Failed to fetch RSS feed: ${response.statusText}` }, { status: response.status });
    }

    const xmlText = await response.text();
    
    // Basic check for XML content
    if (!xmlText.trim().startsWith('<')) {
        return NextResponse.json({ error: 'Response does not appear to be XML' }, { status: 500 });
    }

    return new NextResponse(xmlText, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    });
  } catch (error) {
    console.error(`Error fetching or processing RSS feed from ${rssUrl}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    // Avoid leaking too much internal detail for network errors to client
    if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED')) {
        return NextResponse.json({ error: 'Could not connect to the RSS feed server.'}, {status: 502});
    }
    return NextResponse.json({ error: `Server error processing RSS feed: ${errorMessage}` }, { status: 500 });
  }
}
