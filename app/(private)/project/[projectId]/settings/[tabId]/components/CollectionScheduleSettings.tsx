'use client';

import { useState, useTransition } from 'react';
import { useSWRConfig } from 'swr';
import useSWRMutation from 'swr/mutation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import SettingsFormHeader from '@/components/settings/SettingsFormHeader';
import SettingsSectionLabel from '@/app/(private)/settings/components/SettingsSectionLabel';
import { usePrivateLayoutContext } from '@/app/(private)/components/PrivateLayoutContext';
import { showErrorAlertToast, showSuccessAlertToast } from '@/components/Alerts';
import { appFetch } from '@/hooks/appFetch';
import { RouteHelper } from '@/libs/routes';
import type { ProjectRow } from '@/libs/database/Projects/types';
import {
  MAX_CUSTOM_EVERY_DAYS,
  MAX_MONTH_DAY,
  MIN_CUSTOM_EVERY_DAYS,
  WEEKDAY_LABELS,
  getNextCollectionScheduleRunAt,
  type CollectionSchedule,
  type CollectionScheduleFrequency,
} from '@/libs/collection/schedule';

type Frequency = CollectionScheduleFrequency | 'manual';

const FREQUENCY_OPTIONS: { value: Frequency; title: string; description: string }[] = [
  { value: 'manual', title: 'Manual', description: 'Only when you press Run.' },
  { value: 'daily', title: 'Daily', description: 'Once every day.' },
  { value: 'weekly', title: 'Weekly', description: 'Once on a chosen day.' },
  { value: 'monthly', title: 'Monthly', description: 'Once on a chosen date.' },
  { value: 'custom', title: 'Custom', description: 'Once every few days.' },
];

const formatDateTime = (value: Date | string | null | undefined) =>
  value ? new Date(value).toLocaleString() : 'Never';

/** The schedule the form currently describes. `undefined` while the custom day count is invalid. */
function toSchedule(
  frequency: Frequency,
  day: number,
  everyDays: string
): CollectionSchedule | null | undefined {
  switch (frequency) {
    case 'manual':
      return null;
    case 'daily':
      return { frequency: 'daily' };
    case 'weekly':
      return { frequency: 'weekly', weekday: day };
    case 'monthly':
      return { frequency: 'monthly', monthDay: day };
    case 'custom': {
      const days = Number(everyDays);
      const isValid =
        Number.isInteger(days) && days >= MIN_CUSTOM_EVERY_DAYS && days <= MAX_CUSTOM_EVERY_DAYS;
      return isValid ? { frequency: 'custom', everyDays: days } : undefined;
    }
  }
}

export default function CollectionScheduleSettings({
  enabledChatbotCount,
}: {
  enabledChatbotCount: number;
}) {
  const { currentProject } = usePrivateLayoutContext();
  if (!currentProject) return null;
  // Keyed so switching Project resets the form to that Project's schedule.
  return (
    <CollectionScheduleForm
      key={currentProject.id}
      project={currentProject}
      enabledChatbotCount={enabledChatbotCount}
    />
  );
}

