import {
  columnOrderingFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  tableFeatures,
} from '@tanstack/react-table';

// Keep the feature registry stable; v9 includes the core row model by default.
export const draftTableFeatures = tableFeatures({
  columnOrderingFeature,
  columnSizingFeature,
  columnResizingFeature,
  columnVisibilityFeature,
});
