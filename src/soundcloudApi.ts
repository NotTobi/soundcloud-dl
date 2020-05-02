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
  id: number;
  duration: number; // in ms
  kind: string;
  state: string;
  title: string;
  artwork_url: string;
  streamable: boolean;
  downloadable: boolean;
  has_downloads_left: boolean;
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

interface OriginalDownload {
  redirectUri: string;
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

  async getOriginalDownloadUrl(id: number) {
    const url = `${this.baseUrl}/tracks/${id}/download?client_id=${this.clientId}`;

    this.logger.logInfo("Getting original download URL for track with Id", id);

    const downloadObj = await this.fetchJson<OriginalDownload>(url);

    if (!downloadObj || !downloadObj.redirectUri) {
      this.logger.logError("Invalid original file response", downloadObj);

      return null;
    }

    return downloadObj.redirectUri;
  }

  async downloadArtwork(artworkUrl: string) {
    const [buffer] = await this.fetchArrayBuffer(artworkUrl);
    return buffer;
  }

  downloadStream(streamUrl: string) {
    return this.fetchArrayBuffer(streamUrl);
  }

  private async fetchArrayBuffer(url: string): Promise<[ArrayBuffer, Headers]> {
    try {
      const resp = await fetch(url);

      if (!resp.ok) return [null, null];

      const buffer = await resp.arrayBuffer();

      if (!buffer) return [null, null];

      return [buffer, resp.headers];
    } catch (error) {
      this.logger.logError("Failed to fetch ArrayBuffer from", url);

      return [null, null];
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
