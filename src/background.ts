import { SoundCloudApi, Track } from "./soundcloudApi";
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
}

async function handleDownload(
  data: DownloadData,
  trackNumber: number | undefined,
  albumName: string | undefined,
  reportProgress: (progress?: number, error?: string) => void
) {
  let normalizeTrack = getConfigValue("normalize-track");

  let artistsString = data.username;
  let titleString = data.title;

  if (normalizeTrack) {
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

  const [streamBuffer, streamHeaders] = await soundcloudApi.downloadStream(data.streamUrl, reportProgress);

  if (!streamBuffer) {
    logger.logError("Failed to download stream");

    reportProgress(undefined, "Failed to download stream");

    return;
  }

  let contentType;
  if (!data.fileExtension) {
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
    writer.setAlbum(albumName ?? titleString);
    writer.setArtists([artistsString]);

    writer.setComment("https://github.com/NotTobi/soundcloud-dl");

    if (trackNumber > 0) {
      writer.setTrackNumber(trackNumber);
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

  if (!saveAs && defaultDownloadLocation) {
    downloadFilename = defaultDownloadLocation.replace(/^\/+/g, "") + "/" + downloadFilename;
  }

  downloadFilename = sanitizeFileName(downloadFilename);

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

function getProgressiveStreamUrl(details: Track): string | null {
  if (!details || !details.media || !details.media.transcodings || details.media.transcodings.length < 1) return null;

  const progressiveStreams = details.media.transcodings.filter(
    (i) => i.format?.protocol === "progressive" && !i.snipped
  );

  if (progressiveStreams.length < 1) {
    logger.logError("No progressive streams found!");

    return null;
  }

  const hqStreams = progressiveStreams.filter((i) => i.quality === "hq");
  const nonHqStreams = progressiveStreams.filter((i) => i.quality !== "hq");

  if (getConfigValue("download-hq-version") && hqStreams.length > 0) {
    logger.logInfo("Using High Quality Stream!");

    return hqStreams[0].url;
  }

  return nonHqStreams[0].url;
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

async function downloadTrack(
  track: Track,
  trackNumber: number | undefined,
  albumName: string | undefined,
  reportProgress: (progress?: number, error?: string) => void
) {
  if (!track || track.kind !== "track" || track.state !== "finished" || !track.streamable) {
    logger.logError("Track is not streamable", track);

    reportProgress(undefined, "Track is not streamable");

    return;
  }

  let stream: { url: string; extension?: string };
  if (getConfigValue("download-original-version") && track.downloadable && track.has_downloads_left) {
    const originalDownloadUrl = await soundcloudApi.getOriginalDownloadUrl(track.id);

    if (originalDownloadUrl) {
      stream = {
        url: originalDownloadUrl,
      };
    }
  }

  if (!stream) {
    const progressiveStreamUrl = getProgressiveStreamUrl(track);

    if (!progressiveStreamUrl) {
      logger.logError("Progressive stream URL could not be determined", track);

      reportProgress(undefined, "Progressive stream URL could not be determined");

      return;
    }

    stream = await soundcloudApi.getStreamDetails(progressiveStreamUrl);
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
  };

  await handleDownload(downloadData, trackNumber, albumName, reportProgress);
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

      for (let i = 0; i < tracks.length; i++) {
        const trackNumber = isAlbum ? i + 1 : undefined;
        const albumName = isAlbum ? set.title : undefined;

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
