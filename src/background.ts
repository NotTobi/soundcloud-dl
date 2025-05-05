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
  searchDownloads,
} from "./compatibilityStubs";
import { MetadataExtractor, ArtistType, RemixType } from "./metadataExtractor";
import { Mp3TagWriter } from "./tagWriters/mp3TagWriter";
import { loadConfiguration, storeConfigValue, getConfigValue, registerConfigChangeHandler, loadConfigValue } from "./utils/config";
import { TagWriter } from "./tagWriters/tagWriter";
import { Mp4TagWriter } from "./tagWriters/mp4TagWriter";
import { Parser } from "m3u8-parser";
import { concatArrayBuffers, sanitizeFilenameForDownload } from "./utils/download";
import { WavTagWriter } from "./tagWriters/wavTagWriter";

// Message Type Constants
const DOWNLOAD_SET = "DOWNLOAD_SET";
const DOWNLOAD = "DOWNLOAD";

class TrackError extends Error {
  constructor(message: string, trackId: number) {
    super(`${message} (TrackId: ${trackId})`);
  }
}

const soundcloudApi = new SoundCloudApi();
const logger = Logger.create("Background");
const manifest = getExtensionManifest();

logger.logInfo("Starting with version: " + manifest.version);

// Load configuration and THEN register message listener
loadConfiguration(true).then(() => {
  logger.logInfo("Initial configuration loaded. Registering message listener.");
  
  onMessage(async (sender, message: DownloadRequest) => {
    const tabId = sender.tab.id;
    const { downloadId, url, type } = message;

    if (!tabId) return;

    try {
      if (type === DOWNLOAD_SET) {
        logger.logDebug("Received set download request", { url });

        const set = await soundcloudApi.resolveUrl<Playlist>(url);

        if (!set) {
          throw new Error(`Failed to resolve SoundCloud URL. Check if you are logged in or if the URL is correct. URL: ${url}`);
        }

        const isAlbum = set.set_type === "album" || set.set_type === "ep";

        const trackIds = set.tracks.map((i) => i.id);

        const progresses: { [key: number]: number } = {};

        const reportPlaylistProgress = (trackId: number) => (progress?: number) => {
          if (progress) {
            progresses[trackId] = progress;
          }

          const totalProgress = Object.values(progresses).reduce((acc, cur) => acc + cur, 0);

          sendDownloadProgress(tabId, downloadId, totalProgress / trackIds.length);
        };

        const treatAsAlbum = isAlbum && trackIds.length > 1;
        const albumName = treatAsAlbum ? set.title : undefined;

        const trackIdChunkSize = 10;
        const trackIdChunks = chunkArray(trackIds, trackIdChunkSize);

        let currentTrackIdChunk = 0;
        for (const trackIdChunk of trackIdChunks) {
          const baseTrackNumber = currentTrackIdChunk * trackIdChunkSize;

          const keyedTracks = await soundcloudApi.getTracks(trackIdChunk);
          const tracks = Object.values(keyedTracks).reverse();

          logger.logInfo(`Downloading ${isAlbum ? "album" : "playlist"}...`);

          const downloads: Promise<void>[] = [];

          for (let i = 0; i < tracks.length; i++) {
            const trackNumber = treatAsAlbum ? baseTrackNumber + i + 1 : undefined;
            const playlistName = !isAlbum ? set.title : undefined;

            const download = downloadTrack(tracks[i], trackNumber, albumName, playlistName, reportPlaylistProgress(tracks[i].id));

            downloads.push(download);
          }

          await Promise.all(
            downloads.map((p) =>
              p.catch((error) => {
                logger.logError("Failed to download track of set", error);
              })
            )
          );

          currentTrackIdChunk++;
        }

        logger.logInfo(`Downloaded ${isAlbum ? "album" : "playlist"}!`);
      } else if (type === DOWNLOAD) {
        logger.logDebug("Received track download request", { url });

        const track = await soundcloudApi.resolveUrl<Track>(url);

        const reportTrackProgress = (progress?: number) => {
          sendDownloadProgress(tabId, downloadId, progress);
        };

        await downloadTrack(track, undefined, undefined, undefined, reportTrackProgress);
      } else {
        throw new Error(`Unknown download type: ${type}`);
      }
    } catch (error) {
      sendDownloadProgress(tabId, downloadId, undefined, error);

      logger.logError("Download failed unexpectedly", error);
    }
  });
});

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
  playlistName?: string;
  hls: boolean;
}

