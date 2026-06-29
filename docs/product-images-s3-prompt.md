# Product Images 1C -> S3 -> APP Prompt

## Progress Checklist

### Discovery
- [x] Confirmed `Номенклатура.ФайлКартинки` exists in `OneC/MainConf/Catalogs/Номенклатура.xml`.
- [x] Confirmed `Номенклатура.ФайлКартинки` points to `CatalogRef.НоменклатураПрисоединенныеФайлы`.
- [x] Confirmed extension `OneC/MatrixZakup` adopts the same `ФайлКартинки` attribute.
- [x] Confirmed attached product files are queried from `Справочник.НоменклатураПрисоединенныеФайлы` by `ВладелецФайла`.
- [x] Confirmed deleted attached files must be filtered by `НЕ ПометкаУдаления`.
- [x] Confirmed existing UT/BSP code receives image binary through `РаботаСФайлами.ДанныеФайла(...).СсылкаНаДвоичныеДанныеФайла`.
- [x] Confirmed existing APP already has `expo-image`.
- [x] Confirmed existing API already has S3 helpers in `LeaderProductAPI/src/storage/minio.ts`.
- [x] Confirmed existing API already has `/files/*` proxy with Redis cache.

### 1C
- [x] Add `/hs/lp-app/nomenclature-images` metadata endpoint.
- [x] Add `/hs/lp-app/nomenclature-images/{fileGuid}/content` binary endpoint.
- [x] Return main image from `Номенклатура.ФайлКартинки`.
- [x] Return additional active image files from `НоменклатураПрисоединенныеФайлы`.
- [x] Return `deletionMark` changes so API can deactivate old images.
- [x] Add pagination and `changedSince`.
- [x] Add controlled JSON errors with `errorId`.

### API
- [x] Add Prisma model for product image metadata.
- [x] Add 1C client methods for image metadata and binary content.
- [x] Add image sync service with pagination, retry, concurrency limit, and backoff.
- [x] Generate `thumb` and `preview` images.
- [x] Upload images to S3 with immutable hash-based keys.
- [x] Add `Cache-Control` metadata to S3 objects.
- [x] Add lazy image sync when a product has no image yet.
- [ ] Add nightly reconciliation and old-object cleanup.
- [x] Extend `/api/client-orders/products`.
- [x] Extend `/api/client-orders/products/batch`.
- [ ] Extend `/api/client-orders/reference-details/product`.
- [ ] Add API tests.

### APP
- [x] Extend `ClientOrderProduct` with image fields.
- [x] Use `expo-image` for product thumbnails.
- [x] Use `imageThumbUrl` in product lists and picker.
- [x] Use `imagePreviewUrl` in product editor/detail sheet.
- [x] Add stable `cacheKey` based on `productGuid + imageHash`.
- [x] Add `cachePolicy="memory-disk"`.
- [ ] Add prefetch for visible/next product images.
- [x] Keep placeholder when image is missing or fails.
- [ ] Add APP tests.

### Verification
- [ ] Product search displays thumbnails.
- [ ] Product card displays preview image.
- [ ] App does not load original images in lists.
- [ ] Reopening the same product uses local cache.
- [ ] Changing product photo in 1C changes image hash/url in APP.
- [ ] 1C outage does not break already synced images.
- [ ] S3 keys are separated by `dev` / `prod`.
- [ ] No S3 secrets are shipped to APP.

## Local 1C Findings

Use the real UT/BSP storage model, not a custom guess.

- Main configuration:
  - `OneC/MainConf/Catalogs/Номенклатура.xml`
  - attribute: `ФайлКартинки`
  - type: `CatalogRef.НоменклатураПрисоединенныеФайлы`
  - meaning: direct reference to the main product image file.
  - choice parameter link: `ВладелецФайла` -> current `Номенклатура` ref.

- Extension:
  - `OneC/MatrixZakup/Catalogs/Номенклатура.xml`
  - attribute `ФайлКартинки` is adopted from the main configuration.

- Attached files:
  - catalog: `НоменклатураПрисоединенныеФайлы`
  - owner field: `ВладелецФайла`
  - active files must filter `НЕ ПометкаУдаления`.

