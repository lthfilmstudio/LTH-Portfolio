import worksData from './works.json';

export type Category = 'feature' | 'series' | 'trailer' | 'short' | 'commercial' | 'mv' | 'tvmovie';

export type LinkType =
  | 'youtube'
  | 'facebook'
  | 'netflix'
  | 'iqiyi'
  | 'kktv'
  | 'catchplay'
  | 'friday'
  | 'myvideo'
  | 'hakkatv'
  | 'pts'
  | 'hami'
  | 'vimeo'
  | 'link';

export interface WorkLink {
  type: LinkType;
  url: string;
  label?: string;
}

export interface Work {
  slug: string;
  titleZh: string;
  titleEn: string;
  year: string;
  categories: Category[];
  primaryCategory: Category;
  director: string;
  writers: string;
  description: string;
  cover: string;
  covers: string[];
  links: WorkLink[];
  hasDetail: boolean;
}

export const works = worksData as Work[];

export const CATEGORY_LABELS: Record<Category, { zh: string; en: string }> = {
  feature: { zh: '電影', en: 'Feature Film' },
  series: { zh: '劇集', en: 'Series' },
  trailer: { zh: '預告片花', en: 'Trailer' },
  short: { zh: '短片', en: 'Short Film' },
  commercial: { zh: '廣告', en: 'Commercial' },
  mv: { zh: '音樂錄影帶', en: 'Music Video' },
  tvmovie: { zh: '電視電影', en: 'TV Movie' },
};

export const CATEGORY_ORDER: Category[] = [
  'feature',
  'series',
  'tvmovie',
  'short',
  'trailer',
  'commercial',
  'mv',
];

export function worksByCategory(cat: Category): Work[] {
  return works.filter((w) => w.categories.includes(cat));
}

export function primaryYoutubeLink(w: Work): string | null {
  const yt = w.links.find((l) => l.type === 'youtube');
  return yt?.url ?? null;
}

export function firstExternalLink(w: Work): string | null {
  const pref: LinkType[] = ['youtube', 'vimeo', 'netflix', 'iqiyi', 'kktv', 'catchplay', 'facebook', 'link'];
  for (const p of pref) {
    const hit = w.links.find((l) => l.type === p);
    if (hit) return hit.url;
  }
  return w.links[0]?.url ?? null;
}
