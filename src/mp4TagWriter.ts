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
  private _atoms: Atom[] = [];

  constructor(buffer: ArrayBuffer) {
    this._buffer = buffer;
  }

  parse() {
    if (this._atoms.length > 0) throw new Error("Buffer already parsed.");

    let offset = 0;
    let atom: Atom;

    while (true) {
      atom = this._readAtom(offset);

      if (!atom || atom.length < 1) break;

      if (atom.name === "moov") {
        this._atoms.push(atom);
        break;
      }

      offset = atom.offset + atom.length;
    }

    if (this._atoms.length < 1) throw new Error("Buffer could not be parsed.");

    let curAtom = this._atoms[0];

    for (let i = 1; i < this._metadataAtoms.length; i++) {
      const curAtomName = this._metadataAtoms[i];

      curAtom = curAtom.children?.find((atom) => atom.name === curAtomName);

      if (!curAtom) throw new Error(`Could not determine '${curAtomName}' atom`);

      this._atoms.push(curAtom);
    }

    this._atoms = this._atoms.reverse();
  }

  addMetadataAtom(name: string, data: ArrayBuffer | string) {
    if (name.length > 4 || name.length < 1) throw new Error(`Unsupported atom name: '${name}'.`);

    let dataBuffer: ArrayBuffer;

    if (data instanceof ArrayBuffer) {
      dataBuffer = data;
    } else if (typeof data === "string") {
      dataBuffer = this._getBufferFromString(data);
    } else {
      throw new Error(`Unsupported data: '${data}'`);
    }

    // determine offset
    const [ilstAtom] = this._atoms;

    let offset = ilstAtom.offset + 8;

    if (ilstAtom.children.length > 0) {
      const lastChild = ilstAtom.children[ilstAtom.children.length - 1];

      offset = lastChild.offset + lastChild.length;
    }

    const atomHeaderLength = 24;
    const atomLength = atomHeaderLength + dataBuffer.byteLength;

    const atom: Atom = {
      name,
      length: atomLength,
      offset,
      children: [],
    };

    ilstAtom.children.push(atom);

    const headerBuffer = new ArrayBuffer(atomHeaderLength);
    const headerBufferView = new DataView(headerBuffer);

    // length at 0, length = 4
    headerBufferView.setUint32(0, atomLength);

    // name at 4, length = 4
    for (let i = 0; i < name.length; i++) {
      const char = name.charCodeAt(i);
      headerBufferView.setUint8(4 + i, char);
    }

    // data length at 8, length = 4
    headerBufferView.setUint32(8, dataBuffer.byteLength + 16);

    // data name at 12, length = 4
    const dataName = "data";
    for (let i = 0; i < dataName.length; i++) {
      const char = dataName.charCodeAt(i);
      headerBufferView.setUint8(12 + i, char);
    }

    let atomFlag = 1;
    if (name === "covr") atomFlag = 13;

    // data flags at 16, length = 4
    headerBufferView.setUint32(16, atomFlag);

    const resultBuffer = new ArrayBuffer(this._buffer.byteLength + headerBuffer.byteLength + dataBuffer.byteLength);
    const result = new Uint8Array(resultBuffer);

    result.set(new Uint8Array(this._buffer.slice(0, offset)), 0);
    result.set(new Uint8Array(headerBuffer), offset);
    result.set(new Uint8Array(dataBuffer), offset + headerBuffer.byteLength);
    result.set(new Uint8Array(this._buffer.slice(offset)), offset + headerBuffer.byteLength + dataBuffer.byteLength);

    this._buffer = resultBuffer;
  }

  getBuffer() {
    const bufferView = new DataView(this._buffer);

    for (const atom of this._atoms) {
      if (atom.children?.length > 0) {
        atom.length = 8 + atom.children.reduce((acc, cur) => acc + cur.length, 0);
      }

      if (atom.name === "meta") {
        atom.length += 4;
      } else if (atom.name === "stsd") {
        atom.length += 8;
      }

      bufferView.setUint32(atom.offset, atom.length);
    }

    return this._buffer;
  }

  private _getBufferFromString(input: string): ArrayBuffer {
    // return new TextEncoder().encode(input).buffer;

    const buffer = new ArrayBuffer(input.length);
    const bufferView = new DataView(buffer);

    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      bufferView.setUint8(i, char);
    }

    return buffer;
  }

  private _readAtom(offset: number): Atom {
    const begin = offset;
    const end = offset + 8;

    const buffer = this._buffer.slice(begin, end);

    if (buffer.byteLength < 8) {
      return {
        length: 0,
        offset,
      };
    }

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
      } else if (name === "stsd") {
        childOffset += 8;
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

  setTitle(title: string) {
    this._mp4.addMetadataAtom("©nam", title);
  }

  setArtists(artists: string[]) {
    const artist = artists.join(", ");

    this._mp4.addMetadataAtom("©ART", artist);
  }

  setAlbum(album: string) {
    this._mp4.addMetadataAtom("©alb", album);
  }

  setComment(comment: string) {
    this._mp4.addMetadataAtom("©cmt", comment);
  }

  setArtwork(artworkBuffer: ArrayBuffer) {
    this._mp4.addMetadataAtom("covr", artworkBuffer);
  }

  getDownloadUrl() {
    const buffer = this._mp4.getBuffer();
    const blob = new Blob([buffer], { type: "audio/mpeg" });

    return URL.createObjectURL(blob);
  }
}
