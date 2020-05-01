export interface TagWriter {
  setTitle: (title: string) => void;
  setArtists: (artists: string[]) => void;
  setAlbum: (album: string) => void;
  setComment: (comment: string) => void;
  setArtwork: (artworkBuffer: ArrayBuffer) => void;
  getBuffer: () => Promise<ArrayBuffer>;
}
