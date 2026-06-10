// Integration module: Video-Streaming
export type TranscodeInput = { assetId: string; sourcePath: string; renditions?: number[] };

export function createFfmpegCommands(input: TranscodeInput) {
  const renditions = input.renditions || [360, 720, 1080];
  return renditions.map((height) => ({
    height,
    command: `ffmpeg -i ${input.sourcePath} -vf scale=-2:${height} -hls_time 6 -hls_playlist_type vod public/hls/${input.assetId}/${height}p.m3u8`,
  }));
}
