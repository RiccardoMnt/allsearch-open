import { describe, expect, it, beforeEach } from 'bun:test';
import { getOpportunitiesSummary } from '@/libs/utils/project-analysis/getOpportunitiesSummary';
import { resetOpportunityId, PromptResponseWorkRow } from '@/libs/utils/project-analysis/helpers';
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

function makeSource(overrides: Partial<SourceItem> = {}): SourceItem {
  return {
    isCited: true,
    url: 'https://competitor.com/page',
    cleanUrl: 'competitor.com/page',
    hostname: 'competitor.com',
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

beforeEach(() => {
  resetOpportunityId();
});

describe('getOpportunitiesSummary', () => {
  describe('empty / no-data cases', () => {
    it('returns empty summary when there are no prompt responses', async () => {
      const result = await getOpportunitiesSummary(makeProject(), []);
      expect(result).toEqual({ data: [], totalCount: 0 });
    });
  });

  describe('ProjectSourceNotFound opportunity', () => {
    it('creates an opportunity when no project source appears in any response', async () => {
      const project = makeProject();
      const responses = [
        makeWorkRow({
          sources: [makeSource({ hostname: 'competitor.com', cleanUrl: 'competitor.com/page' })],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'ProjectSourceNotFoundOpportunity');
      expect(opp).toBeDefined();
    });

    it('assigns priority score of 150 per prompt', async () => {
      const project = makeProject();
      const responses = [
        makeWorkRow({
          prompt_id: 'prompt-1',
          sources: [makeSource()],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'ProjectSourceNotFoundOpportunity');
      expect(opp?.priorityScore).toBe(150);
    });

    it('does not create an opportunity when the project source appears in the response', async () => {
      const project = makeProject();
      const responses = [
        makeWorkRow({
          sources: [
              makeSource({ hostname: 'myproject.com', cleanUrl: 'myproject.com/page' }),
            ],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'ProjectSourceNotFoundOpportunity');
      expect(opp).toBeUndefined();
    });

    it('does not create an opportunity when only some responses for the prompt cite the project source', async () => {
      const project = makeProject();
      const responses = [
        // Response with project source — brand IS cited
        makeWorkRow({
          id: 'response-1',
          prompt_id: 'prompt-1',
          sources: [makeSource({ hostname: 'myproject.com', cleanUrl: 'myproject.com/page' })],
        }),
        // Another response for the same prompt — brand NOT cited
        makeWorkRow({
          id: 'response-2',
          prompt_id: 'prompt-1',
          sources: [makeSource({ hostname: 'competitor.com', cleanUrl: 'competitor.com/page' })],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'ProjectSourceNotFoundOpportunity');
      expect(opp).toBeUndefined();
    });

    it('does not create an opportunity when a www subdomain of the project appears in the response', async () => {
      const project = makeProject({ hostname: 'myproject.com' });
      const responses = [
        makeWorkRow({
          sources: [
              makeSource({ hostname: 'www.myproject.com', cleanUrl: 'www.myproject.com/page' }),
            ],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'ProjectSourceNotFoundOpportunity');
      expect(opp).toBeUndefined();
    });

    it('does not create an opportunity when a related international domain of the project appears in the response', async () => {
      const project = makeProject({ hostname: 'myproject.com' });
      const responses = [
        makeWorkRow({
          sources: [
              makeSource({ hostname: 'myproject.co.uk', cleanUrl: 'myproject.co.uk/page' }),
            ],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'ProjectSourceNotFoundOpportunity');
      expect(opp).toBeUndefined();
    });
  });

  describe('ProjectSourceNotCited opportunity', () => {
    it('creates an opportunity when project source is not cited but other sources are cited before it', async () => {
      const project = makeProject();
      const responses = [
        makeWorkRow({
          sources: [
              // Cited competitor source appears before the uncited project source
              makeSource({ isCited: true, hostname: 'competitor.com', cleanUrl: 'competitor.com/page' }),
              makeSource({ isCited: false, hostname: 'myproject.com', cleanUrl: 'myproject.com/page' }),
            ],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'ProjectSourceNotCitedOpportunity');
      expect(opp).toBeDefined();
    });

    it('assigns priority score of 100 per prompt with this issue', async () => {
      const project = makeProject();
      const responses = [
        makeWorkRow({
          sources: [
              makeSource({ isCited: true, hostname: 'competitor.com', cleanUrl: 'competitor.com/page' }),
              makeSource({ isCited: false, hostname: 'myproject.com', cleanUrl: 'myproject.com/page' }),
            ],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'ProjectSourceNotCitedOpportunity');
      expect(opp?.priorityScore).toBe(100);
    });

    it('does not create an opportunity when the project source is the only source', async () => {
      const project = makeProject();
      // Project source is not cited, but there are no cited sources before it
      const responses = [
        makeWorkRow({
          sources: [makeSource({ isCited: false, hostname: 'myproject.com', cleanUrl: 'myproject.com/page' })],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'ProjectSourceNotCitedOpportunity');
      expect(opp).toBeUndefined();
    });
  });

  describe('ProjectSourceNeedsImprovement opportunity', () => {
    it('creates an opportunity when project is cited but not ranked first', async () => {
      const project = makeProject({ id: 'project-brand-id' });
      const responses = [
        makeWorkRow({
          brand_ids_ranking: ['competitor-brand', 'project-brand-id'],
          sources: [
              // Competitor cited first, then project cited
              makeSource({ isCited: true, hostname: 'competitor.com', cleanUrl: 'competitor.com/page' }),
              makeSource({ isCited: true, hostname: 'myproject.com', cleanUrl: 'myproject.com/page' }),
            ],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'ProjectSourceNeedsImprovementOpportunity');
      expect(opp).toBeDefined();
    });

    it('assigns priority score of 70 per prompt with this issue', async () => {
      const project = makeProject({ id: 'project-brand-id' });
      const responses = [
        makeWorkRow({
          brand_ids_ranking: ['competitor-brand', 'project-brand-id'],
          sources: [
              makeSource({ isCited: true, hostname: 'competitor.com', cleanUrl: 'competitor.com/page' }),
              makeSource({ isCited: true, hostname: 'myproject.com', cleanUrl: 'myproject.com/page' }),
            ],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'ProjectSourceNeedsImprovementOpportunity');
      expect(opp?.priorityScore).toBe(70);
    });

    it('does not create an opportunity when project is ranked first', async () => {
      const project = makeProject({ id: 'project-brand-id' });
      const responses = [
        makeWorkRow({
          brand_ids_ranking: ['project-brand-id', 'competitor-brand'],
          sources: [
              makeSource({ isCited: true, hostname: 'myproject.com', cleanUrl: 'myproject.com/page' }),
              makeSource({ isCited: true, hostname: 'competitor.com', cleanUrl: 'competitor.com/page' }),
            ],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'ProjectSourceNeedsImprovementOpportunity');
      expect(opp).toBeUndefined();
    });
  });

  describe('UgcSourceNeedsImprovement opportunity', () => {
    it('creates an opportunity for cited UGC sources when project is not ranked first', async () => {
      const project = makeProject({ id: 'project-brand-id' });
      const responses = [
        makeWorkRow({
          brand_ids_ranking: ['competitor-brand'],
          sources: [
              // reddit.com is a known UGC domain
              makeSource({ isCited: true, hostname: 'reddit.com', cleanUrl: 'reddit.com/r/tools' }),
            ],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'UgcSourceNeedsImprovementOpportunity');
      expect(opp).toBeDefined();
    });

    it('assigns priority score of 50 per UGC opportunity', async () => {
      const project = makeProject({ id: 'project-brand-id' });
      const responses = [
        makeWorkRow({
          brand_ids_ranking: ['competitor-brand'],
          sources: [makeSource({ isCited: true, hostname: 'reddit.com', cleanUrl: 'reddit.com/r/tools' })],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'UgcSourceNeedsImprovementOpportunity');
      expect(opp?.priorityScore).toBe(50);
    });

    it('does not create a UGC opportunity when project is ranked first', async () => {
      const project = makeProject({ id: 'project-brand-id' });
      const responses = [
        makeWorkRow({
          brand_ids_ranking: ['project-brand-id'],
          sources: [makeSource({ isCited: true, hostname: 'reddit.com', cleanUrl: 'reddit.com/r/tools' })],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'UgcSourceNeedsImprovementOpportunity');
      expect(opp).toBeUndefined();
    });

    it('ignores non-UGC sources for UGC opportunities', async () => {
      const project = makeProject({ id: 'project-brand-id' });
      const responses = [
        makeWorkRow({
          brand_ids_ranking: ['competitor-brand'],
          sources: [
              // example.com is not a UGC domain
              makeSource({ isCited: true, hostname: 'example.com', cleanUrl: 'example.com/article' }),
            ],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      const opp = result.data.find((o) => o.type === 'UgcSourceNeedsImprovementOpportunity');
      expect(opp).toBeUndefined();
    });
  });

  describe('sorting and resultMaxLength', () => {
    it('sorts opportunities by priority score descending', async () => {
      const project = makeProject({ id: 'project-brand-id' });
      const responses = [
        // Creates both a ProjectSourceNotFound (150) and a UGC opportunity (50)
        makeWorkRow({
          prompt_id: 'prompt-no-project',
          brand_ids_ranking: ['competitor-brand'],
          sources: [makeSource({ isCited: true, hostname: 'reddit.com', cleanUrl: 'reddit.com/r/tools' })],
        }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      // Verify sorted by priority score descending
      for (let i = 0; i < result.data.length - 1; i++) {
        expect(result.data[i].priorityScore).toBeGreaterThanOrEqual(result.data[i + 1].priorityScore);
      }
    });

    it('respects resultMaxLength to limit returned data', async () => {
      const project = makeProject({ id: 'project-brand-id' });
      // Two prompts with no project sources → 2 opportunities
      const responses = [
        makeWorkRow({ id: 'r1', prompt_id: 'prompt-1', sources: [makeSource()] }),
        makeWorkRow({ id: 'r2', prompt_id: 'prompt-2', sources: [makeSource({ cleanUrl: 'competitor.com/other' })] }),
      ];

      const result = await getOpportunitiesSummary(project, responses, 1);
      expect(result.data).toHaveLength(1);
      expect(result.totalCount).toBe(2);
    });

    it('returns all opportunities when resultMaxLength is not set', async () => {
      const project = makeProject({ id: 'project-brand-id' });
      const responses = [
        makeWorkRow({ id: 'r1', prompt_id: 'prompt-1', sources: [makeSource()] }),
        makeWorkRow({ id: 'r2', prompt_id: 'prompt-2', sources: [makeSource({ cleanUrl: 'competitor.com/other' })] }),
      ];

      const result = await getOpportunitiesSummary(project, responses);
      expect(result.data).toHaveLength(result.totalCount);
    });
  });
});
