import { TagWriter } from "./tagWriter";

interface Atom {
  length: number;
  name?: string;
  offset?: number;
  children?: Atom[];
  data?: ArrayBuffer;
}

// length(4) + name(4)
const ATOM_HEAD_LENGTH = 8;
// data-length(4) + data-name(4) + data-flags(4)
const ATOM_DATA_HEAD_LENGTH = 16;

const ATOM_HEADER_LENGTH = ATOM_HEAD_LENGTH + ATOM_DATA_HEAD_LENGTH;

class Mp4 {
  private readonly _metadataPath = ["moov", "udta", "meta", "ilst"];
  private _buffer: ArrayBuffer | null;
  private _atoms: Atom[] = [];

  constructor(buffer: ArrayBuffer) {
    this._buffer = buffer;
  }

  parse() {
    if (this._buffer === null) throw new Error("Buffer can not be null");
    if (this._atoms.length > 0) throw new Error("Buffer already parsed");

    let offset = 0;
    let atom: Atom;

    while (true) {
      atom = this._readAtom(offset);

      if (!atom || atom.length < 1) break;

      this._atoms.push(atom);

      offset = atom.offset + atom.length;
    }

    if (this._atoms.length < 1) throw new Error("Buffer could not be parsed");
  }

  setDuration(duration: number) {
    const mvhdAtom: Atom = this._findAtom(this._atoms, ["moov", "mvhd"]);

    if (mvhdAtom === null) throw new Error("'mvhd' atom could not be found");

    const bufferView = new DataView(this._buffer);

    // version(4) + created(4) + modified(4) + timescale(4)
    const precedingDataLength = 16;
    bufferView.setUint32(mvhdAtom.offset + ATOM_HEAD_LENGTH + precedingDataLength, duration);
  }

  addMetadataAtom(name: string, data: ArrayBuffer | string) {
    if (name.length > 4 || name.length < 1) throw new Error(`Unsupported atom name: '${name}'`);

    let dataBuffer: ArrayBuffer;

    if (data instanceof ArrayBuffer) {
      dataBuffer = data;
    } else if (typeof data === "string") {
      dataBuffer = this._getBufferFromString(data);
    } else {
      throw new Error(`Unsupported data: '${data}'`);
    }

    const atom: Atom = {
      name,
      length: ATOM_HEADER_LENGTH + dataBuffer.byteLength,
      data: dataBuffer,
    };

    this._insertAtom(atom, this._metadataPath);
  }

  getBlob() {
    console.log({ atoms: this._atoms });

    const buffers: Uint8Array[] = [];

    // todo go through all atoms and their children
    // recalculate length
    // add atom buffer slices to buffers (old and new)

    this._atoms = [];
    this._buffer = null;

    return new Blob(buffers);

    // const bufferView = new DataView(this._buffer);

    // for (const atom of this._atoms) {
    //   if (atom.children?.length > 0) {
    //     atom.length = 8 + atom.children.reduce((acc, cur) => acc + cur.length, 0);
    //   }

    //   if (atom.name === "meta") {
    //     atom.length += 4;
    //   } else if (atom.name === "stsd") {
    //     atom.length += 8;
    //   }

    //   bufferView.setUint32(atom.offset, atom.length);
    // }

    // todo: maybe store all of the headers seperately and onlt perform one merge operation at the end
    // const resultBuffer = new ArrayBuffer(this._buffer.byteLength + headerBuffer.byteLength + dataBuffer.byteLength);
    // const result = new Uint8Array(resultBuffer);

    // result.set(new Uint8Array(this._buffer.slice(0, offset)), 0);
    // result.set(new Uint8Array(headerBuffer), offset);
    // result.set(new Uint8Array(dataBuffer), offset + headerBuffer.byteLength);
    // result.set(new Uint8Array(this._buffer.slice(offset)), offset + headerBuffer.byteLength + dataBuffer.byteLength);

    // this._buffer = resultBuffer;

    // return this._buffer;
  }

