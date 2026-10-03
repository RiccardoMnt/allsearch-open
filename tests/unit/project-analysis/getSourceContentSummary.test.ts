import { describe, expect, it } from 'bun:test';
import { getSourceContentSummary } from '@/libs/utils/project-analysis/getSourceContentSummary';
import { PromptResponseWorkRow } from '@/libs/utils/project-analysis/helpers';
import { ProjectRow } from '@/libs/database/Projects/types';
import { SourceItem } from '@/libs/database/Sources/types';
import { ChatbotId } from '@/libs/database/shared/ChatbotId';

function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'project-1',
    url: 'https://myproject.com',
    hostname: 'myproject.com',
    name: 'My Project',
    aliases: [],
    icon_url: null,
    target_location: null,
    collection_schedule: null,
    prompts_updated_at: null,
    is_paused: false,
    is_archived: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSource(
  overrides: Partial<SourceItem> = {}
): SourceItem {
  return {
    isCited: true,
    url: 'https://example.com/page',
    cleanUrl: 'example.com/page',
    hostname: 'example.com',
    ...overrides,
  };
}

function makeWorkRow(overrides: Partial<PromptResponseWorkRow> = {}): PromptResponseWorkRow {
  return {
    id: 'response-1',
    sources: [],
    brand_ids_ranking: [],
    sentiment: null,
    chatbot_id: ChatbotId.ChatGPT,
    prompt_id: 'prompt-1',
    created_at: '2026-01-01T00:00:00.000Z',
    run_id: null,
    key: '2026-01-01-prompt-1-chatgpt',
    created_at_iso_date: '2026-01-01',
    ...overrides,
  };
}

