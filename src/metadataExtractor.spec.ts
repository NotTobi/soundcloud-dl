import { MetadataExtractor, Artist, ArtistType } from "./metadataExtractor";

const createExtractor = (title: string, username: string) => new MetadataExtractor(title, username);

test("no artist in title", () => {
  const username = "username";
  const title = "title";

  const extractor = createExtractor(title, username);

  const correctArtists: Artist[] = [
    {
      name: "username",
      type: ArtistType.Main,
    },
  ];

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("artist in title", () => {
  const username = "username";
  const title = "artist - title";

  const extractor = createExtractor(title, username);

  const correctArtists: Artist[] = [
    {
      name: "artist",
      type: ArtistType.Main,
    },
  ];

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("2 artists in title with comma", () => {
  const username = "username";
  const title = "artist1, artist2 - title";

  const extractor = createExtractor(title, username);

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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("2 artists in title with featuring", () => {
  const username = "username";
  const title = "artist1 featuring artist2 - title";

  const extractor = createExtractor(title, username);

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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("2 artists in title with feat", () => {
  const username = "username";
  const title = "artist1 feat artist2 - title";

  const extractor = createExtractor(title, username);

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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("2 artists in title with feat.", () => {
  const username = "username";
  const title = "artist1 feat. artist2 - title";

  const extractor = createExtractor(title, username);

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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("2 artists in title with ft", () => {
  const username = "username";
  const title = "artist1 ft artist2 - title";

  const extractor = createExtractor(title, username);

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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("2 artists in title with ft.", () => {
  const username = "username";
  const title = "artist1 ft. artist2 - title";

  const extractor = createExtractor(title, username);

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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("2 artists in title with x", () => {
  const username = "username";
  const title = "artist1 x artist2 - title";

  const extractor = createExtractor(title, username);

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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("2 artists in title with w/", () => {
  const username = "username";
  const title = "artist1 w/ artist2 - title";

  const extractor = createExtractor(title, username);

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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("2 artists in title with &", () => {
  const username = "username";
  const title = "artist1 & artist2 - title";

  const extractor = createExtractor(title, username);

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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("multiple artists in title with feat feat. ft ft.featuring", () => {
  const username = "username";
  const title = "artist1 feat artist2 feat. artist3 ft artist4 ft. artist5 featuring artist6 - title";

  const extractor = createExtractor(title, username);

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
    {
      name: "artist4",
      type: ArtistType.Feature,
    },
    {
      name: "artist5",
      type: ArtistType.Feature,
    },
    {
      name: "artist6",
      type: ArtistType.Feature,
    },
  ];

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("multiple artists in title with , & ft. w/", () => {
  const username = "username";
  const title = "artist1, artist2 & artist3 ft. artist4 w/ artist5 - title";

  const extractor = createExtractor(title, username);

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
    {
      name: "artist4",
      type: ArtistType.Feature,
    },
    {
      name: "artist5",
      type: ArtistType.Feature,
    },
  ];

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("remove artist from title", () => {
  const username = "username";
  const title = "artist - title";

  const extractor = createExtractor(title, username);

  const correctTitle = "title";

  expect(extractor.getTitle()).toEqual(correctTitle);
});

test("remove multiple artists from title", () => {
  const username = "username";
  const title = "artist1, artist2 & artist3 - title";

  const extractor = createExtractor(title, username);

  const correctTitle = "title";

  expect(extractor.getTitle()).toEqual(correctTitle);
});

test("feature in title without main artist", () => {
  const username = "username";
  const title = "title ft. artist2";

  const extractor = createExtractor(title, username);

  const correctArtists: Artist[] = [
    {
      name: "username",
      type: ArtistType.Main,
    },
    {
      name: "artist2",
      type: ArtistType.Feature,
    },
  ];

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("feature in title without main artist", () => {
  const username = "username";
  const title = "title (w/ artist2)";

  const extractor = createExtractor(title, username);

  const correctArtists: Artist[] = [
    {
      name: "username",
      type: ArtistType.Main,
    },
    {
      name: "artist2",
      type: ArtistType.Feature,
    },
  ];

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("feature in title without main artist", () => {
  const username = "username";
  const title = "title [featuring artist2]";

  const extractor = createExtractor(title, username);

  const correctArtists: Artist[] = [
    {
      name: "username",
      type: ArtistType.Main,
    },
    {
      name: "artist2",
      type: ArtistType.Feature,
    },
  ];

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("feature in title", () => {
  const username = "username";
  const title = "artist1 - title [featuring artist2]";

  const extractor = createExtractor(title, username);

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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("feature in title with multiple main artists", () => {
  const username = "username";
  const title = "artist1, artist2 - title [featuring artist3]";

  const extractor = createExtractor(title, username);

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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("multiple features in title without main artist", () => {
  const username = "username";
  const title = "title ft. artist2 & artist3";

  const extractor = createExtractor(title, username);

  const correctArtists: Artist[] = [
    {
      name: "username",
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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("multiple features in title without main artist", () => {
  const username = "username";
  const title = "title (w/ artist2, artist3)";

  const extractor = createExtractor(title, username);

  const correctArtists: Artist[] = [
    {
      name: "username",
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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("multiple features in title without main artist", () => {
  const username = "username";
  const title = "title [featuring artist2 w/ artist3]";

  const extractor = createExtractor(title, username);

  const correctArtists: Artist[] = [
    {
      name: "username",
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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("feature in title", () => {
  const username = "username";
  const title = "artist1 - title [featuring artist2 & artist3]";

  const extractor = createExtractor(title, username);

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

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("feature in title with multiple main artists", () => {
  const username = "username";
  const title = "artist1, artist2 - title [featuring artist3 w/ artist4]";

  const extractor = createExtractor(title, username);

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
    {
      name: "artist4",
      type: ArtistType.Feature,
    },
  ];

  expect(extractor.getArtists()).toEqual(correctArtists);
});

test("remove feature from title", () => {
  const username = "username";
  const title = "title ft. artist2";

  const extractor = createExtractor(title, username);

  const correctTitle = "title";

  expect(extractor.getTitle()).toEqual(correctTitle);
});

test("remove feature from title with [", () => {
  const username = "username";
  const title = "title [featuring artist2]";

  const extractor = createExtractor(title, username);

  const correctTitle = "title";

  expect(extractor.getTitle()).toEqual(correctTitle);
});

test("remove feature from title with (", () => {
  const username = "username";
  const title = "artist1 - title (w/ artist2)";

  const extractor = createExtractor(title, username);

  const correctTitle = "title";

  expect(extractor.getTitle()).toEqual(correctTitle);
});

test("remove multiple features from title", () => {
  const username = "username";
  const title = "artist1 - title w/ artist2 & artist3";

  const extractor = createExtractor(title, username);

  const correctTitle = "title";

  expect(extractor.getTitle()).toEqual(correctTitle);
});

test("remove multiple features from title with [", () => {
  const username = "username";
  const title = "artist1 - title [w/ artist2 & artist3]";

  const extractor = createExtractor(title, username);

  const correctTitle = "title";

  expect(extractor.getTitle()).toEqual(correctTitle);
});

test("remove multiple features from title with (", () => {
  const username = "username";
  const title = "artist1 - title (w/ artist2 & artist3)";

  const extractor = createExtractor(title, username);

  const correctTitle = "title";

  expect(extractor.getTitle()).toEqual(correctTitle);
});

// test("remix with artist in title", () => {
//   const username = "username";
//   const title = "artist1 - title (artist2 remix)";

//   const extractor = createExtractor(title, username);

//   const correctArtists: Artist[] = [
//     {
//       name: "artist1",
//       type: ArtistType.Main,
//     },
//     {
//       name: "artist2",
//       type: ArtistType.Remixer,
//     },
//   ];

//   expect(extractor.getArtists()).toEqual(correctArtists);

//   const correctTitle = "title (artist Remix)";

//   expect(extractor.getTitle()).toEqual(correctTitle);
// });

// test("remix with no artist in title", () => {
//   const username = "username";
//   const title = "title (artist remix)";

//   const extractor = createExtractor(title, username);

//   const correctArtists: Artist[] = [
//     {
//       name: "username",
//       type: ArtistType.Main,
//     },
//     {
//       name: "artist1",
//       type: ArtistType.Remixer,
//     },
//   ];

//   expect(extractor.getArtists()).toEqual(correctArtists);

//   const correctTitle = "title (artist Remix)";

//   expect(extractor.getTitle()).toEqual(correctTitle);
// });
