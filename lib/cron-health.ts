import { prisma } from "./prisma";
import { sendTelegramAdminAlert, escapeHtml } from "./telegram";

// Alert once a job hits this many consecutive failures, then again every
// this-many failures after that (not on every single failure) — a
// prolonged outage still resurfaces periodically without spamming the
// channel every single cron tick while it stays down.
const FAILURE_ALERT_THRESHOLD = 3;

export async function recordCronSuccess(jobName: string): Promise<void> {
  await prisma.cronHealth.upsert({
    where: { id: jobName },
    update: { lastRunAt: new Date(), lastSuccessAt: new Date(), lastError: null, consecutiveFailures: 0 },
    create: { id: jobName, lastRunAt: new Date(), lastSuccessAt: new Date() },
  });
}

/**
 * Records a cron failure and, once it's failed FAILURE_ALERT_THRESHOLD times
 * in a row, sends a Telegram alert — this is what makes a silently-failing
 * cron (expired API key, etc.) actually visible instead of only showing up
 * as a red mark on cron-job.org's own dashboard, which nobody checks
 * routinely. Never lets an alert-delivery failure mask the original error.
 */
export async function recordCronFailure(jobName: string, error: Error): Promise<void> {
  const updated = await prisma.cronHealth.upsert({
    where: { id: jobName },
    update: { lastRunAt: new Date(), lastError: error.message, consecutiveFailures: { increment: 1 } },
    create: { id: jobName, lastRunAt: new Date(), lastError: error.message, consecutiveFailures: 1 },
  });

  if (updated.consecutiveFailures > 0 && updated.consecutiveFailures % FAILURE_ALERT_THRESHOLD === 0) {
    try {
      await sendTelegramAdminAlert(
        `⚠️ <b>System alert</b>: "${escapeHtml(jobName)}" has failed ` +
          `${updated.consecutiveFailures} times in a row.\n` +
          `Last error: ${escapeHtml(error.message)}`
      );
    } catch (alertErr) {
      console.error(`Failed to send cron failure alert for ${jobName}:`, (alertErr as Error).message);
    }
  }
}
