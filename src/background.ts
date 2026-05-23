import { SoundCloudApi, StreamDetails, Track } from "./soundcloudApi";
import { Logger } from "./utils/logger";
import {
  onBeforeSendHeaders,
  onBeforeRequest,
  downloadToFile,
  onMessage,
  onPageActionClicked,
  openOptionsPage,
  getExtensionManifest,
  sendMessageToTab,
} from "./compatibilityStubs";
import { MetadataExtractor, ArtistType, RemixType } from "./metadataExtractor";
import { Mp3TagWriter } from "./tagWriters/mp3TagWriter";
import {
  loadConfiguration,
  storeConfigValue,
  getConfigValue,
} from "./utils/config";
import { TagWriter } from "./tagWriters/tagWriter";
import { Mp4TagWriter } from "./tagWriters/mp4TagWriter";
import { Parser } from "m3u8-parser";
import {
  concatArrayBuffers,
  sanitizeFilenameForDownload,
} from "./utils/download";
import { WavTagWriter } from "./tagWriters/wavTagWriter";

class TrackError extends Error {
  readonly errorLabel?: string;

  constructor(message: string, trackId: number, errorLabel?: string) {
    super(`${message} (TrackId: ${trackId})`);
    this.errorLabel = errorLabel;
  }
}

const soundcloudApi = new SoundCloudApi();
const logger = Logger.create("Background");
const manifest = getExtensionManifest();

logger.logInfo("Starting with version: " + manifest.version);

loadConfiguration(true);

interface DownloadData {
  trackId: number;
  title: string;
  duration: number;
  uploadDate: Date;
  username: string;
  userPermalink: string;
  avatarUrl: string;
  artworkUrl: string;
  streamUrl: string;
  fileExtension?: string;
  trackNumber: number | undefined;
  albumName: string | undefined;
  hls: boolean;
  permalinkUrl: string;
}

