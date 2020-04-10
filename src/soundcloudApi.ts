import { Logger } from "./logger";

interface MediaTranscodingFormat {
  protocol: string;
}

interface MediaTranscoding {
  snipped: boolean;
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

export class SoundCloudApi {
  private logger: Logger;
  private clientId: string;

  constructor(private readonly apiUrl) {
    this.logger = Logger.create("SoundCloudApi");
  }

  setClientId(clientId: string) {
    if (this.clientId === clientId) return;

    this.logger.logInfo("Setting ClientId", clientId);

    this.clientId = clientId;
  }

  async getTrack(trackId: string) {
    const url = `${this.apiUrl}/tracks/${trackId}?client_id=${this.clientId}`;

    this.logger.logInfo("Fetching track with Id", trackId);

    const track = await this.fetchJson<TrackDetails>(url);

    if (!track || track.kind != "track" || track.state != "finished") {
      this.logger.logError("Invalid track response", track);

      return null;
    }

    return track;
  }

  async getStreamUrl(progressiveStreamUrl: string) {
    const url = `${progressiveStreamUrl}?client_id=${this.clientId}`;

    this.logger.logInfo("Fetching stream from progressiveStreamUrl", progressiveStreamUrl);

    const stream = await this.fetchJson<ProgressiveStream>(url);

    if (!stream || !stream.url) {
      this.logger.logError("Invalid stream response", stream);

      return null;
    }

    return stream.url;
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
