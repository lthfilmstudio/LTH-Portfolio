import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://lthfilmstudio.com',
  integrations: [sitemap()],
});
