import { SoundCloudApi, StreamDetails, Track } from "./soundcloudApi";
import { Logger } from "./logger";
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
import { Mp3TagWriter } from "./mp3TagWriter";
import { loadConfiguration, storeConfigValue, getConfigValue, registerConfigChangeHandler } from "./config";
import { TagWriter } from "./tagWriter";
import { Mp4TagWriter } from "./mp4TagWriter";
import { Parser } from "m3u8-parser";

const soundcloudApi = new SoundCloudApi();
const logger = Logger.create("Background");
const manifest = getExtensionManifest();

logger.logInfo("Starting with version: " + manifest.version);

loadConfiguration(true);

function sanitizeFileName(input: string) {
  return input.replace(/[\*\\\/:?"'<>~|]+/, "").replace(/\s{2,}/, " ");
}

interface DownloadData {
  title: string;
  duration: number;
  date: Date;
  username: string;
  avatarUrl: string;
  artworkUrl: string;
  streamUrl: string;
  fileExtension?: string;
  trackNumber: number | undefined;
  albumName: string | undefined;
  hls: boolean;
}

function concatArrayBuffers(buffers: ArrayBuffer[]) {
  const totalLength = buffers.reduce((acc, cur) => acc + cur.byteLength, 0);

  const mergedBuffer = new Uint8Array(totalLength);

  let bufferOffset = 0;
  for (const buffer of buffers) {
    mergedBuffer.set(new Uint8Array(buffer), bufferOffset);

    bufferOffset += buffer.byteLength;
  }

  return mergedBuffer;
}

async function handleDownload(data: DownloadData, reportProgress: (progress?: number, error?: string) => void) {
  let artistsString = data.username;
  let titleString = data.title;

  if (getConfigValue("normalize-track")) {
    const extractor = new MetadataExtractor(data.title, data.username);

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

  const rawFilename = `${artistsString} - ${titleString}`;

  let artworkUrl = data.artworkUrl;

  if (!artworkUrl) {
    logger.logInfo("No Artwork URL could be determined. Fallback to User Avatar");
    artworkUrl = data.avatarUrl;
  }

  logger.logInfo(`Starting download of '${rawFilename}'...`);

  let streamBuffer: ArrayBuffer;
  let streamHeaders: Headers;

  // todo: error handling
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

        const progress = Math.round((i / segmentUrls.length) * 100);

        reportProgress(progress);
      }

      reportProgress(100);

      streamBuffer = concatArrayBuffers(segments);
    } catch (error) {
      console.error("Failed to download m3u8 playlist", error);
    }
  } else {
    [streamBuffer, streamHeaders] = await soundcloudApi.downloadStream(data.streamUrl, reportProgress);
  }

  if (!streamBuffer) {
    logger.logError("Failed to download stream");

    reportProgress(undefined, "Failed to download stream");

    return;
  }

  let contentType;
  if (!data.fileExtension && streamHeaders) {
    contentType = streamHeaders.get("content-type");
    let extension = "mp3";

    if (contentType.startsWith("audio/mp4")) extension = "m4a";
    else if (contentType.startsWith("audio/x-wav")) extension = "wav";

    data.fileExtension = extension;

    logger.logInfo("Inferred file extension from 'content-type' header", { contentType, extension });
  }

  let writer: TagWriter;

  if (data.fileExtension === "m4a") {
    const mp4Writer = new Mp4TagWriter(streamBuffer);

    mp4Writer.setDuration(data.duration);

    writer = mp4Writer;
  } else if (data.fileExtension === "mp3") {
    writer = new Mp3TagWriter(streamBuffer);
  }

  let downloadBlob: Blob;

  if (writer) {
    writer.setTitle(titleString);
    // todo: sanitize album as well
    writer.setAlbum(data.albumName ?? titleString);
    writer.setArtists([artistsString]);

    writer.setComment("https://github.com/NotTobi/soundcloud-dl");

    if (data.trackNumber > 0) {
      writer.setTrackNumber(data.trackNumber);
    }

    const releaseYear = data.date.getFullYear();

    writer.setYear(releaseYear);

    if (artworkUrl) {
      const sizeOptions = ["original", "t500x500", "large"];
      let artworkBuffer = null;
      let curArtworkUrl;

      do {
        const curSizeOption = sizeOptions.shift();
        curArtworkUrl = artworkUrl.replace("-large.", `-${curSizeOption}.`);

        artworkBuffer = await soundcloudApi.downloadArtwork(curArtworkUrl);
      } while (artworkBuffer === null && sizeOptions.length > 0);

      if (artworkBuffer) {
        writer.setArtwork(artworkBuffer);
      }
    } else {
      logger.logWarn("Skipping download of Artwork");
    }

    downloadBlob = writer.getBlob();
  } else {
    const options: BlobPropertyBag = {};

    if (contentType) options.type = contentType;

    downloadBlob = new Blob([streamBuffer], options);
  }

  const downloadUrl = URL.createObjectURL(downloadBlob);
  const saveAs = !getConfigValue("download-without-prompt");
  const defaultDownloadLocation = getConfigValue("default-download-location");
  let downloadFilename = rawFilename + "." + data.fileExtension;

  downloadFilename = sanitizeFileName(downloadFilename);

  if (!saveAs && defaultDownloadLocation) {
    downloadFilename = defaultDownloadLocation.replace(/^\/+/g, "") + "/" + downloadFilename;
  }

  try {
    await downloadToFile(downloadUrl, downloadFilename, saveAs);

    logger.logInfo(`Successfully downloaded '${rawFilename}'!`);
  } catch (error) {
    logger.logError("Failed to add track to downloads", { downloadFilename, saveAs });

    reportProgress(undefined, "Failed to add track to downloads");
  } finally {
    URL.revokeObjectURL(downloadUrl);
  }
}