async function handleDownload(data: DownloadData, reportProgress: (progress?: number) => void) {
  // --- DEBUG START: Moved to very beginning ---
  logger.logDebug(`[handleDownload ENTRY] Processing TrackId: ${data.trackId}. History check comes later.`);
  // --- DEBUG END ---
  // todo: one big try-catch is not really good error handling :/
  try {
    logger.logInfo(`Initiating download check for ${data.trackId} with payload`, { payload: data });

    let artistsString = data.username;
    let titleString = data.title;

    if (getConfigValue("normalize-track")) {
      const extractor = new MetadataExtractor(data.title, data.username, data.userPermalink);

      let artists = extractor.getArtists();

      if (!getConfigValue("include-producers")) artists = artists.filter((i) => i.type !== ArtistType.Producer);

      artistsString = artists.map((i) => i.name).join(", ");
      titleString = extractor.getTitle();
      const remixers = artists.filter((i) => i.type === ArtistType.Remixer);

      if (remixers.length > 0) {
        const remixerNames = remixers.map((i) => i.name).join(" & ");
        const remixTypeString = RemixType[remixers[0].remixType || RemixType.Remix].toString();

        titleString += ` (${remixerNames} ${remixTypeString})`;
      }
    }

    if (!artistsString) {
      artistsString = "Unknown";
    }

    if (!titleString) {
      titleString = "Unknown";
    }

    const rawFilenameBase = sanitizeFilenameForDownload(`${artistsString} - ${titleString}`);

    // --- START Calculate potential final filename ---
    const saveAs = !getConfigValue("download-without-prompt");
    const defaultDownloadLocation = getConfigValue("default-download-location");
    // We need a potential extension here to check; assume mp3 as most common or use provided if available
    const checkExtension = data.fileExtension || 'mp3'; 
    let potentialDownloadFilename = rawFilenameBase + "." + checkExtension;

    if (!saveAs && defaultDownloadLocation) {
      if (data.playlistName) {
        const sanitizedPlaylistName = sanitizeFilenameForDownload(data.playlistName);
        potentialDownloadFilename = defaultDownloadLocation + "/" + sanitizedPlaylistName + "/" + potentialDownloadFilename;
      } else {
        potentialDownloadFilename = defaultDownloadLocation + "/" + potentialDownloadFilename;
      }
    }
    // --- END Calculate potential final filename ---

    // --- Log values just before the check ---
    const shouldDownloadWithoutPrompt = getConfigValue("download-without-prompt");
    const shouldSkipExisting = getConfigValue("skipExistingFiles");
    logger.logDebug(`Skip check condition values: downloadWithoutPrompt=${shouldDownloadWithoutPrompt}, skipExistingFiles=${shouldSkipExisting}`);
    // --- End log ---

    // --- START Skip existing file check ---
    if (shouldSkipExisting) {
      try {
        // Construct path prefix (handling playlist/default location)
        let pathPrefix = "";
        if (defaultDownloadLocation) {
          if (data.playlistName) {
            const sanitizedPlaylistName = sanitizeFilenameForDownload(data.playlistName);
            pathPrefix = defaultDownloadLocation + "/" + sanitizedPlaylistName + "/";
          } else {
            pathPrefix = defaultDownloadLocation + "/";
          }
        }

        // Store the track ID in a dedicated download history tracker to prevent duplicate downloads
        // even across browser sessions
        const trackIdKey = `track-${data.trackId}`;
        const trackDownloadHistory = await loadConfigValue("track-download-history");
        
        // --- DEBUG START ---
        logger.logDebug(`[handleDownload] Checking history for key: ${trackIdKey}. Current history object:`, trackDownloadHistory);
        // --- DEBUG END ---
        
        // Check if we've already downloaded this specific track ID
        if (trackDownloadHistory && trackDownloadHistory[trackIdKey]) {
          const previousDownload = trackDownloadHistory[trackIdKey];
          logger.logInfo(`Skipping download for TrackId: ${data.trackId}. Previously downloaded as: ${previousDownload.filename} at ${new Date(previousDownload.timestamp).toLocaleString()}`);
          reportProgress(101); // Report as complete immediately to prevent UI hanging
          return; // Skip the rest of the download process
        }
        
        // Multi-strategy file existence checks
        
        // Strategy 1: Exact filename match with known extension
        const specificFilename = `${pathPrefix}${rawFilenameBase}.${data.fileExtension || 'mp3'}`;
        logger.logDebug(`[Strategy 1] Checking for specific file: ${specificFilename}`);
        const exactQuery = { filename: specificFilename };
        const exactMatches = await searchDownloads(exactQuery);
        logger.logDebug(`[Strategy 1] Found ${exactMatches.length} exact matches in download history`);
        
        // Strategy 2: Regex pattern to match any extension
        const escapedPathPrefix = pathPrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const escapedRawFilenameBase = rawFilenameBase.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regexQuery = { filenameRegex: `^${escapedPathPrefix}${escapedRawFilenameBase}\..+$` };
        logger.logDebug(`[Strategy 2] Checking with regex pattern: ${regexQuery.filenameRegex}`);
        const regexMatches = exactMatches.length === 0 ? await searchDownloads(regexQuery) : [];
        logger.logDebug(`[Strategy 2] Found ${regexMatches.length} regex matches in download history`);
        
        // Strategy 3: Check by track title and artist in filename, ignoring exact path
        const filenameWithoutPathRegex = `${escapedRawFilenameBase}\..+$`;
        const titleArtistQuery = { filenameRegex: filenameWithoutPathRegex };
        logger.logDebug(`[Strategy 3] Checking with title/artist only: ${titleArtistQuery.filenameRegex}`);
        const titleArtistMatches = exactMatches.length === 0 && regexMatches.length === 0 ? 
                                  await searchDownloads(titleArtistQuery) : [];
        logger.logDebug(`[Strategy 3] Found ${titleArtistMatches.length} title/artist matches in download history`);
        
        // Combine all matches and filter for completed downloads
        const allMatches = [...exactMatches, ...regexMatches, ...titleArtistMatches];
        const completedDownloads = allMatches.filter(d => d.state === 'complete');
        
        if (completedDownloads.length > 0) {
          // Log details about ALL matches found for better debugging
          completedDownloads.forEach((download, index) => {
            logger.logDebug(`Match ${index + 1}: ${download.filename} (State: ${download.state}, ID: ${download.id})`);
          });
          
          // Found an existing download - skip this one
          logger.logInfo(`Skipping download for TrackId: ${data.trackId}. File already exists in download history: ${completedDownloads[0].filename}`);
          
          // Store this track in our download history
          trackDownloadHistory[trackIdKey] = {
            filename: completedDownloads[0].filename,
            timestamp: Date.now()
          };
          await storeConfigValue("track-download-history", trackDownloadHistory);
          
          reportProgress(101); // Report as complete immediately to prevent UI hanging
          return; // Skip the rest of the download process
        } else {
          logger.logDebug(`No matching downloads found for TrackId: ${data.trackId} with filename base "${rawFilenameBase}"`);
        }
      } catch (error) {
        logger.logError(`Error checking for existing download (TrackId: ${data.trackId})`, error);
        // Continue with download despite check error
      }
    }
    // --- END Skip existing file check ---

    let artworkUrl = data.artworkUrl;

    if (!artworkUrl) {
      logger.logInfo(`No Artwork URL could be determined. Fallback to User Avatar (TrackId: ${data.trackId})`);
      artworkUrl = data.avatarUrl;
    }

    logger.logInfo(`Starting download of '${rawFilenameBase}' (TrackId: ${data.trackId})...`);

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

        const segmentUrls: string[] = parser.manifest.segments.map((i) => i.uri);
        const segments: ArrayBuffer[] = [];

        for (let i = 0; i < segmentUrls.length; i++) {
          const segmentReq = await fetch(segmentUrls[i]);
          const segment = await segmentReq.arrayBuffer();

          segments.push(segment);

          // --- Rate Limiting Start ---
          const enableRateLimit = getConfigValue("enable-hls-rate-limiting" as any) as boolean;
          const delayMs = getConfigValue("hls-rate-limit-delay-ms" as any) as number;

          if (enableRateLimit && delayMs > 0) {
            logger.logDebug(`Rate limiting HLS download, delaying for ${delayMs}ms`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
          // --- Rate Limiting End ---

          const progress = Math.round((i / segmentUrls.length) * 100);

          reportProgress(progress);
        }

        reportProgress(100);

        streamBuffer = concatArrayBuffers(segments);
      } catch (error) {
        logger.logError(`Failed to download m3u8 playlist (TrackId: ${data.trackId})`, error);

        throw error;
      }
    } else {
      try {
        [streamBuffer, streamHeaders] = await soundcloudApi.downloadStream(data.streamUrl, reportProgress);
      } catch (error) {
        logger.logError(`Failed to download stream (TrackId: ${data.trackId})`, error);

        throw error;
      }
    }

    if (!streamBuffer) {
      throw new TrackError("Undefined streamBuffer", data.trackId);
    }

    let contentType;
    if (!data.fileExtension && streamHeaders) {
      contentType = streamHeaders.get("content-type");
      let extension = "mp3";

      if (contentType === "audio/mp4") extension = "m4a";
      else if (contentType === "audio/x-wav" || contentType === "audio/wav") extension = "wav";

      data.fileExtension = extension;

      logger.logInfo(`Inferred file extension from 'content-type' header (TrackId: ${data.trackId})`, {
        contentType,
        extension,
      });
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
            logger.logError(`Failed to set duration for track (TrackId: ${data.trackId})`, error);
          }

          writer = mp4Writer;
        } else if (data.fileExtension === "mp3") {
          writer = new Mp3TagWriter(streamBuffer);
        } else if (data.fileExtension === "wav") {
          writer = new WavTagWriter(streamBuffer);
        }

        if (writer) {
          // Wrap individual tag setting in try-catch blocks
          try {
            writer.setTitle(titleString);
          } catch (e) { logger.logError(`Failed to set title for track (TrackId: ${data.trackId})`, e); }
          
          try {
            // todo: sanitize album as well
            writer.setAlbum(data.albumName ?? titleString);
          } catch (e) { logger.logError(`Failed to set album for track (TrackId: ${data.trackId})`, e); }

          try {
            writer.setArtists([artistsString]);
          } catch (e) { logger.logError(`Failed to set artists for track (TrackId: ${data.trackId})`, e); }

          // Set grouping if playlistName is available
          if (data.playlistName) {
            try {
              writer.setGrouping(data.playlistName);
            } catch (e) { logger.logError(`Failed to set grouping for track (TrackId: ${data.trackId})`, e); }
          }

          try {
            writer.setComment("https://github.com/NotTobi/soundcloud-dl");
          } catch (e) { logger.logError(`Failed to set comment for track (TrackId: ${data.trackId})`, e); }

          if (data.trackNumber > 0) {
            try {
              writer.setTrackNumber(data.trackNumber);
            } catch (e) { logger.logError(`Failed to set track number for track (TrackId: ${data.trackId})`, e); }
          }

          try {
            const releaseYear = data.uploadDate.getFullYear();
            writer.setYear(releaseYear);
          } catch (e) { logger.logError(`Failed to set year for track (TrackId: ${data.trackId})`, e); }

          if (artworkUrl) {
            try {
                const sizeOptions = ["original", "t500x500", "large"];
                let artworkBuffer: ArrayBuffer | null = null;

                const artworkPromises = sizeOptions.map(size => {
                const curArtworkUrl = artworkUrl.replace("-large.", `-${size}.`);
                return soundcloudApi.downloadArtwork(curArtworkUrl);
                });

                const results = await Promise.allSettled(artworkPromises);

                for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                    artworkBuffer = result.value;
                    break; // Use the first successfully downloaded artwork
                }
                }

                if (artworkBuffer) {
                    writer.setArtwork(artworkBuffer);
                } else {
                    logger.logWarn(`Failed to download any artwork version for TrackId: ${data.trackId}`);
                }
            } catch (e) { logger.logError(`Failed to set artwork for track (TrackId: ${data.trackId})`, e); }
          } else {
            logger.logWarn(`Skipping download of Artwork (TrackId: ${data.trackId})`);
          }

          // Get buffer after attempting all tags
          try {
            downloadBuffer = await writer.getBuffer();
          } catch (e) { 
              logger.logError(`Failed to get final buffer after writing tags (TrackId: ${data.trackId})`, e); 
              // Fallback to original buffer to ensure download can continue
              logger.logInfo(`Using original buffer without metadata for track (TrackId: ${data.trackId})`);
              downloadBuffer = streamBuffer;
          }

        }
      } catch (error) {
        // This top-level catch is now less likely to be hit for simple tag errors
        logger.logError(`Unexpected error during metadata processing block (TrackId: ${data.trackId})`, error);
      }
    }

    const blobOptions: BlobPropertyBag = {};

    if (contentType) blobOptions.type = contentType;

    const downloadBlob = new Blob([downloadBuffer ?? streamBuffer], blobOptions);

    // Use the already calculated filename (potentialDownloadFilename was just for the check)
    let downloadFilename = rawFilenameBase + "." + data.fileExtension;
    if (!saveAs && defaultDownloadLocation) {
      if (data.playlistName) {
        const sanitizedPlaylistName = sanitizeFilenameForDownload(data.playlistName);
        downloadFilename = defaultDownloadLocation + "/" + sanitizedPlaylistName + "/" + downloadFilename;
      } else {
        downloadFilename = defaultDownloadLocation + "/" + downloadFilename;
      }
    }

    logger.logInfo(`Downloading track as '${downloadFilename}' (TrackId: ${data.trackId})...`);

    let downloadUrl: string;

    try {
      downloadUrl = URL.createObjectURL(downloadBlob);

      await downloadToFile(downloadUrl, downloadFilename, saveAs);

      logger.logInfo(`Successfully downloaded '${rawFilenameBase}' (TrackId: ${data.trackId})!`);
      
      // After successful download, record this track ID in our history
      if (shouldSkipExisting) {
        try {
          const trackIdKey = `track-${data.trackId}`;
          const trackDownloadHistory = await getConfigValue("track-download-history") || {};
          trackDownloadHistory[trackIdKey] = {
            filename: downloadFilename,
            timestamp: Date.now()
          };
          await storeConfigValue("track-download-history", trackDownloadHistory);
          logger.logDebug(`Added TrackId: ${data.trackId} to download history tracker`);
        } catch (error) {
          logger.logError(`Failed to update download history for TrackId: ${data.trackId}`, error);
        }
      }

      reportProgress(101);
    } catch (error) {
      logger.logError(`Failed to download track to file system (TrackId: ${data.trackId})`, {
        downloadFilename,
        saveAs,
      });

      throw new TrackError(`Failed to download track to file system`, data.trackId);
    } finally {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    }
  } catch (error) {
    throw new TrackError("Unknown error during download", data.trackId);
  }
}

