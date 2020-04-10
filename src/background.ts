import ID3Writer from "browser-id3-writer";
import { SoundCloudApi, TrackDetails } from "./soundcloudApi";

const apiUrl = "https://api-v2.soundcloud.com";
const soundcloudApi = new SoundCloudApi(apiUrl);
const trackIds: { [tabId: string]: string } = {};
let authorizationHeader: string | null = null;

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    let requestHasAuth = false;

    for (let i = 0; i < details.requestHeaders.length; i++) {
      if (details.requestHeaders[i].name !== "Authorization") continue;

      requestHasAuth = true;
      const newAuthorizationHeader = details.requestHeaders[i].value;

      if (!newAuthorizationHeader.startsWith("OAuth") || newAuthorizationHeader === authorizationHeader) continue;

      authorizationHeader = newAuthorizationHeader;
      console.log("Stored Authorization Header:", authorizationHeader);
    }

    if (!requestHasAuth) {
      details.requestHeaders.push({
        name: "Authorization",
        value: authorizationHeader,
      });
    }

    return details;
  },
  { urls: ["*://api-v2.soundcloud.com/*"] },
  ["requestHeaders", "blocking"]
);

let headerReceivedOptions = [];

if (window.navigator.userAgent.includes("hrome")) {
  headerReceivedOptions = ["extraHeaders", "blocking", "responseHeaders"];
} else {
  headerReceivedOptions = ["blocking", "responseHeaders"];
}

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    for (let i = 0; i < details.responseHeaders.length; i++) {
      if (details.responseHeaders[i].name == "X-Content-Type-Options") {
        details.responseHeaders.splice(i, 1);
      }
      if (details.responseHeaders[i].name == "Access-Control-Allow-Origin") {
        details.responseHeaders.splice(i, 1);
      }
    }

    details.responseHeaders.push({
      name: "Access-Control-Allow-Origin",
      value: "*",
    });
    details.responseHeaders.push({
      name: "Access-Control-Allow-Headers",
      value: "Authorization, Content-Type, Device-Locale, X-CSRF-Token",
    });
    details.responseHeaders.push({
      name: "Access-Control-Allow-Methods",
      value: "GET, POST, PUT, PATCH, DELETE",
    });
    details.responseHeaders.push({
      name: "Access-Control-Expose-Headers",
      value: "Date",
    });
    details.responseHeaders.push({
      name: "Access-Control-Allow-Credentials",
      value: "true",
    });

    return details;
  },
  {
    urls: ["https://api-v2.soundcloud.com/*"],
  },
  headerReceivedOptions
);

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const match = details.url.match(/tracks\/(\d+)/);

    // currently I have not found a better way to do this
    if (match?.length == 2) {
      const trackId = match[1];

      trackIds[details.tabId] = trackId;
    }

    const params = new URLSearchParams(details.url);

    const clientId = params.get("client_id");

    if (!clientId) return;

    soundcloudApi.setClientId(clientId);
  },
  { urls: ["*://api-v2.soundcloud.com/*"] }
);

