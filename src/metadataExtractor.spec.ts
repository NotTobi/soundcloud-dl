import { MetadataExtractor, Artist, ArtistType, getRemixTypeFromString } from "./metadataExtractor";

const createExtractor = (title: string, username: string = "username") => new MetadataExtractor(title, username);

const braceCombos = [
  ["", ""],
  ["(", ")"],
  ["[", "]"],
];

const titleSeperators = MetadataExtractor.titleSeperators;
const featureSeperators = MetadataExtractor.featureSeperators;
const combiningFeatureSeperators = MetadataExtractor.combiningFeatureSeperators;
const producerIndicators = MetadataExtractor.producerIndicators;
const remixIndicators = MetadataExtractor.remixIndicators;

describe("seperators", () => {
  test.each(titleSeperators)("artist1 %s title", (seperator) => {
    const title = `artist1 ${seperator} title`;
    const extractor = createExtractor(title);

    const correctArtists: Artist[] = [
      {
        name: "artist1",
        type: ArtistType.Main,
      },
    ];
    const correctTitle = "title";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toBe(correctTitle);
  });

  test.each(featureSeperators)("artist1%sartist2 - title", (seperator) => {
    const title = `artist1${seperator}artist2 - title`;
    const extractor = createExtractor(title);

    const correctArtists: Artist[] = [
      {
        name: "artist1",
        type: ArtistType.Main,
      },
      {
        name: "artist2",
        type: ArtistType.Feature,
      },
    ];
    const correctTitle = "title";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toBe(correctTitle);
  });

  test.each(featureSeperators)("artist1 - title %sartist2", (seperator) => {
    const title = `artist1 - title ${seperator}artist2`;
    const extractor = createExtractor(title);

    const correctArtists: Artist[] = [
      {
        name: "artist1",
        type: ArtistType.Main,
      },
      {
        name: "artist2",
        type: ArtistType.Feature,
      },
    ];
    const correctTitle = "title";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toBe(correctTitle);
  });

  braceCombos.forEach(([opening, closing]) => {
    producerIndicators.forEach((producerIndicator) => {
      test(`artist1 - title ${opening}${producerIndicator}artist2${closing}`, () => {
        const title = `artist1 - title ${opening}${producerIndicator}artist2${closing}`;
        const extractor = createExtractor(title);

        const correctArtists: Artist[] = [
          {
            name: "artist1",
            type: ArtistType.Main,
          },
          {
            name: "artist2",
            type: ArtistType.Producer,
          },
        ];
        const correctTitle = "title";

        expect(extractor.getArtists()).toEqual(correctArtists);
        expect(extractor.getTitle()).toBe(correctTitle);
      });

      combiningFeatureSeperators.forEach((combiningSeperator) => {
        test(`artist1 - title ${opening}${producerIndicator}artist2${combiningSeperator}artist3${closing}`, () => {
          const title = `artist1 - title ${opening}${producerIndicator}artist2${combiningSeperator}artist3${closing}`;
          const extractor = createExtractor(title);

          const correctArtists: Artist[] = [
            {
              name: "artist1",
              type: ArtistType.Main,
            },
            {
              name: "artist2",
              type: ArtistType.Producer,
            },
            {
              name: "artist3",
              type: ArtistType.Producer,
            },
          ];
          const correctTitle = "title";

          expect(extractor.getArtists()).toEqual(correctArtists);
          expect(extractor.getTitle()).toBe(correctTitle);
        });
      });
    });

    featureSeperators.forEach((seperator) => {
      test(`artist1 - title ${opening}${seperator}artist2${closing}`, () => {
        const title = `artist1 - title ${opening}${seperator}artist2${closing}`;
        const extractor = createExtractor(title);

        const correctArtists: Artist[] = [
          {
            name: "artist1",
            type: ArtistType.Main,
          },
          {
            name: "artist2",
            type: ArtistType.Feature,
          },
        ];
        const correctTitle = "title";

        expect(extractor.getArtists()).toEqual(correctArtists);
        expect(extractor.getTitle()).toBe(correctTitle);
      });

      combiningFeatureSeperators.forEach((combiningSeperator) => {
        test(`artist1 - title ${opening}${seperator}artist2${combiningSeperator}artist3${closing}`, () => {
          const title = `artist1 - title ${opening}${seperator}artist2${combiningSeperator}artist3${closing}`;
          const extractor = createExtractor(title);

          const correctArtists: Artist[] = [
            {
              name: "artist1",
              type: ArtistType.Main,
            },
            {
              name: "artist2",
              type: ArtistType.Feature,
            },
            {
              name: "artist3",
              type: ArtistType.Feature,
            },
          ];
          const correctTitle = "title";

          expect(extractor.getArtists()).toEqual(correctArtists);
          expect(extractor.getTitle()).toBe(correctTitle);
        });
      });
    });

    if (opening === "") return;

    remixIndicators.forEach((remixIndicator) => {
      test(`artist1 - title ${opening}artist2${remixIndicator}${closing}`, () => {
        const title = `artist1 - title ${opening}artist2${remixIndicator}${closing}`;
        const extractor = createExtractor(title);

        const correctArtists: Artist[] = [
          {
            name: "artist1",
            type: ArtistType.Main,
          },
          {
            name: "artist2",
            type: ArtistType.Remixer,
            remixType: getRemixTypeFromString(remixIndicator),
          },
        ];
        const correctTitle = "title";

        expect(extractor.getArtists()).toEqual(correctArtists);
        expect(extractor.getTitle()).toBe(correctTitle);
      });

      combiningFeatureSeperators.forEach((combiningSeperator) => {
        test(`artist1 - title ${opening}artist2${combiningSeperator}artist3${remixIndicator}${closing}`, () => {
          const title = `artist1 - title ${opening}artist2${combiningSeperator}artist3${remixIndicator}${closing}`;
          const extractor = createExtractor(title);

          const correctArtists: Artist[] = [
            {
              name: "artist1",
              type: ArtistType.Main,
            },
            {
              name: "artist2",
              type: ArtistType.Remixer,
              remixType: getRemixTypeFromString(remixIndicator),
            },
            {
              name: "artist3",
              type: ArtistType.Remixer,
              remixType: getRemixTypeFromString(remixIndicator),
            },
          ];
          const correctTitle = "title";

          expect(extractor.getArtists()).toEqual(correctArtists);
          expect(extractor.getTitle()).toBe(correctTitle);
        });
      });
    });
  });
});

