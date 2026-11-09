import type { ImageMetadata } from 'astro';

import villaTwin from '../assets/villa-twin.jpg';
import villaWide from '../assets/villa-wide.jpg';
import villaDusk from '../assets/villa-dusk.jpg';
import luxContinental from '../assets/lux-continental.jpg';
import mansion from '../assets/mansion.jpg';
import interiorBed from '../assets/interior-bed.jpg';
import sitaraGate from '../assets/sitara-gate.jpg';
import planSitara from '../assets/plan-sitara-villas.jpg';
import planAbdullah from '../assets/plan-abdullah-gardens.jpg';
import planCityWalk from '../assets/plan-city-walk.jpg';

/** Images used directly by section components (project and group images live on their records). */
export const images = { villaTwin, mansion };

export const brand = 'Best Builders & Developers';

export const contact = {
  phoneDisplay: '0311-073-1111',
  phoneTel: '+923110731111',
  whatsapp: '923110731111',
  city: 'Faisalabad, Pakistan',
  facebook: 'https://www.facebook.com/Bestbuildersdevelopers/',
  instagram: 'https://www.instagram.com/best_builders_developers/',
  group: 'https://www.bestbuilders.pk/',
} as const;

export const waLink = (text: string) => `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(text)}`;

export interface Stat {
  value: string;
  label: string;
}

export const stats: Stat[] = [
  { value: '3', label: 'Live projects on the Canal corridor' },
  { value: '7K', label: 'Plots from 5 Marla up to 7 Kanal' },
  { value: '3', label: 'Group companies, one standard' },
];

export type ProjectStatus = 'selling' | 'booking';

export interface Spec {
  label: string;
  value: string;
}

