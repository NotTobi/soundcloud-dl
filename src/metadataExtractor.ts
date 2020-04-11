import escapeStringRegexp from "escape-string-regexp";

//   function filterArtists(matchedArtists: string) {
//     const artistRegex = /^(.+) (featuring|feat|ft|&|w\/|with|,|X)\.? (.+)$/i;
//     const filteredArtists = [];

//     while (true) {
//       const artistResult = artistRegex.exec(matchedArtists);

//       if (artistResult && artistResult.length > 0) {
//         filteredArtists.push(artistResult[1]);
//         matchedArtists = artistResult[3];
//       } else {
//         filteredArtists.push(matchedArtists);
//         break;
//       }
//     }

//     return filteredArtists;
//   }

//   function getMetadata(title: string, username: string) {
//     let artists: string[] = [];

//     /* Remove 'Free Download' Text from Title */
//     title = title.replace(/\s?\[?\(?(Free Download|Video in Description)\)?\]?.*$/i, "");

//     /* Filter Leading Artists from Title */
//     const titleRegex = /^(.+) - (.+)$/i;

//     const titleResult = titleRegex.exec(title);

//     if (titleResult && titleResult.length > 0) {
//       title = titleResult[2];

//       artists = filterArtists(titleResult[1]);
//     } else {
//       artists.push(username);
//     }

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

//     /* Trim Title */
//     title = title.trim();

//     // add Producers to Artists
//     artists = artists.concat(producers);

//     /* Trim Artists */
//     artists = artists.map((artist) => artist.trim());

//     /* Distinct Artists */
//     artists = [...new Set(artists)];

//     return {
//       title,
//       artists,
//     };
//   }

export enum ArtistType {
  Main,
  Feature,
  Remixer,
  Producer,
}

export interface Artist {
  name: string;
  type: ArtistType;
}

interface TitleSplit {
  artistNames: string[];
  title: string;
}

export class MetadataExtractor {
  private readonly titleSeperators = ["-", "–", "—", "~"];
  private readonly featureSeperators = [",", "&", "featuring", "feat.", "feat", "ft.", "ft", "w/", " x "];
  private readonly remixSeperators = ["remix", "flip", "bootleg", "mashup", "edit"];
  private readonly promotions = ["free download", "video in description"];

  constructor(private title: string, private username: string) {}

  getArtists(): Artist[] {
    let artists: Artist[] = [];

    const titleSplit = this.splitByTitleSeperators(this.title, true);

    artists = artists.concat(
      titleSplit.artistNames.map<Artist>((name) => ({
        name: this.sanitizeArtistName(name),
        type: ArtistType.Feature,
      }))
    );

    let title = titleSplit.title;

    // todo check for remixes or producers

    if (artists.length < 1) {
      artists.push({
        name: this.sanitizeArtistName(this.username),
        type: ArtistType.Main,
      });
    } else {
      artists[0].type = ArtistType.Main;
    }

    return artists;
  }

  getTitle(): string {
    let title = this.title;

    const titleSplit = this.splitByTitleSeperators(title, false);

    title = titleSplit.title;

    return this.sanitizeTitle(title);
  }

  private splitByTitleSeperators(title: string, extractArtists: boolean): TitleSplit {
    let artistNames: string[] = [];

    if (this.includesSeperators(title, this.titleSeperators)) {
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

  private getArtistNames(input: string): string[] {
    const seperators = this.escapeRegexArray(this.featureSeperators).join("|");
    const regex = new RegExp(`(.+)\\s?(${seperators})\\s?(.+)`);

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

  private includesSeperators(input: string, seperators: string[]) {
    return seperators.some((seperator) => input.includes(seperator));
  }

  private escapeRegexArray(input: string[]) {
    return input.map((i) => escapeStringRegexp(i));
  }
}
