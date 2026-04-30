import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://lthfilmstudio.com',
  integrations: [
    sitemap({
      // 排除後台 URL — CF Access 保護，不該進 Google 索引
      // 排除 /copyright/ — 頁面本身已掛 noindex，不該出現在 sitemap
      filter: (page) => !page.includes('/admin/') && !page.includes('/copyright/'),
    }),
  ],
});
