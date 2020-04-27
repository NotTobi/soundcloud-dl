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
  id: number;
  username: string;
  avatar_url: string;
}

export interface Track {
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

type KeyedTracks = { [key: number]: Track };

export class SoundCloudApi {
  readonly baseUrl: string = "https://api-v2.soundcloud.com";
  private logger: Logger;
  clientId: string;
  userId: number;

  constructor() {
    this.logger = Logger.create("SoundCloudApi");
  }

  setClientId(clientId: string) {
    this.logger.logInfo("Setting ClientId", clientId);

    this.clientId = clientId;
  }

  setUserId(userId: number) {
    this.logger.logInfo("Setting UserId", userId);

    this.userId = userId;
  }

  async resolveUrl<T>(url: string) {
    const reqUrl = `${this.baseUrl}/resolve?url=${url}&client_id=${this.clientId}`;

    return await this.fetchJson<T>(reqUrl);
  }

  async getCurrentUser(oauthToken: string) {
    const url = `${this.baseUrl}/me?oauth_token=${oauthToken}&client_id=${this.clientId}`;

    return await this.fetchJson<User>(url);
  }

  async getTracks(trackIds: number[]): Promise<KeyedTracks> {
    const url = `${this.baseUrl}/tracks?ids=${trackIds.join(",")}&client_id=${this.clientId}`;

    this.logger.logInfo("Fetching tracks with Ids", { trackIds });

    const tracks = await this.fetchJson<Track>(url);

    return trackIds.reduce((acc, cur, index) => {
      acc[cur] = tracks[index];

      return acc;
    }, {});
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
