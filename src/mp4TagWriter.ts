import { TagWriter } from "./tagWriter";

interface Atom {
  name?: string;
  length: number;
  offset: number;
  children?: Atom[];
}

class Mp4 {
  // Metadata resides in moov.udta.meta.ilst
  private readonly _metadataAtoms = ["moov", "udta", "meta", "ilst"];
  private _buffer: ArrayBuffer;
  private _textEncoder: TextEncoder;
  private _moovAtom: Atom | null;
  private _ilstAtom: Atom | null;

  constructor(buffer: ArrayBuffer) {
    this._buffer = buffer;
    this._textEncoder = new TextEncoder();
  }

  parse() {
    if (this._moovAtom) throw new Error("Buffer already parsed.");

    let offset = 0;
    let atom: Atom;

    while (true) {
      atom = this._readAtom(offset);

      if (!atom || atom.length < 1) break;

      if (atom.name === "moov") {
        this._moovAtom = atom;
        break;
      }

      offset = atom.offset + atom.length;
    }

    if (!this._moovAtom) throw new Error("Buffer does not contain a 'moov' atom.");

    let curAtom = this._moovAtom;

    for (let i = 1; i < this._metadataAtoms.length; i++) {
      const curAtomName = this._metadataAtoms[i];

      curAtom = curAtom.children?.find((atom) => atom.name === curAtomName);

      if (!curAtom) throw new Error(`Could not determine '${curAtomName}' atom`);
    }

    this._ilstAtom = curAtom;
  }

  addMetadataAtom(name: string, data: ArrayBuffer | string) {
    const dataType = typeof data;
    const encodedName = this._textEncoder.encode(name).buffer;
    let encodedData: ArrayBuffer;

    if (data instanceof ArrayBuffer) {
      encodedData = data;
    } else if (dataType === "string") {
      encodedData = this._textEncoder.encode(data).buffer;
    } else {
      throw new Error(`Unsupported data of type '${dataType}'`);
    }

    // todo is byteLength same as length stored !?
    const length = encodedData.byteLength + 8;
    let offset = this._ilstAtom.offset + 8;

    if (this._ilstAtom.children.length > 0) {
      const lastChild = this._ilstAtom.children[this._ilstAtom.children.length - 1];

      offset = lastChild.offset + lastChild.length;
    }

    const atom: Atom = {
      name,
      length,
      offset,
      children: [],
    };

    this._ilstAtom.children.push(atom);

    // todo cover will (likely !?) need format flag

    const startBuffer = this._buffer.slice(0, offset);
    const endBuffer = this._buffer.slice(offset, this._buffer.byteLength - offset);

    // todo insert length, name and encoded data between start- and endBuffer
    // length needs to be padded and encoded (!?)
  }

  getBuffer() {
    // todo recalculate lengths of moov/children and change them in the buffer

    return this._buffer;
  }

  private _readAtom(offset: number): Atom {
    const begin = offset;
    const end = offset + 8;

    const buffer = this._buffer.slice(begin, end);

    if (buffer.byteLength < 8) {
      return {
        length: 0,
        offset: offset,
      };
    }

    // length is first 4 bytes; name are second 4 bytes
    const dataView = new DataView(buffer);
    const length = dataView.getUint32(0, false);
    let name = "";
    for (let i = 0; i < 4; i++) {
      name += String.fromCharCode(dataView.getUint8(4 + i));
    }

    if (this._metadataAtoms.includes(name)) {
      const children: Atom[] = [];
      let childOffset = offset + 8;
      const childEnd = offset + length;

      if (name === "meta") {
        childOffset += 4;
      }

      while (true) {
        if (childOffset >= childEnd) break;

        const childAtom = this._readAtom(childOffset);

        if (!childAtom || childAtom.length < 1) break;

        childOffset = childAtom.offset + childAtom.length;

        children.push(childAtom);
      }

      return {
        name,
        length,
        offset,
        children,
      };
    } else {
      return {
        name,
        length,
        offset,
        children: [],
      };
    }
  }
}

export class Mp4TagWriter implements TagWriter {
  private _mp4: Mp4;

  constructor(buffer: ArrayBuffer) {
    this._mp4 = new Mp4(buffer);
    this._mp4.parse();
  }

  // "\251nam"
  setTitle(title: string) {
    this._mp4.addMetadataAtom("©nam", title);
  }

  // "\251ART"
  setArtists(artists: string[]) {
    const artist = artists.join(", ");

    this._mp4.addMetadataAtom("©art", artist);
  }

  // "\251alb"
  setAlbum(album: string) {
    this._mp4.addMetadataAtom("©alb", album);
  }

  // "\251cmt"
  setComment(comment: string) {
    this._mp4.addMetadataAtom("©cmt", comment);
  }

  setArtwork(artworkBuffer: ArrayBuffer) {
    // this._mp4.addMetadataAtom("covr", artworkBuffer);
  }

  getDownloadUrl() {
    const buffer = this._mp4.getBuffer();
    const blob = new Blob([buffer], { type: "audio/mpeg" });

    return URL.createObjectURL(blob);
  }
}
