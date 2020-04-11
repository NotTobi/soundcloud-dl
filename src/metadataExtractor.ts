import escapeStringRegexp from "escape-string-regexp";

//     /* Filter Producer(s) from Title */
//     let producers: string[] = [];

//     const producerRegexes = [
//       /^.+(\s?\(Prod\.?\s?(by)?\s?(.+)\))$/i,
//       /^.+(\s?\[Prod\.?\s?(by)?\s?(.+)\])$/i,
//       /^.+(\s?Prod\.?\s?(by)?\s?(.+))$/i,
//     ];

//     producerRegexes.forEach(function (producerRegex) {
//       const result = producerRegex.exec(title);

//       if (result && result.length > 0) {
//         title = title.replace(result[1]metadataExtractor.test
//     });

//     /* Filter Features from Title */
//     if (/^.+(featuring|feat|ft|w\/| X ).+$/i.test(title)) {
//       const featureRegexes = [
//         /^.+(\s?\((featuring|feat|ft|w\/| X )\.?\s?(.+)\))$/i,
//         /^.+(\s?\[(featuring|feat|ft|w\/| X )\.?\s?(.+)\])$/i,
//         /^.+(\s?(featuring|feat|ft|w\/| X )\.?\s?(.+))$/i,
//       ];

//       featureRegexes.forEach(function (featureRegex) {
//         const result = featureRegex.exec(title);

//         if (result && result.length > 0) {
//           title = title.replace(result[1], "");

//           artists = artists.concat(filterArtists(result[3]));
//         }
//       });
//     }

//     /* Filter Remix Artists */
//     if (/^.+(Remix|Flip|Bootleg|Mashup|Edit).*$/i.test(title)) {
//       const remixRegexes = [
//         /^.+\s?\((.+)\s(Remix|Flip|Bootleg|Mashup|Edit)\)$/i,
//         /^.+\s?\[(.+)\s(Remix|Flip|Bootleg|Mashup|Edit)\]$/i,
//       ];

//       remixRegexes.forEach(function (remixRegex) {
//         const result = remixRegex.exec(title);

//         if (result && result.length > 0) {
//           artists = artists.concat(filterArtists(result[1]));
//         }
//       });
//     }
// }

export enum ArtistType {
  Main,
  Feature,
  Remixer,
  Producer,
}

export enum RemixType {
  Remix,
  Flip,
  Bootleg,
  Mashup,
  Edit,
}

export interface Artist {
  name: string;
  type: ArtistType;
  remixType?: RemixType;
}

interface TitleSplit {
  artistNames: string[];
  title: string;
}

interface RemixTitleSplit {
  artists: Artist[];
  title: string;
}

export class MetadataExtractor {
  private readonly titleSeperators = ["-", "–", "—", "~"];
  private readonly featureSeperators = [",", "&", "featuring", "feat.", "feat", "ft.", "ft", "w/", " x "];
  private readonly remixIndicators = ["remix", "flip", "bootleg", "mashup", "edit"];
  private readonly producerIndicators = ["prod", "prod.", "prod by", "prod. by"];
  private readonly promotions = ["free", "free download", "video in description"];

  constructor(private title: string, private username: string) {}

  getArtists(): Artist[] {
    let artists: Artist[] = [];

    const titleSplit = this.splitByTitleSeperators(this.title, true);

    artists = artists.concat(
      titleSplit.artistNames.map<Artist>((name, index) => ({
        name: this.sanitizeArtistName(name),
        type: index === 0 ? ArtistType.Main : ArtistType.Feature,
      }))
    );

    const featureSplit = this.splitByFeatures(titleSplit.title, true);

    artists = artists.concat(
      featureSplit.artistNames.map<Artist>((name) => ({
        name: this.sanitizeArtistName(name),
        type: ArtistType.Feature,
      }))
    );

    const producerSplit = this.splitByProducer(featureSplit.title, true);

    artists = artists.concat(
      producerSplit.artistNames.map<Artist>((name) => ({
        name: this.sanitizeArtistName(name),
        type: ArtistType.Producer,
      }))
    );

    const remixSplit = this.splitByRemix(producerSplit.title, true);

    artists = artists.concat(remixSplit.artists);

    const hasMainArtist = artists.some((i) => i.type === ArtistType.Main);

    if (!hasMainArtist) {
      const user = {
        name: this.sanitizeArtistName(this.username),
        type: ArtistType.Main,
      };

      if (artists.length > 0) {
        artists = [user, ...artists];
      } else {
        artists.push(user);
      }
    }

    // Distinct (not sure if this works with objects)
    artists = [...new Set(artists)];

    // sort by importance
    artists.sort((i) => i.type);

    return artists;
  }

  getTitle(): string {
    let title = this.title;

    title = this.splitByTitleSeperators(title, false).title;

    title = this.splitByFeatures(title, false).title;

    title = this.splitByProducer(title, false).title;

    title = this.splitByRemix(title, false).title;

    return this.sanitizeTitle(title);
  }

  private splitByTitleSeperators(title: string, extractArtists: boolean): TitleSplit {
    let artistNames: string[] = [];

    if (this.includes(title, this.titleSeperators)) {
      const seperators = this.escapeRegexArray(this.titleSeperators);
      const regex = new RegExp(`^((.+)\\s[${seperators}]\\s)(.+)$`);

      const result = regex.exec(title);

      if (result && result.length > 0) {
        const [_, artistSection, artistString] = result;

        if (extractArtists) {
          artistNames = this.getArtistNames(artistString);
        }

        title = title.replace(artistSection, "");
      }
    }

    return {
      artistNames,
      title,
    };
  }

  private splitByFeatures(title: string, extractArtists: boolean): TitleSplit {
    let artistNames: string[] = [];

    if (this.includes(title, this.featureSeperators)) {
      const seperators = this.escapeRegexArray(this.featureSeperators).join("|");
      const regex = new RegExp(`\\[?\\(?(${seperators})([^\\[\\]\\(\\)]+)\\[?\\]?\\(?\\)?`);

      const result = regex.exec(title);

      if (result && result.length > 0) {
        const [featureSection, _, artistsString] = result;

        if (extractArtists) {
          artistNames = this.getArtistNames(artistsString);
        }

        title = title.replace(featureSection, "");
      }
    }

    return {
      artistNames,
      title,
    };
  }

  private splitByProducer(title: string, extractArtists: boolean): TitleSplit {
    let artistNames: string[] = [];

    if (this.includes(title, this.producerIndicators)) {
    }

    return {
      artistNames,
      title,
    };
  }

  private splitByRemix(title: string, extractArtists: boolean): RemixTitleSplit {
    let artists: Artist[] = [];

    if (this.includes(title, this.remixIndicators)) {
    }

    return {
      artists,
      title,
    };
  }

  private getArtistNames(input: string): string[] {
    const seperators = this.escapeRegexArray(this.featureSeperators).join("|");
    const regex = new RegExp(`(.+)\\s?(${seperators})\\s?(.+)`, "i");

    const names = [];

    while (true) {
      const result = regex.exec(input);

      if (!result) {
        names.push(input);
        break;
      }

      names.push(result[3]);
      input = result[1];
    }

    return names.reverse();
  }

  private sanitizeArtistName(input: string) {
    return input.trim();
  }

  private sanitizeTitle(input: string) {
    return input.trim();
  }

  private includes(input: string, seperators: string[]) {
    return seperators.some((seperator) => input.includes(seperator));
  }

  private escapeRegexArray(input: string[]) {
    return input.map((i) => escapeStringRegexp(i));
  }
}
