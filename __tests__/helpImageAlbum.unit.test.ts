import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
jest.mock('../src/features/help/components/HelpMedia', () => ({ HelpImage: 'HelpImage' }));
import { HelpImageAlbum } from '../src/features/help/components/HelpImageAlbum';
import type { HelpAttachment } from '../src/features/help/helpApi';

const photos = [ { width: 600, height: 1000 }, { width: 1600, height: 900 }, {} ].map((size, i) => ({ id: `photo-${i}`, name: `${i}.jpg`, kind: 'IMAGE', mimeType: 'image/jpeg', size: 123, url: '', ...size } as HelpAttachment));
let screen: TestRenderer.ReactTestRenderer;
afterEach(async () => { if (screen) await act(async () => screen.unmount()); });
test('album keeps attachment order, reports the tapped tile origin, and forwards long press', async () => {
  const onImage = jest.fn(), onLongPress = jest.fn();
  await act(async () => { screen = TestRenderer.create(React.createElement(HelpImageAlbum, { attachments: photos, availableWidth: 310, resolve: jest.fn(), onImage, onLongPress }), { createNodeMock: node => node.props.testID?.startsWith('help-album-image-') ? { measureInWindow: (done: Function) => done(30, 40, 120, 140) } : null }); });
  screen.root.findAll(node => jest.isMockFunction(node.instance?.measureInWindow)).forEach(node => node.instance.measureInWindow.mockImplementation((done: Function) => done(30, 40, 120, 140)));
  const tile = screen.root.findAll(node => node.props.testID === 'help-album-image-1')[0];
  await act(async () => { tile.props.onPress(); tile.props.onLongPress(); });
  expect(onImage).toHaveBeenCalledWith(1, { x: 30, y: 40, width: 120, height: 140 }); expect(onLongPress).toHaveBeenCalledTimes(1);
  const rendered = screen.root.findAll(node => node.type === 'HelpImage' as any);
  expect(rendered.map(node => node.props.attachment.id)).toEqual(photos.map(photo => photo.id));
  expect(rendered.every(node => node.props.onAspectRatio === undefined)).toBe(true);
  expect(rendered.every(node => node.props.resizeMode === 'cover')).toBe(true);
});
test('all ten photos have distinct accessible targets; narrow layout remains inside its supplied width', async () => {
  const attachments = Array.from({ length: 10 }, (_, i) => ({ ...photos[i % 3], id: `photo-${i}` }));
  await act(async () => { screen = TestRenderer.create(React.createElement(HelpImageAlbum, { attachments, availableWidth: 180, resolve: jest.fn(), onImage: jest.fn(), onLongPress: jest.fn() })); });
  const images = screen.root.findAll(node => node.type === 'HelpImage' as any);
  expect(images).toHaveLength(10);
  expect(screen.root.findAll(node => node.props.testID === 'help-image-album')[0].props.style.width).toBe(180);
  for (let i = 0; i < 10; i++) expect(screen.root.findAll(node => node.props.testID === `help-album-image-${i}`)[0].props.accessibilityLabel).toBe(`Открыть изображение ${i + 1} из 10`);
});


test('single portrait keeps contain rendering and resizes only with explicit column bounds', async () => {
  const attachment = {...photos[0], width:1080, height:2400};
  const props = {attachments:[attachment],availableWidth:310,maxHeight:511.5,resolve:jest.fn(),onImage:jest.fn(),onLongPress:jest.fn()};
  await act(async()=>{screen=TestRenderer.create(React.createElement(HelpImageAlbum,props));});
  const frame=()=>screen.root.findAll(node=>node.props.testID==='help-image-album')[0].props.style;
  const phone=frame();
  expect(phone.width/phone.height).toBeCloseTo(1080/2400);
  const image=screen.root.findAll(node=>node.type==='HelpImage' as any)[0];
  expect(image.props.resizeMode).toBe('contain');expect(image.props.onAspectRatio).toBeUndefined();
  await act(async()=>{screen.update(React.createElement(HelpImageAlbum,{...props,attachments:[{...attachment}],onImage:jest.fn()}));});
  expect(frame()).toEqual(phone);
  await act(async()=>{screen.update(React.createElement(HelpImageAlbum,{...props,availableWidth:640,maxHeight:760}));});
  expect(frame().width).toBeGreaterThan(phone.width);expect(frame().height).toBe(760);
  expect(frame().width/frame().height).toBeCloseTo(1080/2400);
});
