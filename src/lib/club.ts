/**
 * CLUB PRESENTATION CONFIG — WHITE-LABEL LAYER
 *
 * Everything cinematic that is *about the club* (not derived from
 * stat events) lives here: identity, imagery, next fixture, honours.
 * Club #2 = edit this file + the CSS variables in globals.css.
 *
 * Photos are free-license Unsplash placeholders, hot-loaded from the
 * Unsplash CDN. Swap any `src` for `/img/...` files in /public to use
 * real club photography — the .mn-photo grade makes any shot on-brand.
 */

export interface ClubPhoto {
  src: string;
  alt: string;
}

export interface NextFixture {
  opponent: string;
  /** ISO datetime with time — drives the LED countdown. */
  dateISO: string;
  venue: string;
  competition: string;
}

export interface Honour {
  title: string;
  season: string;
}

const u = (id: string, w = 1800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&q=70&w=${w}`;

export const CLUB = {
  name: "Goa Guardians",
  nameShort: "Guardians",
  city: "Panaji, Goa",
  league: "Prime Volleyball League",
  founded: 2021,
  arena: "Campal Indoor Stadium",

  /** Set to null to hide the Matchday section. */
  nextFixture: {
    opponent: "Chennai Blitz",
    dateISO: "2026-07-25T19:00:00+05:30",
    venue: "Campal Indoor Stadium, Panaji",
    competition: "Prime Volleyball League · Round 9",
  } as NextFixture | null,

  photos: {
    /** Hero — indoor court, net battle, real match energy. */
    hero: {
      src: u("photo-1547347298-4074fc3086f0", 2200),
      alt: "Players contest the ball at the net under indoor lights",
    },
    /** Star player — moody jersey portrait for the spotlight section. */
    spotlight: {
      src: u("photo-1553005746-9245ba190489", 1400),
      alt: "Player in a black number 13 volleyball jersey",
    },
    /** Attack — airborne spike for the matchday panel. */
    attack: {
      src: u("photo-1567880325673-ccc01edca61c", 1400),
      alt: "Player mid-air attacking the ball",
    },
    /** Squad — team playing together. */
    squad: {
      src: u("photo-1673058577973-68b6b6d53ccd", 1600),
      alt: "The team playing a rally together",
    },
    /** Community — silhouettes at sunset for the closing tunnel. */
    community: {
      src: u("photo-1612872087720-bb876e2e67d1", 2000),
      alt: "Silhouettes of players jumping at the net at sunset",
    },
  } satisfies Record<string, ClubPhoto>,

  /** Rafter banners — the honours hanging from the arena roof. */
  honours: [
    { title: "League Runners-up", season: "2024–25" },
    { title: "State Champions", season: "2023–24" },
    { title: "Coastal Cup Winners", season: "2022–23" },
  ] satisfies Honour[],
};
