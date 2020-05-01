declare module "browser-id3-writer" {
  export default class ID3Writer {
    constructor(buffer: ArrayBuffer);

    setFrame(name: string, value: any);
    addTag(): void;
    getURL(): string;
    getBlob(): Blob;
  }
}
