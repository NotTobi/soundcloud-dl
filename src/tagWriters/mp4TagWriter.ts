import { concatArrayBuffers } from "../utils/download";
import { TagWriter } from "./tagWriter";
import { Logger, LogLevel } from "../utils/logger";

interface Atom {
  length: number;
  name?: string;
  offset?: number;
  children?: Atom[];
  data?: ArrayBuffer;
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
  private _loggedErrors: Set<string> = new Set();
  private _hasValidStructure = false;
  private _logger: Logger;
  
  private _logError(message: string): void {
    // Only log each unique error message once
    if (!this._loggedErrors.has(message)) {
      this._logger.logDebug(`MP4 metadata: ${message}`); // Using logDebug instead of logError
      this._loggedErrors.add(message);
    }
  }

  constructor(buffer: ArrayBuffer) {
    this._buffer = buffer;
    this._bufferView = new DataView(buffer);
    this._logger = Logger.create("MP4TagWriter", LogLevel.Warning); // Only show warnings and errors
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
    
    // Check if this is a valid MP4 file with a 'moov' atom
    const hasMoov = this._findAtom(this._atoms, ["moov"]) !== null;
    this._hasValidStructure = hasMoov;
    
    if (!hasMoov) {
      this._logError("File does not contain a 'moov' atom - likely not a valid MP4 file or has a non-standard structure");
    }
  }

  setDuration(duration: number) {
    try {
      // Skip if not a valid MP4 structure
      if (!this._hasValidStructure) {
        this._logError(`Cannot set duration - file doesn't have a valid MP4 structure`);
        return;
      }
      
      const mvhdAtom: Atom = this._findAtom(this._atoms, ["moov", "mvhd"]);
  
      if (!mvhdAtom) throw new Error("'mvhd' atom could not be found");
  
      // version(4) + created(4) + modified(4) + timescale(4)
      const precedingDataLength = 16;
      this._bufferView.setUint32(mvhdAtom.offset + ATOM_HEAD_LENGTH + precedingDataLength, duration);
    } catch (error) {
      this._logError(`Failed to set duration: ${error.message}`);
    }
  }

  addMetadataAtom(name: string, data: ArrayBuffer | string | number) {
    try {
      // Skip if not a valid MP4 structure
      if (!this._hasValidStructure) {
        this._logError(`Cannot add ${name} metadata - file doesn't have a valid MP4 structure`);
        return;
      }
    
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
    } catch (error) {
      // Log error but don't throw - this makes the tag writer more resilient
      this._logError(`Failed to add metadata atom '${name}': ${error.message}`);
    }
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

          // set length of parent in buffer
          this._bufferView.setUint32(parent.offset, parent.length);

          const parentHeader = this._buffer.slice(parent.offset, parent.offset + parentHeadLength);
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
    try {
      // First check if the structure is valid
      if (!this._hasValidStructure) {
        this._logError("Cannot insert atom: file doesn't have a valid MP4 structure");
        return;
      }
    
      if (!path) throw new Error("Path can not be empty");

      const parentAtom = this._findAtom(this._atoms, path);

      if (!parentAtom) {
        // Try to create missing atoms in the path
        this._createMetadataPath();
        
        // Try again after creating the path
        const newParentAtom = this._findAtom(this._atoms, path);
        
        if (!newParentAtom) {
          // Log the error instead of throwing it
          this._logError(`Parent atom at path '${path.join(" > ")}' could not be found or created`);
          return; // Exit without throwing
        }
        
        // Continue with the newly created parent atom
        if (newParentAtom.children === undefined) {
          newParentAtom.children = this._readChildAtoms(newParentAtom);
        }
    
        let offset = newParentAtom.offset + ATOM_HEAD_LENGTH;
    
        if (newParentAtom.name === "meta") {
          offset += 4;
        } else if (newParentAtom.name === "stsd") {
          offset += 8;
        }
    
        if (newParentAtom.children.length > 0) {
          const lastChild = newParentAtom.children[newParentAtom.children.length - 1];
          offset = lastChild.offset + lastChild.length;
        }
    
        atom.offset = offset;
        newParentAtom.children.push(atom);
        return;
      }

      if (parentAtom.children === undefined) {
        parentAtom.children = this._readChildAtoms(parentAtom);
      }

      let offset = parentAtom.offset + ATOM_HEAD_LENGTH;

      if (parentAtom.name === "meta") {
        offset += 4;
      } else if (parentAtom.name === "stsd") {
        offset += 8;
      }

      if (parentAtom.children.length > 0) {
        const lastChild = parentAtom.children[parentAtom.children.length - 1];

        offset = lastChild.offset + lastChild.length;
      }

      atom.offset = offset;

      parentAtom.children.push(atom);
    } catch (error) {
      this._logError(`Error inserting atom: ${error.message}`);
    }
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

  // Helper method to create the metadata path if it doesn't exist
  private _createMetadataPath() {
    try {
      // First check if the structure is valid
      if (!this._hasValidStructure) {
        // Don't even attempt to create paths for invalid MP4 structures
        return;
      }
      
      // Find the 'moov' atom first
      let moovAtom = this._findAtom(this._atoms, ["moov"]);
      
      if (!moovAtom) {
        // If we can't find moov, we can't proceed safely
        this._logError("Could not find 'moov' atom, which is required for metadata");
        return;
      }
      
      // Ensure moov has children loaded
      if (moovAtom.children === undefined) {
        moovAtom.children = this._readChildAtoms(moovAtom);
      }
      
      // Check for udta
      let udtaAtom = this._findAtom([moovAtom], ["udta"]);
      if (!udtaAtom) {
        // Create udta if it doesn't exist
        const udtaLength = ATOM_HEAD_LENGTH;
        const udtaOffset = moovAtom.offset + moovAtom.length;
        
        udtaAtom = {
          name: "udta",
          length: udtaLength,
          offset: udtaOffset,
          children: []
        };
        
        moovAtom.children.push(udtaAtom);
        moovAtom.length += udtaLength;
      }
      
      // Check for meta
      let metaAtom = this._findAtom([udtaAtom], ["meta"]);
      if (!metaAtom) {
        // Create meta if it doesn't exist
        const metaLength = ATOM_HEAD_LENGTH + 4; // meta has additional 4 bytes
        const metaOffset = udtaAtom.offset + udtaAtom.length;
        
        metaAtom = {
          name: "meta",
          length: metaLength,
          offset: metaOffset,
          children: []
        };
        
        udtaAtom.children.push(metaAtom);
        udtaAtom.length += metaLength;
      }
      
      // Check for ilst
      let ilstAtom = this._findAtom([metaAtom], ["ilst"]);
      if (!ilstAtom) {
        // Create ilst if it doesn't exist
        const ilstLength = ATOM_HEAD_LENGTH;
        const ilstOffset = metaAtom.offset + metaAtom.length;
        
        ilstAtom = {
          name: "ilst",
          length: ilstLength,
          offset: ilstOffset,
          children: []
        };
        
        metaAtom.children.push(ilstAtom);
        metaAtom.length += ilstLength;
      }
    } catch (error) {
      this._logError(`Failed to create metadata path: ${error.message}`);
    }
  }
}

export class Mp4TagWriter implements TagWriter {
  private _originalBuffer: ArrayBuffer;
  private _mp4: Mp4;
  
