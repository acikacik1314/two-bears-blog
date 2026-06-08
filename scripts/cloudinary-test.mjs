import { v2 as cloudinary } from 'cloudinary';

// Cloudinary credentials
cloudinary.config({
  cloud_name: 'dxnu4ceop',
  api_key: '413919488719673',
  api_secret: 'cYpMPGABrNYTR4hfgBKprb15-j8',
});

// 1. Upload a sample image
console.log('上傳圖片中...');
const uploadResult = await cloudinary.uploader.upload(
  'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  { public_id: 'two-bears-test' }
);

console.log('✅ 上傳成功！');
console.log('URL:', uploadResult.secure_url);
console.log('Public ID:', uploadResult.public_id);

// 2. Get image details
const details = await cloudinary.api.resource('two-bears-test');
console.log('\n圖片資訊：');
console.log('寬度:', details.width, 'px');
console.log('高度:', details.height, 'px');
console.log('格式:', details.format);
console.log('檔案大小:', details.bytes, 'bytes');

// 3. Generate transformed URL
// f_auto: 自動選擇最佳格式（WebP、AVIF 等）
// q_auto: 自動調整品質以減少檔案大小
const transformedUrl = cloudinary.url('two-bears-test', {
  transformation: [{ fetch_format: 'auto', quality: 'auto' }],
  secure: true,
});

console.log('\nDone! Click link below to see optimized version of the image. Check the size and the format.');
console.log(transformedUrl);
