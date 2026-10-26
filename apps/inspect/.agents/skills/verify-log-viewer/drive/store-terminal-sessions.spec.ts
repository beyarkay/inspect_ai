import { mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

// Real-backend drive for the Terminals tab: a sample whose store holds
// asciinema:* casts shows every session stacked on one shared clock, links
// commands to their transcript tool calls in both directions, offers an agent
// picker when the casts come from several agents, and keeps the cast keys out
// of the Info tab's Store record tree.
//
// Fixtures: the software-engineering logs that
// `fixtures/make_multiterminal_fixtures.py --out-dir <VERIFY_LOG_DIR>` writes
// — `*_fix-failing-tests_*.eval` (one agent; sessions main, server, tests,
// build; store key `webapp:ticket`) and `*_fix-failing-tests-multiagent_*.eval`
// (tests and build owned by a `test-runner` subagent).

const evidence = join(import.meta.dirname, "..", "evidence");

const logDir =
  process.env.VERIFY_LOG_DIR ?? join(homedir(), "code/viewer-validation/logs");

const findLog = (pattern: RegExp): string | undefined => {
  try {
    return readdirSync(logDir).find((name) => pattern.test(name));
  } catch {
    return undefined;
  }
};

const singleAgentLog = findLog(/_fix-failing-tests_.*\.eval$/);
const multiAgentLog = findLog(/_fix-failing-tests-multiagent_.*\.eval$/);

const sampleUrl = (log: string | undefined, rest: string): string => {
  if (log === undefined) {
    throw new Error("gate with test.skip(log === undefined) first");
  }
  return `/#/logs/${encodeURIComponent(log)}/samples/sample/fix-failing-tests/1/${rest}`;
};

const readout = (page: Page) => page.getByLabel("Elapsed in the run");

const row = (page: Page, session: string) =>
  page.locator(`[data-session="${session}"]`);

test.beforeAll(() => {
  mkdirSync(evidence, { recursive: true });
});

test("terminals share one clock and link to the transcript both ways", async ({
  page,
}) => {
  test.skip(
    singleAgentLog === undefined,
    "no fix-failing-tests fixture in VERIFY_LOG_DIR"
  );

  // ?t= opens the view paused at that time, following the agent's terminal.
  await page.goto(sampleUrl(singleAgentLog, "terminals?t=1200"));
  await expect(readout(page)).toHaveText(/^20:00/, { timeout: 15_000 });
  await expect(row(page, "main")).toHaveAttribute("data-state", "focused");
  await expect(row(page, "server")).toHaveAttribute("data-state", "open");
  // One agent: no agent picker.
  await expect(page.getByRole("button", { name: /terms?$/ })).toHaveCount(0);
  // Space plays and pauses with focus on the page body.
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  // The tab collapses the sample header (the input block goes).
  await expect(page.getByText(/The webapp test suite is failing/)).toHaveCount(
    0
  );
  await page.screenshot({ path: join(evidence, "terminals-shared-view.png") });

  // Fill window covers the viewport under its own header; Escape leaves it.
  await page.getByRole("button", { name: "Fill window" }).click();
  const fill = page.getByRole("region", {
    name: "Terminals filling the window",
  });
  await expect(fill).toBeVisible();
  const fillBox = await fill.boundingBox();
  expect(fillBox?.height).toBe(page.viewportSize()?.height);
  await expect(readout(page)).toHaveText(/^20:00/);
  await page.screenshot({ path: join(evidence, "terminals-fill-window.png") });
  await page.keyboard.press("Escape");
  await expect(fill).toHaveCount(0);

  // Leaving the tab gives the header back (it was expanded before).
  await page.getByRole("tab", { name: "Info" }).click();
  await expect(
    page.getByText(/The webapp test suite is failing/)
  ).toBeVisible();
  await page.goto(sampleUrl(singleAgentLog, "terminals?t=1200"));
  await expect(readout(page)).toHaveText(/^20:00/, { timeout: 15_000 });

  // ⤢ opens one session full-viewport; Escape returns to the shared view.
  await page.getByRole("button", { name: "Expand main" }).click();
  const expanded = page.getByRole("dialog", { name: "Terminal main" });
  await expect(expanded).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(expanded).toHaveCount(0);

  // The focused bar's command opens its tool call in the transcript, which
  // offers the way back.
  await row(page, "main")
    .getByRole("button", { name: "$ npx tsc --noEmit" })
    .click();
  await expect(page).toHaveURL(/\/transcript\?event=/);
  const eventId = /[?&]event=([^&]+)/.exec(page.url())?.[1] ?? "";
  const toolCard = page.locator(`[id="${eventId}"]`);
  await toolCard.getByRole("button", { name: "Show in terminals" }).click();
  await expect(page).toHaveURL(/\/terminals\?t=/);
  await expect(
    row(page, "main").getByRole("button", { name: "$ npx tsc --noEmit" })
  ).toBeVisible({ timeout: 15_000 });

  // The Info tab's Store card keeps non-cast keys and holds no asciinema:*
  // entries.
  await page.getByRole("tab", { name: "Info" }).click();
  await expect(page.getByText("webapp:ticket")).toBeVisible();
  await expect(page.getByText("asciinema:terminal-main")).toHaveCount(0);
});

test("the agent picker swaps agents on the same clock", async ({ page }) => {
  test.skip(
    multiAgentLog === undefined,
    "no fix-failing-tests-multiagent fixture in VERIFY_LOG_DIR"
  );

  await page.goto(sampleUrl(multiAgentLog, "terminals?t=2400"));
  await expect(readout(page)).toHaveText(/^40:00/, { timeout: 15_000 });
  await expect(row(page, "server")).toBeVisible();
  await expect(row(page, "tests")).toHaveCount(0);

  await page.getByRole("button", { name: /^main\s*·\s*2 terms$/ }).click();
  await expect(page.getByText("Agents in this sample")).toBeVisible();
  await page.getByRole("button", { name: /test-runner/ }).click();

  await expect(row(page, "tests")).toHaveAttribute("data-state", "focused");
  await expect(row(page, "build")).toBeVisible();
  await expect(row(page, "server")).toHaveCount(0);
  await expect(readout(page)).toHaveText(/^40:00/);
  await page.screenshot({ path: join(evidence, "terminals-subagent.png") });

  // A subagent's tool call opens its own agent's terminals.
  await page.goto(sampleUrl(multiAgentLog, "transcript?event=ev-tests-003"));
  await page
    .locator('[id="ev-tests-003"]')
    .getByRole("button", { name: "Show in terminals" })
    .click();
  await expect(page).toHaveURL(/\/terminals\?t=.*&agent=/);
  await expect(
    page.getByRole("button", { name: /^test-runner\s*·\s*2 terms$/ })
  ).toBeVisible();
  await expect(row(page, "tests")).toHaveAttribute("data-state", "focused");
});