async function handleDownload(
  data: DownloadData,
  reportProgress: (progress?: number) => void
) {
  // todo: one big try-catch is not really good error handling :/
  try {
    logger.logInfo(`Initiating download of ${data.trackId} with payload`, {
      payload: data,
    });

    let artistsString = data.username;
    let titleString = data.title;

    if (getConfigValue("normalize-track")) {
      const extractor = new MetadataExtractor(
        data.title,
        data.username,
        data.userPermalink
      );

      let artists = extractor.getArtists();

      if (!getConfigValue("include-producers"))
        artists = artists.filter((i) => i.type !== ArtistType.Producer);

      artistsString = artists.map((i) => i.name).join(", ");
      titleString = extractor.getTitle();
      const remixers = artists.filter((i) => i.type === ArtistType.Remixer);

      if (remixers.length > 0) {
        const remixerNames = remixers.map((i) => i.name).join(" & ");
        const remixTypeString =
          RemixType[remixers[0].remixType || RemixType.Remix].toString();

        titleString += ` (${remixerNames} ${remixTypeString})`;
      }
    }

    if (!artistsString) {
      artistsString = "Unknown";
    }

    if (!titleString) {
      titleString = "Unknown";
    }

    const rawFilename = sanitizeFilenameForDownload(
      `${artistsString} - ${titleString}`
    );

    let artworkUrl = data.artworkUrl;

    if (!artworkUrl) {
      logger.logInfo(
        `No Artwork URL could be determined. Fallback to User Avatar (TrackId: ${data.trackId})`
      );
      artworkUrl = data.avatarUrl;
    }

    logger.logInfo(
      `Starting download of '${rawFilename}' (TrackId: ${data.trackId})...`
    );

    let streamBuffer: ArrayBuffer;
    let streamHeaders: Headers;

    if (data.hls) {
      try {
        const playlistReq = await fetch(data.streamUrl);
        const playlist = await playlistReq.text();

        // @ts-ignore
        const parser = new Parser();

        parser.push(playlist);
        parser.end();

        const parsedSegments: { uri: string; map?: { uri: string } }[] =
          parser.manifest.segments;

        // Collect unique EXT-X-MAP init segments. Fragmented MP4 (CMAF) HLS
        // playlists reference an init segment containing the 'ftyp' and 'moov'
        // boxes; without it the concatenated media segments are unplayable and
        // have no moov to attach tags to.
        const initSegmentUrls: string[] = [];
        for (const segment of parsedSegments) {
          const mapUri = segment.map?.uri;
          if (mapUri && !initSegmentUrls.includes(mapUri)) {
            initSegmentUrls.push(mapUri);
          }
        }

        const segmentUrls: string[] = parsedSegments.map((i) => i.uri);
        const allUrls = [...initSegmentUrls, ...segmentUrls];
        const segments: ArrayBuffer[] = [];

        for (let i = 0; i < allUrls.length; i++) {
          const segmentReq = await fetch(allUrls[i]);
          const segment = await segmentReq.arrayBuffer();

          segments.push(segment);

          const progress = Math.round((i / allUrls.length) * 100);

          reportProgress(progress);
        }

        reportProgress(100);

        streamBuffer = concatArrayBuffers(segments);
      } catch (error) {
        logger.logError(
          `Failed to download m3u8 playlist (TrackId: ${data.trackId})`,
          error
        );

        throw error;
      }
    } else {
      try {
        [streamBuffer, streamHeaders] = await soundcloudApi.downloadStream(
          data.streamUrl,
          reportProgress
        );
      } catch (error) {
        logger.logError(
          `Failed to download stream (TrackId: ${data.trackId})`,
          error
        );

        throw error;
      }
    }

    if (!streamBuffer) {
      throw new TrackError(
        "SoundCloud returned no audio data for this track.",
        data.trackId,
        "No audio received"
      );
    }

    let contentType;
    if (!data.fileExtension && streamHeaders) {
      contentType = streamHeaders.get("content-type");
      let extension = "mp3";

      if (contentType === "audio/mp4") extension = "m4a";
      else if (contentType === "audio/x-wav" || contentType === "audio/wav")
        extension = "wav";

      data.fileExtension = extension;

      logger.logInfo(
        `Inferred file extension from 'content-type' header (TrackId: ${data.trackId})`,
        {
          contentType,
          extension,
        }
      );
    }

    let downloadBuffer: ArrayBuffer;

    if (getConfigValue("set-metadata")) {
      try {
        let writer: TagWriter;

        if (data.fileExtension === "m4a") {
          const mp4Writer = new Mp4TagWriter(streamBuffer);

          try {
            mp4Writer.setDuration(data.duration);
          } catch (error) {
            logger.logError(
              `Failed to set duration for track (TrackId: ${data.trackId})`,
              error
            );
          }

          writer = mp4Writer;
        } else if (data.fileExtension === "mp3") {
          writer = new Mp3TagWriter(streamBuffer);
        } else if (data.fileExtension === "wav") {
          writer = new WavTagWriter(streamBuffer);
        }

        if (writer) {
          writer.setTitle(titleString);
          // todo: sanitize album as well
          writer.setAlbum(data.albumName ?? titleString);
          writer.setArtists([artistsString]);

          writer.setComment(data.permalinkUrl || data.trackId.toString());

          if (data.trackNumber > 0) {
            writer.setTrackNumber(data.trackNumber);
          }

          writer.setDate(data.uploadDate);

          if (artworkUrl) {
            const sizeOptions = ["original", "t500x500", "large"];
            let artworkBuffer = null;
            let curArtworkUrl;

            do {
              const curSizeOption = sizeOptions.shift();
              curArtworkUrl = artworkUrl.replace(
                "-large.",
                `-${curSizeOption}.`
              );

              artworkBuffer = await soundcloudApi.downloadArtwork(
                curArtworkUrl
              );
            } while (artworkBuffer === null && sizeOptions.length > 0);

            if (artworkBuffer) {
              writer.setArtwork(artworkBuffer);
            }
          } else {
            logger.logWarn(
              `Skipping download of Artwork (TrackId: ${data.trackId})`
            );
          }

          downloadBuffer = await writer.getBuffer();
        }
      } catch (error) {
        logger.logError(
          `Failed to set metadata (TrackId: ${data.trackId})`,
          error
        );
      }
    }

    const blobOptions: BlobPropertyBag = {};

    if (contentType) blobOptions.type = contentType;

    const downloadBlob = new Blob(
      [downloadBuffer ?? streamBuffer],
      blobOptions
    );

    const saveAs = !getConfigValue("download-without-prompt");
    const defaultDownloadLocation = getConfigValue("default-download-location");
    let downloadFilename = rawFilename + "." + data.fileExtension;

    if (!saveAs && defaultDownloadLocation) {
      downloadFilename = defaultDownloadLocation + "/" + downloadFilename;
    }

    logger.logInfo(
      `Downloading track as '${downloadFilename}' (TrackId: ${data.trackId})...`
    );

    let downloadUrl: string;

    try {
      downloadUrl = URL.createObjectURL(downloadBlob);

      await downloadToFile(downloadUrl, downloadFilename, saveAs);

      logger.logInfo(
        `Successfully downloaded '${rawFilename}' (TrackId: ${data.trackId})!`
      );

      reportProgress(101);
    } catch (error) {
      logger.logError(
        `Failed to download track to file system (TrackId: ${data.trackId})`,
        {
          downloadFilename,
          saveAs,
        }
      );

      throw new TrackError(
        "The file couldn't be saved to your computer. Check your browser's download permissions and try again.",
        data.trackId,
        "Could not save file"
      );
    } finally {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    }
  } catch (error) {
    if (error instanceof TrackError) {
      throw error;
    }

    throw new TrackError(
      "Something went wrong while downloading this track. Please try again.",
      data.trackId,
      "Unexpected error"
    );
  }
}

