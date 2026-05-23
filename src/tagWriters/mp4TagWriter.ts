import { concatArrayBuffers } from "../utils/download";
import { TagWriter } from "./tagWriter";

interface Atom {
  length: number;
  name?: string;
  offset?: number;
  children?: Atom[];
  data?: ArrayBuffer;
  // Raw payload to write directly after the 8-byte atom header (no iTunes
  // 'data' sub-atom wrapper). Used for synthesized atoms like 'hdlr'.
  rawData?: ArrayBuffer;
  // True for atoms that were not present in the source buffer and need their
  // header synthesized at serialization time.
  synthetic?: boolean;
}

interface AtomLevel {
  parent: Atom;
  offset: number;
  childIndex: number;
}

// length(4) + name(4)
const ATOM_HEAD_LENGTH = 8;
// data-length(4) + data-name(4) + data-flags(4)
const ATOM_DATA_HEAD_LENGTH = 16;

const ATOM_HEADER_LENGTH = ATOM_HEAD_LENGTH + ATOM_DATA_HEAD_LENGTH;

class Mp4 {
  private readonly _metadataPath = ["moov", "udta", "meta", "ilst"];
  private _buffer: ArrayBuffer | null;
  private _bufferView: DataView | null;
  private _atoms: Atom[] = [];

  constructor(buffer: ArrayBuffer) {
    this._buffer = buffer;
    this._bufferView = new DataView(buffer);
  }

  parse() {
    if (!this._buffer) throw new Error("Buffer can not be null");
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

    if (!mvhdAtom) throw new Error("'mvhd' atom could not be found");

    // version(4) + created(4) + modified(4) + timescale(4)
    const precedingDataLength = 16;
    this._bufferView.setUint32(mvhdAtom.offset + ATOM_HEAD_LENGTH + precedingDataLength, duration);
  }

