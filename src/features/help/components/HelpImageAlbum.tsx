import React, { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { HelpAttachment } from '../helpApi';
import { helpAlbumLayout } from '../helpAlbumLayout';
import { HelpImage, type HelpImageOrigin, type ResolveHelpMedia } from './HelpMedia';

export type HelpImageAlbumProps = {
  attachments: HelpAttachment[];
  resolve: ResolveHelpMedia;
  availableWidth: number;
  onImage: (index: number, origin?: HelpImageOrigin) => void;
  onLongPress: () => void;
};

export function HelpImageAlbum({ attachments, resolve, availableWidth, onImage, onLongPress }: HelpImageAlbumProps) {
  const refs = useRef(new Map<string, View>());
  const images = attachments.slice(0, 10);
  const signature = images.map(item => `${item.width}:${item.height}`).join('|');
  // Unknown legacy dimensions keep the reserved square estimate for this view.
  // Loading image pixels must never resize a message under the reader's finger.
  const layout = useMemo(() => helpAlbumLayout(images, availableWidth), [signature, availableWidth]);
  return <View testID="help-image-album" style={{ width: layout.width, height: layout.height, position: 'relative', overflow: 'hidden' }}>
    {layout.items.map(tile => {
      const attachment = images[tile.index];
      return <Pressable key={attachment.id} ref={ref => { if (ref) refs.current.set(attachment.id, ref); else refs.current.delete(attachment.id); }}
        testID={`help-album-image-${tile.index}`} accessibilityRole="button" accessibilityLabel={`Открыть изображение ${tile.index + 1} из ${images.length}`}
        onLongPress={onLongPress} delayLongPress={500}
        onPress={() => {
          const ref = refs.current.get(attachment.id);
          if (!ref) { onImage(tile.index); return; }
          ref.measureInWindow((x, y, width, height) => onImage(tile.index, width > 0 && height > 0 ? { x, y, width, height } : undefined));
        }}
        style={{ position: 'absolute', left: tile.x, top: tile.y, width: tile.width, height: tile.height, overflow: 'hidden' }}>
        <HelpImage attachment={attachment} resolve={resolve} resizeMode={images.length === 1 ? 'contain' : 'cover'} style={StyleSheet.absoluteFill} />
      </Pressable>;
    })}
  </View>;
}
