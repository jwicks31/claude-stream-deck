import { formatMinutes, formatTokens, formatUSD } from "./formatters.js";
import type {
  AggregateState,
  SessionStateName,
  UsageMetric,
  UsageScope,
  UsageSnapshot,
} from "./types.js";

export type TileModel = {
  title: string;
  value: string;
  subtitle: string;
  accent: string;
  stale: boolean;
};

export const SCOPE_LABELS: Record<UsageScope, string> = {
  block: "5h Block",
  today: "Today",
  week: "7 Days",
  month: "Month",
};

export const STATE_COLORS: Record<SessionStateName, string> = {
  idle: "#8B93A7",
  working: "#E5A50A",
  waiting: "#E0483E",
  done: "#2EB67D",
  offline: "#4A5060",
  unknown: "#5C6370",
};

export const STATE_LABELS: Record<SessionStateName, string> = {
  idle: "Idle",
  working: "Working",
  waiting: "Waiting",
  done: "Done",
  offline: "Offline",
  unknown: "No data",
};

const CLAUDE_ACCENT = "#D97757";

/** Pure view-model for a usage tile from the current poller state. */
export function usageTileModel(
  snapshot: UsageSnapshot | null,
  scope: UsageScope,
  metric: UsageMetric,
  stale: boolean,
): TileModel {
  const title = SCOPE_LABELS[scope];
  if (!snapshot) {
    return { title, value: "—", subtitle: stale ? "ccusage error" : "loading…", accent: CLAUDE_ACCENT, stale };
  }
  if (scope === "block") {
    const block = snapshot.block;
    if (!block) {
      return { title, value: "$0", subtitle: "no active block", accent: CLAUDE_ACCENT, stale };
    }
    const value = metric === "tokens" ? formatTokens(block.totalTokens) : formatUSD(block.costUSD);
    const parts: string[] = [];
    if (block.remainingMinutes != null) parts.push(`${formatMinutes(block.remainingMinutes)} left`);
    if (metric === "cost" && block.projectedCostUSD != null)
      parts.push(`→ ${formatUSD(block.projectedCostUSD)}`);
    return { title, value, subtitle: parts.join(" "), accent: CLAUDE_ACCENT, stale };
  }
  const totals = snapshot[scope];
  const value = metric === "tokens" ? formatTokens(totals.totalTokens) : formatUSD(totals.costUSD);
  const subtitle =
    metric === "tokens" ? `${formatUSD(totals.costUSD)}` : `${formatTokens(totals.totalTokens)} tok`;
  return { title, value, subtitle, accent: CLAUDE_ACCENT, stale };
}