describe("Real world tests", () => {
  test("no username in title", () => {
    const title = "title";
    const extractor = createExtractor(title);

    const correctArtists: Artist[] = [
      {
        name: "username",
        type: ArtistType.Main,
      },
    ];
    const correctTitle = "title";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toBe(correctTitle);
  });

  test("remove twitter handle from username", () => {
    const extractor = createExtractor("title", "username (@username)");

    const correctArtists: Artist[] = [
      {
        name: "username",
        type: ArtistType.Main,
      },
    ];

    expect(extractor.getArtists()).toEqual(correctArtists);
  });

  test("remove twitter handle from username directly", () => {
    const extractor = createExtractor("title", "@username");

    const correctArtists: Artist[] = [
      {
        name: "username",
        type: ArtistType.Main,
      },
    ];

    expect(extractor.getArtists()).toEqual(correctArtists);
  });

  test("++ in name", () => {
    const extractor = createExtractor("wish 4u... +++miraie, milkoi", "yandere");

    const correctArtists: Artist[] = [
      {
        name: "yandere",
        type: ArtistType.Main,
      },
      {
        name: "miraie",
        type: ArtistType.Feature,
      },
      {
        name: "milkoi",
        type: ArtistType.Feature,
      },
    ];

    const correctTitle = "wish 4u...";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("remove brace without feature separator", () => {
    const extractor = createExtractor("title (other)");

    expect(extractor.getTitle()).toEqual("title");
  });

  test("remove bracket without feature separator", () => {
    const extractor = createExtractor("title [other]");

    expect(extractor.getTitle()).toEqual("title");
  });

  test("braces after features", () => {
    const extractor = createExtractor("title ft. artist (unrelated)");

    const correctArtists: Artist[] = [
      {
        name: "username",
        type: ArtistType.Main,
      },
      {
        name: "artist",
        type: ArtistType.Feature,
      },
    ];

    const correctTitle = "title";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("japanese quotation marks", () => {
    const extractor = createExtractor("glue ft. blxty「prod. kiryano」");

    const correctArtists: Artist[] = [
      {
        name: "username",
        type: ArtistType.Main,
      },
      {
        name: "blxty",
        type: ArtistType.Feature,
      },
      {
        name: "kiryano",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "glue";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });
});
