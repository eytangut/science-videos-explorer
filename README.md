
# Science Video Viewer (Firebase Studio Edition)

This is a Next.js application built in Firebase Studio that allows you to discover and watch popular videos from your favorite science YouTube channels. It fetches video data using the YouTube Data API, stores your preferences locally, and provides a clean interface for browsing content.

## Features

*   Add and manage a list of YouTube science channels.
*   Fetch popular videos from these channels.
*   Filter videos by duration, watch later status.
*   Mark videos as watched to hide them from the main view.
*   Interleaved display of videos from different channels, with shuffling for variety.
*   Local storage for API key, channel list, watched videos, and video cache.
*   Responsive design for desktop and mobile.
*   Dark theme UI.

## Getting Started

1.  **Clone the repository (if you haven't already).**
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up your YouTube Data API Key:**
    *   Go to the [Google Cloud Console](https://console.cloud.google.com/).
    *   Create a new project or select an existing one.
    *   Enable the "YouTube Data API v3".
    *   Create API credentials (API Key).
    *   **Crucially, restrict your API key!** For development, you might allow HTTP referrers for `localhost`. For production deployment (like GitHub Pages), restrict it to your `*.github.io` domain. Also, restrict the key to only be able to use the "YouTube Data API v3".
4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:9002` (or as configured).
5.  **Open the app in your browser and add your API Key and YouTube Channel IDs** in the "Channel Setup" panel on the left.

## Project Structure

*   `src/app/page.tsx`: The main page component containing most of the application logic.
*   `src/components/`: Contains all React components.
    *   `src/components/ui/`: ShadCN UI components.
    *   `ChannelManagementPanel.tsx`: Panel for managing API key and channels.
    *   `VideoCard.tsx`: Component for displaying individual video information.
    *   `VideoList.tsx`: Component for displaying the list of videos and filter controls.
*   `src/hooks/`: Custom React hooks for managing state (channels, watched videos, API key, etc.).
*   `src/lib/`: Utility functions.
    *   `youtubeDataApi.ts`: Functions for interacting with the YouTube Data API.
    *   `utils.ts`: General utility functions like `cn` for Tailwind class merging.
*   `src/types/`: TypeScript type definitions.
*   `public/`: Static assets.
*   `next.config.ts`: Next.js configuration, including static export settings for GitHub Pages.
*   `tailwind.config.ts`: Tailwind CSS configuration.
*   `src/app/globals.css`: Global styles and ShadCN theme variables.

## Deploying to GitHub Pages

This project is configured for static export, making it suitable for deployment to GitHub Pages.

1.  **Update Repository Name in `next.config.ts`:**
    Open `next.config.ts` and ensure the `REPO_NAME` constant is set to your GitHub repository name.
    ```javascript
    const REPO_NAME = 'your-repository-name'; // <<--!!! UPDATE THIS !!!
    ```
    If you are deploying to a user/organization page (e.g., `https://<username>.github.io/`), set `REPO_NAME` to an empty string `''`.

2.  **Build the Application:**
    This command will create a static export of your application in the `out` directory.
    ```bash
    npm run build
    ```

3.  **Deploy to GitHub Pages:**
    This script uses the `gh-pages` package to deploy the contents of the `out` directory to the `gh-pages` branch of your repository.
    ```bash
    npm run deploy
    ```

4.  **Configure GitHub Repository Settings:**
    *   Go to your repository on GitHub.
    *   Navigate to "Settings" > "Pages".
    *   Under "Build and deployment", select "Deploy from a branch" as the source.
    *   Select the `gh-pages` branch and the `/ (root)` folder.
    *   Save the changes.

    It might take a few minutes for your site to become live at `https://<your-username>.github.io/<your-repository-name>/`.

## Further Ideas & Enhancements

Here are 20 ideas to further develop this application:

1.  **User Accounts & Profiles:** Allow users to save their API keys and channel lists to a cloud-backed account (e.g., using Firebase Authentication).
2.  **Shared Channel Lists:** Enable users to share their curated channel lists with others (e.g., via a unique link or code).
3.  **Custom Video Ranking/Sorting:** Allow users to manually drag-and-drop videos to reorder them or apply custom weights/priorities to channels.
4.  **AI-Powered Video Summaries:** Integrate Genkit to generate brief summaries for videos, displayable on the card or in a modal.
5.  **AI-Powered Video Tagging/Categorization:** Use AI (Genkit) to automatically tag videos with more granular topics beyond YouTube's default tags.
6.  **Advanced Filtering by AI Tags:** Allow filtering videos based on the AI-generated tags or categories.
7.  **"Surprise Me" Button:** A button to randomly pick and highlight/play a video from the current filtered list.
8.  **Playlist Creation within App:** Let users create and manage personal "app playlists" from the discovered videos.
9.  **"New Videos Since Last Visit" Indicator:** Highlight videos that have been published since the user's last session with the app.
10. **Enhanced Statistics & Insights:** Show more detailed stats like average video length preference, most-watched channels, or trends in video topics.
11. **Channel Discovery Suggestions:** Based on currently added channels, suggest similar science channels using AI or YouTube's related channels data.
12. **Comment Highlights/Analysis:** Fetch top/relevant comments for a video or perform sentiment analysis on comments using Genkit.
13. **More Keyboard Shortcuts:** Implement shortcuts for actions like "mark as watched," "add to watch later," "next video," etc.
14. **Import/Export Settings:** Allow users to export their entire configuration (API key, channels, watched videos, etc.) as a JSON file and import it.
15. **Theming Options:** Allow users to choose between a few pre-defined themes or customize accent colors.
16. **Integration with "Read Later" Services:** Add buttons to send videos directly to services like Pocket or Instapaper.
17. **Customizable Video Card Layouts:** Offer options for different video card sizes (compact, detailed) or a pure list view.
18. **"Why am I seeing this?" Feature:** For each video, provide a brief explanation based on current filters and sorting why it appeared (e.g., "Popular from Vsauce, matches 'All Durations' filter").
19. **Video Series Detection/Grouping:** Attempt to identify and group videos that belong to a series from a channel.
20. **Watched History & Playback Position:** More advanced tracking of watched videos, potentially storing playback position if using an embedded player.

We hope you enjoy using and extending the Science Video Viewer!
