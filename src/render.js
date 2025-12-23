import { secondsToHhmm } from './utils.js';

export const renderHuman = ({ dateLabel, projectKey, grouped, summaries, timezone }) => {
  console.log(`\nJira action summary for project ${projectKey} on ${dateLabel} (timezone ${timezone})`);
  if (!grouped.length) {
    console.log('Không có hoạt động trong ngày.');
    return;
  }

  for (const entry of grouped) {
    const summaryText = summaries.get(entry.actor.id) || '';
    const stats = entry.stats;
    const totalActions = entry.actions.length;
    const workTime = secondsToHhmm(stats.worklogSeconds);

    console.log(`\n${entry.actor.name} (${totalActions} hành động)`);
    if (summaryText) {
      console.log(summaryText);
    }
    console.log(
      `Stats: created ${stats.created}, status ${stats.status}, comments ${stats.comments}, worklogs ${stats.worklogs}, time ${workTime}`
    );
  }
};

export const renderJson = ({ dateLabel, projectKey, grouped, timezone }) => {
  const output = {
    project: projectKey,
    date: dateLabel,
    timezone,
    users: grouped.map((entry) => ({
      actor: entry.actor,
      stats: entry.stats,
      actions: entry.actions,
    })),
  };
  console.log(JSON.stringify(output, null, 2));
};
