import { Image, Platform } from 'react-native';
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

// RN-web Image has no resolveAssetSource. Keep web originals local too, with
// explicit intrinsic dimensions so image decoding cannot change row geometry.
function webIllustration(width:number,height:number,index:number){
  const colors=['#A8C4DD','#C9B9D9','#AED1C1','#DCC3A5'];
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 720 1080"><rect width="720" height="1080" fill="${colors[index%colors.length]}"/><path d="M0 800H720V1080H0Z" fill="#D8DEE8"/><rect x="90" y="170" width="320" height="390" rx="16" fill="#F4F7FA"/><path d="M250 170V560M90 365H410" stroke="#9AAFC2" stroke-width="12"/><rect x="110" y="710" width="500" height="45" rx="12" fill="#7188A0"/><path d="M150 755V960M570 755V960" stroke="#7188A0" stroke-width="25"/><text x="360" y="1025" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#34495E">QA ${index+1}</text></svg>`)}`;
}

export function createFixtureAlbum(ticketId: number, sequence: number, count: number): HelpAttachment[] {
  const size = Number.isFinite(count) ? Math.max(2, Math.min(10, Math.trunc(count))) : 6;
  return Array.from({ length: size }, (_, index) => {
    const [width, height] = sizes[index];
    const web=Platform.OS==='web';
    return { id: `qa-album-${ticketId}-${sequence}-${index}`, name: `Комната ${index + 1}.${web?'svg':'png'}`, mimeType: web?'image/svg+xml':'image/png', kind: 'IMAGE', size: 0, url: web?webIllustration(width,height,index):Image.resolveAssetSource(assets[index]).uri, width, height, thumbnailDataUri: `data:image/png;base64,${previews[index % previews.length]}`, position: index };
  });
}