interface TranscodingDetails {
  url: string;
  protocol: string;
}

function getTranscodingDetails(details: Track): TranscodingDetails | null {
  if (details?.media?.transcodings?.length < 1) return null;

  const mpegStreams = details.media.transcodings.filter(
    (i) =>
      (i.format?.protocol === "progressive" || i.format?.protocol === "hls") &&
      i.format?.mime_type === "audio/mpeg" &&
      !i.snipped
  );

  if (mpegStreams.length < 1) {
    logger.logError("No streams could be found found!");

    return null;
  }

  // prefer 'progressive' streams
  const sortedStreams = mpegStreams.sort((a, b) => {
    if (a.format.protocol === "progressive" && b.format.protocol === "hls") {
      return -1;
    } else if (a.format.protocol === "hls" && b.format.protocol === "progressive") {
      return 1;
    }

    return 0;
  });

  console.log({ sortedStreams });

  const hqStreams = sortedStreams.filter((i) => i.quality === "hq");
  const nonHqStreams = sortedStreams.filter((i) => i.quality !== "hq");

  if (getConfigValue("download-hq-version") && hqStreams.length > 0) {
    logger.logInfo("Using High Quality Stream!");

    return {
      url: hqStreams[0].url,
      protocol: hqStreams[0].format.protocol,
    };
  }

  return {
    url: nonHqStreams[0].url,
    protocol: nonHqStreams[0].format.protocol,
  };
}

// -------------------- HANDLERS --------------------