export interface PlotCategory {
  size: string;
  type: string;
  note: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface Project {
  slug: string;
  name: string;
  /** Full official name, used in titles and schema. */
  fullName: string;
  /** Title split for the big display headings: line one, then the gold line. */
  title: [string, string];
  status: ProjectStatus;
  /** Residential or commercial, used for copy and schema. */
  kind: 'Residential' | 'Residential & Commercial' | 'Commercial';
  summary: string;
  image: ImageMetadata;
  imageAlt: string;
  specs: Spec[];
  primaryCta: string;

  // Landing page content
  seoTitle: string;
  seoDescription: string;
  tagline: string;
  overview: string[];
  address: { street: string; area: string };
  mapQuery: string;
  sitePhones: string[];
  plots: PlotCategory[];
  amenities: { title: string; text: string }[];
  plan: {
    image: ImageMetadata;
    alt: string;
    full: string;
    pdf?: string;
    legend: { label: string; color: string }[];
  };
  locationNotes: string[];
  faqs: Faq[];
}

export const statusLabel: Record<ProjectStatus, string> = {
  selling: 'Now Selling',
  booking: 'Now Booking',
};

export const projects: Project[] = [
  {
    slug: 'sitara-villas',
    name: 'Sitara Villas',
    fullName: 'Sitara Villas Best Block',
    title: ['Sitara Villas', 'Best Block'],
    status: 'selling',
    kind: 'Residential',
    summary:
      'A gated block of 1, 2 and 4 Kanal plots on Canal Expressway, with 50 ft roads, green belts and parks. Developed with Sitara Group.',
    image: sitaraGate,
    imageAlt: 'The stone pillar entrance gate of Sitara Villas on Canal Expressway, Faisalabad',
    specs: [
      { label: 'Location', value: 'Canal Expressway' },
      { label: 'Plot sizes', value: '1 · 2 · 4+ Kanal' },
      { label: 'Type', value: 'Residential + Commercial' },
      { label: 'Developer', value: 'Best Builders × Sitara Group' },
    ],
    primaryCta: 'Get Prices',

    seoTitle: 'Sitara Villas Best Block Faisalabad | 1, 2 & 4 Kanal Plots on Canal Expressway',
    seoDescription:
      'Buy 1 Kanal, 2 Kanal and 4 Kanal plots in Sitara Villas Best Block, Canal Expressway Faisalabad. See the master plan, the location map, plot sizes and FAQs. Call 0311-073-1111.',
    tagline: 'Large residential plots behind one of Faisalabad’s best-known gates, on Canal Expressway.',
    overview: [
      'Sitara Villas Best Block is a joint project of Best Builders & Developers and Sitara Group, on Canal Expressway in Faisalabad. It is planned for buyers who want a large plot: the block is laid out almost entirely in 1 Kanal, 2 Kanal and 4 Kanal-plus plots. That keeps density low and the streets quiet.',
      'The block is entered through the Sitara Villas stone-pillar gate. Inside, a 70 ft main road links the residential lanes, which are 50 ft wide. Parks and green belts are spread through the plan rather than kept in one corner, so most plots are a short walk from open space.',
      'Best Builders keeps a site office inside the block. Our advisors can show you available plots on the ground, explain the file and transfer process, and connect you with Best Builders Interiors when you are ready to build.',
    ],
    address: { street: 'Sitara Villas, Canal Expressway', area: 'Faisalabad' },
    mapQuery: 'Sitara Villas, Canal Expressway, Faisalabad',
    sitePhones: ['0311-073-1111', '0322-798-4444'],
    plots: [
      { size: '1 Kanal', type: 'Residential', note: 'The most common plot in the block, on 50 ft roads' },
      { size: '2 Kanal', type: 'Residential', note: 'Wide frontages for large family homes' },
      { size: '4 Kanal & above', type: 'Residential', note: 'Estate-size plots for villas with grounds' },
      { size: 'Commercial', type: 'Commercial', note: 'Selected plots for everyday shops and services' },
    ],
    amenities: [
      { title: 'Signature gated entrance', text: 'The stone-pillar Sitara Villas gate on Canal Expressway.' },
      { title: '70 ft main road', text: 'A wide main road through the block, with 50 ft residential streets.' },
      { title: 'Parks & green belts', text: 'Several parks set into the plan, close to most plots.' },
      { title: 'Low-density planning', text: 'Mostly Kanal-and-above plots, so there are fewer homes per street.' },
      { title: 'Commercial plots', text: 'Day-to-day shopping planned inside the block.' },
      { title: 'On-site sales office', text: 'The Best Builders office inside Sitara Villas for site visits.' },
    ],
    plan: {
      image: planSitara,
      alt: 'Sitara Villas Best Block master plan showing parks, 1 Kanal, 2 Kanal, 4 Kanal and commercial plots',
      full: '/plans/sitara-villas-master-plan.jpg',
      pdf: '/plans/sitara-villas-master-plan.pdf',
      legend: [
        { label: 'Park', color: '#1f9a4b' },
        { label: '1 Kanal', color: '#cfe59a' },
        { label: '2 Kanal', color: '#c99a73' },
        { label: '4 Kanal & above', color: '#f4d3a6' },
        { label: 'Commercial', color: '#5fc8f0' },
      ],
    },
    locationNotes: [
      'Direct access from Canal Expressway, Faisalabad’s main east–west corridor',
      'Quick to reach from Canal Road and the city centre',
      'Surrounded by Faisalabad’s established Canal Road communities',
    ],
    faqs: [
      {
        q: 'Where is Sitara Villas Best Block located?',
        a: 'Sitara Villas Best Block is on Canal Expressway in Faisalabad, behind the Sitara Villas gate. The map on this page shows the exact location, and our team can send a pin on WhatsApp.',
      },
      {
        q: 'What plot sizes are available in Sitara Villas Best Block?',
        a: 'The block has 1 Kanal, 2 Kanal and 4 Kanal-plus residential plots, as well as a few commercial plots. Availability changes daily, so call 0311-073-1111 or message us on WhatsApp for the current list.',
      },
      {
        q: 'Who is developing Sitara Villas Best Block?',
        a: 'Best Block is a project by Best Builders & Developers together with Sitara Group, the developer of Sitara Villas.',
      },
      {
        q: 'What is the price of a 1 Kanal plot in Sitara Villas?',
        a: 'Prices depend on the plot’s size, position, and any corner or park-facing premium. Share the size you want with us on WhatsApp and we will send today’s rates and the payment options.',
      },
      {
        q: 'Can I visit the site before buying?',
        a: 'Yes. We arrange free site visits seven days a week. An advisor will meet you at the Best Builders office in Sitara Villas and show you the available plots.',
      },
      {
        q: 'Can Best Builders also construct my house?',
        a: 'Yes. Best Builders Interiors, part of the same group, designs and builds homes, and Best Builders Homes furnishes them. You can buy, build and furnish with one group.',
      },
    ],
  },
  {
    slug: 'abdullah-gardens',
    name: 'Abdullah Gardens',
    fullName: 'Abdullah Gardens',
    title: ['Abdullah', 'Gardens'],
    status: 'selling',
    kind: 'Residential & Commercial',
    summary:
      'A green, family-first community on Main Canal Road near Kalma Chowk, with plots from 5 Marla to 7 Kanal, fourteen parks and a tennis court.',
    image: villaWide,
    imageAlt: 'Modern two-storey home with a wood and stone facade, typical of Abdullah Gardens',
    specs: [
      { label: 'Location', value: 'Main Canal Road, Kalma Chowk' },
      { label: 'Plot sizes', value: '5 Marla – 7 Kanal' },
      { label: 'Type', value: 'Residential + Commercial' },
      { label: 'Parks', value: '14 parks + tennis court' },
    ],
    primaryCta: 'Get Prices',

    seoTitle: 'Abdullah Gardens Faisalabad | Plots for Sale on Canal Road, 5 Marla to 7 Kanal',
    seoDescription:
      'Residential and commercial plots in Abdullah Gardens, Main Canal Road near Kalma Chowk, Faisalabad. Choose from 5–12 Marla, 13–20 Marla and 1.5–7 Kanal plots. See the master plan, map and FAQs.',
    tagline: 'One of Canal Road’s greenest communities, with a plot for every stage of family life.',
    overview: [
      'Abdullah Gardens is an established housing community on Main Canal Road near Kalma Chowk, Faisalabad. Best Builders & Developers sells plots here and keeps an office on site.',
      'The plan suits a wide range of buyers. There are 5–12 Marla plots for a first home, 13–20 Marla plots for growing families, and 1.5–7 Kanal plots for large villas. Commercial plots sit along the main roads and around the commercial centre.',
      'Green space is the community’s strongest point. The master plan has fourteen numbered parks, a tennis court and several neighbourhood mosques, including Masjid Siraj, Masjid Zeenat and Masjid Abu Ubaida. It also has its own commercial centre and a WASA facility. The Ayesha Block sits at the Canal Road end, by the main entrance gate.',
    ],
    address: { street: 'Main Canal Road, Abdullah Gardens, Kalma Chowk', area: 'Faisalabad' },
    mapQuery: 'Abdullah Gardens, Canal Road, Faisalabad',
    sitePhones: ['0311-073-1111', '0323-602-9026'],
    plots: [
      { size: '5 – 12 Marla', type: 'Residential', note: 'Ideal first homes and smaller family houses' },
      { size: '13 – 20 Marla', type: 'Residential', note: 'Larger family homes, including 1 Kanal' },
      { size: '1.5 – 7 Kanal', type: 'Residential', note: 'Villa plots, some facing parks' },
      { size: 'Commercial', type: 'Commercial', note: 'Shops and offices on the main roads and around the commercial centre' },
    ],
    amenities: [
      { title: '14 parks', text: 'Numbered parks spread across every phase of the plan.' },
      { title: 'Tennis court', text: 'A dedicated court in the community.' },
      { title: 'Mosques', text: 'Masjid Siraj, Masjid Zeenat, Masjid Abu Ubaida and more.' },
      { title: 'Commercial centre', text: 'Daily shopping and services inside the community.' },
      { title: 'Gated entrance', text: 'A main entrance gate on Canal Road, by the Ayesha Block.' },
      { title: 'WASA facility', text: 'A water and sanitation facility marked in the master plan.' },
    ],
    plan: {
      image: planAbdullah,
      alt: 'Abdullah Gardens master plan showing parks, 5–12 Marla, 13–20 Marla, 1.5–7 Kanal and commercial plots',
      full: '/plans/abdullah-gardens-master-plan.jpg',
      pdf: '/plans/abdullah-gardens-master-plan.pdf',
      legend: [
        { label: 'Park', color: '#1f9a4b' },
        { label: '5–12 Marla', color: '#cfe59a' },
        { label: '13–20 Marla', color: '#c99a73' },
        { label: '1.5–7 Kanal', color: '#f4d3a6' },
        { label: 'Commercial', color: '#5fc8f0' },
      ],
    },
    locationNotes: [
      'Frontage on Main Canal Road, Faisalabad',
      'Near Kalma Chowk, a well-known Canal Road landmark',
      'Easy access to Canal Expressway and the city centre',
    ],
    faqs: [
      {
        q: 'Where is Abdullah Gardens Faisalabad?',
        a: 'Abdullah Gardens is on Main Canal Road near Kalma Chowk, Faisalabad. The location map on this page shows the community, and we can share a live pin on WhatsApp.',
      },
      {
        q: 'What plot sizes are available in Abdullah Gardens?',
        a: 'Residential plots come in three ranges, 5–12 Marla, 13–20 Marla and 1.5–7 Kanal, and there are also commercial plots. Message us the size you want and we will send the plots available today.',
      },
      {
        q: 'Are there commercial plots in Abdullah Gardens?',
        a: 'Yes. Commercial plots are planned along the main roads and around the commercial centre. Ask our advisors for the current commercial inventory and rates.',
      },
      {
        q: 'What facilities does Abdullah Gardens have?',
        a: 'The master plan has fourteen parks, a tennis court, several mosques, a commercial centre, a WASA facility and a gated main entrance on Canal Road.',
      },
      {
        q: 'What is the price of a 10 Marla plot in Abdullah Gardens?',
        a: 'Rates change with the location, the road width and whether the plot is a corner or faces a park. Call 0311-073-1111 or WhatsApp us for today’s prices on 10 Marla and other sizes.',
      },
      {
        q: 'How do I arrange a site visit to Abdullah Gardens?',
        a: 'Call or WhatsApp 0311-073-1111. Site visits are free, run seven days a week, and start from the Best Builders office in Abdullah Gardens.',
      },
    ],
  },
  {
    slug: 'city-walk',
    name: 'City Walk',
    fullName: 'City Walk',
    title: ['City', 'Walk'],
    status: 'booking',
    kind: 'Commercial',
    summary:
      'A commercial address on Canal Road, with about 230 shop and office plots on 80 ft boulevards around a sports complex, a park and a mosque.',
    image: luxContinental,
    imageAlt: 'Classical stone commercial facade representing City Walk on Canal Road',
    specs: [
      { label: 'Location', value: 'Canal Road' },
      { label: 'Units', value: 'Shops · Offices · Plazas' },
      { label: 'Type', value: 'Commercial' },
      { label: 'Main roads', value: '80 ft boulevards' },
    ],
    primaryCta: 'Get Prices',

    seoTitle: 'City Walk Faisalabad | Commercial Plots & Shops on Canal Road',
    seoDescription:
      'Commercial plots, shops and plaza sites at City Walk, Canal Road Faisalabad. The project has 80 ft boulevards, a sports complex, a park, a mosque and dedicated parking. See the layout plan, map and FAQs.',
    tagline: 'Faisalabad’s next commercial address, planned for footfall on Canal Road.',
    overview: [
      'City Walk is a planned commercial project by Best Builders & Developers with frontage on Canal Road, Faisalabad. It is designed around foot traffic: two 80 ft boulevards with green medians run through the site, and the shop rows are set on 50 ft and 34 ft roads, so every unit is visible from a street.',
      'The layout has about 230 commercial plots. There are compact 15 ft × 40 ft shops of about 2.2 Marla, 30 ft-wide units of about 5 Marla, and corner and end plots with extra frontage. Two large plaza sites sit nearest Canal Road.',
      'City Walk is designed to bring people back. It has a sports complex and a park at its heart, a mosque, and dedicated parking strips along the main rows. That suits retail, food, clinics, showrooms and offices that depend on regular visitors.',
    ],
    address: { street: 'City Walk, Canal Road', area: 'Faisalabad' },
    mapQuery: 'City Walk, Canal Road, Faisalabad',
    sitePhones: ['0311-073-1111'],
    plots: [
      { size: '≈ 2.2 Marla', type: 'Shop', note: '15 ft × 40 ft units in the inner rows' },
      { size: '≈ 5 Marla', type: 'Shop / Office', note: '30 ft-wide units facing the boulevards' },
      { size: 'Corner & end', type: 'Premium', note: 'Plots with extra frontage on two roads' },
      { size: 'Plaza sites', type: 'Large plot', note: 'Two large plots closest to Canal Road' },
    ],
    amenities: [
      { title: 'Canal Road frontage', text: 'One of Faisalabad’s busiest roads, right at the entrance.' },
      { title: '80 ft boulevards', text: 'Two wide main roads with green medians.' },
      { title: 'Sports complex', text: 'A central sports complex that brings in daily visitors.' },
      { title: 'Park', text: 'Open green space beside the sports complex.' },
      { title: 'Mosque', text: 'A mosque inside the project.' },
      { title: 'Dedicated parking', text: 'Parking strips along the main shop rows.' },
    ],
    plan: {
      image: planCityWalk,
      alt: 'City Walk Canal Road layout plan showing commercial plots, 80 ft roads, a sports complex, a park, a mosque and parking',
      full: '/plans/city-walk-master-plan.jpg',
      legend: [
        { label: 'Commercial plots', color: '#cfcfcf' },
        { label: 'Plaza sites', color: '#f3f1b3' },
        { label: 'Sports complex', color: '#1a8ee0' },
        { label: 'Park & mosque', color: '#55c43c' },
      ],
    },
    locationNotes: [
      'Direct frontage on Canal Road, Faisalabad',
      'Placed for the Canal Road residential belt around it',
      'Quick links to Canal Expressway and the city centre',
    ],
    faqs: [
      {
        q: 'Where is City Walk Faisalabad?',
        a: 'City Walk is on Canal Road, Faisalabad, with the entrance on the main road. The map on this page shows the location, and our team can share a pin on WhatsApp.',
      },
      {
        q: 'What can I buy in City Walk?',
        a: 'City Walk is a commercial project. You can buy shop plots of about 2.2 Marla (15 ft × 40 ft) and about 5 Marla (30 ft wide), corner and end plots, or one of the large plaza sites near Canal Road.',
      },
      {
        q: 'Is City Walk residential or commercial?',
        a: 'City Walk is fully commercial. It is planned for shops, offices, food outlets, clinics and showrooms, with a sports complex, a park and a mosque as anchors.',
      },
      {
        q: 'What facilities does City Walk have?',
        a: 'The plan has two 80 ft boulevards, 50 ft and 34 ft internal roads, a sports complex, a park, a mosque and dedicated parking along the shop rows.',
      },
      {
        q: 'What is the price of a commercial plot in City Walk?',
        a: 'Prices depend on the plot’s size and position. Boulevard-facing and corner units carry a premium. Call 0311-073-1111 or WhatsApp us for today’s rates and payment options.',
      },
      {
        q: 'How do I book a plot in City Walk?',
        a: 'Contact our sales team on 0311-073-1111. We will share the available plots, hold your choice, and take you through booking and documentation.',
      },
    ],
  },
];

export const projectBySlug = (slug: string) => projects.find((p) => p.slug === slug);

/** Projects offered in the lead form. */
export const enquiryOptions: string[] = [...projects.map((p) => p.fullName), 'Not sure yet'];

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
