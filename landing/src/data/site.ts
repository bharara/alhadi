import type { ImageMetadata } from 'astro';

import villaTwin from '../assets/villa-twin.jpg';
import villaGarden from '../assets/villa-garden.jpg';
import villaWide from '../assets/villa-wide.jpg';
import villaDusk from '../assets/villa-dusk.jpg';
import luxContinental from '../assets/lux-continental.jpg';
import mansion from '../assets/mansion.jpg';
import interiorBed from '../assets/interior-bed.jpg';

/** Images used directly by section components (project and group images live on their records). */
export const images = { villaTwin, mansion };

export const contact = {
  phoneDisplay: '0311-073-1111',
  phoneTel: '+923110731111',
  whatsapp: '923110731111',
  city: 'Faisalabad, Pakistan',
  facebook: 'https://www.facebook.com/Bestbuildersdevelopers/',
  instagram: 'https://www.instagram.com/best_builders_developers/',
  group: 'https://www.bestbuilders.pk/',
} as const;

export interface Stat {
  value: string;
  label: string;
}

/** Placeholder figures — confirm with the sales team before launch. */
export const stats: Stat[] = [
  { value: '5+', label: 'Signature projects across Faisalabad' },
  { value: '3', label: 'Group companies, one standard' },
  { value: '7K', label: 'Up to 7 Kanal residential plots' },
];

export type ProjectStatus = 'selling' | 'launching' | 'soon';

export interface Spec {
  label: string;
  value: string;
}

export interface Project {
  slug: string;
  name: string;
  /** Second line of the title, rendered in gold. */
  accent: string;
  status: ProjectStatus;
  summary: string;
  image: ImageMetadata;
  imageAlt: string;
  specs: Spec[];
  primaryCta: string;
  showBrochure: boolean;
}

export const statusLabel: Record<ProjectStatus, string> = {
  selling: 'Now Selling',
  launching: 'Launching Soon',
  soon: 'Coming Soon',
};

export const projects: Project[] = [
  {
    slug: 'sitara-villas',
    name: 'Sitara Villas',
    accent: 'Best Block',
    status: 'selling',
    summary: 'A gated block of large plots on Canal Expressway, with wide boulevards, green belts and parks.',
    image: villaGarden,
    imageAlt: 'Contemporary villa with a landscaped lawn at Sitara Villas',
    specs: [
      { label: 'Location', value: 'Canal Expressway' },
      { label: 'Plot sizes', value: '1 · 2 · 4 Kanal' },
      { label: 'Type', value: 'Residential' },
      { label: 'Plan', value: 'Instalments available' },
    ],
    primaryCta: 'View Master Plan',
    showBrochure: true,
  },
  {
    slug: 'abdullah-gardens',
    name: 'Abdullah',
    accent: 'Gardens',
    status: 'selling',
    summary: 'A green, family-first neighbourhood on Main Canal Road, with plots for first homes and for large villas.',
    image: villaWide,
    imageAlt: 'Modern two-storey home with wood and stone facade at Abdullah Gardens',
    specs: [
      { label: 'Location', value: 'Main Canal Road' },
      { label: 'Plot sizes', value: '5 Marla – 7 Kanal' },
      { label: 'Type', value: 'Residential + Commercial' },
      { label: 'Plan', value: 'Instalments available' },
    ],
    primaryCta: 'View Master Plan',
    showBrochure: true,
  },
  {
    slug: 'city-walk',
    name: 'City',
    accent: 'Walk',
    status: 'launching',
    summary: 'A commercial address on Canal Road built for visibility, with shops and offices around a central plaza.',
    image: luxContinental,
    imageAlt: 'Classical stone commercial building facade at City Walk',
    specs: [
      { label: 'Location', value: 'Canal Road' },
      { label: 'Units', value: 'Shops · Offices' },
      { label: 'Type', value: 'Commercial' },
      { label: 'Status', value: 'Pre-registration open' },
    ],
    primaryCta: 'Register Interest',
    showBrochure: false,
  },
];

/** Projects offered in the lead form, including ones not yet featured. */
export const enquiryOptions: string[] = [
  'Sitara Villas',
  'Abdullah Gardens',
  'City Walk',
  'The Green Haven',
  'Aurum Residence',
  'Not sure yet',
];

export interface GroupCompany {
  name: string;
  kicker: string;
  blurb: string;
  image: ImageMetadata;
  current: boolean;
}

export const group: GroupCompany[] = [
  { name: 'Developers', kicker: 'You are here', blurb: 'Real estate sales & development', image: villaDusk, current: true },
  { name: 'Interiors', kicker: 'Build', blurb: 'Home construction & interior design', image: villaWide, current: false },
  { name: 'Homes', kicker: 'Furnish', blurb: 'Furniture, drapery & décor', image: interiorBed, current: false },
];

export const footerProjects: string[] = ['Sitara Villas', 'Abdullah Gardens', 'City Walk', 'The Green Haven', 'Aurum Residence'];