- Existing UT/BSP-like retrieval patterns found locally:
  - `OneC/MainConf/CommonModules/ДатаМобайл_ОбщийМодуль/Ext/Module.bsl`
    - gets `Номенклатура.ФайлКартинки`;
    - queries `Справочник.НоменклатураПрисоединенныеФайлы`;
    - reads binary through `ДанныеФайла(...).СсылкаНаДвоичныеДанныеФайла`;
    - then uses `ПолучитьИзВременногоХранилища(...)`.
  - `OneC/MainConf/DataProcessors/МобильноеРабочееМестоСборкиИКурьерскойДоставки/.../Module.bsl`
    - uses `РаботаСФайлами.ДанныеФайла(СтрокаТовар.ФайлКартинки, ...).СсылкаНаДвоичныеДанныеФайла`.
  - `OneC/MainConf/DataProcessors/МобильноеРабочееМестоКладовщика/.../Module.bsl`
    - lists `НоменклатураПрисоединенныеФайлы` by `ВладелецФайла`;
    - filters `НЕ ПометкаУдаления`.

Conclusion: for this project, the correct source of the main image is `Номенклатура.ФайлКартинки`. Additional images should be taken from active `НоменклатураПрисоединенныеФайлы` records where `ВладелецФайла = Номенклатура`.

## Reference Sources

- 1C HTTP services: https://1c-dn.com/1c_enterprise/http_services/
- 1C binary data management: https://1c-dn.com/1c_enterprise/binary_data_management/
- AWS S3 object metadata and `Cache-Control`: https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html
- AWS S3 presigned URLs: https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html
- Expo Image cache and prefetch: https://docs.expo.dev/versions/latest/sdk/image/
- Android large bitmap guidance: https://developer.android.com/topic/performance/graphics/load-bitmap

## Full Development Prompt

You are a senior full-stack engineer. Implement a production-grade product image pipeline for LeaderProduct:

`1C UT/BSP -> LeaderProductAPI -> S3 -> LeaderProductAPP`

### Project Context

- Workspace: `D:\GitRepositories\LeaderProduct`
- APP: `LeaderProductAPP`
  - Expo / React Native.
  - `expo-image` is already installed.
  - Product UI is in `src/features/clientOrders`.
  - Product API client is in `utils/clientOrdersService.ts`.
- API: `LeaderProductAPI`
  - Express / Prisma.
  - S3 helpers already exist in `src/storage/minio.ts`.
  - `/files/*` proxy already exists and has Redis cache.
  - Client orders live 1C mapping is in `src/modules/clientOrders`.
- 1C extension: `OneC/MatrixZakup`
  - The APP must never call 1C directly.
  - Data flow must stay `APP -> LeaderProductAPI -> 1C/S3`.

### Goal

Product photos must be available in:

- product picker;
- mobile product cards;
- product editor bottom sheet;
- web product table;
- web product preview.

Images must be fast, cacheable, and safely updated when photos change in 1C.

### Non-Negotiable Production Rules

- Do not load product images directly from 1C in APP.
- Do not return image base64 in product list JSON.
- Do not load original/full-size images in product lists.
- Do not put S3 credentials in APP.
- Do not overwrite cached S3 objects under the same key.
- S3 object keys must contain content hash.
- If 1C is unavailable, already synced images must continue to work.
- If photo changes in 1C, APP must receive a new URL/cache key automatically.

### Correct 1C Data Model

Use the actual UT/BSP model found in the local configuration:

- Main image:
  - `Справочник.Номенклатура.ФайлКартинки`
  - type: `СправочникСсылка.НоменклатураПрисоединенныеФайлы`
- Additional attached images:
  - `Справочник.НоменклатураПрисоединенныеФайлы`
  - filter: `ВладелецФайла = &Номенклатура`
  - filter: `НЕ ПометкаУдаления`
- Binary reading pattern:
  - `РаботаСФайлами.ДанныеФайла(ФайлКартинки, УникальныйИдентификатор).СсылкаНаДвоичныеДанныеФайла`
  - or project-local equivalent `ДанныеФайла(...)`
  - then `ПолучитьИзВременногоХранилища(...)` to get `ДвоичныеДанные`.

### 1C Requirements

Add or extend `/hs/lp-app` endpoints.

