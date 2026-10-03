'use client';

import { NativeSelect } from '@/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BrandSettings from './BrandSettings';
import OrganizationSettingsForm from '@/components/settings/OrganizationSettingsForm';
import { useRouter } from 'next/navigation';
import { SETTINGS_TABS } from './helpers';
import CompetitorsSettings from './CompetitorsSettings';
import Others from './Others';
import CollectionScheduleSettings from './CollectionScheduleSettings';

export default function Settings({
  projectId,
  selectedSettingsTabId,
  enabledChatbotCount,
}: {
  projectId: string;
  selectedSettingsTabId: string;
  enabledChatbotCount: number;
}) {
  const router = useRouter();

  const settingsTabs = SETTINGS_TABS;

  const onSelectionChange = (tabId: string) => {
    const tab = settingsTabs.find((tab) => tab.id === tabId);
    if (tab) router.push(tab.getRoute(projectId));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs */}
      <section>
        <NativeSelect
          aria-label="Settings tabs"
          className="md:hidden"
          value={selectedSettingsTabId}
          onChange={(event) => onSelectionChange(event.target.value)}
        >
          {settingsTabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label}
            </option>
          ))}
        </NativeSelect>

        <div className="scrollbar-hide -mx-4 -my-1 flex overflow-auto px-4 py-1 lg:-mx-8 lg:px-8">
          <Tabs
            className="hidden md:flex xl:w-full"
            value={selectedSettingsTabId}
            onValueChange={onSelectionChange}
          >
            <TabsList className="border-border w-full justify-start border">
              {settingsTabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="flex-none px-3">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </section>

      {/* Content */}
      <section>
        {selectedSettingsTabId === 'competitors' && <CompetitorsSettings />}
        {selectedSettingsTabId === 'brand' && <BrandSettings />}
        {selectedSettingsTabId === 'organization' && <OrganizationSettingsForm />}
        {selectedSettingsTabId === 'schedule' && (
          <CollectionScheduleSettings enabledChatbotCount={enabledChatbotCount} />
        )}
        {selectedSettingsTabId === 'others' && <Others />}
      </section>
    </div>
  );
}
