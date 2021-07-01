import { sanitizeFilenameForDownload } from "./download";

const illegalCharacters = ["<", ">", ":", '"', "/", "\\", "|", "?", "*", , "\u0000"];

describe("Sanitization of filenames", () => {
  test.each(illegalCharacters)("%s in filename", (character) => {
    const filename = `Foo${character}Bar`;
    const correctFilename = "FooBar";

    expect(sanitizeFilenameForDownload(filename)).toEqual(correctFilename);
  });

  test("Filename starts with dot", () => {
    const filename = ".filename";
    const correctFilename = "filename";

    expect(sanitizeFilenameForDownload(filename)).toEqual(correctFilename);
  });

  test("Filename ends with dot", () => {
    const filename = "filename.";
    const correctFilename = "filename";

    expect(sanitizeFilenameForDownload(filename)).toEqual(correctFilename);
  });

  test("Filename contains multiple spaces", () => {
    const filename = "Foo  Bar";
    const correctFilename = "Foo Bar";

    expect(sanitizeFilenameForDownload(filename)).toEqual(correctFilename);
  });

  test("Filename starts with a space", () => {
    const filename = " filename";
    const correctFilename = "filename";

    expect(sanitizeFilenameForDownload(filename)).toEqual(correctFilename);
  });

  test("Filename ends with a space", () => {
    const filename = "filename ";
    const correctFilename = "filename";

    expect(sanitizeFilenameForDownload(filename)).toEqual(correctFilename);
  });

  test("Cyrillic filename", () => {
    const filename = "Хмари";
    const correctFilename = "Хмари";

    expect(sanitizeFilenameForDownload(filename)).toEqual(correctFilename);
  });
});