interface TranscodingDetails {
  url: string;
  protocol: "hls" | "progressive";
  quality: "hq" | "sq";
  extension: string;
}

function getTranscodingDetails(details: Track): TranscodingDetails[] | null {
  if (details?.media?.transcodings?.length < 1) return null;

  logger.logInfo(
    `Available transcodings for track ${details.id}`,
    details.media.transcodings.map((t) => ({
      protocol: t.format?.protocol,
      mime_type: t.format?.mime_type,
      quality: t.quality,
      snipped: t.snipped,
      url: t.url,
    }))
  );

  const mpegStreams = details.media.transcodings
    .filter(
      (transcoding) =>
        (transcoding.format?.protocol === "progressive" ||
          transcoding.format?.protocol === "hls") &&
        (transcoding.format?.mime_type?.startsWith("audio/mpeg") ||
          transcoding.format?.mime_type?.startsWith("audio/mp4")) &&
        !transcoding.snipped
    )
    .map<TranscodingDetails>((transcoding) => ({
      protocol: transcoding.format.protocol,
      url: transcoding.url,
      quality: transcoding.quality,
      extension: soundcloudApi.convertMimeTypeToExtension(
        transcoding.format.mime_type
      ),
    }));

  if (mpegStreams.length < 1) {
    logger.logWarn("No transcodings streams could be determined!");

    return null;
  }

  // prefer 'hqq and 'progressive' streams
  let streams = mpegStreams.sort((a, b) => {
    if (a.quality === "hq" && b.quality === "sq") {
      return -1;
    }

    if (a.quality === "sq" && b.quality === "hq") {
      return 1;
    }

    if (a.protocol === "progressive" && b.protocol === "hls") {
      return -1;
    }

    if (a.protocol === "hls" && b.protocol === "progressive") {
      return 1;
    }

    return 0;
  });

  if (!getConfigValue("download-hq-version")) {
    streams = streams.filter((stream) => stream.quality !== "hq");
  }

  if (streams.some((stream) => stream.quality === "hq")) {
    logger.logInfo("Including high quality streams!");
  }

  return streams;
}