interface TranscodingDetails {
  url: string;
  protocol: "hls" | "progressive";
  quality: "hq" | "sq";
}

function getTranscodingDetails(details: Track): TranscodingDetails[] | null {
  if (details?.media?.transcodings?.length < 1) return null;

  const mpegStreams = details.media.transcodings
    .filter(
      (transcoding) =>
        (transcoding.format?.protocol === "progressive" || transcoding.format?.protocol === "hls") &&
        (transcoding.format?.mime_type?.startsWith("audio/mpeg") ||
          transcoding.format?.mime_type?.startsWith("audio/mp4")) &&
        !transcoding.snipped
    )
    .map<TranscodingDetails>((transcoding) => ({
      protocol: transcoding.format.protocol,
      url: transcoding.url,
      quality: transcoding.quality,
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
        if (details.requestHeaders[i].name.toLowerCase() !== "authorization") continue;

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

    if (url.pathname === "/connect/session" && getConfigValue("oauth-token") === null) {
      logger.logInfo("User logged in");

      storeConfigValue("oauth-token", undefined);
    } else if (url.pathname === "/sign-out") {
      logger.logInfo("User logged out");

      storeConfigValue("oauth-token", null);
      storeConfigValue("user-id", null);
      storeConfigValue("client-id", null);
      storeConfigValue("followed-artists", []);
    } else if (url.pathname.startsWith("/me/followings/")) {
      const followerIdMatch = followerIdRegex.exec(url.pathname);

      if (followerIdMatch.length === 2) {
        const followerId = +followerIdMatch[1];

        if (!!followerId) {
          let followedArtists = getConfigValue("followed-artists");

          if (details.method === "POST") {
            followedArtists = [...followedArtists, followerId];
          } else if (details.method === "DELETE") {
            followedArtists = followedArtists.filter((i) => i !== followerId);
          }

          storeConfigValue("followed-artists", followedArtists);
        }
      }
    } else {
      const clientId = url.searchParams.get("client_id");
      const storedClientId = getConfigValue("client-id");

      if (clientId) {
        storeConfigValue("client-id", clientId);
      } else if (storedClientId) {
        logger.logDebug("Adding ClientId to unauthenticated request...", { url, clientId: storedClientId });

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
  return track && track.kind === "track" && track.state === "finished" && (track.streamable || track.downloadable);
}

function isTranscodingDetails(detail: unknown): detail is TranscodingDetails {
  return !!detail["protocol"];
}

async function downloadTrack(
  track: Track,
  trackNumber: number | undefined,
  albumName: string | undefined,
  playlistName: string | undefined,
  reportProgress: (progress?: number) => void
) {
  if (!isValidTrack(track)) {
    logger.logError("Track does not satisfy constraints needed to be downloadable", track);

    throw new TrackError("Track does not satisfy constraints needed to be downloadable", track.id);
  }

  const downloadDetails: Array<StreamDetails | TranscodingDetails> = [];

  if (getConfigValue("download-original-version") && track.downloadable && track.has_downloads_left) {
    const originalDownloadUrl = await soundcloudApi.getOriginalDownloadUrl(track.id);

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
    throw new TrackError("No download details could be determined", track.id);
  }

  for (const downloadDetail of downloadDetails) {
    let stream: StreamDetails;

    try {
      if (isTranscodingDetails(downloadDetail)) {
        logger.logDebug("Get stream details from transcoding details", downloadDetail);

        stream = await soundcloudApi.getStreamDetails(downloadDetail.url);
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
        playlistName,
        hls: stream.hls,
      };

      await handleDownload(downloadData, reportProgress);

      return;
    } catch {
      // this is to try and download at least one of the available version
      continue;
    }
  }

  throw new TrackError("No version of this track could be downloaded", track.id);
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
}

function sendDownloadProgress(tabId: number, downloadId: string, progress?: number, error?: Error | string) {
  let errorMessage: string = "";

  if (error instanceof Error) {
    errorMessage = error.message;
  } else {
    errorMessage = error;
  }

  const downloadProgress: DownloadProgress = {
    downloadId,
    progress,
    error: errorMessage,
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

onPageActionClicked(() => {
  openOptionsPage();
});
const oauthTokenChanged = async (token: string) => {
  if (!token) return;

  const user = await soundcloudApi.getCurrentUser();

  if (!user) {
    logger.logError("Failed to fetch currently logged in user");

    return;
  }

  storeConfigValue("user-id", user.id);

  logger.logInfo("Logged in as", user.username);

  const followedArtistIds = await soundcloudApi.getFollowedArtistIds(user.id);

  if (!followedArtistIds) {
    logger.logError("Failed to fetch ids of followed artists");

    return;
  }

  storeConfigValue("followed-artists", followedArtistIds);
};

registerConfigChangeHandler("oauth-token", oauthTokenChanged);

