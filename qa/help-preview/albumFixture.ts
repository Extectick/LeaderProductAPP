import { Image } from 'react-native';
import type { HelpAttachment } from '../../src/features/help/helpApi';

// Synthetic local illustrations and 8×8 PNG previews. No network or user media.
const assets = [
  require('./assets/albums/room-01.png'), require('./assets/albums/room-02.png'),
  require('./assets/albums/room-03.png'), require('./assets/albums/room-04.png'),
  require('./assets/albums/room-05.png'), require('./assets/albums/room-06.png'),
  require('./assets/albums/room-07.png'), require('./assets/albums/room-08.png'),
  require('./assets/albums/room-09.png'), require('./assets/albums/room-10.png'),
];
const previews = [
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAJElEQVR4nGPY3Bq3uTXu8tx8NMRAD4m6WKe6WKcpeX5oiHQJAA+ZZk1s+gD0AAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAJElEQVR4nGOI626K627KXzwTDTHQQ8IpMdopMdqvKBsNkS4BAEvDWzPaJd4JAAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAJElEQVR4nGOoappb1TS3f+ZONMRAD4nQ6LzQ6LyU7CY0RLoEACV0Zr+BkRrmAAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAJElEQVR4nGNYVN6wqLxhX880NMRAD4nC4MjC4MjWpEw0RLoEACO1ZolUZ1QMAAAAAElFTkSuQmCC',
];
const sizes = [[720, 1080], [1440, 810], [960, 960], [1280, 960], [640, 1120], [1600, 800], [800, 1000], [1440, 960], [960, 960], [700, 1080]];

export function createFixtureAlbum(ticketId: number, sequence: number, count: number): HelpAttachment[] {
  const size = Number.isFinite(count) ? Math.max(2, Math.min(10, Math.trunc(count))) : 6;
  return Array.from({ length: size }, (_, index) => {
    const [width, height] = sizes[index];
    return { id: `qa-album-${ticketId}-${sequence}-${index}`, name: `Комната ${index + 1}.png`, mimeType: 'image/png', kind: 'IMAGE', size: 0, url: Image.resolveAssetSource(assets[index]).uri, width, height, thumbnailDataUri: `data:image/png;base64,${previews[index % previews.length]}`, position: index };
  });
}
