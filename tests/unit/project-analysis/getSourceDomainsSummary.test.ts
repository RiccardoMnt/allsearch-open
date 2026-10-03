import { describe, expect, it } from 'bun:test';
import { getSourceDomainsSummary } from '@/libs/utils/project-analysis/getSourceDomainsSummary';
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

describe('getSourceDomainsSummary', () => {
  it('returns empty summary when there are no responses', async () => {
    const result = await getSourceDomainsSummary(makeProject(), []);
    expect(result).toEqual({ data: [], totalCount: 0 });
  });

  it('counts a single domain from a single response', async () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        sources: [makeSource({ hostname: 'example.com', isCited: true })],
      }),
    ];

    const result = await getSourceDomainsSummary(project, responses);
    expect(result.totalCount).toBe(1);
    expect(result.data[0].hostname).toBe('example.com');
    expect(result.data[0].usedCount).toBe(1);
    expect(result.data[0].usedPercentage).toBe(100);
    expect(result.data[0].citedCount).toBe(1);
    expect(result.data[0].citedPercentage).toBe(100);
  });

  it('does not count the same domain multiple times within a single response', async () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        sources: [
            makeSource({ hostname: 'example.com', cleanUrl: 'example.com/page-1', isCited: true }),
            makeSource({ hostname: 'example.com', cleanUrl: 'example.com/page-2', isCited: true }),
          ],
      }),
    ];

    const result = await getSourceDomainsSummary(project, responses);
    expect(result.data[0].usedCount).toBe(1);
    // citedCount uses the first source's isCited for the domain in this response
    expect(result.data[0].citedCount).toBe(1);
  });

  it('counts domains across multiple responses', async () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        id: 'r1',
        sources: [makeSource({ hostname: 'example.com', isCited: true })],
      }),
      makeWorkRow({
        id: 'r2',
        sources: [makeSource({ hostname: 'example.com', isCited: false })],
      }),
    ];

    const result = await getSourceDomainsSummary(project, responses);
    expect(result.data[0].usedCount).toBe(2);
    expect(result.data[0].citedCount).toBe(1);
    expect(result.data[0].usedPercentage).toBe(100);
    // citedPercentage is relative to usedCount, not responsesCount
    expect(result.data[0].citedPercentage).toBe(50);
  });

  it('sorts domains by usedCount descending', async () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        id: 'r1',
        sources: [
            makeSource({ hostname: 'rare.com', cleanUrl: 'rare.com/page' }),
            makeSource({ hostname: 'common.com', cleanUrl: 'common.com/page' }),
          ],
      }),
      makeWorkRow({
        id: 'r2',
        sources: [makeSource({ hostname: 'common.com', cleanUrl: 'common.com/page2' })],
      }),
    ];

    const result = await getSourceDomainsSummary(project, responses);
    expect(result.data[0].hostname).toBe('common.com');
    expect(result.data[1].hostname).toBe('rare.com');
  });

  it('respects resultMaxLength', async () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        sources: [
            makeSource({ hostname: 'a.com', cleanUrl: 'a.com/page' }),
            makeSource({ hostname: 'b.com', cleanUrl: 'b.com/page' }),
            makeSource({ hostname: 'c.com', cleanUrl: 'c.com/page' }),
          ],
      }),
    ];

    const result = await getSourceDomainsSummary(project, responses, 2);
    expect(result.data).toHaveLength(2);
    expect(result.totalCount).toBe(3);
  });

  it('sets domainCategory to "You" for the project hostname', async () => {
    const project = makeProject({ hostname: 'myproject.com' });
    const responses = [
      makeWorkRow({
        sources: [makeSource({ hostname: 'myproject.com', cleanUrl: 'myproject.com/page' })],
      }),
    ];

    const result = await getSourceDomainsSummary(project, responses);
    expect(result.data[0].domainCategory).toBe('You');
  });

  it('classifies known domain categories correctly', async () => {
    const project = makeProject();
    const responses = [
      makeWorkRow({
        sources: [
            makeSource({ hostname: 'reddit.com', cleanUrl: 'reddit.com/r/test' }),
            makeSource({ hostname: 'nytimes.com', cleanUrl: 'nytimes.com/article' }),
            makeSource({ hostname: 'wikipedia.org', cleanUrl: 'wikipedia.org/wiki/test' }),
            makeSource({ hostname: 'unknown.com', cleanUrl: 'unknown.com/page' }),
          ],
      }),
    ];

    const result = await getSourceDomainsSummary(project, responses);
    const byHostname = (h: string) => result.data.find((d) => d.hostname === h)!;
    expect(byHostname('reddit.com').domainCategory).toBe('UGC');
    expect(byHostname('nytimes.com').domainCategory).toBe('Editorial');
    expect(byHostname('wikipedia.org').domainCategory).toBe('Institutional');
    expect(byHostname('unknown.com').domainCategory).toBe('Other');
  });

  it('calculates citedPercentage relative to usedCount', async () => {
    const project = makeProject();
    // Domain appears in 3 responses but cited in only 1
    const responses = [
      makeWorkRow({
        id: 'r1',
        sources: [makeSource({ hostname: 'example.com', isCited: true })],
      }),
      makeWorkRow({
        id: 'r2',
        sources: [makeSource({ hostname: 'example.com', isCited: false })],
      }),
      makeWorkRow({
        id: 'r3',
        sources: [makeSource({ hostname: 'example.com', isCited: false })],
      }),
    ];

    const result = await getSourceDomainsSummary(project, responses);
    expect(result.data[0].citedPercentage).toBe(33); // Math.round(1/3 * 100)
  });

  it('calculates usedPercentage relative to total responses count', async () => {
    const project = makeProject();
    // 3 responses total, domain appears in 2
    const responses = [
      makeWorkRow({
        id: 'r1',
        sources: [makeSource({ hostname: 'example.com' })],
      }),
      makeWorkRow({
        id: 'r2',
        sources: [makeSource({ hostname: 'example.com' })],
      }),
      makeWorkRow({
        id: 'r3',
        sources: [makeSource({ hostname: 'other.com', cleanUrl: 'other.com/page' })],
      }),
    ];

    const result = await getSourceDomainsSummary(project, responses);
    const exampleDomain = result.data.find((d) => d.hostname === 'example.com')!;
    expect(exampleDomain.usedPercentage).toBe(67); // Math.round(2/3 * 100)
  });
});