#### `GET /nomenclature-images`

Query params:

- `changedSince?: string`
- `limit?: number`
- `offset?: number`
- `productGuid?: string`
- `includeDeleted?: boolean`

Response:

```json
{
  "items": [
    {
      "productGuid": "uuid",
      "fileGuid": "uuid",
      "fileName": "photo.jpg",
      "contentType": "image/jpeg",
      "extension": "jpg",
      "size": 123456,
      "modifiedAt": "2026-06-28T10:00:00Z",
      "isMain": true,
      "deletionMark": false
    }
  ],
  "limit": 100,
  "offset": 0,
  "hasMore": true
}
```

Rules:

- `isMain=true` when file equals `Номенклатура.ФайлКартинки`.
- Additional files may be returned with `isMain=false`.
- Deleted files should be returned only when `includeDeleted=true` or when needed for incremental delete propagation.
- Exclude non-image file extensions/content types from normal active output.
- Search/read must not block regular client orders endpoints.

#### `GET /nomenclature-images/{fileGuid}/content`

Returns binary file content.

Headers:

- `Content-Type`
- `Content-Length` if known
- `Content-Disposition: inline; filename="..."`

Do not return base64 JSON for the binary endpoint.

### API Requirements

#### Prisma Model

Add a model similar to:

```prisma
model ProductImage {
  id             String   @id @default(uuid())
  productGuid    String
  fileGuid       String
  isMain         Boolean  @default(false)
  fileName       String?
  contentType    String?
  size           Int?
  width          Int?
  height         Int?
  hashSha256     String
  s3KeyThumb     String
  s3KeyPreview   String
  s3KeyOriginal  String?
  modifiedAt1c   DateTime?
  syncedAt       DateTime @default(now())
  deletedAt      DateTime?
  syncState      String   @default("SYNCED")
  lastError      String?

  @@unique([fileGuid, hashSha256])
  @@index([productGuid, isMain])
  @@index([productGuid, deletedAt])
}
```

Use enum if the project prefers Prisma enums:

- `PENDING`
- `SYNCED`
- `ERROR`
- `DELETED`

#### API 1C Client

Add methods:

- `getOnecLpAppNomenclatureImages(params)`
- `getOnecLpAppNomenclatureImageContent(fileGuid)`

The binary method must preserve response body as a Buffer/stream.

#### Image Sync Service

Create a service for image synchronization:

- incremental sync by `changedSince`;
- pagination by `limit/offset`;
- concurrency limit 2-4;
- retry with exponential backoff;
- skip unchanged files;
- detect changed files by `sha256`;
- mark deleted files by `deletionMark`;
- keep old hash versions for retention window;
- never delete old S3 objects immediately after a new photo appears.

Recommended object keys:

```text
{env}/images/client-orders/products/{productGuid}/{fileGuid}/{sha256}/thumb.webp
{env}/images/client-orders/products/{productGuid}/{fileGuid}/{sha256}/preview.webp
{env}/images/client-orders/products/{productGuid}/{fileGuid}/{sha256}/original.{ext}
```

Where `{env}` is `dev` or `prod`.

Image sizes:

- `thumb`: 160-240px max side.
- `preview`: 800-1000px max side.
- `original`: optional; store only if needed.

S3 metadata:

- `Content-Type: image/webp` for generated webp.
- `Cache-Control: public, max-age=31536000, immutable` for hash-based objects.

If using private files:

- APP still receives only API URLs or signed URLs.
- If signed URLs are used, APP must receive stable `imageHash` and use stable cache key.

#### Lazy Sync

When `/api/client-orders/products` or `/products/batch` returns products and image is missing:

- return product immediately without blocking;
- enqueue image sync for those product GUIDs;
- do not show a user-facing error.

#### Product DTO Extension

Extend product DTO in:

- `GET /api/client-orders/products`
- `POST /api/client-orders/products/batch`
- `GET /api/client-orders/reference-details/product`

Add:

```ts
type ProductImageDto = {
  id: string;
  fileGuid: string;
  thumbUrl: string;
  previewUrl: string;
  isMain: boolean;
  hash: string;
};

imageThumbUrl?: string | null;
imagePreviewUrl?: string | null;
imageHash?: string | null;
images?: ProductImageDto[];
```

