import { TagWriter } from "./tagWriter";
import { WaveFile } from "wavefile";

export class WavTagWriter implements TagWriter {
  private wav: WaveFile;

  constructor(buffer: ArrayBuffer) {
    const uint8Array = new Uint8Array(buffer);

    this.wav = new WaveFile();
    this.wav.fromBuffer(uint8Array);
  }

  setTitle(title: string): void {
    if (!title) throw new Error("Invalid value for title");

    this.wav.setTag("INAM", title);
  }

  setArtists(artists: string[]): void {
    if (!artists || artists.length < 1) throw new Error("Invalid value for artists");

    this.wav.setTag("IART", artists.join(", "));
  }

  setAlbum(album: string): void {
    if (!album) throw new Error("Invalid value for album");

    this.wav.setTag("IPRD", album);
  }

  setComment(comment: string): void {
    if (!comment) throw new Error("Invalid value for comment");

    this.wav.setTag("ICMT", comment);
  }

  setTrackNumber(trackNumber: number): void {
    // not sure what the highest track number is for RIFF, but let's assume it's the max value of short
    if (trackNumber < 1 || trackNumber > 32767) throw new Error("Invalid value for trackNumber");

    this.wav.setTag("ITRK", trackNumber.toString());
  }

  setDate(date: Date): void {
    if (!date || isNaN(date.getTime())) throw new Error("Invalid value for date");

    this.wav.setTag("ICRD", date.toISOString().slice(0, 10));
  }

  setArtwork(artworkBuffer: ArrayBuffer): void {
    if (!artworkBuffer || artworkBuffer.byteLength < 1) throw new Error("Invalid value for artworkBuffer");

    // this.writer.setFrame("APIC", {
    //   type: 3,
    //   data: artworkBuffer,
    //   description: "",
    // });
  }

  getBuffer(): Promise<ArrayBuffer> {
    this.wav.toRIFF();

    const rawBuffer = this.wav.toBuffer();

    console.log({ tags: this.wav.listTags() });

    return Promise.resolve(rawBuffer.buffer);
  }
}
