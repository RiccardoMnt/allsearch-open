import { RouteHelper } from '@/libs/routes';

type Tab = {
  id: string;
  label: string;
  getRoute: (projectId: string) => string;
};

export const SETTINGS_TABS: Tab[] = [
  {
    id: 'competitors',
    label: 'Competitors',
    getRoute: (projectId: string) => RouteHelper.Project.Settings.getCompetitors(projectId),
  },
  {
    id: 'brand',
    label: 'Brand',
    getRoute: (projectId: string) => RouteHelper.Project.Settings.getBrand(projectId),
  },
  {
    id: 'organization',
    label: 'Organization',
    getRoute: (projectId: string) => RouteHelper.Project.Settings.getOrganization(projectId),
  },
  {
    id: 'schedule',
    label: 'Schedule',
    getRoute: (projectId: string) => RouteHelper.Project.Settings.getSchedule(projectId),
  },
  {
    id: 'others',
    label: 'Others',
    getRoute: (projectId: string) => RouteHelper.Project.Settings.getOthers(projectId),
  },
];

type Competitor = {
  name: string | null | undefined;
  url: string;
};

export const isDuplicateUrl = (url: string, items: Competitor[]) =>
  items.some((item) => item.url === url);

export const isDuplicateName = (name: string, items: Competitor[]) =>
  !!name && items.some((item) => item.name === name);

export const isCompetitorUnique = (
  competitors: Competitor[],
  name: string | null | undefined,
  url: string
) =>
  !competitors.some((competitor) => (!!name && competitor.name === name) || competitor.url === url);