// -------------------- HANDLERS --------------------
const authRegex = new RegExp("OAuth (.+)");
const followerIdRegex = new RegExp("/me/followings/(\\d+)");

onBeforeSendHeaders(
  (details) => {
    let requestHasAuth = false;

    if (details.requestHeaders && getConfigValue("oauth-token") !== null) {
      for (let i = 0; i < details.requestHeaders.length; i++) {
        if (details.requestHeaders[i].name.toLowerCase() !== "authorization")
          continue;

        requestHasAuth = true;
        const authHeader = details.requestHeaders[i].value;

        const result = authRegex.exec(authHeader);

        if (!result || result.length < 2) continue;

        storeConfigValue("oauth-token", result[1]);
      }

      const oauthToken = getConfigValue("oauth-token");

      if (!requestHasAuth && oauthToken) {
        logger.logDebug("Adding OAuth token to request...", { oauthToken });

        details.requestHeaders.push({
          name: "Authorization",
          value: "OAuth " + oauthToken,
        });

        return {
          requestHeaders: details.requestHeaders,
        };
      }
    }
  },
  ["*://api-v2.soundcloud.com/*"],
  ["blocking", "requestHeaders"]
);

onBeforeRequest(
  (details) => {
    const url = new URL(details.url);

    if (
      url.pathname === "/connect/session" &&
      getConfigValue("oauth-token") === null
    ) {
      logger.logInfo("User logged in");

      storeConfigValue("oauth-token", undefined);
    } else if (url.pathname === "/sign-out") {
      logger.logInfo("User logged out");

      storeConfigValue("oauth-token", null);
      storeConfigValue("client-id", null);
    } else {
      const clientId = url.searchParams.get("client_id");
      const storedClientId = getConfigValue("client-id");

      if (clientId) {
        storeConfigValue("client-id", clientId);
      } else if (storedClientId) {
        logger.logDebug("Adding ClientId to unauthenticated request...", {
          url,
          clientId: storedClientId,
        });

        url.searchParams.append("client_id", storedClientId);

        return {
          redirectUrl: url.toString(),
        };
      }
    }
  },
  ["*://api-v2.soundcloud.com/*", "*://api-auth.soundcloud.com/*"],
  ["blocking"]
);

function isValidTrack(track: Track) {
  return (
    track &&
    track.kind === "track" &&
    track.state === "finished" &&
    (track.streamable || track.downloadable)
  );
}

function isTranscodingDetails(detail: unknown): detail is TranscodingDetails {
  return !!detail["protocol"];
}

