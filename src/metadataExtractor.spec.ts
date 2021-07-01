import { MetadataExtractor, Artist, ArtistType, getRemixTypeFromString, RemixType } from "./metadataExtractor";

const createExtractor = (title: string, username: string = "username") => new MetadataExtractor(title, username);

const braceCombos = [
  ["", ""],
  ["(", ")"],
  ["[", "]"],
];

const titleSeparators = MetadataExtractor.titleSeparators;
const featureSeparators = MetadataExtractor.featureSeparators;
const combiningFeatureSeparators = MetadataExtractor.combiningFeatureSeparators;
const producerIndicators = MetadataExtractor.producerIndicators;
const remixIndicators = MetadataExtractor.remixIndicators;

describe("Different separators", () => {
  test.each(titleSeparators)("artist1 %s title", (separator) => {
    const title = `artist1 ${separator} title`;
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

  test.each(featureSeparators)("artist1%sartist2 - title", (separator) => {
    const title = `artist1${separator}artist2 - title`;
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

  test.each(featureSeparators)("artist1 - title %sartist2", (separator) => {
    const title = `artist1 - title ${separator}artist2`;
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

      combiningFeatureSeparators.forEach((combiningSeparator) => {
        test(`artist1 - title ${opening}${producerIndicator}artist2${combiningSeparator}artist3${closing}`, () => {
          const title = `artist1 - title ${opening}${producerIndicator}artist2${combiningSeparator}artist3${closing}`;
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

    featureSeparators.forEach((separator) => {
      test(`artist1 - title ${opening}${separator}artist2${closing}`, () => {
        const title = `artist1 - title ${opening}${separator}artist2${closing}`;
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

      combiningFeatureSeparators.forEach((combiningSeparator) => {
        test(`artist1 - title ${opening}${separator}artist2${combiningSeparator}artist3${closing}`, () => {
          const title = `artist1 - title ${opening}${separator}artist2${combiningSeparator}artist3${closing}`;
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

      combiningFeatureSeparators.forEach((combiningSeparator) => {
        test(`artist1 - title ${opening}artist2${combiningSeparator}artist3${remixIndicator}${closing}`, () => {
          const title = `artist1 - title ${opening}artist2${combiningSeparator}artist3${remixIndicator}${closing}`;
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

describe("Edge cases", () => {
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

  test("braces with producer", () => {
    const extractor = createExtractor("title (artist)");

    const correctArtists: Artist[] = [
      {
        name: "username",
        type: ArtistType.Main,
      },
      {
        name: "artist",
        type: ArtistType.Producer,
      },
    ];

    expect(extractor.getArtists()).toEqual(correctArtists);

    expect(extractor.getTitle()).toEqual("title");
  });

  test("brackets with producer", () => {
    const extractor = createExtractor("title [artist]");

    const correctArtists: Artist[] = [
      {
        name: "username",
        type: ArtistType.Main,
      },
      {
        name: "artist",
        type: ArtistType.Producer,
      },
    ];

    expect(extractor.getArtists()).toEqual(correctArtists);

    expect(extractor.getTitle()).toEqual("title");
  });

  test("braces with producers", () => {
    const extractor = createExtractor("title (artist1 + artist2)");

    const correctArtists: Artist[] = [
      {
        name: "username",
        type: ArtistType.Main,
      },
      {
        name: "artist1",
        type: ArtistType.Producer,
      },
      {
        name: "artist2",
        type: ArtistType.Producer,
      },
    ];

    expect(extractor.getArtists()).toEqual(correctArtists);

    expect(extractor.getTitle()).toEqual("title");
  });

  test("brackets with producers", () => {
    const extractor = createExtractor("title [artist1 + artist2]");

    const correctArtists: Artist[] = [
      {
        name: "username",
        type: ArtistType.Main,
      },
      {
        name: "artist1",
        type: ArtistType.Producer,
      },
      {
        name: "artist2",
        type: ArtistType.Producer,
      },
    ];

    expect(extractor.getArtists()).toEqual(correctArtists);

    expect(extractor.getTitle()).toEqual("title");
  });

  test("braces with producer after features", () => {
    const extractor = createExtractor("title ft. artist1 (artist2)");

    const correctArtists: Artist[] = [
      {
        name: "username",
        type: ArtistType.Main,
      },
      {
        name: "artist1",
        type: ArtistType.Feature,
      },
      {
        name: "artist2",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "title";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("brackets with producer after features", () => {
    const extractor = createExtractor("title ft. artist1 [artist2]");

    const correctArtists: Artist[] = [
      {
        name: "username",
        type: ArtistType.Main,
      },
      {
        name: "artist1",
        type: ArtistType.Feature,
      },
      {
        name: "artist2",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "title";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("self produced", () => {
    const extractor = createExtractor("title (prod. artist)", "artist");

    const correctArtists: Artist[] = [
      {
        name: "artist",
        type: ArtistType.Main,
      },
    ];

    const correctTitle = "title";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });
});

describe("Real world examples", () => {
  test("1", () => {
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

  test("2", () => {
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

  test("3", () => {
    const extractor = createExtractor("show (emorave + mental)", "sparr00w (@sprr00w)");

    const correctArtists: Artist[] = [
      {
        name: "sparr00w",
        type: ArtistType.Main,
      },
      {
        name: "emorave",
        type: ArtistType.Producer,
      },
      {
        name: "mental",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "show";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("4", () => {
    const extractor = createExtractor("heart & soul (prod. lil biscuit + yeezo)", "hamilton");

    const correctArtists: Artist[] = [
      {
        name: "hamilton",
        type: ArtistType.Main,
      },
      {
        name: "lil biscuit",
        type: ArtistType.Producer,
      },
      {
        name: "yeezo",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "heart & soul";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("5", () => {
    const extractor = createExtractor("4:00 p. pilotkid", "@tamino404");

    const correctArtists: Artist[] = [
      {
        name: "tamino404",
        type: ArtistType.Main,
      },
      {
        name: "pilotkid",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "4:00";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("6", () => {
    const extractor = createExtractor("outta my head (longlost)", "longlost");

    const correctArtists: Artist[] = [
      {
        name: "longlost",
        type: ArtistType.Main,
      },
    ];

    const correctTitle = "outta my head";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("7", () => {
    const extractor = createExtractor("W1TCHCH4P3L (ft. Maestro) [Prod. Shinju]", "witchcraftshawty");

    const correctArtists: Artist[] = [
      {
        name: "witchcraftshawty",
        type: ArtistType.Main,
      },
      {
        name: "Maestro",
        type: ArtistType.Feature,
      },
      {
        name: "Shinju",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "W1TCHCH4P3L";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("8", () => {
    const extractor = createExtractor("travis scott - lonely ft. young thug & quavo [destxmido edit]", "destxmido");

    const correctArtists: Artist[] = [
      {
        name: "travis scott",
        type: ArtistType.Main,
      },
      {
        name: "young thug",
        type: ArtistType.Feature,
      },
      {
        name: "quavo",
        type: ArtistType.Feature,
      },
      {
        name: "destxmido",
        type: ArtistType.Remixer,
        remixType: RemixType.Edit,
      },
    ];

    const correctTitle = "lonely";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("9", () => {
    const extractor = createExtractor(
      "KNAAMEAN? ft. * BB * & DAISY DIVA [prod. CURTAINS x NIGHTCLUB20XX x POPSTARBILLS x DEATHNOTES]",
      "POPSTARBILLS 💫"
    );

    const correctArtists: Artist[] = [
      {
        name: "POPSTARBILLS",
        type: ArtistType.Main,
      },
      {
        name: "* BB *",
        type: ArtistType.Feature,
      },
      {
        name: "DAISY DIVA",
        type: ArtistType.Feature,
      },
      {
        name: "CURTAINS",
        type: ArtistType.Producer,
      },
      {
        name: "NIGHTCLUB20XX",
        type: ArtistType.Producer,
      },
      {
        name: "DEATHNOTES",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "KNAAMEAN?";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("10", () => {
    const extractor = createExtractor("we're gonna b ok [space]", "keyblayde808");

    const correctArtists: Artist[] = [
      {
        name: "keyblayde808",
        type: ArtistType.Main,
      },
      {
        name: "space",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "we're gonna b ok";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("11", () => {
    const extractor = createExtractor("avantgarde (wifi) video in desc", "5v");

    const correctArtists: Artist[] = [
      {
        name: "5v",
        type: ArtistType.Main,
      },
      {
        name: "wifi",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "avantgarde";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("12", () => {
    const extractor = createExtractor("my emo shorty (northeast lights x mart)", "ultravialit");

    const correctArtists: Artist[] = [
      {
        name: "ultravialit",
        type: ArtistType.Main,
      },
      {
        name: "northeast lights",
        type: ArtistType.Producer,
      },
      {
        name: "mart",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "my emo shorty";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("13", () => {
    const extractor = createExtractor("outer space(+yandere)", "crescent");

    const correctArtists: Artist[] = [
      {
        name: "crescent",
        type: ArtistType.Main,
      },
      {
        name: "yandere",
        type: ArtistType.Feature,
      },
    ];

    const correctTitle = "outer space";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("14", () => {
    const extractor = createExtractor("LY2 w Lil Narnia prod Shyburial", "Yung Scuff");

    const correctArtists: Artist[] = [
      {
        name: "Yung Scuff",
        type: ArtistType.Main,
      },
      {
        name: "Lil Narnia",
        type: ArtistType.Feature,
      },
      {
        name: "Shyburial",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "LY2";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("15", () => {
    const extractor = createExtractor("okay ft. palmtri (snowdrive)", "sparr00w (@sprr00w)");

    const correctArtists: Artist[] = [
      {
        name: "sparr00w",
        type: ArtistType.Main,
      },
      {
        name: "palmtri",
        type: ArtistType.Feature,
      },
      {
        name: "snowdrive",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "okay";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("16", () => {
    const extractor = createExtractor("they/them anthem (jeremyy, shrinemaiden)", "☆amy crush☆ (@aim_crush)");

    const correctArtists: Artist[] = [
      {
        name: "amy crush",
        type: ArtistType.Main,
      },
      {
        name: "jeremyy",
        type: ArtistType.Producer,
      },
      {
        name: "shrinemaiden",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "they/them anthem";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("17", () => {
    const extractor = createExtractor("Liltumblrxo ~ In Your Head [+Shinju]", "icy#9 Productions");

    const correctArtists: Artist[] = [
      {
        name: "Liltumblrxo",
        type: ArtistType.Main,
      },
      {
        name: "Shinju",
        type: ArtistType.Feature,
      },
    ];

    const correctTitle = "In Your Head";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("18", () => {
    const extractor = createExtractor("Хмари", "5 Vymir (П'ятий Вимір)");

    const correctArtists: Artist[] = [
      {
        name: "5 Vymir (П'ятий Вимір)",
        type: ArtistType.Main,
      },
    ];

    const correctTitle = "Хмари";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("19", () => {
    const extractor = createExtractor("Zeiten Ändern Dich");

    const correctTitle = "Zeiten Ändern Dich";

    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test.skip("20", () => {
    const extractor = createExtractor("VIPER w/ loveUnity & KID TRASH [+kidtrashpop]", "JoshuaSageArt");

    const correctArtists: Artist[] = [
      {
        name: "JoshuaSageArt",
        type: ArtistType.Main,
      },
      {
        name: "loveUnity",
        type: ArtistType.Feature,
      },
      {
        name: "KID TRASH",
        type: ArtistType.Feature,
      },
      {
        name: "kidtrashpop",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "VIPER";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("21", () => {
    const extractor = createExtractor("nothings fading (taylor morgan, saint tomorrow)", "kiryano");

    const correctArtists: Artist[] = [
      {
        name: "kiryano",
        type: ArtistType.Main,
      },
      {
        name: "taylor morgan",
        type: ArtistType.Producer,
      },
      {
        name: "saint tomorrow",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "nothings fading";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("22", () => {
    const extractor = createExtractor("worse (+internet joe +nefa)", "fiction57");

    const correctArtists: Artist[] = [
      {
        name: "fiction57",
        type: ArtistType.Main,
      },
      {
        name: "internet joe",
        type: ArtistType.Feature,
      },
      {
        name: "nefa",
        type: ArtistType.Feature,
      },
    ];

    const correctTitle = "worse";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("23", () => {
    const extractor = createExtractor("blessed feat. funeral (doxia & wifi)", "mental");

    const correctArtists: Artist[] = [
      {
        name: "mental",
        type: ArtistType.Main,
      },
      {
        name: "funeral",
        type: ArtistType.Feature,
      },
      {
        name: "doxia",
        type: ArtistType.Producer,
      },
      {
        name: "wifi",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "blessed";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("24", () => {
    const extractor = createExtractor("4MCLF (Ft. Flowr) [Prod. MCX]", "icarus444");

    const correctArtists: Artist[] = [
      {
        name: "icarus444",
        type: ArtistType.Main,
      },
      {
        name: "Flowr",
        type: ArtistType.Feature,
      },
      {
        name: "MCX",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "4MCLF";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("25", () => {
    const extractor = createExtractor("blackwinterwells + roxas - stuck! (flood+no bands)", "helix tears");

    const correctArtists: Artist[] = [
      {
        name: "blackwinterwells",
        type: ArtistType.Main,
      },
      {
        name: "roxas",
        type: ArtistType.Feature,
      },
      {
        name: "flood",
        type: ArtistType.Producer,
      },
      {
        name: "no bands",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "stuck!";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("26", () => {
    const extractor = createExtractor("walk walk walk walk w/ ovrwrld (prod. River)", "vaeo");

    const correctArtists: Artist[] = [
      {
        name: "vaeo",
        type: ArtistType.Main,
      },
      {
        name: "ovrwrld",
        type: ArtistType.Feature,
      },
      {
        name: "River",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "walk walk walk walk";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("27", () => {
    const extractor = createExtractor("DEAD FLOWERS (Ft. Witle$$ & HEA)(Prod. FXCKJAMiE)", "AOM (Afraid of Myself)");

    const correctArtists: Artist[] = [
      {
        name: "AOM (Afraid of Myself)",
        type: ArtistType.Main,
      },
      {
        name: "Witle$$",
        type: ArtistType.Feature,
      },
      {
        name: "HEA",
        type: ArtistType.Feature,
      },
      {
        name: "FXCKJAMiE",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "DEAD FLOWERS";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test.skip("28", () => {
    const extractor = createExtractor("tellmewhy (´｡• ω •｡`) prod wonderr+ninetyniiine", "emotionals");

    const correctArtists: Artist[] = [
      {
        name: "emotionals",
        type: ArtistType.Main,
      },
      {
        name: "wonderr",
        type: ArtistType.Producer,
      },
      {
        name: "ninetyniiine",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "tellmewhy";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("29", () => {
    const extractor = createExtractor("odece & 5v - spazzed ft. ninyy (5v + odece + shinju) vid in desc", "go luxury");

    const correctArtists: Artist[] = [
      {
        name: "odece",
        type: ArtistType.Main,
      },
      {
        name: "5v",
        type: ArtistType.Feature,
      },
      {
        name: "ninyy",
        type: ArtistType.Feature,
      },
      {
        name: "shinju",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "spazzed";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test("30", () => {
    const extractor = createExtractor("Graveyard Shift: Ludwig Abraham", "Schauspielhaus Zürich");

    const correctArtists: Artist[] = [
      {
        name: "Schauspielhaus Zürich",
        type: ArtistType.Main,
      },
    ];

    const correctTitle = "Graveyard Shift: Ludwig Abraham";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });

  test.skip("31", () => {
    const extractor = createExtractor("Too Many Years Ft. PNB Rock - Prod. By J Gramm", "Kodak Black");

    const correctArtists: Artist[] = [
      {
        name: "Kodak Black",
        type: ArtistType.Main,
      },
      {
        name: "PNB Rock",
        type: ArtistType.Feature,
      },
      {
        name: "J Gramm",
        type: ArtistType.Producer,
      },
    ];

    const correctTitle = "Too Many Years";

    expect(extractor.getArtists()).toEqual(correctArtists);
    expect(extractor.getTitle()).toEqual(correctTitle);
  });
});