Main image selection:

1. active image with `isMain=true`;
2. otherwise first active product image;
3. otherwise `null`.

#### Admin / Maintenance Endpoints

Add protected endpoints:

- `GET /api/client-orders/product-images/status`
- `POST /api/client-orders/product-images/sync`
- `POST /api/client-orders/product-images/sync/:productGuid`
- `POST /api/client-orders/product-images/cleanup`

Status should include:

- last sync time;
- uploaded count;
- skipped count;
- failed count;
- pending count;
- last error.

### APP Requirements

#### Types

Extend `ClientOrderProduct` in `utils/clientOrdersService.ts`:

```ts
imageThumbUrl?: string | null;
imagePreviewUrl?: string | null;
imageHash?: string | null;
images?: {
  id: string;
  fileGuid: string;
  thumbUrl: string;
  previewUrl: string;
  isMain: boolean;
  hash: string;
}[];
```

#### Rendering

Use `expo-image` for product images.

Product list / picker:

- source: `imageThumbUrl`;
- fallback: existing placeholder;
- no layout shift.

Product editor/detail:

- source: `imagePreviewUrl || imageThumbUrl`;
- fallback: existing placeholder.

Use cache:

```tsx
<Image
  source={{ uri: imageUrl }}
  cachePolicy="memory-disk"
  recyclingKey={imageHash ? `${productGuid}:${imageHash}` : productGuid}
/>
```

If the implementation uses signed URLs, add a stable cache key based on:

```text
product:{productGuid}:{imageHash}:thumb
product:{productGuid}:{imageHash}:preview
```

#### Prefetch

After product search results load:

- prefetch only first visible images and next few rows;
- do not prefetch entire catalog;
- do not block UI on prefetch.

#### UX

- Missing image: show placeholder.
- Failed image load: keep placeholder, no toast.
- 1C/API image sync pending: no visible error.
- Product cards must keep stable dimensions while images load.

### Cache / Freshness Strategy

Use immutable image URLs by content hash.

When image changes in 1C:

1. API downloads new binary.
2. API calculates new sha256.
3. API uploads new S3 keys with new hash.
4. Product DTO returns new `imageThumbUrl`, `imagePreviewUrl`, `imageHash`.
5. APP sees new URL/cache key and loads new image.
6. Old cached image can remain safely; it is no longer referenced.

Nightly reconciliation:

- list all image metadata from 1C;
- mark missing/deleted files in API DB;
- cleanup S3 objects older than retention period.

Suggested retention:

- dev: 3-7 days;
- prod: 14-30 days.

### Tests

API tests:

- maps 1C metadata correctly;
- filters deletion marks;
- main image priority uses `ФайлКартинки`;
- unchanged file is skipped;
- changed hash creates new S3 object keys;
- deleted file deactivates ProductImage;
- product DTO includes image fields;
- 1C unavailable does not break product search;
- S3 upload receives `Cache-Control`;
- cleanup does not remove currently referenced hash.

APP tests:

- product thumbnail renders `imageThumbUrl`;
- preview uses `imagePreviewUrl`;
- placeholder renders when no image;
- image hash changes recycling/cache key;
- product picker layout does not shift while loading.

Manual verification:

- add photo in 1C product card;
- run image sync;
- open product picker in APP;
- see thumbnail;
- open product editor;
- see preview;
- change photo in 1C;
- run sync again;
- APP receives new image without clearing cache;
- disable 1C;
- already synced images still show.

### Commands

Use existing repo scripts where available.

API:

```powershell
cd D:\GitRepositories\LeaderProduct\LeaderProductAPI
npm run type-check
npm test
```

APP:

```powershell
cd D:\GitRepositories\LeaderProduct\LeaderProductAPP
npx tsc --noEmit
npm run test:unit
```

### Acceptance Criteria

- Product photos appear in mobile and web client orders.
- Lists use thumbnails, not original images.
- Product detail uses preview image.
- Images are cached on device.
- Changed 1C image appears as a new URL/hash.
- 1C outage does not break already synced images.
- S3 keys are separated by `dev` and `prod`.
- No S3 credentials are present in APP.
- All new API and APP tests pass.
