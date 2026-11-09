import { brand, contact, projects, type Project } from './site';

/** JSON-LD builders. Every page links back to the single organisation node by @id. */

export const orgId = (site: URL) => new URL('/#organization', site).href;

export function organization(site: URL, logo: string) {
  return {
    '@type': 'RealEstateAgent',
    '@id': orgId(site),
    name: brand,
    url: site.href,
    logo,
    image: logo,
    telephone: contact.phoneTel,
    areaServed: { '@type': 'City', name: 'Faisalabad' },
    address: { '@type': 'PostalAddress', addressLocality: 'Faisalabad', addressRegion: 'Punjab', addressCountry: 'PK' },
    sameAs: [contact.facebook, contact.instagram, contact.group],
    parentOrganization: { '@type': 'Organization', name: 'Best Builders', url: contact.group },
  };
}

export function homeGraph(site: URL, logo: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization(site, logo),
      {
        '@type': 'WebSite',
        '@id': new URL('/#website', site).href,
        url: site.href,
        name: brand,
        publisher: { '@id': orgId(site) },
        inLanguage: 'en-PK',
      },
      {
        '@type': 'ItemList',
        name: 'Projects by Best Builders & Developers in Faisalabad',
        itemListElement: projects.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.fullName,
          url: new URL(`/${p.slug}/`, site).href,
        })),
      },
    ],
  };
}

export function projectGraph(p: Project, site: URL, logo: string, image: string, gallery: string[] = []) {
  const url = new URL(`/${p.slug}/`, site).href;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.mapQuery)}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization(site, logo),
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: p.seoTitle,
        description: p.seoDescription,
        inLanguage: 'en-PK',
        primaryImageOfPage: image,
        about: { '@id': `${url}#place` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
        publisher: { '@id': orgId(site) },
      },
      {
        '@type': 'Place',
        '@id': `${url}#place`,
        name: `${p.fullName}, Faisalabad`,
        description: p.summary,
        url,
        image: [image, ...gallery, new URL(p.plan.full, site).href],
        hasMap: mapUrl,
        telephone: contact.phoneTel,
        address: {
          '@type': 'PostalAddress',
          streetAddress: p.address.street,
          addressLocality: p.address.area,
          addressRegion: 'Punjab',
          addressCountry: 'PK',
        },
        containedInPlace: { '@type': 'City', name: 'Faisalabad' },
        amenityFeature: p.amenities.map((a) => ({
          '@type': 'LocationFeatureSpecification',
          name: a.title,
          value: true,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: site.href },
          { '@type': 'ListItem', position: 2, name: p.fullName, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: p.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };
}
