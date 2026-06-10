// Integration module: Video-Streaming
export function masterPlaylist(assetId: string, renditions = [360, 720, 1080]) {
  return renditions
    .map((height) => `#EXT-X-STREAM-INF:BANDWIDTH=${height * 1400},RESOLUTION=1280x${height}\n${height}p.m3u8`)
    .join("\n");
}

export function cdnUrl(assetId: string) {
  const base = process.env.VIDEO_CDN_BASE_URL || "/hls";
  return `${base}/${assetId}/master.m3u8`;
}
