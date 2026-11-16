import { listingsApi, projects } from './site';

export interface ListingPhoto {
  full: string;
  thumb: string;
  width: number;
  height: number;
  alt: string | null;
}

// Mirrors publishedListings() in dashboard/worker/website/public.ts.
export interface Listing {
  id: string;
  slug: string;
  url: string;
  project_slug: string | null;
  project_name: string | null;
  title: string;
  summary: string | null;
  description: string | null;
  type: string;
  type_label: string;
  size: string;
  block: string | null;
  number: string | null;
  price: string | null;
  features: string[];
  status: 'available' | 'sold';
  featured: boolean;
  published_at: string | null;
  updated_at: string;
  photos: ListingPhoto[];
}

export interface ListingSettings {
  home: { enabled: boolean; heading: string; intro: string; limit: number };
  project: { enabled: boolean; heading: string };
}

interface Feed {
  settings: ListingSettings;
  listings: Listing[];
}

const OFFLINE: Feed = {
  settings: { home: { enabled: false, heading: '', intro: '', limit: 0 }, project: { enabled: false, heading: '' } },
  listings: [],
};

async function load(): Promise<Feed> {
  const url = `${listingsApi}/api/public/listings/full`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return (await response.json()) as Feed;
  } catch (error) {
    // A Cloudflare build must never publish a site that silently lost its listings.
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    if (env.CF_PAGES || env.CI) throw error;
    console.warn(`[listings] ${(error as Error).message}; building without listings.`);
    return OFFLINE;
  }
}

const feed = await load();

// The project list lives in both apps; a slug only the dashboard knows would link to a missing page.
const knownProjects = new Set(projects.map((p) => p.slug));
const unknown = feed.listings.filter((l) => l.project_slug && !knownProjects.has(l.project_slug));
if (unknown.length) throw new Error(`[listings] unknown project_slug: ${unknown.map((l) => `${l.slug} → ${l.project_slug}`).join(', ')}`);

export const { settings, listings } = feed;

export const listingPath = (l: Pick<Listing, 'slug'>) => `/properties/${l.slug}/`;

export const listingFacts = (l: Listing) => [l.size, l.block ? `Block ${l.block}` : null, l.number ? `No. ${l.number}` : null].filter(Boolean).join(' · ');

export const photoSrcset = (p: ListingPhoto) => `${p.thumb} 600w, ${p.full} 1600w`;

/** WhatsApp message asking about, or to visit, a listing; names where it is and links its page. */
export function listingMessage(l: Listing, intent: 'ask' | 'visit', pageUrl: string): string {
  const where = [l.project_name, l.block ? `Block ${l.block}` : null, l.number ? `No. ${l.number}` : null].filter(Boolean).join(', ');
  const subject = `the ${l.title}${where ? ` (${where})` : ''}`;
  return intent === 'ask' ? `Assalam o Alaikum, I'm interested in ${subject}. Is it still available? ${pageUrl}` : `Assalam o Alaikum, I'd like to visit ${subject}. ${pageUrl}`;
}
