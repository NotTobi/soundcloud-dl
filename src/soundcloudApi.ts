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
  display_date: string;
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
type ProgressReport = (progress: number) => void;

export class SoundCloudApi {
  readonly baseUrl: string = "https://api-v2.soundcloud.com";
  private logger: Logger;

  constructor() {
    this.logger = Logger.create("SoundCloudApi");
  }

  resolveUrl<T>(url: string) {
    const reqUrl = `${this.baseUrl}/resolve?url=${url}`;

    return this.fetchJson<T>(reqUrl);
  }

  getCurrentUser() {
    const url = `${this.baseUrl}/me`;

    return this.fetchJson<User>(url);
  }

  async getFollowedArtistIds(userId: number): Promise<number[]> {
    const url = `${this.baseUrl}/users/${userId}/followings/ids`;

    const data = await this.fetchJson<any>(url);

    if (!data || !data.collection) return [];

    return data.collection;
  }

  async getTracks(trackIds: number[]): Promise<KeyedTracks> {
    const url = `${this.baseUrl}/tracks?ids=${trackIds.join(",")}`;

    this.logger.logInfo("Fetching tracks with Ids", { trackIds });

    const tracks = await this.fetchJson<Track>(url);

    return trackIds.reduce((acc, cur, index) => {
      acc[cur] = tracks[index];

      return acc;
    }, {});
  }

  async getStreamDetails(progressiveStreamUrl: string): Promise<StreamDetails> {
    const url = `${progressiveStreamUrl}`;

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
    const url = `${this.baseUrl}/tracks/${id}/download`;

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

  downloadStream(streamUrl: string, reportProgress: ProgressReport) {
    return this.fetchArrayBuffer(streamUrl, reportProgress);
  }

  private async fetchArrayBuffer(url: string, reportProgress?: ProgressReport): Promise<[ArrayBuffer, Headers]> {
    try {
      if (reportProgress) {
        return new Promise((resolve, reject) => {
          const req = new XMLHttpRequest();

          try {
            const handleProgress = (event: ProgressEvent<EventTarget>) => {
              const progress = Math.round((event.loaded / event.total) * 100);

              reportProgress(progress);
            };

            const handleReadyStateChanged = async (event: Event) => {
              if (req.readyState == req.DONE) {
                if (req.status !== 200 || !req.response) {
                  resolve([null, null]);

                  return;
                }

                reportProgress(100);

                // todo parse headers
                // req.getAllResponseHeaders()
                const headers = new Headers();

                resolve([req.response, headers]);
              }
            };

            req.responseType = "arraybuffer";
            req.onprogress = handleProgress;
            req.onreadystatechange = handleReadyStateChanged;
            req.onerror = reject;
            req.open("GET", url, true);
            req.send(null);
          } catch (error) {
            this.logger.logError(`Failed to fetch ArrayBuffer with progress from: ${url}`, error);

            reject(error);
          }
        });
      }

      const resp = await fetch(url);

      if (!resp.ok) return [null, null];

      const buffer = await resp.arrayBuffer();

      if (!buffer) return [null, null];

      return [buffer, resp.headers];
    } catch (error) {
      this.logger.logError(`Failed to fetch ArrayBuffer from: ${url}`, error);

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
