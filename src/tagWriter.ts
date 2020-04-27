import ID3Writer from "browser-id3-writer";

export class TagWriter {
  private writer: ID3Writer;

  constructor(buffer: ArrayBuffer) {
    this.writer = new ID3Writer(buffer);
  }

  setTitle(title: string) {
    this.writer.setFrame("TIT2", title);
  }

  setArtists(artists: string[]) {
    this.writer.setFrame("TPE1", artists);
  }

  setAlbum(album: string) {
    this.writer.setFrame("TALB", album);
  }

  setComment(comment: string) {
    this.writer.setFrame("COMM", {
      text: comment,
      description: "",
    });
  }

  setArtwork(artworkBuffer: ArrayBuffer) {
    this.writer.setFrame("APIC", {
      type: 3,
      data: artworkBuffer,
      description: "",
    });
  }

  getDownloadUrl() {
    this.writer.addTag();

    return this.writer.getURL();
  }
}
