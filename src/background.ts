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
import { config, loadConfiguration, storeConfigValue } from "./config";
import { TagWriter } from "./tagWriter";
import { Mp4TagWriter } from "./mp4TagWriter";

const soundcloudApi = new SoundCloudApi();
const logger = Logger.create("Background");

loadConfiguration(true).then(() => {
  soundcloudApi.setClientId(config["client-id"].value);
  soundcloudApi.setUserId(config["user-id"].value);
});

function sanitizeFileName(input: string) {
  return input.replace(/[\\\/\:\*\?\"\'\<\>\~\|]+/g, "");
}

interface DownloadData {
  title: string;
  duration: number;
  username: string;
  avatarUrl: string;
  artworkUrl: string;
  streamUrl: string;
  fileExtension?: string;
}

async function handleDownload(data: DownloadData) {
  const { title, username, avatarUrl, streamUrl } = data;

  const extractor = new MetadataExtractor(title, username);
  const artists = extractor.getArtists();
  const artistsString = artists.map((i) => i.name).join(", ");
  let titleString = extractor.getTitle();

  const remixers = artists.filter((i) => i.type === ArtistType.Remixer);

  if (remixers.length > 0) {
    const remixerNames = remixers.map((i) => i.name).join(" & ");

    const remixTypeString = RemixType[remixers[0].remixType || RemixType.Remix].toString();

    titleString += ` (${remixerNames} ${remixTypeString})`;
  }

  const rawFilename = `${artistsString} - ${titleString}`;
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

  if (!data.fileExtension) {
    const contentType = streamHeaders.get("content-type");
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
    writer.setAlbum(titleString);
    writer.setArtists([artistsString]);
    writer.setComment("https://github.com/NotTobi/soundcloud-dl");

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
    downloadBlob = new Blob([streamBuffer]);
  }

  const downloadUrl = URL.createObjectURL(downloadBlob);

  await downloadToFile(downloadUrl, filename + "." + data.fileExtension);

  logger.logInfo(`Successfully downloaded '${filename}'!`);

  // todo: first do this when the download is completed
  // URL.revokeObjectURL(downloadUrl);
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

  if (config["download-hq-version"].value && hqStreams.length > 0) {
    logger.logInfo("Using High Quality Stream!");

    return hqStreams[0].url;
  }

  return nonHqStreams[0].url;
}

// -------------------- HANDLERS --------------------

// todo: find better way to aquire client_id and OAuth token
onBeforeSendHeaders(async (details) => {
  let requestHasAuth = false;

  if (details.requestHeaders) {
    for (let i = 0; i < details.requestHeaders.length; i++) {
      if (details.requestHeaders[i].name.toLowerCase() !== "authorization") continue;

      requestHasAuth = true;
      const authHeader = details.requestHeaders[i].value;

      const authRegex = new RegExp("OAuth (.+)");
      const result = authRegex.exec(authHeader);

      if (!result || result.length < 2) continue;

      const newToken = result[1];

      if (newToken === config["oauth-token"].value) continue;

      await storeConfigValue("oauth-token", newToken);
    }

    if (!requestHasAuth && config["oauth-token"].value) {
      details.requestHeaders.push({
        name: "Authorization",
        value: "OAuth " + config["oauth-token"].value,
      });
    }
  }

  return {
    requestHeaders: details.requestHeaders,
  };
});

onBeforeRequest(async (details) => {
  if (details.tabId < 0) return;

  const params = new URLSearchParams(details.url);

  const clientId = params.get("client_id");

  if (!clientId || clientId === soundcloudApi.clientId) return;

  soundcloudApi.setClientId(clientId);

  await storeConfigValue("client-id", clientId);

  if (!config["oauth-token"].value) return;

  const user = await soundcloudApi.getCurrentUser(config["oauth-token"].value);

  if (!user) return;

  soundcloudApi.setUserId(user.id);

  await storeConfigValue("user-id", user.id);
});

onMessageFromTab(async (_, message) => {
  if (message.type !== "DOWNLOAD" || !message.url) return;

  const track = await soundcloudApi.resolveUrl<Track>(message.url);

  if (!track || track.kind !== "track" || track.state !== "finished" || !track.streamable) {
    logger.logError("Track is not streamable", track);

    return;
  }

  let stream: { url: string; extension?: string };

  if (config["download-original-version"].value && track.downloadable && track.has_downloads_left) {
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
    streamUrl: stream.url,
    fileExtension: stream.extension,
    title: track.title,
    username: track.user.username,
    artworkUrl: track.artwork_url,
    avatarUrl: track.user.avatar_url,
  };

  await handleDownload(downloadData);
});

onPageActionClicked(() => {
  openOptionsPage();
});
