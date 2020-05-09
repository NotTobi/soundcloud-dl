import ID3Writer from "browser-id3-writer";
import { TagWriter } from "./tagWriter";

export class Mp3TagWriter implements TagWriter {
  private writer: ID3Writer;

  constructor(buffer: ArrayBuffer) {
    this.writer = new ID3Writer(buffer);
  }

  setTitle(title: string) {
    if (!title) throw new Error("Invalid value for title");

    this.writer.setFrame("TIT2", title);
  }

  setArtists(artists: string[]) {
    if (!artists || artists.length < 1) throw new Error("Invalid value for artists");

    this.writer.setFrame("TPE1", artists);
  }

  setAlbum(album: string) {
    if (!album) throw new Error("Invalid value for album");

    this.writer.setFrame("TALB", album);
  }

  setComment(comment: string) {
    if (!comment) throw new Error("Invalid value for comment");

    this.writer.setFrame("COMM", {
      text: comment,
      description: "",
    });
  }

  setTrackNumber(trackNumber: number) {
    // not sure what the highest track number is for ID3, but let's assume it's the max value of short
    if (trackNumber < 1 || trackNumber > 32767) throw new Error("Invalid value for trackNumber");

    this.writer.setFrame("TRCK", trackNumber);
  }

  setYear(year: number) {
    if (year < 1) throw new Error("Invalud value for year");

    this.writer.setFrame("TYER", year);
  }

  setArtwork(artworkBuffer: ArrayBuffer) {
    if (!artworkBuffer || artworkBuffer.byteLength < 1) throw new Error("Invalid value for artworkBuffer");

    this.writer.setFrame("APIC", {
      type: 3,
      data: artworkBuffer,
      description: "",
    });
  }

  getBlob() {
    this.writer.addTag();

    return this.writer.getBlob();
  }
}
