import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://lthfilmstudio.com',
  integrations: [
    sitemap({
      // 排除後台 URL — CF Access 保護，不該進 Google 索引
      filter: (page) => !page.includes('/admin/'),
    }),
  ],
});