async function downloadTrack(
  track: Track,
  trackNumber: number | undefined,
  albumName: string | undefined,
  reportProgress: (progress?: number) => void
) {
  if (!track) {
    logger.logError("Cannot download: track resource is null (resolve failed)");

    throw new Error("Track resource is null (resolve failed)");
  }

  if (!isValidTrack(track)) {
    logger.logError(
      "Track does not satisfy constraints needed to be downloadable",
      {
        id: track.id,
        kind: track.kind,
        state: track.state,
        streamable: track.streamable,
        downloadable: track.downloadable,
      }
    );

    throw new TrackError(
      "This track isn't available for download. It may be private, geo-blocked, or still being processed by SoundCloud.",
      track.id,
      "Track unavailable"
    );
  }

  const downloadDetails: Array<StreamDetails | TranscodingDetails> = [];

  if (
    getConfigValue("download-original-version") &&
    track.downloadable &&
    track.has_downloads_left
  ) {
    const originalDownloadUrl = await soundcloudApi.getOriginalDownloadUrl(
      track.id
    );

    if (originalDownloadUrl) {
      const stream: StreamDetails = {
        url: originalDownloadUrl,
        hls: false,
      };

      downloadDetails.push(stream);
    }
  }

  const transcodingDetails = getTranscodingDetails(track);

  if (transcodingDetails) {
    downloadDetails.push(...transcodingDetails);
  }

  if (downloadDetails.length < 1) {
    throw new TrackError(
      "SoundCloud didn't provide any audio source for this track, so it can't be downloaded.",
      track.id,
      "No audio source"
    );
  }

  for (const downloadDetail of downloadDetails) {
    let stream: StreamDetails;

    try {
      if (isTranscodingDetails(downloadDetail)) {
        logger.logDebug(
          "Get stream details from transcoding details",
          downloadDetail
        );

        const streamUrl = await soundcloudApi.getStreamUrl(
          downloadDetail.url,
          track.track_authorization
        );
        stream = {
          url: streamUrl,
          hls: downloadDetail.protocol === "hls",
          extension: downloadDetail.extension,
        };
      } else {
        stream = downloadDetail;
      }

      const downloadData: DownloadData = {
        trackId: track.id,
        duration: track.duration,
        uploadDate: new Date(track.display_date),
        streamUrl: stream.url,
        fileExtension: stream.extension,
        title: track.title,
        username: track.user.username,
        userPermalink: track.user.permalink,
        artworkUrl: track.artwork_url,
        avatarUrl: track.user.avatar_url,
        trackNumber,
        albumName,
        hls: stream.hls,
        permalinkUrl: track.permalink_url,
      };

      await handleDownload(downloadData, reportProgress);

      return;
    } catch (error) {
      logger.logWarn(
        `Failed to download a version of track ${track.id}, trying next`,
        {
          downloadDetail,
          error: error instanceof Error ? error.message : error,
        }
      );

      continue;
    }
  }

  const hasDrmOnly =
    track.media?.transcodings?.length > 0 &&
    track.media.transcodings.every((t) =>
      t.format?.protocol?.includes("encrypted")
    );

  const hasDrm = track.media?.transcodings?.some((t) =>
    t.format?.protocol?.includes("encrypted")
  );

  if (hasDrmOnly) {
    throw new TrackError(
      "SoundCloud serves this track as a DRM-protected stream. It can be played in the browser but cannot be saved as a file.",
      track.id,
      "DRM-protected stream"
    );
  }

  if (hasDrm) {
    throw new TrackError(
      "SoundCloud only offers this track as a DRM-protected stream. It can be played in the browser but cannot be saved as a file.",
      track.id,
      "DRM-protected stream"
    );
  }

  throw new TrackError(
    "None of the available audio versions for this track could be downloaded. SoundCloud may have removed or restricted the audio.",
    track.id,
    "Download failed"
  );
}

interface Playlist {
  tracks: Track[];
  set_type: string;
  title: string;
}

interface DownloadRequest {
  type: string;
  url: string;
  downloadId: string;
}

interface DownloadProgress {
  downloadId: string;
  progress?: number;
  error?: string;
  errorLabel?: string;
}

function sendDownloadProgress(
  tabId: number,
  downloadId: string,
  progress?: number,
  error?: Error | string
) {
  let errorMessage: string = "";
  let errorLabel: string | undefined;

  if (error instanceof Error) {
    errorMessage = error.message;
    const label = (error as { errorLabel?: string }).errorLabel;
    if (label) {
      errorLabel = label;
    }
  } else {
    errorMessage = error;
  }

  const downloadProgress: DownloadProgress = {
    downloadId,
    progress,
    error: errorMessage,
    errorLabel,
  };

  sendMessageToTab(tabId, downloadProgress);
}

function chunkArray<T>(array: T[], chunkSize: number) {
  if (chunkSize < 1) throw new Error("Invalid chunk size");

  const chunks: T[][] = [];

  for (let i = 0; i < array.length; i += chunkSize) {
    const chunk = array.slice(i, i + chunkSize);

    chunks.push(chunk);
  }

  return chunks;
}

