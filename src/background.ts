import { SoundCloudApi, Track } from "./soundcloudApi";
import { Logger } from "./logger";
import {
  onBeforeSendHeaders,
  onBeforeRequest,
  downloadToFile,
  onMessageFromTab,
  onPageActionClicked,
  openOptionsPage,
} from "./compatibilityStubs";
import { MetadataExtractor, ArtistType, RemixType } from "./metadataExtractor";
import { Mp3TagWriter } from "./mp3TagWriter";
import { loadConfiguration, storeConfigValue, getConfigValue } from "./config";
import { TagWriter } from "./tagWriter";
import { Mp4TagWriter } from "./mp4TagWriter";

const soundcloudApi = new SoundCloudApi();
const logger = Logger.create("Background");

loadConfiguration(true);

function sanitizeFileName(input: string) {
  return input.replace(/[\\\/\:\*\?\"\'\<\>\~\|]+/g, "");
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

async function handleDownload(data: DownloadData, trackNumber?: number) {
  const { title, username, avatarUrl, streamUrl } = data;
  const normalizeTrack = getConfigValue("normalize-track");

  let rawFilename = username + " - " + title;
  let artistsString, titleString;

  if (normalizeTrack) {
    const extractor = new MetadataExtractor(title, username);
    const artists = extractor.getArtists();
    artistsString = artists.map((i) => i.name).join(", ");
    titleString = extractor.getTitle();
    const remixers = artists.filter((i) => i.type === ArtistType.Remixer);

    if (remixers.length > 0) {
      const remixerNames = remixers.map((i) => i.name).join(" & ");
      const remixTypeString = RemixType[remixers[0].remixType || RemixType.Remix].toString();

      titleString += ` (${remixerNames} ${remixTypeString})`;
    }

    rawFilename = `${artistsString} - ${titleString}`;
  }

  const filename = sanitizeFileName(rawFilename);

  let artworkUrl = data.artworkUrl;

  if (!artworkUrl) {
    logger.logInfo("No Artwork URL could be determined. Fallback to User Avatar");
    artworkUrl = avatarUrl;
  }

  logger.logInfo(`Starting download of '${filename}'...`);

  const [streamBuffer, streamHeaders] = await soundcloudApi.downloadStream(streamUrl);

  if (!streamBuffer) {
    logger.logError("Failed to download stream");

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

  if (writer && normalizeTrack) {
    writer.setTitle(titleString);
    writer.setAlbum(titleString);
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
  let downloadFilename = filename + "." + data.fileExtension;

  if (!saveAs && defaultDownloadLocation) {
    downloadFilename = defaultDownloadLocation.replace(/^\/+/g, "") + "/" + downloadFilename;
  }

  await downloadToFile(downloadUrl, downloadFilename, saveAs);

  logger.logInfo(`Successfully downloaded '${filename}'!`);

  URL.revokeObjectURL(downloadUrl);
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

async function downloadTrack(track: Track, trackNumber?: number) {
  if (!track || track.kind !== "track" || track.state !== "finished" || !track.streamable) {
    logger.logError("Track is not streamable", track);
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
      return;
    }

    stream = await soundcloudApi.getStreamDetails(progressiveStreamUrl);
  }

  if (!stream) {
    logger.logError("Stream could not be determined");
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

  await handleDownload(downloadData, trackNumber);
}

onMessageFromTab(async (_, message) => {
  if (!message.url) return;

  if (message.type === "DOWNLOAD_SET") {
    // todo: correctly type
    const set = await soundcloudApi.resolveUrl<{ tracks: Track[]; set_type: string }>(message.url);
    const isAlbum = set.set_type === "album";

    const trackIds = set.tracks.map((i) => i.id);

    const keyedTracks = await soundcloudApi.getTracks(trackIds);
    const tracks = Object.values(keyedTracks).reverse();

    logger.logInfo("Downloading playlist...");

    const downloads = [];

    for (let i = 0; i < tracks.length; i++) {
      const download = downloadTrack(tracks[i], isAlbum ? i + 1 : undefined);

      downloads.push(download);
    }

    await Promise.all(downloads);

    logger.logInfo("Downloaded playlist!");
  } else if (message.type === "DOWNLOAD") {
    const track = await soundcloudApi.resolveUrl<Track>(message.url);

    await downloadTrack(track);
  }
});

onPageActionClicked(() => {
  openOptionsPage();
});
