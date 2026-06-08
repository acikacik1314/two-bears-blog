#!/bin/bash
BLOG_DIR="$(dirname "$0")/../src/content/blog"
IMG_DIR="$(dirname "$0")/../public/images/blog"
FAILED=0
SUCCESS=0

mkdir -p "$IMG_DIR"

for mdfile in "$BLOG_DIR"/*.md; do
  hero=$(grep -m1 "^heroImage:" "$mdfile" | sed "s/heroImage: *['\"]//;s/['\"] *$//")
  if [[ "$hero" != *"pimg"* ]]; then continue; fi

  slug=$(basename "$mdfile" .md)
  outfile="$IMG_DIR/${slug}.jpg"

  if [ -f "$outfile" ]; then
    echo "⏭️  已存在 $slug，跳過"
    SUCCESS=$((SUCCESS+1))
    continue
  fi

  if ffmpeg -y -i "$hero" -vf "scale='min(1200,iw)':-2" -q:v 4 "$outfile" -loglevel error 2>/dev/null; then
    sed -i '' "s|heroImage: *['\"]${hero}['\"]|heroImage: '/images/blog/${slug}.jpg'|" "$mdfile"
    SUCCESS=$((SUCCESS+1))
    size=$(du -sh "$outfile" | cut -f1)
    echo "✅ $slug ($size)"
  else
    FAILED=$((FAILED+1))
    echo "❌ 失敗：$slug"
  fi
done

echo ""
echo "完成！成功：$SUCCESS　失敗：$FAILED"
total=$(du -sh "$IMG_DIR" 2>/dev/null | cut -f1)
echo "圖片資料夾總大小：$total"