/** Pure view-model for the session-state tile. */
export function sessionTileModel(agg: AggregateState, projectFilter?: string): TileModel {
  const n = agg.sessions.length;
  const title = projectFilter?.trim() || "Claude";
  const subtitle =
    n === 0 ? "no sessions" : n === 1 ? (agg.sessions[0]?.project ?? "1 session") : `${n} sessions`;
  return {
    title,
    value: STATE_LABELS[agg.state],
    subtitle,
    accent: STATE_COLORS[agg.state],
    stale: false,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 144×144 tile SVG: accent band, title, big value, subtitle, stale marker. */
export function tileSvg(model: TileModel): string {
  const valueSize = model.value.length > 7 ? 26 : model.value.length > 5 ? 32 : 38;
  const stale = model.stale
    ? `<text x="128" y="26" font-size="18" text-anchor="middle" fill="#E5A50A">⚠</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" rx="14" fill="#191922"/>
<rect x="0" y="0" width="144" height="6" fill="${model.accent}"/>
<text x="72" y="42" font-family="-apple-system, 'Segoe UI', sans-serif" font-size="19" text-anchor="middle" fill="#9BA3B4">${esc(model.title)}</text>
<text x="72" y="88" font-family="-apple-system, 'Segoe UI', sans-serif" font-size="${valueSize}" font-weight="700" text-anchor="middle" fill="${model.stale ? "#9BA3B4" : "#F2F3F5"}">${esc(model.value)}</text>
<text x="72" y="120" font-family="-apple-system, 'Segoe UI', sans-serif" font-size="16" text-anchor="middle" fill="#7A8296">${esc(model.subtitle)}</text>
${stale}
</svg>`;
}

/** Session tile variant: colored dot + state word. */
export function sessionTileSvg(model: TileModel): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" rx="14" fill="#191922"/>
<rect x="0" y="0" width="144" height="6" fill="${model.accent}"/>
<text x="72" y="36" font-family="-apple-system, 'Segoe UI', sans-serif" font-size="18" text-anchor="middle" fill="#9BA3B4">${esc(model.title)}</text>
<circle cx="72" cy="66" r="14" fill="${model.accent}"/>
<text x="72" y="104" font-family="-apple-system, 'Segoe UI', sans-serif" font-size="24" font-weight="700" text-anchor="middle" fill="#F2F3F5">${esc(model.value)}</text>
<text x="72" y="128" font-family="-apple-system, 'Segoe UI', sans-serif" font-size="15" text-anchor="middle" fill="#7A8296">${esc(model.subtitle)}</text>
</svg>`;
}

export type CommandGlyph = "check" | "cross" | "new-chat" | "text";

export type CommandKeyModel = {
  glyph: CommandGlyph;
  label: string;
  /** Shown instead of a glyph for custom text commands. */
  preview?: string;
  accent: string;
};

export const COMMAND_ACCENTS = {
  accept: "#2EB67D",
  reject: "#E0483E",
  "new-chat": "#5A8DEE",
  custom: "#9B7ADE",
} as const;

/** Pure view-model for the Command Key from its settings. */
export function commandKeyModel(preset?: string, customText?: string): CommandKeyModel {
  switch (preset ?? "accept") {
    case "reject":
      return { glyph: "cross", label: "Reject", accent: COMMAND_ACCENTS.reject };
    case "new-chat":
      return { glyph: "new-chat", label: "New Chat", accent: COMMAND_ACCENTS["new-chat"] };
    case "custom": {
      const text = (customText ?? "").trim();
      const preview = text.length > 9 ? `${text.slice(0, 8)}…` : text || "…";
      return { glyph: "text", label: "Custom", preview, accent: COMMAND_ACCENTS.custom };
    }
    default:
      return { glyph: "check", label: "Accept", accent: COMMAND_ACCENTS.accept };
  }
}

const COMMAND_GLYPH_PATHS: Record<Exclude<CommandGlyph, "text">, string> = {
  check: `<path d="M46 74 L66 94 L100 48" stroke="__A__" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  cross: `<path d="M50 50 L94 94 M94 50 L50 94" stroke="__A__" stroke-width="11" stroke-linecap="round" fill="none"/>`,
  "new-chat": `<path d="M38 48 h68 a10 10 0 0 1 10 10 v34 a10 10 0 0 1 -10 10 h-40 l-18 14 v-14 h-10 a10 10 0 0 1 -10 -10 v-34 a10 10 0 0 1 10 -10 z" stroke="__A__" stroke-width="7" fill="none" stroke-linejoin="round"/><path d="M72 58 v28 M58 72 h28" stroke="__A__" stroke-width="7" stroke-linecap="round"/>`,
};

/** 144×144 Command Key image: glyph (or custom-text preview) + label. */
export function commandKeySvg(model: CommandKeyModel): string {
  const art =
    model.glyph === "text"
      ? `<text x="72" y="84" font-family="-apple-system, 'Segoe UI', sans-serif" font-size="${(model.preview ?? "").length > 6 ? 26 : 34}" font-weight="700" text-anchor="middle" fill="${model.accent}">${esc(model.preview ?? "")}</text>`
      : COMMAND_GLYPH_PATHS[model.glyph].replaceAll("__A__", model.accent);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" rx="14" fill="#191922"/>
<rect x="0" y="0" width="144" height="6" fill="${model.accent}"/>
${art}
<text x="72" y="128" font-family="-apple-system, 'Segoe UI', sans-serif" font-size="17" text-anchor="middle" fill="#9BA3B4">${esc(model.label)}</text>
</svg>`;
}

export function svgToDataUri(svg: string): string {
  // Explicit charset so non-ASCII glyphs (…, →, ⚠) can't be mis-decoded.
  return `data:image/svg+xml;charset=utf-8;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
