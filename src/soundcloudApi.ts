import { Logger } from "./logger";

interface MediaTranscodingFormat {
  protocol: string;
}

interface MediaTranscoding {
  snipped: boolean;
  quality: string;
  url: string;
  format: MediaTranscodingFormat;
}

interface Media {
  transcodings: MediaTranscoding[];
}

interface User {
  username: string;
  avatar_url: string;
}

export interface TrackDetails {
  kind: string;
  state: string;
  title: string;
  artwork_url: string;
  user: User;
  media: Media;
}

interface ProgressiveStream {
  url: string;
}

interface StreamDetails {
  url: string;
  extension: string;
}

export class SoundCloudApi {
  private logger: Logger;
  private clientId: string;
  readonly url: string = "https://api-v2.soundcloud.com";

  constructor() {
    this.logger = Logger.create("SoundCloudApi");
  }

  setClientId(clientId: string) {
    if (this.clientId === clientId) return;

    this.logger.logInfo("Setting ClientId", clientId);

    this.clientId = clientId;
  }

  async getTrack(trackId: string) {
    const url = `${this.url}/tracks/${trackId}?client_id=${this.clientId}`;

    this.logger.logInfo("Fetching track with Id", trackId);

    const track = await this.fetchJson<TrackDetails>(url);

    if (!track || track.kind != "track" || track.state != "finished") {
      this.logger.logError("Invalid track response", track);

      return null;
    }

    return track;
  }

  async getStreamDetails(progressiveStreamUrl: string): Promise<StreamDetails> {
    const url = `${progressiveStreamUrl}?client_id=${this.clientId}`;

    this.logger.logInfo("Fetching stream from progressiveStreamUrl", progressiveStreamUrl);

    const stream = await this.fetchJson<ProgressiveStream>(url);

    if (!stream || !stream.url) {
      this.logger.logError("Invalid stream response", stream);

      return null;
    }

    let extension = "mp3";
    const regexResult = /\.(\w{3,4})(?:$|\?)/.exec(stream.url);

    if (regexResult.length === 2) {
      extension = regexResult[1];
    }

    return {
      url: stream.url,
      extension,
    };
  }

  async downloadArtwork(artworkUrl: string) {
    this.logger.logInfo("Downloading artwork from", artworkUrl);

    return this.fetchArrayBuffer(artworkUrl);
  }

  async downloadStream(streamUrl) {
    this.logger.logInfo("Downloading stream from", streamUrl);

    return this.fetchArrayBuffer(streamUrl);
  }

  private async fetchArrayBuffer(url: string) {
    try {
      const resp = await fetch(url);

      if (!resp.ok) return null;

      const buffer = await resp.arrayBuffer();

      if (!buffer) return null;

      return buffer;
    } catch (error) {
      this.logger.logError("Failed to fetch ArrayBuffer from", url);

      return null;
    }
  }

  private async fetchJson<T>(url: string) {
    try {
      const resp = await fetch(url);

      if (!resp.ok) return null;

      const json = (await resp.json()) as T;

      if (!json) return null;

      return json;
    } catch (error) {
      this.logger.logError("Failed to fetch JSON from", url);

      return null;
    }
  }
}
