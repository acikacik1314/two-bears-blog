import { config, collection, fields } from '@keystatic/core';

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
        heroImage: fields.image({
          label: '封面圖片（選填）',
          directory: 'src/assets/images',
          publicPath: '/src/assets/images/',
        }),
        body: fields.markdoc({
          label: '文章內容',
          extension: 'md',
        }),
      },
    }),
  },
});
