import { config, collection, fields, singleton } from '@keystatic/core';

export default config({
  storage: import.meta.env.PROD
    ? {
        kind: 'github',
        repo: {
          owner: 'acikacik1314',
          name: 'two-bears-blog',
        },
      }
    : { kind: 'local' },

  ui: {
    brand: { name: '兩隻熊後台' },
  },

  singletons: {
    about: singleton({
      label: '關於頁面',
      path: 'src/content/singletons/about',
      format: { contentField: 'body' },
      schema: {
        title: fields.text({ label: '頁面標題' }),
        description: fields.text({ label: 'SEO 描述', multiline: true }),
        youtubeUrl: fields.text({ label: 'YouTube 頻道連結（選填）' }),
        body: fields.markdoc({ label: '頁面內容', extension: 'md' }),
      },
    }),

    settings: singleton({
      label: '網站設定',
      path: 'src/content/singletons/settings',
      format: { data: 'json' },
      schema: {
        siteTitle: fields.text({ label: '網站名稱' }),
        siteDescription: fields.text({ label: '網站描述', multiline: true }),
        youtubeChannel: fields.text({ label: 'YouTube 頻道網址（選填）' }),
        footerText: fields.text({ label: 'Footer 文字' }),
      },
    }),
  },

  collections: {
    blog: collection({
      label: '文章',
      slugField: 'title',
      path: 'src/content/blog/*',
      format: { contentField: 'body' },
      schema: {
        title: fields.slug({ name: { label: '標題' } }),
        description: fields.text({ label: '摘要', multiline: true }),
        pubDate: fields.date({ label: '發布日期' }),
        updatedDate: fields.date({ label: '更新日期' }),
        tags: fields.array(
          fields.text({ label: '標籤' }),
          { label: '標籤', itemLabel: (props) => props.value ?? '標籤' }
        ),
        category: fields.select({
          label: '分類',
          options: [
            { label: '旅遊', value: '旅遊' },
            { label: '美食', value: '美食' },
            { label: '影片', value: '影片' },
            { label: '預言', value: '預言' },
            { label: '生活', value: '生活' },
          ],
          defaultValue: '旅遊',
        }),
        youtubeId: fields.text({ label: 'YouTube ID（選填）' }),
        rumbleId: fields.text({ label: 'Rumble ID（選填）' }),
        heroImage: fields.text({ label: '封面圖片（選填）' }),
        pixnetSource: fields.text({ label: 'Pixnet 來源（選填）' }),
        rumblePage: fields.text({ label: 'Rumble 頁面（選填）' }),
        youtubePost: fields.text({ label: 'YouTube Post（選填）' }),
        predictions: fields.object({
          hits: fields.array(
            fields.text({ label: '命中' }),
            { label: '命中預言', itemLabel: (props) => props.value ?? '命中' }
          ),
          misses: fields.array(
            fields.text({ label: '未命中' }),
            { label: '未命中預言', itemLabel: (props) => props.value ?? '未命中' }
          ),
          pending: fields.array(
            fields.text({ label: '待驗證' }),
            { label: '待驗證預言', itemLabel: (props) => props.value ?? '待驗證' }
          ),
        }, { label: '預言驗證' }),
        body: fields.markdoc({
          label: '文章內容',
          extension: 'md',
        }),
      },
    }),
  },
});
