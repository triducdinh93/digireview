# DigiReview Blog dành để nhúng vào Google Sites

Đây là một blog độc lập bằng HTML, CSS và JavaScript. Google Sites chỉ đóng vai trò trang chứa. Blog cần được đăng lên một dịch vụ hosting tĩnh trước, sau đó nhúng URL vào Google Sites.

## Chức năng đã có

- Trang chủ dạng tạp chí/review
- Menu nhiều cấp và menu mobile
- Tìm kiếm tức thời
- Tìm kiếm toàn bộ tiêu đề, mô tả, chuyên mục, tag và nội dung
- Chuyên mục động
- Phân trang
- Bài nổi bật
- Bài mới
- Sidebar
- Trang bài review dài
- Mục lục tự động từ H2 và H3
- Thanh tiến độ đọc
- Review snapshot và điểm đánh giá
- Pros và Cons
- CTA affiliate với rel="sponsored nofollow"
- Chia sẻ Facebook, X, LinkedIn và sao chép link
- Bài liên quan tự động
- Đánh giá sao bằng localStorage
- Bộ đếm lượt xem cục bộ
- Dark mode
- Form newsletter và form liên hệ có thể nối Formspree
- Bình luận Giscus có thể bật bằng cấu hình
- Schema Blog và Article dạng JSON-LD
- Trang About, Contact, Privacy, Terms và Disclaimer
- Trình biên tập bài viết admin.html

## Cấu trúc thư mục

```text
google-sites-blog/
├── index.html
├── admin.html
├── README-VI.md
├── assets/
│   ├── app.js
│   ├── style.css
│   └── favicon.svg
└── data/
    └── posts.js
```

## Chỉnh tên website

Mở `data/posts.js`, sửa phần:

```js
site: {
  name: "DigiReview",
  tagline: "Reviews & Buying Guides",
  topbarText: "Independent reviews. Clear buying decisions.",
  description: "..."
}
```

## Thêm hoặc sửa bài bằng trang quản trị

1. Chạy blog trên hosting hoặc máy chủ cục bộ.
2. Mở `admin.html`.
3. Chọn bài cần sửa hoặc nhấn `New post`.
4. Nhập dữ liệu và nhấn `Save post`.
5. Nhấn `Export posts.js`.
6. Chép file vừa tải về đè lên `data/posts.js`.
7. Đăng lại website lên hosting.

Lưu ý: admin.html không phải hệ thống đăng nhập hoặc CMS trực tuyến. Nó là trình biên tập chạy trong trình duyệt, phù hợp với website tĩnh.

## Chạy thử trên máy tính

Không nên mở trực tiếp bằng `file://`. Hãy chạy một máy chủ cục bộ.

Nếu có Python:

```bash
cd google-sites-blog
python -m http.server 8080
```

Sau đó mở:

```text
http://localhost:8080
```

Trang quản trị:

```text
http://localhost:8080/admin.html
```

## Đăng lên GitHub Pages

1. Tạo một repository mới trên GitHub.
2. Upload toàn bộ nội dung bên trong thư mục `google-sites-blog` vào repository.
3. Vào `Settings` → `Pages`.
4. Chọn `Deploy from a branch`.
5. Chọn branch `main` và thư mục `/root`.
6. Lưu và chờ GitHub cung cấp URL website.

Có thể thêm file `.nojekyll` rỗng ở thư mục gốc. Gói này đã kèm sẵn file đó.

## Nhúng vào Google Sites

Cách nên dùng:

1. Mở Google Sites ở chế độ chỉnh sửa.
2. Chọn tab `Pages`.
3. Nhấn nút thêm trang.
4. Chọn `Full page embed`.
5. Dán URL GitHub Pages của blog.
6. Đặt tên trang, ví dụ `Blog`.
7. Publish Google Sites.

Bạn cũng có thể dùng `Insert` → `Embed` → `By URL`, nhưng Full page embed phù hợp hơn cho giao diện blog.

## Bật form newsletter và liên hệ

Tạo form trên Formspree hoặc dịch vụ nhận form tương đương. Sau đó sửa trong `data/posts.js`:

```js
newsletterEndpoint: "https://formspree.io/f/MA_CUA_BAN",
contactEndpoint: "https://formspree.io/f/MA_CUA_BAN"
```

Nếu để trống, website sẽ hiện thông báo nhắc cấu hình khi người dùng gửi form.

## Bật bình luận Giscus

Giscus sử dụng GitHub Discussions. Sau khi tạo cấu hình trên giscus.app, sửa:

```js
comments: {
  provider: "giscus",
  repo: "username/repository",
  repoId: "...",
  category: "General",
  categoryId: "..."
}
```

Nếu để `provider: "none"`, phần bình luận sẽ hiện hướng dẫn cấu hình.

## Đổi link affiliate

Trong mỗi bài:

```js
affiliateUrl: "https://link-affiliate-cua-ban.com",
affiliateLabel: "Check Current Offer"
```

Nếu `affiliateUrl` để trống, khối CTA sẽ tự ẩn.

## Thêm Google Analytics

Dán đoạn mã Google Analytics vào trong `<head>` của `index.html`, ngay trước thẻ `</head>`.

## Giới hạn cần hiểu rõ

- Khi nhúng trong Google Sites, blog chạy trong iframe.
- Google Sites không trở thành CMS và không tự quản lý bài của blog.
- SEO của nội dung nhúng không được gộp hoàn toàn vào URL Google Sites.
- Muốn SEO từng bài mạnh, nên dùng URL hosting của blog làm website chính hoặc kết nối tên miền riêng cho hosting.
- Bình luận, form email và dữ liệu dùng chung giữa nhiều người cần dịch vụ ngoài.
- Bộ đếm lượt xem và rating mặc định chỉ lưu trong trình duyệt từng người. Muốn số liệu toàn cầu cần Supabase, Firebase hoặc backend riêng.

## Nâng cấp thành CMS thật

Để đăng bài mà không cần sửa file, có thể nối blog với một trong các hệ thống:

- WordPress REST API
- Blogger API
- Google Sheets + Apps Script API
- Supabase
- Firebase
- Headless CMS như Sanity hoặc Contentful

Phiên bản hiện tại ưu tiên đơn giản, miễn phí và có thể nhúng ngay sau khi host.