onMessage(async (sender, message: DownloadRequest) => {
  const tabId = sender.tab.id;
  const { downloadId, url, type } = message;

  if (!tabId) return;

  try {
    if (type === "DOWNLOAD_SET") {
      logger.logDebug("Received set download request", { url });

      const set = await soundcloudApi.resolveUrl<Playlist>(url);
      const isAlbum = set.set_type === "album" || set.set_type === "ep";

      const trackIds = set.tracks.map((i) => i.id);

      const progresses: { [key: number]: number } = {};

      const reportPlaylistProgress =
        (trackId: number) => (progress?: number) => {
          if (progress) {
            progresses[trackId] = progress;
          }

          const totalProgress = Object.values(progresses).reduce(
            (acc, cur) => acc + cur,
            0
          );

          sendDownloadProgress(
            tabId,
            downloadId,
            totalProgress / trackIds.length
          );
        };

      const treatAsAlbum = isAlbum && trackIds.length > 1;
      const albumName = treatAsAlbum ? set.title : undefined;

      const trackIdChunkSize = 10;
      const trackIdChunks = chunkArray(trackIds, trackIdChunkSize);

      let successes = 0;
      let failures = 0;
      const failureLabels = new Set<string>();
      let lastFailure: Error | undefined;

      let currentTrackIdChunk = 0;
      for (const trackIdChunk of trackIdChunks) {
        const baseTrackNumber = currentTrackIdChunk * trackIdChunkSize;

        const keyedTracks = await soundcloudApi.getTracks(trackIdChunk);
        const tracks = Object.values(keyedTracks).reverse();

        logger.logInfo(`Downloading ${isAlbum ? "album" : "playlist"}...`);

        const downloads: Promise<void>[] = [];

        for (let i = 0; i < tracks.length; i++) {
          const trackNumber = treatAsAlbum
            ? baseTrackNumber + i + 1
            : undefined;

          const download = downloadTrack(
            tracks[i],
            trackNumber,
            albumName,
            reportPlaylistProgress(tracks[i].id)
          ).then(
            () => {
              successes++;
            },
            (error: Error) => {
              failures++;
              lastFailure = error;
              const label = (error as { errorLabel?: string }).errorLabel;
              if (label) {
                failureLabels.add(label);
              }
              logger.logError("Failed to download track of set", error);
            }
          );

          downloads.push(download);
        }

        await Promise.all(downloads);

        currentTrackIdChunk++;
      }

      logger.logInfo(
        `Downloaded ${isAlbum ? "album" : "playlist"} (${successes} ok, ${failures} failed)`
      );

      if (successes === 0 && failures > 0) {
        const labels = [...failureLabels];
        const label =
          labels.length === 1 ? labels[0] : `All ${failures} tracks failed`;
        const lastDetail = lastFailure?.message
          ? ` Last error: ${lastFailure.message}`
          : "";
        const summary = Object.assign(
          new Error(
            `None of the ${failures} tracks in this set could be downloaded.${lastDetail}`
          ),
          { errorLabel: label }
        );

        sendDownloadProgress(tabId, downloadId, undefined, summary);
      } else {
        sendDownloadProgress(tabId, downloadId, 101);
      }
    } else if (type === "DOWNLOAD") {
      logger.logDebug("Received track download request", { url });

      const track = await soundcloudApi.resolveUrl<Track>(url);

      const reportTrackProgress = (progress?: number) => {
        sendDownloadProgress(tabId, downloadId, progress);
      };

      await downloadTrack(track, undefined, undefined, reportTrackProgress);
    } else {
      throw new Error(`Unknown download type: ${type}`);
    }
  } catch (error) {
    sendDownloadProgress(tabId, downloadId, undefined, error);

    logger.logError("Download failed unexpectedly", error);
  }
});

onPageActionClicked(() => {
  openOptionsPage();
});
