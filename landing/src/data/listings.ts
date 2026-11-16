import { listingsApi } from './site';

/** Shapes of GET /api/public/listings/full on the dashboard Worker (dashboard/worker/website/public.ts). */
export interface ListingPhoto {
  full: string;
  thumb: string;
  width: number;
  height: number;
  alt: string | null;
}

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

interface Feed {
  listings: Listing[];
}

async function load(): Promise<Listing[]> {
  const url = `${listingsApi}/api/public/listings/full`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return ((await response.json()) as Feed).listings;
  } catch (error) {
    // A production build must never publish a site that silently lost its listings.
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    if (env.CF_PAGES || env.CI) throw error;
    console.warn(`[listings] ${(error as Error).message}; building without property pages.`);
    return [];
  }
}

/** Published listings, loaded once per build. */
export const listings: Listing[] = await load();

export const listingPath = (l: Pick<Listing, 'slug'>) => `/properties/${l.slug}/`;

/** "1 Kanal · Block C · No. 112" */
export const listingFacts = (l: Listing) => [l.size, l.block ? `Block ${l.block}` : null, l.number ? `No. ${l.number}` : null].filter(Boolean).join(' · ');

export const photoSrcset = (p: ListingPhoto) => `${p.thumb} 600w, ${p.full} 1600w`;