onBeforeSendHeaders(
  (details) => {
    let requestHasAuth = false;

    if (details.requestHeaders && getConfigValue("oauth-token") !== null) {
      for (let i = 0; i < details.requestHeaders.length; i++) {
        if (details.requestHeaders[i].name.toLowerCase() !== "authorization") continue;

        requestHasAuth = true;
        const authHeader = details.requestHeaders[i].value;

        const authRegex = new RegExp("OAuth (.+)");
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
      storeConfigValue("followed-artists", []);
    } else {
      const clientId = url.searchParams.get("client_id");

      if (clientId) {
        storeConfigValue("client-id", clientId);
      } else if (getConfigValue("client-id")) {
        logger.logDebug("Adding ClientId to unauthenticated request...", { url, clientId });

        url.searchParams.append("client_id", getConfigValue("client-id"));

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

async function downloadTrack(
  track: Track,
  trackNumber: number | undefined,
  albumName: string | undefined,
  reportProgress: (progress?: number, error?: string) => void
) {
  if (!isValidTrack(track)) {
    logger.logError("Track does not satisfy constraints needed to be downloadable", track);

    reportProgress(undefined, "Track does not satisfy constraints needed to be downloadable");

    return;
  }

  let stream: StreamDetails;
  if (getConfigValue("download-original-version") && track.downloadable && track.has_downloads_left) {
    const originalDownloadUrl = await soundcloudApi.getOriginalDownloadUrl(track.id);

    if (originalDownloadUrl) {
      stream = {
        url: originalDownloadUrl,
        hls: false,
      };
    }
  }

  if (!stream) {
    const streamDetails = getTranscodingDetails(track);

    if (!streamDetails) {
      logger.logError("Stream details could not be determined", track);

      reportProgress(undefined, "Stream details could not be determined");

      return;
    }

    stream = await soundcloudApi.getStreamDetails(streamDetails.url);
  }

  if (!stream) {
    logger.logError("Stream could not be determined");

    reportProgress(undefined, "Stream could not be determined");

    return;
  }

  const downloadData: DownloadData = {
    duration: track.duration,
    date: new Date(track.display_date),
    streamUrl: stream.url,
    fileExtension: stream.extension,
    title: track.title,
    username: track.user.username,
    artworkUrl: track.artwork_url,
    avatarUrl: track.user.avatar_url,
    trackNumber,
    albumName,
    hls: stream.hls,
  };

  await handleDownload(downloadData, reportProgress);
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

function sendDownloadProgress(tabId, downloadId: string, progress?: number, error?: string) {
  const downloadProgress: DownloadProgress = {
    downloadId,
    progress,
    error,
  };

  sendMessageToTab(tabId, downloadProgress);
}

onMessage(async (sender, message: DownloadRequest) => {
  const tabId = sender.tab.id;
  const { downloadId, url, type } = message;

  if (!tabId) return;

  try {
    if (type === "DOWNLOAD_SET") {
      const set = await soundcloudApi.resolveUrl<Playlist>(url);
      const isAlbum = set.set_type === "album" || set.set_type === "ep";

      const trackIds = set.tracks.map((i) => i.id);

      const keyedTracks = await soundcloudApi.getTracks(trackIds);
      const tracks = Object.values(keyedTracks).reverse();

      logger.logInfo(`Downloading ${isAlbum ? "album" : "playlist"}...`);

      const downloads = [];
      const progresses: { [key: number]: number } = {};

      const reportPlaylistProgress = (trackId: number) => (progress?: number, error?: string) => {
        if (progress) {
          progresses[trackId] = progress;
        }

        const totalProgress = Object.values(progresses).reduce((acc, cur) => acc + cur, 0);

        sendDownloadProgress(tabId, downloadId, totalProgress / trackIds.length, error);
      };

      const treatAsAlbum = isAlbum && tracks.length > 1;

      for (let i = 0; i < tracks.length; i++) {
        const trackNumber = treatAsAlbum ? i + 1 : undefined;
        const albumName = treatAsAlbum ? set.title : undefined;

        const download = downloadTrack(tracks[i], trackNumber, albumName, reportPlaylistProgress(tracks[i].id));

        downloads.push(download);
      }

      await Promise.all(downloads);

      logger.logInfo(`Downloaded ${isAlbum ? "album" : "playlist"}!`);
    } else if (type === "DOWNLOAD") {
      const track = await soundcloudApi.resolveUrl<Track>(url);

      const reportTrackProgress = (progress?: number, error?: string) => {
        sendDownloadProgress(tabId, downloadId, progress, error);
      };

      await downloadTrack(track, undefined, undefined, reportTrackProgress);
    } else {
      throw new Error("Unknown download type");
    }
  } catch (error) {
    sendDownloadProgress(tabId, downloadId, undefined, error);

    logger.logError("Failed init initialize download", error);
  }
});

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