function CollectionScheduleForm({
  project,
  enabledChatbotCount,
}: {
  project: ProjectRow;
  enabledChatbotCount: number;
}) {
  const { projects, setProjects, setCurrentProject, currentPrompts } = usePrivateLayoutContext();
  const { mutate: mutateGlobal } = useSWRConfig();
  const stored = project.collection_schedule;
  const [frequency, setFrequency] = useState<Frequency>(stored?.frequency ?? 'manual');
  const [day, setDay] = useState(
    stored?.frequency === 'weekly'
      ? stored.weekday
      : stored?.frequency === 'monthly'
        ? stored.monthDay
        : 1
  );
  const [everyDays, setEveryDays] = useState(
    String(stored?.frequency === 'custom' ? stored.everyDays : 3)
  );
  const [isSaving, startSaving] = useTransition();

  const schedule = toSchedule(frequency, day, everyDays);

  const [now] = useState(() => new Date());
  const nextRunAt = schedule
    ? getNextCollectionScheduleRunAt(
        schedule,
        project.prompts_updated_at ? new Date(project.prompts_updated_at) : null,
        now
      )
    : undefined;

  // Each Run asks every Prompt on every enabled Chatbot, so this is what it costs.
  const promptCount = currentPrompts.length;
  const callsPerRun = promptCount * enabledChatbotCount;

  const onFrequencyChange = (value: Frequency) => {
    setFrequency(value);
    // Give the new frequency a sensible day rather than an invalid leftover.
    setDay(1);
  };

  const save = () => {
    if (schedule === undefined) return;
    startSaving(async () => {
      try {
        const updatedProject = await appFetch<ProjectRow>(
          RouteHelper.Api.Project.getCollectionSchedule(project.id),
          { method: 'PATCH', body: JSON.stringify({ schedule }) },
          'Failed to save the schedule'
        );
        setCurrentProject(updatedProject);
        setProjects(projects.map((row) => (row.id === project.id ? updatedProject : row)));
        showSuccessAlertToast(
          'Schedule saved',
          schedule ? 'Runs start on their own from now on.' : 'Runs start only when you press Run.'
        );
      } catch (error) {
        showErrorAlertToast(
          'Could not save the schedule',
          error instanceof Error ? error.message : ''
        );
      }
    });
  };

  const { trigger: runNow, isMutating: isStartingRun } = useSWRMutation(
    RouteHelper.Api.Project.getProcessPrompts(project.id),
    (url: string) => appFetch<void>(url, { method: 'POST' }, 'Failed to start the Collection Run'),
    {
      // Wakes the shared progress UI, the same way the app-wide Refresh does.
      onSuccess: () => mutateGlobal(RouteHelper.Api.CollectionRuns.getActive()),
      onError: (error) =>
        showErrorAlertToast('Could not start the run', error instanceof Error ? error.message : ''),
    }
  );

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <SettingsFormHeader
        title="Schedule"
        description="How often this project collects new AI responses. Runs happen while the app is running on this machine."
      />

      <hr className="bg-border-secondary h-px w-full border-none" aria-hidden="true" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-16">
        <SettingsSectionLabel
          title="Frequency"
          description="Manual keeps everything under your control. The others start a run on their own."
        />

        <div className="flex flex-col gap-4">
          <RadioGroup
            aria-label="Collection frequency"
            value={frequency}
            onValueChange={(value) => onFrequencyChange(value as Frequency)}
            className="gap-3"
          >
            {FREQUENCY_OPTIONS.map((option) => {
              const inputId = `collection-frequency-${option.value}`;
              return (
                <Field
                  key={option.value}
                  orientation="horizontal"
                  onClick={() => onFrequencyChange(option.value)}
                  className="border-border has-data-checked:border-shadcn-primary has-data-checked:bg-shadcn-primary/5 has-data-checked:ring-shadcn-primary/30 dark:has-data-checked:bg-shadcn-primary/10 cursor-pointer rounded-lg border p-4 has-data-checked:ring-1"
                >
                  <RadioGroupItem id={inputId} value={option.value} />
                  <FieldContent>
                    <FieldLabel htmlFor={inputId}>{option.title}</FieldLabel>
                    <FieldDescription>{option.description}</FieldDescription>
                  </FieldContent>
                </Field>
              );
            })}
          </RadioGroup>

          {frequency === 'weekly' && (
            <NativeSelect
              aria-label="Day of the week"
              className="w-full"
              value={day}
              onChange={(event) => setDay(Number(event.target.value))}
            >
              {WEEKDAY_LABELS.map((label, weekday) => (
                <NativeSelectOption key={label} value={weekday}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}

          {frequency === 'monthly' && (
            <NativeSelect
              aria-label="Day of the month"
              className="w-full"
              value={day}
              onChange={(event) => setDay(Number(event.target.value))}
            >
              {Array.from({ length: MAX_MONTH_DAY }, (_, index) => index + 1).map((monthDay) => (
                <NativeSelectOption key={monthDay} value={monthDay}>
                  Day {monthDay}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}

          {frequency === 'custom' && (
            <label className="text-secondary flex items-center gap-2 text-sm">
              Every
              <Input
                type="number"
                aria-label="Number of days between runs"
                aria-invalid={schedule === undefined || undefined}
                className="w-20"
                min={MIN_CUSTOM_EVERY_DAYS}
                max={MAX_CUSTOM_EVERY_DAYS}
                value={everyDays}
                onChange={(event) => setEveryDays(event.target.value)}
              />
              days ({MIN_CUSTOM_EVERY_DAYS} to {MAX_CUSTOM_EVERY_DAYS})
            </label>
          )}

          <Button className="w-max" disabled={isSaving || schedule === undefined} onClick={save}>
            Save schedule {isSaving && <Spinner aria-hidden="true" />}
          </Button>
        </div>
      </div>

      <hr className="bg-border-secondary h-px w-full border-none" aria-hidden="true" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-16">
        <SettingsSectionLabel
          title="Status"
          description="When this project last collected, and when it is due next."
        />

        <div className="flex flex-col gap-1 text-sm">
          <p className="text-secondary">
            Last run:{' '}
            <span className="text-primary">{formatDateTime(project.prompts_updated_at)}</span>
          </p>
          <p className="text-secondary">
            Next run:{' '}
            <span className="text-primary">
              {frequency === 'manual'
                ? 'Only when you press Run'
                : nextRunAt
                  ? formatDateTime(nextRunAt)
                  : '-'}
            </span>
          </p>
          <p className="text-tertiary">
            Each run makes about {callsPerRun} {callsPerRun === 1 ? 'call' : 'calls'}: {promptCount}{' '}
            {promptCount === 1 ? 'prompt' : 'prompts'} across {enabledChatbotCount}{' '}
            {enabledChatbotCount === 1 ? 'Chatbot' : 'Chatbots'}, billed by each provider.
          </p>
          {enabledChatbotCount === 0 && (
            <p className="text-error-primary">
              Scheduled runs will collect nothing until you add a provider key and enable a Chatbot
              in Settings.
            </p>
          )}
        </div>
      </div>

      <hr className="bg-border-secondary h-px w-full border-none" aria-hidden="true" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-16">
        <SettingsSectionLabel
          title="Run now"
          description="Collect responses immediately, whatever the schedule says. Prompts already answered today are skipped."
        />

        <Button
          variant="outline"
          className="w-max"
          disabled={isStartingRun}
          onClick={() => runNow()}
        >
          <RefreshCw aria-hidden="true" /> Run prompts{' '}
          {isStartingRun && <Spinner aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}
