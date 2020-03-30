const apiUrl = "https://api-v2.soundcloud.com";
let fetchedClientId;
const trackIds = {};

const browserApi = chrome || browser;

browserApi.webRequest.onBeforeRequest.addListener(
  async details => {
    const match = details.url.match(/tracks\/(\d+)/);

    if (match && match.length == 2) {
      const trackId = match[1];

      console.log("Tab", details.tabId, "TrackId", trackId);

      trackIds[details.tabId] = trackId;
    }

    const params = new URLSearchParams(details.url);

    const clientId = params.get("client_id");

    if (fetchedClientId || !clientId) return;

    console.log("ClientId", clientId);

    fetchedClientId = clientId;
  },
  { urls: ["*://api-v2.soundcloud.com/*"] }
);

function sanitizeFileName(input) {
  return input.replace(/[\\\/\:\*\?\"\'\<\>\~\|]+/g, "");
}

function filterArtists(matchedArtists) {
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

function getMetadata(title, username) {
  let artists = [];

  /* Remove 'Free Download' Text from Title */
  title = title.replace(/\s?\[?\(?(Free Download|Video in Description)\)?\]?.*$/i, "");

  /* Filter Leading Artists from Title */
  const titleRegex = /^(.+) - (.+)$/i;

  titleResult = titleRegex.exec(title);

  if (titleResult && titleResult.length > 0) {
    title = titleResult[2];

    artists = filterArtists(titleResult[1]);
  } else {
    artists.push(username);
  }

  /* Filter Producer(s) from Title */
  const producerRegexes = [
    /^.+(\s?\(Prod\.?\s?(by)?\s?(.+)\))$/i,
    /^.+(\s?\[Prod\.?\s?(by)?\s?(.+)\])$/i,
    /^.+(\s?Prod\.?\s?(by)?\s?(.+))$/i
  ];

  let producers = [];

  producerRegexes.forEach(function(producerRegex) {
    const result = producerRegex.exec(title);

    if (result && result.length > 0) {
      title = title.replace(result[1], "");

      // producers = filterArtists(result[3] ? result[3] : result[2])
    }
  });

  /* Filter Features from Title */
  if (/^.+(featuring|feat|ft|w\/| X ).+$/i.test(title)) {
    const featureRegexes = [
      /^.+(\s?\((featuring|feat|ft|w\/| X )\.?\s?(.+)\))$/i,
      /^.+(\s?\[(featuring|feat|ft|w\/| X )\.?\s?(.+)\])$/i,
      /^.+(\s?(featuring|feat|ft|w\/| X )\.?\s?(.+))$/i
    ];

    featureRegexes.forEach(function(featureRegex) {
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
      /^.+\s?\[(.+)\s(Remix|Flip|Bootleg|Mashup|Edit)\]$/i
    ];

    remixRegexes.forEach(function(remixRegex) {
      const result = remixRegex.exec(title);

      if (result && result.length > 0) {
        artists = artists.concat(filterArtists(result[1]));
      }
    });
  }

  /* Trim Title */
  title = title.trim();

  // toggle add producers to artists
  if (producers) artists = artists.concat(producers);

  /* Trim Artists */
  artists = artists.map(artist => artist.trim());

  /* Distinct Artists */
  artists = [...new Set(artists)];

  return {
    title,
    artists
  };
}

async function handleDownload(data) {
  const { title, username, avatarUrl, streamUrl } = data;

  const metadata = getMetadata(title, username);
  const artistsString = metadata.artists.join(", ");

  let artworkUrl = data.artworkUrl;

  if (!artworkUrl) {
    console.log("No Artwork URL could be determined. Fallback to User Avatar");
    artworkUrl = avatarUrl;
  }

  let artworkBuffer;
  if (artworkUrl) {
    artworkUrl = artworkUrl.replace("-large.jpg", "-t500x500.jpg");

    const artworkResp = await fetch(artworkUrl);
    artworkBuffer = await artworkResp.arrayBuffer();
  } else {
    console.warn("No Artwork URL could be determined");
  }

  const streamResp = await fetch(streamUrl);
  const streamBuffer = await streamResp.arrayBuffer();

  const writer = new ID3Writer(streamBuffer);
  writer
    .setFrame("TIT2", metadata.title) // Title
    .setFrame("TPE1", [artistsString]) // Artists
    .setFrame("TALB", metadata.title); // Album
  // .setFrame("COMM", {
  //   description: "",
  //   text: "Comment"
  // });

  if (artworkBuffer) {
    writer.setFrame("APIC", {
      type: 3,
      data: artworkBuffer,
      description: ""
    });
  }

  writer.addTag();

  const newDownload = {
    url: writer.getURL(),
    filename: sanitizeFileName(`${artistsString} - ${metadata.title}.mp3`)
  };

  await browserApi.downloads.download(newDownload);
}

async function getTrackDetails(trackId) {
  try {
    const trackReqUrl = `${apiUrl}/tracks/${trackId}?client_id=${fetchedClientId}`;

    const resp = await fetch(trackReqUrl);
    const data = await resp.json();

    if (!data || data.kind != "track" || data.state != "finished") return null;

    return data;
  } catch (error) {
    console.error("Failed to fetch track details from API", error);
    return null;
  }
}

async function getStreamUrlFromProgressiveStream(progressiveStream) {
  const streamResourceUrl = progressiveStream.url + "?client_id=" + fetchedClientId;

  try {
    const resp = await fetch(streamResourceUrl);
    const data = await resp.json();

    if (!data || !data.url) return null;

    return data.url;
  } catch (error) {
    console.error("Failed to fetch Stream-URL from API", error);
    return null;
  }
}

function getProgressiveStreamFromTrackDetails(details) {
  if (!details || !details.media || !details.media.transcodings || details.media.transcodings.length < 1) return null;

  const progressiveStreams = details.media.transcodings.filter(i => i.format.protocol === "progressive" && !i.snipped);

  if (progressiveStreams.length < 1) return null;

  return progressiveStreams[0];
}

async function handleMessage(request, sender) {
  if (sender.id != browserApi.runtime.id && request.type === "DOWNLOAD") return;

  const trackId = trackIds[sender.tab.id];

  if (!trackId) return;

  console.log("Downloading...", trackId);

  const trackDetails = await getTrackDetails(trackId);

  if (trackDetails === null) return;

  const progressiveStream = getProgressiveStreamFromTrackDetails(trackDetails);

  if (progressiveStream === null) return;

  const streamUrl = await getStreamUrlFromProgressiveStream(progressiveStream);

  const dowwnloadData = {
    streamUrl,
    title: trackDetails.title,
    username: trackDetails.user.username,
    artworkUrl: trackDetails.artwork_url,
    avatarUrl: trackDetails.user.avatar_url
  };

  await handleDownload(dowwnloadData);
}

browserApi.runtime.onMessage.addListener(handleMessage);
