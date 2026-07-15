/** Aggregated usage totals for a period. */
export type UsageTotals = {
  costUSD: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
};

/** The active 5-hour billing block, when one exists. */
export type BlockUsage = UsageTotals & {
  startTime: string;
  endTime: string;
  remainingMinutes: number | null;
  projectedCostUSD: number | null;
  costPerHour: number | null;
};

/** One normalized snapshot feeding every usage tile. */
export type UsageSnapshot = {
  block: BlockUsage | null;
  today: UsageTotals;
  week: UsageTotals;
  month: UsageTotals;
  updatedAt: number;
};

export type UsageScope = "block" | "today" | "week" | "month";
export type UsageMetric = "cost" | "tokens";

export const SESSION_STATES = ["idle", "working", "waiting", "done", "offline", "unknown"] as const;
export type SessionStateName = (typeof SESSION_STATES)[number];

/** One Claude Code session as recorded by the hook script. */
export type SessionEntry = {
  sessionId: string;
  state: SessionStateName;
  cwd: string;
  project: string;
  model?: string;
  /** ISO timestamp of the last activity-refreshing event. */
  lastActivity: string;
  /** ISO timestamp of the last write for this session. */
  updatedAt: string;
};

export type StateFile = {
  version: 1;
  sessions: Record<string, SessionEntry>;
};

export type AggregateState = {
  state: SessionStateName;
  /** Sessions considered (after project filter + decay). */
  sessions: SessionEntry[];
  counts: Partial<Record<SessionStateName, number>>;
};
