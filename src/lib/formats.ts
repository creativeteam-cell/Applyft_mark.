// Все форматы рекламных креативов

export interface Format {
  id: string
  name: string
  width: number
  height: number
  platform: string
}

export const CREATIVE_FORMATS: Format[] = [
  // Instagram
  { id: 'ig_square',    name: 'Instagram Квадрат',  width: 1080, height: 1080, platform: 'Instagram' },
  { id: 'ig_portrait',  name: 'Instagram Портрет',  width: 1080, height: 1350, platform: 'Instagram' },
  { id: 'ig_story',     name: 'Instagram Stories',  width: 1080, height: 1920, platform: 'Instagram' },
  
  // Facebook
  { id: 'fb_feed',      name: 'Facebook Feed',       width: 1200, height: 628,  platform: 'Facebook' },
  { id: 'fb_square',    name: 'Facebook Квадрат',    width: 1080, height: 1080, platform: 'Facebook' },
  { id: 'fb_story',     name: 'Facebook Stories',    width: 1080, height: 1920, platform: 'Facebook' },
  
  // Google Ads
  { id: 'gads_banner',  name: 'Google Banner',       width: 728,  height: 90,   platform: 'Google Ads' },
  { id: 'gads_rect',    name: 'Google Rectangle',    width: 300,  height: 250,  platform: 'Google Ads' },
  { id: 'gads_large',   name: 'Google Large Rect',   width: 336,  height: 280,  platform: 'Google Ads' },
  
  // LinkedIn
  { id: 'li_post',      name: 'LinkedIn Post',       width: 1200, height: 627,  platform: 'LinkedIn' },
]
