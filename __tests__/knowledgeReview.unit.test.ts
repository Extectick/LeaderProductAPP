import { canPublish, sourceReady, textBlocks } from '../src/features/knowledge/model';
import { createKnowledgeFixture } from '../qa/knowledge-preview/fixture';

describe('knowledge review publication boundaries', () => {
  it('allows only current, readable company text from a fresh source', async () => {
    const client = createKnowledgeFixture();
    const source = (await client.sources())[0];
    const document = (await client.documents({ view: 'pending' })).documents[0];
    const preview = await client.preview(document.id, document.currentRevision);
    expect(canPublish(preview, source)).toBe(true);
    expect(canPublish({ ...preview, version: { ...preview.version, revision: 1 } }, source)).toBe(false);
    expect(canPublish({ ...preview, version: { ...preview.version, text: ' \n ' } }, source)).toBe(false);
    expect(canPublish({ ...preview, version: { ...preview.version, status: 'PROCESSING' } }, source)).toBe(false);
    for (const section of ['AI_WORKSPACE', 'ARCHIVE'] as const) {
      expect(canPublish({ ...preview, document: { ...document, section } }, source)).toBe(false);
    }
    expect(canPublish({ ...preview, document: { ...document, deletedAt: new Date().toISOString() } }, source)).toBe(false);
    expect(canPublish(preview, { ...source, lastErrorCode: 'DAV_UNAVAILABLE' })).toBe(false);
    expect(canPublish(preview, { ...source, enabled: false })).toBe(false);
    expect(sourceReady({ ...source, lastSuccessAt: new Date(Date.now() - 601000).toISOString() })).toBe(false);
  });
  it('renders long text without dropping characters or splitting an emoji pair', () => {
    const text = 'Я'.repeat(2999) + '😀' + '\nСледующая строка\n'.repeat(600);
    const blocks = textBlocks(text);
    expect(blocks.join('')).toBe(text);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every(block => !/[\uD800-\uDBFF]$/.test(block))).toBe(true);
  });
});
