export interface TagWriter {
  setTitle(title: string): void;
  setArtists(artists: string[]): void;
  setAlbum(album: string): void;
  setComment(comment: string): void;
  setTrackNumber(trackNumber: number): void;
  setYear(year: number): void;
  setGrouping(grouping: string): void;
  setArtwork(artworkBuffer: ArrayBuffer): void;
  getBuffer(): Promise<ArrayBuffer>;
}
