import escapeStringRegexp from "escape-string-regexp";

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
  static readonly titleSeperators = ["-", "–", "—", "~"];
  static readonly featureSeperators = ["featuring", "feat.", "feat", "ft.", "ft", "w/"];
  static readonly combiningFeatureSeperators = [...MetadataExtractor.featureSeperators, ",", "&", " x "];
  static readonly remixIndicators = ["remix", "flip", "bootleg", "mashup", "edit"];
  static readonly producerIndicators = ["prod. by", "prod by", "prod.", "prod"];
  static readonly promotions = ["free", "free download", "video in description"];

  constructor(private title: string, private username: string) {}

  getArtists(): Artist[] {
    let artists: Artist[] = [];

    const titleSplit = this.splitByTitleSeperators(this.title, true);

    // artists before the title seperator, e.g. >artist< - title
    artists = artists.concat(
      titleSplit.artistNames.map<Artist>((name, index) => ({
        name: this.sanitizeArtistName(name),
        type: index === 0 ? ArtistType.Main : ArtistType.Feature,
      }))
    );

    // producers after the title seperator, e.g. artist - title (prod. >artist<)
    // we expect the producer section to be last, if not everthing fails :(
    const producerSplit = this.splitByProducer(titleSplit.title, true);

    artists = artists.concat(
      producerSplit.artistNames.map<Artist>((name) => ({
        name: this.sanitizeArtistName(name),
        type: ArtistType.Producer,
      }))
    );

    // remixers after the title seperator, e.g. artist - title (>artist< Remix)
    const remixSplit = this.splitByRemix(producerSplit.title, true);

    artists = artists.concat(remixSplit.artists);

    // features after the title seperator, e.g. artist - title (ft. >artist<)
    const featureSplit = this.splitByFeatures(remixSplit.title, true);

    artists = artists.concat(
      featureSplit.artistNames.map<Artist>((name) => ({
        name: this.sanitizeArtistName(name),
        type: ArtistType.Feature,
      }))
    );

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

    if (this.includes(title, MetadataExtractor.titleSeperators)) {
      const seperators = this.escapeRegexArray(MetadataExtractor.titleSeperators);
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

    if (this.includes(title, MetadataExtractor.featureSeperators)) {
      const seperators = this.escapeRegexArray(MetadataExtractor.featureSeperators).join("|");
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

    if (this.includes(title, MetadataExtractor.producerIndicators)) {
      const seperators = this.escapeRegexArray(MetadataExtractor.producerIndicators).join("|");
      const regex = new RegExp(`\\[?\\(?(${seperators})([^\\[\\]\\(\\)]+)\\[?\\]?\\(?\\)?`);

      const result = regex.exec(title);

      if (result && result.length > 0) {
        const [producerSection, _, artistsString] = result;

        if (extractArtists) {
          artistNames = this.getArtistNames(artistsString);
        }

        title = title.replace(producerSection, "");
      }
    }

    return {
      artistNames,
      title,
    };
  }

  private splitByRemix(title: string, extractArtists: boolean): RemixTitleSplit {
    let artists: Artist[] = [];

    if (this.includes(title, MetadataExtractor.remixIndicators)) {
    }

    return {
      artists,
      title,
    };
  }

  private getArtistNames(input: string): string[] {
    const seperators = this.escapeRegexArray(MetadataExtractor.combiningFeatureSeperators).join("|");
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