function sanitizeFileName(input: string) {
  return input.replace(/[\\\/\:\*\?\"\'\<\>\~\|]+/g, "");
}

function filterArtists(matchedArtists: string) {
  const artistRegex = /^(.+) (featuring|feat|ft|&|w\/|with|,|X)\.? (.+)$/i;
  const filteredArtists = [];

  while (true) {
    const artistResult = artistRegex.exec(matchedArtists);

    if (artistResult && artistResult.length > 0) {
      filteredArtists.push(artistResult[1]);
      matchedArtists = artistResult[3];
    } else {
      filteredArtists.push(matchedArtists);
      break;
    }
  }

  return filteredArtists;
}

function getMetadata(title: string, username: string) {
  let artists: string[] = [];

  /* Remove 'Free Download' Text from Title */
  title = title.replace(/\s?\[?\(?(Free Download|Video in Description)\)?\]?.*$/i, "");

  /* Filter Leading Artists from Title */
  const titleRegex = /^(.+) - (.+)$/i;

  const titleResult = titleRegex.exec(title);

  if (titleResult && titleResult.length > 0) {
    title = titleResult[2];

    artists = filterArtists(titleResult[1]);
  } else {
    artists.push(username);
  }

  /* Filter Producer(s) from Title */
  let producers: string[] = [];

  const producerRegexes = [
    /^.+(\s?\(Prod\.?\s?(by)?\s?(.+)\))$/i,
    /^.+(\s?\[Prod\.?\s?(by)?\s?(.+)\])$/i,
    /^.+(\s?Prod\.?\s?(by)?\s?(.+))$/i,
  ];

  producerRegexes.forEach(function (producerRegex) {
    const result = producerRegex.exec(title);

    if (result && result.length > 0) {
      title = title.replace(result[1], "");

      // producers = filterArtists(result[3] ? result[3] : result[2]);
    }
  });

  /* Filter Features from Title */
  if (/^.+(featuring|feat|ft|w\/| X ).+$/i.test(title)) {
    const featureRegexes = [
      /^.+(\s?\((featuring|feat|ft|w\/| X )\.?\s?(.+)\))$/i,
      /^.+(\s?\[(featuring|feat|ft|w\/| X )\.?\s?(.+)\])$/i,
      /^.+(\s?(featuring|feat|ft|w\/| X )\.?\s?(.+))$/i,
    ];

    featureRegexes.forEach(function (featureRegex) {
      const result = featureRegex.exec(title);

      if (result && result.length > 0) {
        title = title.replace(result[1], "");

        artists = artists.concat(filterArtists(result[3]));
      }
    });
  }

  /* Filter Remix Artists */
  if (/^.+(Remix|Flip|Bootleg|Mashup|Edit).*$/i.test(title)) {
    const remixRegexes = [
      /^.+\s?\((.+)\s(Remix|Flip|Bootleg|Mashup|Edit)\)$/i,
      /^.+\s?\[(.+)\s(Remix|Flip|Bootleg|Mashup|Edit)\]$/i,
    ];

    remixRegexes.forEach(function (remixRegex) {
      const result = remixRegex.exec(title);

      if (result && result.length > 0) {
        artists = artists.concat(filterArtists(result[1]));
      }
    });
  }

  /* Trim Title */
  title = title.trim();

  // add Producers to Artists
  artists = artists.concat(producers);

  /* Trim Artists */
  artists = artists.map((artist) => artist.trim());

  /* Distinct Artists */
  artists = [...new Set(artists)];

  return {
    title,
    artists,
  };
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

  const metadata = getMetadata(title, username);
  const artistsString = metadata.artists.join(", ");

  let artworkUrl = data.artworkUrl;

  if (!artworkUrl) {
    console.log("No Artwork URL could be determined. Fallback to User Avatar");
    artworkUrl = avatarUrl;
  }

  let artworkBuffer: ArrayBuffer;
  if (artworkUrl) {
    artworkUrl = artworkUrl.replace("-large.jpg", "-t500x500.jpg");

    artworkBuffer = await soundcloudApi.downloadArtwork(artworkUrl);
  } else {
    console.warn("No Artwork URL could be determined");
  }

  const streamBuffer = await soundcloudApi.downloadStream(streamUrl);

  if (!streamBuffer) {
    console.error("Failed to download stream");

    return;
  }

  const writer = new ID3Writer(streamBuffer);

  writer
    // Title
    .setFrame("TIT2", metadata.title)
    // Artists
    .setFrame("TPE1", [artistsString])
    // Album
    .setFrame("TALB", metadata.title)
    // Comment
    .setFrame("COMM", {
      description: "",
      text: "https://addons.mozilla.org/firefox/addon/soundcloud-dl/",
    });

  // todo: m4a artwork is currently not set
  if (artworkBuffer && data.fileExtension === "mp3") {
    // Artwork
    writer.setFrame("APIC", {
      type: 3,
      data: artworkBuffer,
      description: "",
    });
  }

  writer.addTag();

  const downloadOptions = {
    url: writer.getURL(),
    filename: sanitizeFileName(`${artistsString} - ${metadata.title}.${data.fileExtension}`),
  };

  await browser.downloads.download(downloadOptions);
}

function getProgressiveStreamUrl(details: TrackDetails): string | null {
  if (!details || !details.media || !details.media.transcodings || details.media.transcodings.length < 1) return null;

  const progressiveStreams = details.media.transcodings.filter(
    (i) => i.format?.protocol === "progressive" && !i.snipped
  );

  if (progressiveStreams.length < 1) {
    console.log("No progressive streams found!");

    return null;
  }

  const hqStreams = progressiveStreams.filter((i) => i.quality === "hq");

  if (hqStreams.length > 0) {
    console.info("Using High Quality Stream!");

    return hqStreams[0].url;
  }

  return progressiveStreams[0].url;
}

browser.runtime.onMessage.addListener(async (request, sender) => {
  if (sender.id != browser.runtime.id && request.type === "DOWNLOAD") return;

  const trackId = trackIds[sender.tab.id];

  if (!trackId) return;

  console.log("Downloading...", trackId);

  const trackDetails = await soundcloudApi.getTrack(trackId);

  if (!trackDetails) return;

  const progressiveStreamUrl = getProgressiveStreamUrl(trackDetails);

  if (!progressiveStreamUrl) return;

  const stream = await soundcloudApi.getStreamDetails(progressiveStreamUrl);

  if (!stream) return;

  const dowwnloadData: DownloadData = {
    streamUrl: stream.url,
    fileExtension: stream.extension,
    title: trackDetails.title,
    username: trackDetails.user.username,
    artworkUrl: trackDetails.artwork_url,
    avatarUrl: trackDetails.user.avatar_url,
  };

  await handleDownload(dowwnloadData);
});