  private _insertAtom(atom: Atom, path: string[]) {
    // todo handle case where path is empty, e.g. add as root atom

    const parentAtom = this._findAtom(this._atoms, path);

    if (parentAtom === null) throw new Error(`Parent atom at path '${path.join(" > ")}' could not be found`);

    if (parentAtom.children === undefined) {
      parentAtom.children = this._readChildAtoms(parentAtom);
    }

    let offset = parentAtom.offset + ATOM_HEAD_LENGTH;

    if (parentAtom.children.length > 0) {
      const lastChild = parentAtom.children[parentAtom.children.length - 1];

      offset = lastChild.offset + lastChild.length;
    }

    atom.offset = offset;

    parentAtom.children.push(atom);
  }

  private _findAtom(atoms: Atom[], path: string[]): Atom | null {
    if (!path || path.length < 1) throw new Error("Path can not be empty");

    const curPath = [...path];
    const curName = curPath.shift();
    const curElem = atoms.find((i) => i.name === curName);

    if (curPath.length < 1) return curElem;

    if (curElem.children === undefined) {
      curElem.children = this._readChildAtoms(curElem);
    }

    if (curElem.children.length < 1) return null;

    return this._findAtom(curElem.children, curPath);
  }

  private _readChildAtoms(atom: Atom): Atom[] {
    const children: Atom[] = [];

    const childEnd = atom.offset + atom.length;
    let childOffset = atom.offset + ATOM_HEAD_LENGTH;

    if (atom.name === "meta") {
      childOffset += 4;
    } else if (atom.name === "stsd") {
      childOffset += 8;
    }

    while (true) {
      if (childOffset >= childEnd) break;

      const childAtom = this._readAtom(childOffset);

      if (!childAtom || childAtom.length < 1) break;

      childOffset = childAtom.offset + childAtom.length;

      children.push(childAtom);
    }

    return children;
  }

  private _readAtom(offset: number): Atom {
    const begin = offset;
    const end = offset + ATOM_HEAD_LENGTH;

    const buffer = this._buffer.slice(begin, end);

    if (buffer.byteLength < ATOM_HEAD_LENGTH) {
      return {
        length: 0,
        offset,
      };
    }

    const dataView = new DataView(buffer);

    let length = dataView.getUint32(0, false);

    let name = "";
    for (let i = 0; i < 4; i++) {
      name += String.fromCharCode(dataView.getUint8(4 + i));
    }

    if (name === "meta") {
      length += 4;
    } else if (name === "stsd") {
      length += 8;
    }

    return {
      name,
      length,
      offset,
    };
  }

  private _getHeaderBufferFromAtom(atom: Atom) {
    if (!atom || atom.length < 1 || !atom.name || !atom.data)
      throw new Error("Can not compute header buffer for this atom");

    const headerBuffer = new ArrayBuffer(ATOM_HEADER_LENGTH);
    const headerBufferView = new DataView(headerBuffer);

    // length at 0, length = 4
    headerBufferView.setUint32(0, atom.length);

    // name at 4, length = 4
    const nameChars = this._getCharCodes(atom.name);
    for (let i = 0; i < nameChars.length; i++) {
      headerBufferView.setUint8(4 + i, nameChars[i]);
    }

    // data length at 8, length = 4
    headerBufferView.setUint32(8, ATOM_DATA_HEAD_LENGTH + atom.data.byteLength);

    // data name at 12, length = 4
    const dataNameChars = this._getCharCodes("data");
    for (let i = 0; i < dataNameChars.length; i++) {
      headerBufferView.setUint8(12 + i, dataNameChars[i]);
    }

    // data flags at 16, length = 4
    headerBufferView.setUint32(16, this._getFlags(name));

    return headerBuffer;
  }

  private _getBufferFromString(input: string): ArrayBuffer {
    // return new TextEncoder().encode(input).buffer;

    const buffer = new ArrayBuffer(input.length);
    const bufferView = new DataView(buffer);
    const chars = this._getCharCodes(input);

    for (let i = 0; i < chars.length; i++) {
      bufferView.setUint8(i, chars[i]);
    }

    return buffer;
  }

  private _getCharCodes(input: string) {
    const chars: number[] = [];

    for (let i = 0; i < input.length; i++) {
      chars.push(input.charCodeAt(i));
    }

    return chars;
  }

  private _getFlags(name: string) {
    switch (name) {
      case "covr":
        return 13;
      default:
        return 1;
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

  setDuration(duration: number) {
    this._mp4.setDuration(duration);
  }

  getBlob() {
    return this._mp4.getBlob();
  }
}
