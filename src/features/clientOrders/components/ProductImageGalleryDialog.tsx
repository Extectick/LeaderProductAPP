import React from 'react';
import { Box, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import BackIcon from '@mui/icons-material/ChevronLeft';
import NextIcon from '@mui/icons-material/ChevronRight';

export type ProductGalleryImage = {
  key: string;
  thumbUrl: string;
  previewUrl: string;
  isMain?: boolean;
};

export type ProductImageGallery = { title: string; subtitle?: string | null; images: ProductGalleryImage[]; index: number };
export const PRODUCT_IMAGE_PLACEHOLDER_URI = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22 viewBox=%220 0 120 120%22%3E%3Crect width=%22120%22 height=%22120%22 rx=%2224%22 fill=%22%23EFF6FF%22/%3E%3Crect x=%2222%22 y=%2224%22 width=%2276%22 height=%2272%22 rx=%2216%22 fill=%22%23FFFFFF%22 stroke=%22%2393C5FD%22 stroke-width=%225%22/%3E%3Ccircle cx=%2248%22 cy=%2249%22 r=%2211%22 fill=%22%23BFDBFE%22/%3E%3Cpath d=%22M33 82l19-21 14 14 11-13 22 20H33z%22 fill=%22%232563EB%22 opacity=%22.72%22/%3E%3C/svg%3E';

function isRemoteImageUri(src?: string | null) {
  return !!src && !src.startsWith('data:');
}

export function WebProductImage({
  src,
  alt,
  sx,
  loading = 'lazy',
  spinnerSize = 18,
  objectFit = 'contain',
}: {
  src: string;
  alt: string;
  sx?: any;
  loading?: 'lazy' | 'eager';
  spinnerSize?: number;
  objectFit?: 'cover' | 'contain';
}) {
  const [loaded, setLoaded] = React.useState(!isRemoteImageUri(src));
  const [failed, setFailed] = React.useState(false);
  const displaySrc = failed ? PRODUCT_IMAGE_PLACEHOLDER_URI : src;
  const shouldShowLoader = isRemoteImageUri(src) && !loaded && !failed;
  const sxList = Array.isArray(sx) ? sx : [sx];

  React.useEffect(() => {
    setLoaded(!isRemoteImageUri(src));
    setFailed(false);
  }, [src]);

  return (
    <Box
      sx={[
        {
          position: 'relative',
          display: 'block',
          overflow: 'hidden',
          bgcolor: '#F8FAFC',
        },
        ...sxList,
      ]}
    >
      <Box
        component="img"
        src={displaySrc}
        alt={alt}
        loading={loading}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          setLoaded(true);
        }}
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit,
          opacity: shouldShowLoader ? 0.22 : 1,
          transition: 'opacity 160ms ease',
        }}
      />
      {shouldShowLoader ? (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'rgba(248, 250, 252, 0.78)',
          }}
        >
          <CircularProgress size={spinnerSize} thickness={4.5} />
        </Box>
      ) : null}
    </Box>
  );
}

function WebProductPreviewImage({ src, alt, isPhoneDialog }: { src: string; alt: string; isPhoneDialog: boolean }) {
  const [loaded, setLoaded] = React.useState(!isRemoteImageUri(src));
  const [failed, setFailed] = React.useState(false);
  const displaySrc = failed ? PRODUCT_IMAGE_PLACEHOLDER_URI : src;
  const shouldShowLoader = isRemoteImageUri(src) && !loaded && !failed;

  React.useEffect(() => {
    setLoaded(!isRemoteImageUri(src));
    setFailed(false);
  }, [src]);

  return (
    <>
      <Box
        component="img"
        src={displaySrc}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          setLoaded(true);
        }}
        sx={{
          maxWidth: '100%',
          maxHeight: isPhoneDialog ? '70vh' : 560,
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          display: 'block',
          opacity: shouldShowLoader ? 0.22 : 1,
          transition: 'opacity 160ms ease',
        }}
      />
      {shouldShowLoader ? (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'rgba(248, 250, 252, 0.72)',
          }}
        >
          <CircularProgress size={30} thickness={4.2} />
        </Box>
      ) : null}
    </>
  );
}