  // Track errors that have already been logged to avoid spamming console
  private static _loggedErrors: Set<string> = new Set();
  private static _logger: Logger = Logger.create("MP4TagWriter", LogLevel.Warning);
  
  private static _logError(message: string): void {
    // Only log each unique error message once
    if (!Mp4TagWriter._loggedErrors.has(message)) {
      Mp4TagWriter._logger.logDebug(`MP4 metadata: ${message}`); // Use logDebug to keep it quieter
      Mp4TagWriter._loggedErrors.add(message);
    }
  }

  constructor(buffer: ArrayBuffer) {
    this._originalBuffer = buffer; // Store original buffer for fallback
    this._mp4 = new Mp4(buffer);
    this._mp4.parse();
  }

  setTitle(title: string): void {
    try {
      if (!title) throw new Error("Invalid value for title");

      this._mp4.addMetadataAtom("©nam", title);
    } catch (error) {
      Mp4TagWriter._logError(`Failed to set title: ${error.message}`);
    }
  }

  setArtists(artists: string[]): void {
    try {
      if (!artists || artists.length < 1) throw new Error("Invalid value for artists");

      this._mp4.addMetadataAtom("©ART", artists.join(", "));
    } catch (error) {
      Mp4TagWriter._logError(`Failed to set artists: ${error.message}`);
    }
  }

  setAlbum(album: string): void {
    try {
      if (!album) throw new Error("Invalid value for album");

      this._mp4.addMetadataAtom("©alb", album);
    } catch (error) {
      Mp4TagWriter._logError(`Failed to set album: ${error.message}`);
    }
  }

  setComment(comment: string): void {
    try {
      if (!comment) throw new Error("Invalid value for comment");

      this._mp4.addMetadataAtom("©cmt", comment);
    } catch (error) {
      Mp4TagWriter._logError(`Failed to set comment: ${error.message}`);
    }
  }

  setTrackNumber(trackNumber: number): void {
    try {
      // max trackNumber is max of Uint8
      if (trackNumber < 1 || trackNumber > 32767) throw new Error("Invalid value for trackNumber");

      this._mp4.addMetadataAtom("trkn", trackNumber);
    } catch (error) {
      Mp4TagWriter._logError(`Failed to set track number: ${error.message}`);
    }
  }

  setYear(year: number): void {
    try {
      if (year < 1) throw new Error("Invalid value for year");

      this._mp4.addMetadataAtom("©day", year.toString());
    } catch (error) {
      Mp4TagWriter._logError(`Failed to set year: ${error.message}`);
    }
  }

  setGrouping(grouping: string): void {
    try {
      if (!grouping) throw new Error("Invalid value for grouping");

      this._mp4.addMetadataAtom("©grp", grouping);
    } catch (error) {
      Mp4TagWriter._logError(`Failed to set grouping: ${error.message}`);
    }
  }

  setArtwork(artworkBuffer: ArrayBuffer): void {
    try {
      if (!artworkBuffer || artworkBuffer.byteLength < 1) throw new Error("Invalid value for artworkBuffer");

      this._mp4.addMetadataAtom("covr", artworkBuffer);
    } catch (error) {
      Mp4TagWriter._logError(`Failed to set artwork: ${error.message}`);
    }
  }

  setDuration(duration: number): void {
    try {
      if (duration < 1) throw new Error("Invalid value for duration");

      this._mp4.setDuration(duration);
    } catch (error) {
      Mp4TagWriter._logError(`Failed to set duration: ${error.message}`);
    }
  }

  getBuffer(): Promise<ArrayBuffer> {
    try {
      const buffer = this._mp4.getBuffer();
      return Promise.resolve(buffer);
    } catch (error) {
      Mp4TagWriter._logError(`Failed to get processed buffer: ${error.message}. Using original buffer as fallback.`);
      return Promise.resolve(this._originalBuffer);
    }
  }
}
