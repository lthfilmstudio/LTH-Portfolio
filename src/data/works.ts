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
  orders?: Partial<Record<Category, number>>;
  coverX?: number;
  coverY?: number;
  coverScale?: number;
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
  'short',
  'tvmovie',
  'trailer',
  'commercial',
  'mv',
];

// 為每個 category 計算 work 在該分類內的 effective order（顯示用 CSS order 值）。
// 顯式 work.orders[cat] 優先；缺值的 fallback 為 works.json 內的相對位置。
const categoryOrderBySlug: Map<string, Map<Category, number>> = (() => {
  const result = new Map<string, Map<Category, number>>();
  for (const cat of CATEGORY_ORDER) {
    const inCat = works.filter((w) => w.categories.includes(cat));
    inCat.sort((a, b) => {
      const ao = a.orders?.[cat];
      const bo = b.orders?.[cat];
      if (ao !== undefined && bo !== undefined) return ao - bo;
      if (ao !== undefined) return -1;
      if (bo !== undefined) return 1;
      return works.indexOf(a) - works.indexOf(b);
    });
    inCat.forEach((w, i) => {
      if (!result.has(w.slug)) result.set(w.slug, new Map());
      result.get(w.slug)!.set(cat, i);
    });
  }
  return result;
})();

export function getWorkCategoryOrder(slug: string, cat: Category): number {
  return categoryOrderBySlug.get(slug)?.get(cat) ?? 9999;
}

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
