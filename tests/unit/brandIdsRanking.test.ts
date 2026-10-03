import { describe, expect, it } from 'bun:test';
import { CompetitorRow } from '@/libs/database/Competitors/types';
import { ProjectRow } from '@/libs/database/Projects/types';
import { getBrandIdsRankingsInText } from '@/libs/utils/brandIdsRanking';

function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'project-1',
    url: 'https://electric.com',
    hostname: 'electric.com',
    name: 'Electric',
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

function makeCompetitor(overrides: Partial<CompetitorRow> = {}): CompetitorRow {
  return {
    id: 'competitor-1',
    url: 'https://voltage.com',
    hostname: 'voltage.com',
    name: 'Voltage',
    aliases: [],
    icon_url: null,
    project_id: 'project-1',
    is_archived: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('getBrandIdsRankingsInText', () => {
  it('matches full words and does not match partial words', () => {
    const project = makeProject();
    const text = 'The electrician showed up early.';

    const rankings = getBrandIdsRankingsInText(text, project, []);

    expect(rankings).toEqual([]);
  });

  it('ranks by first full-word occurrence across project and competitors', () => {
    const project = makeProject();
    const competitor = makeCompetitor();
    const text = 'Voltage is rising. Electric follows.';

    const rankings = getBrandIdsRankingsInText(text, project, [competitor]);

    expect(rankings).toEqual([competitor.id, project.id]);
  });

  it('matches values separated by punctuation boundaries', () => {
    const project = makeProject();
    const text = 'Best choice: Electric, every time.';

    const rankings = getBrandIdsRankingsInText(text, project, []);

    expect(rankings).toEqual([project.id]);
  });

  it('matches project and competitor name variations generated from spaced names', () => {
    const project = makeProject({
      id: 'project-spaced',
      name: 'Acme Power',
      aliases: ['A.P.'],
      hostname: 'acmepower.com',
    });
    const competitor = makeCompetitor({
      id: 'competitor-spaced',
      name: 'Volt Labs',
      aliases: ['Volt_Labs'],
      hostname: 'voltlabs.ai',
    });
    const text =
      'We compared volt-labs and then moved to acmepower for production. Later, A P was mentioned too.';

    const rankings = getBrandIdsRankingsInText(text, project, [competitor]);

    expect(rankings).toEqual([competitor.id, project.id]);
  });

  it('matches dot and underscore variations as full words', () => {
    const project = makeProject({
      id: 'project-dot',
      name: 'A.B Test',
      aliases: [],
      hostname: 'abtest.com',
    });
    const competitor = makeCompetitor({
      id: 'competitor-underscore',
      name: 'Data Flow',
      aliases: [],
      hostname: 'dataflow.io',
    });
    const text = 'Our stack includes data_flow and A.B Test tooling.';

    const rankings = getBrandIdsRankingsInText(text, project, [competitor]);

    expect(rankings).toEqual([competitor.id, project.id]);
  });
});
