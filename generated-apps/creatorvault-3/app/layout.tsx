import "./globals.css";

export const metadata = {
  title: "CreatorVault",
  description: "Build a video streaming platform for creators, editors, and viewers. Real users: creator, video editor, subscriber. Real actions: upload video multipart, queue FFmpeg transcoding, generate HLS playlist, publish CDN playback URL, track processing status, and manage video library. Real data: users, videos, transcode jobs, renditions, playlists, subscriptions. Real state changes: upload creates asset, transcode updates status, publish exposes CDN URL, refresh keeps saved state.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