  addMetadataAtom(name: string, data: ArrayBuffer | string | number) {
    if (name.length > 4 || name.length < 1) throw new Error(`Unsupported atom name: '${name}'`);

    let dataBuffer: ArrayBuffer;

    if (data instanceof ArrayBuffer) {
      dataBuffer = data;
    } else if (typeof data === "string") {
      dataBuffer = this._getBufferFromString(data);
    } else if (typeof data === "number") {
      dataBuffer = new ArrayBuffer(4);
      const dataView = new DataView(dataBuffer);
      dataView.setUint32(0, data);
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

  getBuffer() {
    const buffers: ArrayBuffer[] = [];
    let bufferIndex = 0;

    // we don't change the offsets, since it would add needless complexity without benefit
    for (const atom of this._atoms) {
      if (!atom.children) {
        // nothing has been added or removed
        const slice = this._buffer.slice(atom.offset, atom.offset + atom.length);
        buffers.push(slice);
        bufferIndex++;

        continue;
      }

      atom.length = ATOM_HEAD_LENGTH;

      const levels: AtomLevel[] = [{ parent: atom, offset: bufferIndex, childIndex: 0 }];
      let levelIndex = 0;

      while (true) {
        const { parent, offset, childIndex } = levels[levelIndex];

        if (childIndex >= parent.children.length) {
          // move one level up
          levelIndex--;
          levels.pop();

          let parentHeadLength = ATOM_HEAD_LENGTH;
          if (parent.name === "meta") {
            parent.length += 4;
            parentHeadLength += 4;
          } else if (parent.name === "stsd") {
            parent.length += 8;
            parentHeadLength += 8;
          }

          let parentHeader: ArrayBuffer;
          if (parent.synthetic) {
            parentHeader = this._buildSyntheticHeader(parent, parentHeadLength);
          } else {
            // set length of parent in buffer
            this._bufferView.setUint32(parent.offset, parent.length);
            parentHeader = this._buffer.slice(parent.offset, parent.offset + parentHeadLength);
          }
          buffers.splice(offset, 0, parentHeader);

          // we completed the last parent - exit
          if (levelIndex < 0) break;

          // add our current parents length to new parent and move childIndex of new parent one ahead
          const newParent = levels[levelIndex].parent;
          newParent.length += parent.length;
          levels[levelIndex].childIndex++;

          continue;
        }

        const child = parent.children[childIndex];

        if (child.children) {
          // move one level down
          child.length = ATOM_HEAD_LENGTH;
          levels.push({ parent: child, offset: bufferIndex, childIndex: 0 });
          levelIndex++;
          continue;
        } else if (child.rawData) {
          // synthesized atom with raw payload (e.g. 'hdlr') — combined into one
          // buffer so the bufferIndex stays in step with the array.
          const combined = new Uint8Array(ATOM_HEAD_LENGTH + child.rawData.byteLength);
          const headerView = new DataView(combined.buffer);
          headerView.setUint32(0, child.length);
          const nameChars = this._getCharCodes(child.name);
          for (let i = 0; i < nameChars.length; i++) {
            headerView.setUint8(4 + i, nameChars[i]);
          }
          combined.set(new Uint8Array(child.rawData), ATOM_HEAD_LENGTH);
          buffers.push(combined.buffer);
        } else if (child.data) {
          // add new data to buffer
          const headerBuffer = this._getHeaderBufferFromAtom(child);
          buffers.push(headerBuffer);
          buffers.push(child.data);
        } else {
          // add entire child to buffer
          const slice = this._buffer.slice(child.offset, child.offset + child.length);
          buffers.push(slice);
        }

        bufferIndex++;

        parent.length += child.length;

        // move one child ahead
        levels[levelIndex].childIndex++;
      }
    }

    this._bufferView = null;
    this._buffer = null;
    this._atoms = [];

    return concatArrayBuffers(buffers);
  }

  private _insertAtom(atom: Atom, path: string[]) {
    if (!path || path.length < 1) throw new Error("Path can not be empty");

    const parentAtom = this._ensurePath(path);

    if (parentAtom.children === undefined) {
      parentAtom.children = this._readChildAtoms(parentAtom);
    }

    // Offset is only used when serializing existing (non-synthetic) leaf atoms
    // by slicing from the source buffer. New atoms are written from `data` /
    // `rawData`, so a placeholder is fine.
    atom.offset = 0;

    parentAtom.children.push(atom);
  }

  // Walk the path under the top-level atoms, creating any missing container
  // atoms as synthetic nodes. Returns the deepest atom on the path.
  private _ensurePath(path: string[]): Atom {
    let current = this._atoms.find((a) => a.name === path[0]);

    if (!current) {
      // Don't synthesize top-level containers (e.g. 'moov') — if they're
      // absent the file isn't an MP4 we can tag.
      throw new Error(`Top-level atom '${path[0]}' could not be found`);
    }

    for (let i = 1; i < path.length; i++) {
      if (current.children === undefined) {
        current.children = this._readChildAtoms(current);
      }

      const childName = path[i];
      let child = current.children.find((c) => c.name === childName);

      if (!child) {
        child = this._createSyntheticContainer(childName);
        current.children.push(child);

        // 'meta' is required (by the iTunes/MP4 spec) to start with an 'hdlr'
        // atom declaring metadata handler type 'mdir'. Without it most
        // players silently ignore the entire 'ilst' payload.
        if (childName === "meta") {
          const hdlrPayload = this._buildMetadataHdlrPayload();
          const hdlrAtom: Atom = {
            name: "hdlr",
            length: ATOM_HEAD_LENGTH + hdlrPayload.byteLength,
            rawData: hdlrPayload,
            synthetic: true,
          };
          child.children = [hdlrAtom];
        }
      } else if (child.children === undefined) {
        child.children = this._readChildAtoms(child);
      }

      current = child;
    }

    return current;
  }

  private _createSyntheticContainer(name: string): Atom {
    let length = ATOM_HEAD_LENGTH;
    if (name === "meta") {
      // 4 bytes version + flags after the header.
      length += 4;
    }

    return {
      name,
      length,
      children: [],
      synthetic: true,
    };
  }

  private _buildSyntheticHeader(atom: Atom, headLength: number): ArrayBuffer {
    const header = new ArrayBuffer(headLength);
    const view = new DataView(header);
    view.setUint32(0, atom.length);
    const nameChars = this._getCharCodes(atom.name);
    for (let i = 0; i < nameChars.length; i++) {
      view.setUint8(4 + i, nameChars[i]);
    }
    // For 'meta' the extra 4 bytes (version + flags) are left as zero.
    return header;
  }

  private _buildMetadataHdlrPayload(): ArrayBuffer {
    // version(1) + flags(3) + pre_defined(4) + handler_type(4) +
    // reserved(12) + name(1, null terminator) = 25 bytes
    const buffer = new ArrayBuffer(25);
    const view = new DataView(buffer);
    // handler_type 'mdir' at offset 8
    const handlerType = this._getCharCodes("mdir");
    for (let i = 0; i < 4; i++) {
      view.setUint8(8 + i, handlerType[i]);
    }
    return buffer;
  }

  private _findAtom(atoms: Atom[], path: string[]): Atom | null {
    if (!path || path.length < 1) throw new Error("Path can not be empty");

    const curPath = [...path];
    const curName = curPath.shift();
    const curElem = atoms.find((i) => i.name === curName);

    if (curPath.length < 1) return curElem;

    if (!curElem) return null;

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
        length: buffer.byteLength,
        offset,
      };
    }

    const dataView = new DataView(buffer);

    let length = dataView.getUint32(0, false);

    let name = "";
    for (let i = 0; i < 4; i++) {
      name += String.fromCharCode(dataView.getUint8(4 + i));
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
    headerBufferView.setUint32(16, this._getFlags(atom.name));

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
        // 13 for jpeg, 14 for png
        return 13;
      case "trkn":
      case "disk":
        return 0;
      case "tmpo":
      case "cpil":
      case "rtng":
        return 21;
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

  setTitle(title: string): void {
    if (!title) throw new Error("Invalid value for title");

    this._mp4.addMetadataAtom("©nam", title);
  }

  setArtists(artists: string[]): void {
    if (!artists || artists.length < 1) throw new Error("Invalid value for artists");

    this._mp4.addMetadataAtom("©ART", artists.join(", "));
  }

  setAlbum(album: string): void {
    if (!album) throw new Error("Invalid value for album");

    this._mp4.addMetadataAtom("©alb", album);
  }

  setComment(comment: string): void {
    if (!comment) throw new Error("Invalid value for comment");

    this._mp4.addMetadataAtom("©cmt", comment);
  }

  setTrackNumber(trackNumber: number): void {
    // max trackNumber is max of Uint8
    if (trackNumber < 1 || trackNumber > 32767) throw new Error("Invalid value for trackNumber");

    this._mp4.addMetadataAtom("trkn", trackNumber);
  }

  setDate(date: Date): void {
    if (!date || isNaN(date.getTime())) throw new Error("Invalid value for date");

    this._mp4.addMetadataAtom("©day", date.toISOString());
  }

  setArtwork(artworkBuffer: ArrayBuffer): void {
    if (!artworkBuffer || artworkBuffer.byteLength < 1) throw new Error("Invalid value for artworkBuffer");

    this._mp4.addMetadataAtom("covr", artworkBuffer);
  }

  setDuration(duration: number): void {
    if (duration < 1) throw new Error("Invalid value for duration");

    this._mp4.setDuration(duration);
  }

  getBuffer(): Promise<ArrayBuffer> {
    const buffer = this._mp4.getBuffer();

    return Promise.resolve(buffer);
  }
}
