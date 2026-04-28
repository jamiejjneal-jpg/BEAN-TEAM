import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pricing', '/login', '/register', '/privacy', '/terms'],
        disallow: ['/admin/', '/walker/', '/client/', '/api/', '/srv/', '/settings/'],
      },
    ],
    sitemap: 'https://rockysretreatandrambles.com/sitemap.xml',
  }
}