/** Shared by the order editor and the public customer page; no auth/store dependencies. */
export function ProductImageGalleryDialog({ productImagePreview, setProductImagePreview, isPhoneDialog }: {
  productImagePreview: ProductImageGallery | null;
  setProductImagePreview: React.Dispatch<React.SetStateAction<ProductImageGallery | null>>;
  isPhoneDialog: boolean;
}) {
  return (
      <Dialog
        open={!!productImagePreview}
        onClose={() => setProductImagePreview(null)}
        aria-label="Изображение товара"
        maxWidth="md"
        fullWidth
        fullScreen={isPhoneDialog}
      >
        <DialogTitle sx={{ pb: 0.75 }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 900, lineHeight: 1.2 }} noWrap>
                {productImagePreview?.title || 'Изображение товара'}
              </Typography>
              {productImagePreview?.subtitle ? (
                <Typography sx={{ mt: 0.35, fontSize: 11, fontWeight: 700, color: '#64748B' }}>
                  {productImagePreview.subtitle}
                </Typography>
              ) : null}
            </Box>
            <IconButton
              size="small"
              aria-label="Закрыть фото"
              onClick={() => setProductImagePreview(null)}
              sx={{ mt: -0.4, width: 30, height: 30 }}
            >
              <CloseIcon sx={{ fontSize: 19 }} />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: 2, pt: 1.25, bgcolor: '#F8FAFC' }}>
          {productImagePreview ? (
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography sx={{ fontSize: 11, color: '#64748B', fontWeight: 800 }}>
                {productImagePreview.index + 1} из {productImagePreview.images.length}
              </Typography>
              {productImagePreview.images.length > 1 ? (
                <Stack direction="row" spacing={0.75}>
                  <IconButton
                    size="small"
                    aria-label="Предыдущее фото"
                    onClick={() => setProductImagePreview((prev) => prev ? { ...prev, index: Math.max(0, prev.index - 1) } : prev)}
                    disabled={productImagePreview.index <= 0}
                    sx={{ width: 30, height: 30, border: '1px solid #D8E2F0', borderRadius: '8px' }}
                  >
                    <BackIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label="Следующее фото"
                    onClick={() => setProductImagePreview((prev) => prev ? { ...prev, index: Math.min(prev.images.length - 1, prev.index + 1) } : prev)}
                    disabled={productImagePreview.index >= productImagePreview.images.length - 1}
                    sx={{ width: 30, height: 30, border: '1px solid #D8E2F0', borderRadius: '8px' }}
                  >
                    <NextIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Stack>
              ) : null}
            </Stack>
          ) : null}
          <Box
            sx={{
              position: 'relative',
              minHeight: isPhoneDialog ? '62vh' : 460,
              display: 'grid',
              placeItems: 'center',
              bgcolor: '#FFFFFF',
              border: '1px solid #D8E2F0',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            {productImagePreview ? (
              <WebProductPreviewImage
                src={productImagePreview.images[productImagePreview.index]?.previewUrl || PRODUCT_IMAGE_PLACEHOLDER_URI}
                alt={productImagePreview.title}
                key={productImagePreview.images[productImagePreview.index]?.key || productImagePreview.index}
                isPhoneDialog={isPhoneDialog}
              />
            ) : null}
          </Box>
          {productImagePreview?.images.length && productImagePreview.images.length > 1 ? (
            <Stack direction="row" spacing={1} sx={{ mt: 1.25, overflowX: 'auto', pb: 0.25 }}>
              {productImagePreview.images.map((image, index) => (
                <Box
                  key={`preview-thumb-${image.key}`}
                  component="button"
                  type="button"
                  aria-label={`Фото ${index + 1}`}
                  aria-pressed={index === productImagePreview.index}
                  onClick={() => setProductImagePreview((prev) => prev ? { ...prev, index } : prev)}
                  sx={{
                    width: 62,
                    height: 62,
                    flexShrink: 0,
                    p: 0,
                    borderRadius: '10px',
                    border: index === productImagePreview.index ? '2px solid #2563EB' : '1px solid #D8E2F0',
                    bgcolor: '#FFFFFF',
                    overflow: 'hidden',
                    cursor: 'pointer',
                  }}
                >
                  <WebProductImage src={image.thumbUrl} alt="" spinnerSize={14} sx={{ width: '100%', height: '100%' }} />
                </Box>
              ))}
            </Stack>
          ) : null}
        </DialogContent>
      </Dialog>
  );
}
