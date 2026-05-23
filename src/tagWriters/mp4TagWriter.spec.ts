import { Mp4TagWriter } from "./mp4TagWriter";

// Helpers to build a minimal MP4 atom tree we can feed to the writer.

const ATOM_HEAD_LENGTH = 8;

function fourcc(name: string): number[] {
  return [name.charCodeAt(0), name.charCodeAt(1), name.charCodeAt(2), name.charCodeAt(3)];
}

function buildAtom(name: string, payload: Uint8Array, children: Uint8Array[] = []): Uint8Array {
  const childLength = children.reduce((acc, c) => acc + c.length, 0);
  const length = ATOM_HEAD_LENGTH + payload.length + childLength;
  const out = new Uint8Array(length);
  const view = new DataView(out.buffer);
  view.setUint32(0, length);
  out.set(fourcc(name), 4);
  out.set(payload, ATOM_HEAD_LENGTH);
  let offset = ATOM_HEAD_LENGTH + payload.length;
  for (const child of children) {
    out.set(child, offset);
    offset += child.length;
  }
  return out;
}

// Minimal mvhd: version+flags(4) + created(4) + modified(4) + timescale(4) +
// duration(4) + rate(4) + volume(2) + reserved(10) + matrix(36) + pre_defined(24)
// + next_track_id(4) = 100
function buildMvhd(): Uint8Array {
  const payload = new Uint8Array(100);
  const view = new DataView(payload.buffer);
  view.setUint32(12, 1000); // timescale
  view.setUint32(16, 5000); // duration
  return payload;
}

function buildMinimalMp4(): ArrayBuffer {
  const ftyp = buildAtom("ftyp", new Uint8Array(16));
  const mvhd = buildAtom("mvhd", buildMvhd());
  const moov = buildAtom("moov", new Uint8Array(0), [mvhd]);

  const out = new Uint8Array(ftyp.length + moov.length);
  out.set(ftyp, 0);
  out.set(moov, ftyp.length);
  return out.buffer;
}

function readName(view: DataView, offset: number): string {
  let name = "";
  for (let i = 0; i < 4; i++) {
    name += String.fromCharCode(view.getUint8(offset + 4 + i));
  }
  return name;
}

function findAtom(buffer: ArrayBuffer, path: string[]): { offset: number; length: number } | null {
  const view = new DataView(buffer);

  function search(start: number, end: number, depth: number): { offset: number; length: number } | null {
    const target = path[depth];
    let offset = start;
    while (offset < end) {
      const length = view.getUint32(offset);
      if (length < ATOM_HEAD_LENGTH) return null;
      const name = readName(view, offset);

      if (name === target) {
        if (depth === path.length - 1) return { offset, length };
        let childStart = offset + ATOM_HEAD_LENGTH;
        if (name === "meta") childStart += 4;
        return search(childStart, offset + length, depth + 1);
      }
      offset += length;
    }
    return null;
  }

  return search(0, buffer.byteLength, 0);
}

describe("Mp4TagWriter", () => {
  test("synthesizes udta > meta > ilst chain when missing", async () => {
    const writer = new Mp4TagWriter(buildMinimalMp4());

    writer.setTitle("My Title");
    writer.setArtists(["Artist One"]);
    writer.setAlbum("My Album");
    writer.setComment("a comment");
    writer.setDate(new Date("2024-03-15T00:00:00Z"));

    const buffer = await writer.getBuffer();

    expect(findAtom(buffer, ["moov"])).not.toBeNull();
    expect(findAtom(buffer, ["moov", "mvhd"])).not.toBeNull();
    expect(findAtom(buffer, ["moov", "udta"])).not.toBeNull();
    expect(findAtom(buffer, ["moov", "udta", "meta"])).not.toBeNull();
    expect(findAtom(buffer, ["moov", "udta", "meta", "hdlr"])).not.toBeNull();
    expect(findAtom(buffer, ["moov", "udta", "meta", "ilst"])).not.toBeNull();
    expect(findAtom(buffer, ["moov", "udta", "meta", "ilst", "©nam"])).not.toBeNull();
    expect(findAtom(buffer, ["moov", "udta", "meta", "ilst", "©ART"])).not.toBeNull();
    expect(findAtom(buffer, ["moov", "udta", "meta", "ilst", "©day"])).not.toBeNull();
  });

  test("setDuration writes into mvhd", async () => {
    const writer = new Mp4TagWriter(buildMinimalMp4());
    writer.setDuration(12345);

    const buffer = await writer.getBuffer();
    const mvhd = findAtom(buffer, ["moov", "mvhd"]);
    expect(mvhd).not.toBeNull();

    const view = new DataView(buffer);
    // mvhd payload: 4 (version+flags) + 4 (created) + 4 (modified) + 4 (timescale)
    // = 16, then duration
    const duration = view.getUint32(mvhd!.offset + ATOM_HEAD_LENGTH + 16);
    expect(duration).toBe(12345);
  });

  test("hdlr declares 'mdir' handler type", async () => {
    const writer = new Mp4TagWriter(buildMinimalMp4());
    writer.setTitle("x");

    const buffer = await writer.getBuffer();
    const hdlr = findAtom(buffer, ["moov", "udta", "meta", "hdlr"]);
    expect(hdlr).not.toBeNull();

    const view = new DataView(buffer);
    // hdlr payload: version+flags(4) + pre_defined(4) + handler_type(4)
    let handler = "";
    for (let i = 0; i < 4; i++) {
      handler += String.fromCharCode(view.getUint8(hdlr!.offset + ATOM_HEAD_LENGTH + 8 + i));
    }
    expect(handler).toBe("mdir");
  });

  test("encoded atom length equals returned buffer length", async () => {
    const writer = new Mp4TagWriter(buildMinimalMp4());
    writer.setTitle("title");
    writer.setArtists(["a"]);

    const buffer = await writer.getBuffer();
    const view = new DataView(buffer);

    // sum of top-level atoms must equal buffer length
    let offset = 0;
    while (offset < buffer.byteLength) {
      const len = view.getUint32(offset);
      expect(len).toBeGreaterThan(0);
      offset += len;
    }
    expect(offset).toBe(buffer.byteLength);
  });
});