describe('getSourceContentSummary', () => {
  it('returns empty summary when there are no responses', () => {
    const result = getSourceContentSummary(makeProject(), []);
    expect(result).toEqual({ data: [], totalCount: 0 });
  });

  it('aggregates a single source from a single response', () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        sources: [makeSource({ cleanUrl: 'example.com/page', url: 'https://example.com/page' })],
      }),
    ];

    const result = getSourceContentSummary(project, responses);
    expect(result.totalCount).toBe(1);
    expect(result.data).toHaveLength(1);

    const source = result.data[0];
    expect(source.cleanUrl).toBe('example.com/page');
    expect(source.url).toBe('https://example.com/page');
    expect(source.usedCount).toBe(1);
    expect(source.usedPercentage).toBe(100);
    expect(source.citedCount).toBe(1);
    expect(source.citedPercentage).toBe(100);
  });

  it('counts used and cited separately', () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        id: 'r1',
        sources: [makeSource({ isCited: true, cleanUrl: 'example.com/page' })],
      }),
      makeWorkRow({
        id: 'r2',
        sources: [makeSource({ isCited: false, cleanUrl: 'example.com/page' })],
      }),
    ];

    const result = getSourceContentSummary(project, responses);
    expect(result.data[0].usedCount).toBe(2);
    expect(result.data[0].usedPercentage).toBe(100);
    expect(result.data[0].citedCount).toBe(1);
    expect(result.data[0].citedPercentage).toBe(50);
  });

  it('groups sources by cleanUrl across responses', () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        id: 'r1',
        prompt_id: 'prompt-1',
        sources: [makeSource({ cleanUrl: 'example.com/page', isCited: true })],
      }),
      makeWorkRow({
        id: 'r2',
        prompt_id: 'prompt-2',
        sources: [makeSource({ cleanUrl: 'example.com/page', isCited: true })],
      }),
    ];

    const result = getSourceContentSummary(project, responses);
    expect(result.totalCount).toBe(1);
    expect(result.data[0].usedCount).toBe(2);
    expect(result.data[0].usedInPromptIds).toHaveLength(2);
    expect(result.data[0].usedInPromptIds).toContain('prompt-1');
    expect(result.data[0].usedInPromptIds).toContain('prompt-2');
  });

  it('tracks citedInPromptIds separately from usedInPromptIds', () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        id: 'r1',
        prompt_id: 'prompt-1',
        sources: [makeSource({ cleanUrl: 'example.com/page', isCited: true })],
      }),
      makeWorkRow({
        id: 'r2',
        prompt_id: 'prompt-2',
        sources: [makeSource({ cleanUrl: 'example.com/page', isCited: false })],
      }),
    ];

    const result = getSourceContentSummary(project, responses);
    expect(result.data[0].usedInPromptIds).toHaveLength(2);
    expect(result.data[0].citedInPromptIds).toHaveLength(1);
    expect(result.data[0].citedInPromptIds).toContain('prompt-1');
  });

  it('sorts sources by usedCount descending', () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        id: 'r1',
        sources: [
            makeSource({ cleanUrl: 'rarely-used.com/page', hostname: 'rarely-used.com' }),
            makeSource({ cleanUrl: 'often-used.com/page', hostname: 'often-used.com' }),
          ],
      }),
      makeWorkRow({
        id: 'r2',
        sources: [makeSource({ cleanUrl: 'often-used.com/page', hostname: 'often-used.com' })],
      }),
    ];

    const result = getSourceContentSummary(project, responses);
    expect(result.data[0].cleanUrl).toBe('often-used.com/page');
    expect(result.data[1].cleanUrl).toBe('rarely-used.com/page');
  });

  it('respects resultMaxLength', () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        sources: [
            makeSource({ cleanUrl: 'a.com/1', hostname: 'a.com' }),
            makeSource({ cleanUrl: 'b.com/2', hostname: 'b.com' }),
            makeSource({ cleanUrl: 'c.com/3', hostname: 'c.com' }),
          ],
      }),
    ];

    const result = getSourceContentSummary(project, responses, 2);
    expect(result.data).toHaveLength(2);
    expect(result.totalCount).toBe(3);
  });

  it('sets domainCategory to "You" for project hostname', () => {
    const project = makeProject({ hostname: 'myproject.com' });
    const responses = [
      makeWorkRow({
        sources: [makeSource({ cleanUrl: 'myproject.com/page', hostname: 'myproject.com' })],
      }),
    ];

    const result = getSourceContentSummary(project, responses);
    expect(result.data[0].domainCategory).toBe('You');
  });

  it('classifies known domains correctly', () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        sources: [
            makeSource({ cleanUrl: 'reddit.com/r/test', hostname: 'reddit.com' }),
            makeSource({ cleanUrl: 'nytimes.com/article', hostname: 'nytimes.com' }),
            makeSource({ cleanUrl: 'wikipedia.org/wiki/test', hostname: 'wikipedia.org' }),
            makeSource({ cleanUrl: 'unknown.com/page', hostname: 'unknown.com' }),
          ],
      }),
    ];

    const result = getSourceContentSummary(project, responses);
    const byCleanUrl = (url: string) => result.data.find((d) => d.cleanUrl === url)!;
    expect(byCleanUrl('reddit.com/r/test').domainCategory).toBe('UGC');
    expect(byCleanUrl('nytimes.com/article').domainCategory).toBe('Editorial');
    expect(byCleanUrl('wikipedia.org/wiki/test').domainCategory).toBe('Institutional');
    expect(byCleanUrl('unknown.com/page').domainCategory).toBe('Other');
  });

  it('ranks brandIds by citation count descending', () => {
    const project = makeProject({ id: 'project-1' });
    const responses = [
      makeWorkRow({
        id: 'r1',
        sources: [
          makeSource({
            cleanUrl: 'example.com/page',
            brandIdsRanking: ['brand-a', 'brand-b'],
          }),
        ],
      }),
      makeWorkRow({
        id: 'r2',
        sources: [
          makeSource({
            cleanUrl: 'example.com/page',
            brandIdsRanking: ['brand-b', 'brand-a'],
          }),
        ],
      }),
      makeWorkRow({
        id: 'r3',
        sources: [
          makeSource({
            cleanUrl: 'example.com/page',
            brandIdsRanking: ['brand-b'],
          }),
        ],
      }),
    ];

    const result = getSourceContentSummary(project, responses);
    // brand-b appears 3 times, brand-a 2 times
    expect(result.data[0].brandIdsRanking[0]).toBe('brand-b');
    expect(result.data[0].brandIdsRanking[1]).toBe('brand-a');
  });

  it('sets projectIdRank based on project position in brandIdsRanking', () => {
    const project = makeProject({ id: 'project-1' });
    const responses = [
      makeWorkRow({
        id: 'r1',
        sources: [
          makeSource({
            cleanUrl: 'example.com/page',
            brandIdsRanking: ['other-brand', 'project-1'],
          }),
        ],
      }),
    ];

    const result = getSourceContentSummary(project, responses);
    expect(result.data[0].projectIdRank).toBe(1);
  });

  it('sets projectIdRank to -1 when project not in brandIdsRanking', () => {
    const project = makeProject({ id: 'project-1' });
    const responses = [
      makeWorkRow({
        sources: [
          makeSource({
            cleanUrl: 'example.com/page',
            brandIdsRanking: ['other-brand'],
          }),
        ],
      }),
    ];

    const result = getSourceContentSummary(project, responses);
    expect(result.data[0].projectIdRank).toBe(-1);
  });

  it('includes description and headings only when shouldAddDetails is true', () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        sources: [
          makeSource({
            title: 'Test Title',
            description: 'Test description',
            headings: [{ tag: 'h1', text: 'Heading 1' }],
          }),
        ],
      }),
    ];

    const withoutDetails = getSourceContentSummary(project, responses);
    expect(withoutDetails.data[0].title).toBe('Test Title'); // title always included
    expect(withoutDetails.data[0].description).toBeUndefined();
    expect(withoutDetails.data[0].headings).toBeUndefined();

    const withDetails = getSourceContentSummary(project, responses, undefined, true);
    expect(withDetails.data[0].description).toBe('Test description');
    expect(withDetails.data[0].headings).toEqual([{ tag: 'h1', text: 'Heading 1' }]);
  });

  it('uses createdAt from the first response containing the source', () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        id: 'r1',
        created_at: '2026-01-15T00:00:00.000Z',
        sources: [makeSource({ cleanUrl: 'example.com/page' })],
      }),
      makeWorkRow({
        id: 'r2',
        created_at: '2026-01-20T00:00:00.000Z',
        sources: [makeSource({ cleanUrl: 'example.com/page' })],
      }),
    ];

    const result = getSourceContentSummary(project, responses);
    expect(result.data[0].createdAt).toBe('2026-01-15T00:00:00.000Z');
  });

  it('deduplicates prompt ids in usedInPromptIds for same prompt across responses', () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        id: 'r1',
        prompt_id: 'prompt-1',
        chatbot_id: ChatbotId.ChatGPT,
        sources: [makeSource({ cleanUrl: 'example.com/page' })],
      }),
      makeWorkRow({
        id: 'r2',
        prompt_id: 'prompt-1',
        chatbot_id: ChatbotId.Perplexity,
        sources: [makeSource({ cleanUrl: 'example.com/page' })],
      }),
    ];

    const result = getSourceContentSummary(project, responses);
    // Same prompt_id used twice, but should only appear once in the set
    expect(result.data[0].usedInPromptIds).toHaveLength(1);
    expect(result.data[0].usedCount).toBe(2);
  });
});
