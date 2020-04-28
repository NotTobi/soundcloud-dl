import { TagWriter } from "./tagWriter";

export class Mp4TagWriter implements TagWriter {
  constructor(buffer: ArrayBuffer) {}

  setTitle(title: string) {}

  setArtists(artists: string[]) {}

  setAlbum(album: string) {}

  setComment(comment: string) {}

  setArtwork(artworkBuffer: ArrayBuffer) {}

  getDownloadUrl() {
    return null;
  }
}
