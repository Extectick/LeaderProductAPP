import React from 'react';
import { Box, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import BackIcon from '@mui/icons-material/ChevronLeft';
import NextIcon from '@mui/icons-material/ChevronRight';
import { useGalleryHistory } from '../hooks/useGalleryHistory';

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

/** Shared application viewer: fullscreen, dark stage, original aspect ratio. */
export function ProductImageGalleryDialog({ productImagePreview, setProductImagePreview, isPhoneDialog }: {
  productImagePreview: ProductImageGallery | null;
  setProductImagePreview: React.Dispatch<React.SetStateAction<ProductImageGallery | null>>;
  isPhoneDialog: boolean;
}) {
  const images = productImagePreview?.images || [];
  const index = Math.min(Math.max(productImagePreview?.index || 0, 0), Math.max(images.length - 1, 0));
  const active = images[index];
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setLoaded(false); setFailed(false); }, [active?.previewUrl]);
  const close = useGalleryHistory(!!productImagePreview, () => setProductImagePreview(null));
  const move = (delta: number) => setProductImagePreview(prev => prev ? {
    ...prev, index: Math.max(0, Math.min(prev.images.length - 1, prev.index + delta)),
  } : prev);
  return <Dialog open={!!productImagePreview} onClose={close} fullScreen aria-label="Изображение товара"
    onKeyDown={event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    }}
    PaperProps={{ sx: { bgcolor: '#0B1220', color: '#fff', borderRadius: 0 } }}>
    <DialogTitle sx={{ p: isPhoneDialog ? 1.5 : 2, pt: 'max(12px, env(safe-area-inset-top))', flexShrink: 0 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: 'rgba(15,23,42,.82)' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography title={productImagePreview?.title} sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }} noWrap>{productImagePreview?.title}</Typography>
          {productImagePreview?.subtitle ? <Typography sx={{ fontSize: 12, color: '#CBD5E1' }}>{productImagePreview.subtitle}</Typography> : null}
        </Box>
        {images.length > 1 ? <Typography sx={{ color: '#CBD5E1', fontSize: 12 }}>{index + 1}/{images.length}</Typography> : null}
        <IconButton aria-label="Закрыть фото" onClick={close} sx={{ color: '#fff', width: 44, height: 44, bgcolor: 'rgba(255,255,255,.12)', borderRadius: 1.5 }}><CloseIcon /></IconButton>
      </Stack>
    </DialogTitle>
    <DialogContent sx={{ position: 'relative', p: 0, minHeight: 0, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {active ? <Box component="img" key={active.key} src={failed ? PRODUCT_IMAGE_PLACEHOLDER_URI : active.previewUrl}
        alt={productImagePreview?.title || 'Изображение товара'} onLoad={() => setLoaded(true)}
        onError={() => { setFailed(true); setLoaded(true); }}
        sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', opacity: loaded ? 1 : 0 }} /> : null}
      {active && !loaded ? <CircularProgress aria-label="Загрузка фото" sx={{ position: 'absolute', color: '#fff' }} /> : null}
      {images.length > 1 ? <>
        <IconButton aria-label="Предыдущее фото" disabled={index === 0} onClick={() => move(-1)}
          sx={{ position: 'absolute', left: 12, color: '#fff', bgcolor: 'rgba(15,23,42,.8)', '&.Mui-disabled': { color: '#64748B' }, width: 44, height: 44 }}><BackIcon /></IconButton>
        <IconButton aria-label="Следующее фото" disabled={index === images.length - 1} onClick={() => move(1)}
          sx={{ position: 'absolute', right: 12, color: '#fff', bgcolor: 'rgba(15,23,42,.8)', '&.Mui-disabled': { color: '#64748B' }, width: 44, height: 44 }}><NextIcon /></IconButton>
      </> : null}
    </DialogContent>
    {images.length > 1 ? <Stack direction="row" spacing={1} sx={{ flexShrink: 0, overflowX: 'auto', p: 1.5, pb: 'max(12px, env(safe-area-inset-bottom))' }}>
      {images.map((image, nextIndex) => <Box component="button" type="button" key={image.key} aria-label={`Фото ${nextIndex + 1}`}
        aria-pressed={nextIndex === index} onClick={() => setProductImagePreview(prev => prev ? { ...prev, index: nextIndex } : prev)}
        sx={{ width: 54, height: 54, flexShrink: 0, p: 0, overflow: 'hidden', borderRadius: 1.25, border: nextIndex === index ? '2px solid #2563EB' : '1px solid #64748B', cursor: 'pointer' }}>
        <WebProductImage src={image.thumbUrl} alt="" sx={{ width: '100%', height: '100%' }} />
      </Box>)}
    </Stack> : <Box sx={{ height: 'env(safe-area-inset-bottom)', flexShrink: 0 }} />}
  </Dialog>;
}
