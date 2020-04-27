import { SoundCloudApi, TrackDetails } from "./soundcloudApi";
import { Logger } from "./logger";
import { onBeforeSendHeaders, onBeforeRequest, downloadToFile, onMessageFromTab } from "./compatibilityStubs";
import { MetadataExtractor, ArtistType, RemixType } from "./metadataExtractor";
import { TagWriter } from "./tagWriter";
import { config, initConfiguration } from "./config";

initConfiguration();

const soundcloudApi = new SoundCloudApi();
const logger = Logger.create("Background");
const trackIds: { [tabId: string]: string } = {};
let authorizationHeader: string | null = null;

function sanitizeFileName(input: string) {
  return input.replace(/[\\\/\:\*\?\"\'\<\>\~\|]+/g, "");
}

interface DownloadData {
  title: string;
  username: string;
  avatarUrl: string;
  artworkUrl: string;
  streamUrl: string;
  fileExtension: string;
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

  let artworkUrl = data.artworkUrl;

  if (!artworkUrl) {
    logger.logInfo("No Artwork URL could be determined. Fallback to User Avatar");
    artworkUrl = avatarUrl;
  }

  const streamBuffer = await soundcloudApi.downloadStream(streamUrl);

  if (!streamBuffer) {
    logger.logError("Failed to download stream");

    return;
  }

  const writer = new TagWriter(streamBuffer);

  writer.setTitle(titleString);
  writer.setAlbum(titleString);
  writer.setArtists([artistsString]);
  writer.setComment("https://github.com/NotTobi/soundcloud-dl");

  // todo: setting artwork for m4a currently does not work
  if (artworkUrl && data.fileExtension === "mp3") {
    artworkUrl = artworkUrl.replace("-large.", "-original.");

    const artworkBuffer = await soundcloudApi.downloadArtwork(artworkUrl);

    if (artworkBuffer) {
      writer.setArtwork(artworkBuffer);
    }
  } else {
    logger.logWarn("No Artwork URL could be determined");
  }

  const downloadUrl = writer.getDownloadUrl();
  const rawFilename = `${artistsString} - ${titleString}.${data.fileExtension}`;
  const filename = sanitizeFileName(rawFilename);

  await downloadToFile(downloadUrl, filename);
}

function getProgressiveStreamUrl(details: TrackDetails): string | null {
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

  if (config["download-hq-version"] && hqStreams.length > 0) {
    logger.logInfo("Using High Quality Stream!");

    return hqStreams[0].url;
  }

  return nonHqStreams[0].url;
}

// -------------------- HANDLERS --------------------

// todo: find better way to aquire client_id and OAuth token
onBeforeSendHeaders((details) => {
  let requestHasAuth = false;

  if (details.requestHeaders) {
    for (let i = 0; i < details.requestHeaders.length; i++) {
      if (details.requestHeaders[i].name.toLowerCase() !== "authorization") continue;

      requestHasAuth = true;
      const newAuthorizationHeader = details.requestHeaders[i].value;

      if (!newAuthorizationHeader.startsWith("OAuth") || newAuthorizationHeader === authorizationHeader) continue;

      authorizationHeader = newAuthorizationHeader;
      logger.logInfo("Stored Authorization Header:", authorizationHeader);
    }

    if (!requestHasAuth && authorizationHeader) {
      details.requestHeaders.push({
        name: "Authorization",
        value: authorizationHeader,
      });
    }
  }

  return {
    requestHeaders: details.requestHeaders,
  };
});

onBeforeRequest((details) => {
  if (details.tabId < 0) return;

  const match = details.url.match(/tracks\/(\d+)/);

  if (match?.length == 2) {
    const trackId = match[1];

    trackIds[details.tabId] = trackId;
  }

  const params = new URLSearchParams(details.url);

  const clientId = params.get("client_id");

  if (!clientId) return;

  soundcloudApi.setClientId(clientId);
});

onMessageFromTab(async (tabId, message) => {
  if (message.type !== "DOWNLOAD") return;

  const trackId = trackIds[tabId];

  if (!trackId) return;

  logger.logInfo("Downloading...", trackId);

  const trackDetails = await soundcloudApi.getTrack(trackId);

  if (!trackDetails) return;

  const progressiveStreamUrl = getProgressiveStreamUrl(trackDetails);

  if (!progressiveStreamUrl) return;

  const stream = await soundcloudApi.getStreamDetails(progressiveStreamUrl);

  if (!stream) return;

  const downloadData: DownloadData = {
    streamUrl: stream.url,
    fileExtension: stream.extension,
    title: trackDetails.title,
    username: trackDetails.user.username,
    artworkUrl: trackDetails.artwork_url,
    avatarUrl: trackDetails.user.avatar_url,
  };

  await handleDownload(downloadData);
});

browser.pageAction.onClicked.addListener(() => {
  browser.runtime.openOptionsPage();
});
