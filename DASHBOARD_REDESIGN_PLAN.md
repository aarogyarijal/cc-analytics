# Dashboard Redesign Plan

This document turns the current surface-level dashboard into a telemetry analysis product for Claude Code usage.

## What is wrong today

The current UI in `frontend/src/App.tsx` and its panels is functional, but it mostly shows totals:

- `OverviewCards` only summarizes today vs all-time tokens, cost, sessions, and active time.
- `DailyChart` shows stacked tokens plus cost, but not rates, trends, or anomalies.
- `ModelBreakdown` shows a pie chart and a table, but not model efficiency or relative cost pressure.
- `ToolTable` focuses on counts and latency, but not failure hotspots, tail latency, or trends.
- `EditDecisions` rolls accept/reject counts, but not acceptance rate by language, tool, or decision source.
- `LiveFeed` is useful for debugging, but it dominates the visual language instead of supporting analysis.

The result is a dashboard that answers "what happened" but not "what changed, why it changed, or what needs attention."

## What the docs say Claude Code can actually provide

From the Claude monitoring docs at `https://code.claude.com/docs/en/monitoring-usage`, the telemetry surface is much richer than the current UI reflects.

### Metrics available

- `claude_code.session.count`
- `claude_code.lines_of_code.count`
- `claude_code.pull_request.count`
- `claude_code.commit.count`
- `claude_code.cost.usage`
- `claude_code.token.usage`
- `claude_code.code_edit_tool.decision`
- `claude_code.active_time.total`

### Event types available

- `claude_code.user_prompt`
- `claude_code.tool_result`
- `claude_code.api_request`
- `claude_code.api_error`
- `claude_code.tool_decision`

### Important dimensions

The docs explicitly say metrics and events can be segmented by:

- `user.account_uuid`
- `user.account_id`
- `organization.id`
- `session.id`
- `model`
- `app.version`

And event data can correlate a prompt through follow-on API/tool activity via `prompt.id`.

## Dashboard goals

The redesigned dashboard should answer these questions first:

1. Are we using Claude Code more or less than before?
2. Is that usage efficient or wasteful?
3. Which models, tools, or workflows are generating the most cost or friction?
4. Are accept/reject behavior and tool failures improving or getting worse?
5. Which sessions are outliers and deserve investigation?
6. What changed after a version, workflow, or team shift?

## Information architecture

### 1. Executive overview

Top of page should present a concise operational narrative:

- Total sessions
- Total cost
- Total token volume
- Active time
- Cost per session
- Tokens per session
- Tool success rate
- Edit acceptance rate
- API error rate

This section should use KPI cards with deltas, not just raw totals.

Recommended visual treatment:

- Large number
- Small delta vs previous period
- Mini sparkline or trend arrow
- A short interpretation label like "Up 18% week over week"

### 2. Trend and anomaly layer

Replace the single daily chart with a trend-focused analytics strip:

- Cost over time
- Token volume over time
- Session count over time
- Active time over time
- Lines of code over time
- PR and commit counters over time

Add a second layer for derived rates:

- Cost per session
- Tokens per active minute
- Output-to-input token ratio
- Cache read share
- Edit accept rate
- Tool success rate
- Error rate

This is the layer that tells the story, not just the totals.

### 3. Model intelligence layer

Replace the current pie chart with a ranked model efficiency view.

Show for each model:

- Token volume
- Cost
- Average cost per request
- Cache hit rate
- Output/input ratio
- Error rate
- Share of total spend

This section should emphasize ranking and comparison, not composition.

### 4. Tool quality layer

Turn tool data into an operational reliability panel:

- Most used tools
- Success rate
- Average latency
- P95 or max latency
- Error frequency
- Latency trend

This is where users can tell whether the assistant is performing well or just being used often.

### 5. Edit behavior layer

Replace the current accept/reject stack chart with a decision analysis matrix:

- Accept rate by tool
- Accept rate by language
- Accept rate by decision source
- Volume of edit decisions over time
- Acceptance rate trend

This reveals where Claude Code is trusted versus where users intervene.

### 6. Session intelligence layer

Use the existing `/api/sessions` data as the basis for a session drilldown table:

- Session duration
- Event count
- API call count
- Tool call count
- Cost
- Token count
- Active time

If `prompt.id` and `session.id` are available together, add prompt-level drilldown:

- Prompt count per session
- API calls per prompt
- Tools per prompt
- Tool failure rate per prompt
- Prompt length distribution

### 7. Live incident feed

Keep the live feed, but reduce its footprint and treat it like a right-rail diagnostic console:

- Stream only the most relevant live events
- Group by session or prompt
- Surface errors and long-running tool calls first
- Collapse noisy success events by default

## Insights to add

The dashboard should compute derived insights, not just raw metrics.

### Usage efficiency

- Cost per session
- Tokens per session
- Active time per session
- Cost per active minute
- Tokens per active minute
- Tokens per line of code changed

### Model quality

- Cache hit rate by model
- Cost share by model
- Output/input ratio by model
- Error rate by model
- Fast-mode vs normal-mode behavior if that field is present in the raw events

### Tool reliability

- Success rate by tool
- Tail latency by tool
- Error rate by tool
- Tools with the highest median or P95 latency
- Tools with the most variance, not just the highest mean

### Edit behavior

- Accept/reject rate by tool
- Accept/reject rate by language
- Accept/reject rate by source
- Acceptance drift over time

### Productivity proxies

If the telemetry is available, surface:

- Lines added vs removed
- Commit count
- Pull request count
- Session-to-output conversion

These are proxy indicators, so they should be labeled carefully as observational, not causal.

### Anomaly detection

Flag sessions or days that are unusual:

- Cost spikes
- Token spikes
- Tool failure spikes
- Latency spikes
- Sudden accept-rate drops
- API error bursts

## Best visualization choices

### Use line charts for time series

Best for:

- Cost over time
- Tokens over time
- Sessions over time
- Active time over time
- Acceptance rate over time
- Tool error rate over time

Why:

- The question is change over time, not composition.
- Lines make trends, spikes, and regressions obvious.

### Use stacked area or stacked bar only when composition matters

Best for:

- Input vs output vs cache read tokens
- Success vs reject counts
- Lines added vs removed

Avoid stacked bars for too many categories because they become hard to compare.

### Use ranked horizontal bars for comparisons

Best for:

- Models by cost
- Tools by call volume
- Sessions by cost
- Languages by accept rate

Why:

- Long labels fit better.
- Rank order is easier to scan than pie slices.

### Use heatmaps for matrix-style questions

Best for:

- Acceptance rate by tool and language
- Tool failure rate by hour of day and day of week
- Model usage by day

Why:

- These are two-dimensional patterns, not simple totals.

### Use scatter plots for efficiency and outliers

Best for:

- Session cost vs duration
- Tool latency vs failure rate
- Token volume vs cost
- Prompt length vs API calls

Why:

- Outliers become visible immediately.
- Helps identify expensive or unstable behavior.

### Use tables for drilldown, but make them analytical

Tables should include:

- Sorting
- Inline bars or badges
- Conditional coloring
- Rate columns
- Delta columns

Examples:

- Session table
- Tool table
- Model table
- Decision table

### Use sparklines for compact trend hints

Best for cards and summary rows:

- Cost trend
- Sessions trend
- Error trend
- Tool latency trend

## Proposed page layout

### Header

- Title: "Claude Code Intelligence"
- Date range picker
- Environment or team filter
- Refresh status
- Last ingest time

### Row 1

- KPI cards
- Mini trend chips

### Row 2

- Main trend chart
- Live incident rail

### Row 3

- Model efficiency ranking
- Tool quality ranking

### Row 4

- Edit behavior analysis
- Session drilldown table

### Row 5

- Optional org/team segmentation if resource attributes are available

## Backend and data model changes needed

The current backend only exposes part of the telemetry surface. A complete redesign needs a few query additions.

### Extend `backend/db.py`

Add queries for:

- session count time series
- lines of code time series
- commit count time series
- pull request count time series
- API request latency stats
- API error stats
- prompt-level aggregates by `prompt.id`
- session-level aggregates with cost, tokens, tool calls, and active time
- model efficiency stats including cost per request and output/input ratio
- tool latency percentiles if supported, or at minimum avg/max plus failure rate

### Extend the API

Add endpoints like:

- `/api/kpis`
- `/api/trends`
- `/api/sessions?sort=...`
- `/api/errors`
- `/api/prompt-flows`

Keep `/api/overview` for compatibility, but stop relying on it as the primary analytics source.

### Normalize fields for frontend use

Precompute derived values in the backend when they are reused:

- cost per session
- acceptance rate
- cache hit rate
- output/input ratio
- error rate
- success rate
- duration percentiles

This keeps frontend code simpler and avoids repeating business logic in every component.

## Visual redesign direction

The new design should not feel like a default admin template.

Recommended direction:

- Dark, editorial dashboard with high-contrast metric surfaces
- One strong accent color per data family
- Dense but controlled information hierarchy
- Clear separation between "summary", "trend", and "drilldown"
- Less card sprawl, more deliberate sectioning

Suggested aesthetic:

- Neutral dark background
- Light panels with subtle borders for data surfaces
- Warm accent for cost
- Cool accent for tokens and model usage
- Green for success and acceptance
- Red for failure and rejection

## Implementation phases

### Phase 1

- Redesign page shell and typography
- Replace current header and flat card grid
- Introduce a stronger visual hierarchy

### Phase 2

- Add the missing analytics queries
- Expose rate-based and trend-based metrics
- Add session and error endpoints

### Phase 3

- Replace pie and static tables with ranked analytical views
- Add sparklines, deltas, and anomaly flags

### Phase 4

- Add drilldown interactions
- Add filters for model, session, user, and app version
- Make the live feed secondary instead of primary

## Acceptance criteria

The redesign is done when the dashboard can answer the following without leaving the page:

- What is the cost trend?
- Which model is most expensive and least efficient?
- Which tools are slow or failing?
- Are users accepting or rejecting edits more often?
- Which sessions are anomalous?
- How do tokens, active time, commits, PRs, and lines of code move over time?

## Notes on the current codebase

The existing frontend already uses React Query and Recharts, so the redesign can stay within the current stack.

Relevant files:

- [`frontend/src/App.tsx`](./frontend/src/App.tsx)
- [`frontend/src/components/OverviewCards.tsx`](./frontend/src/components/OverviewCards.tsx)
- [`frontend/src/components/DailyChart.tsx`](./frontend/src/components/DailyChart.tsx)
- [`frontend/src/components/ModelBreakdown.tsx`](./frontend/src/components/ModelBreakdown.tsx)
- [`frontend/src/components/ToolTable.tsx`](./frontend/src/components/ToolTable.tsx)
- [`frontend/src/components/EditDecisions.tsx`](./frontend/src/components/EditDecisions.tsx)
- [`frontend/src/components/LiveFeed.tsx`](./frontend/src/components/LiveFeed.tsx)
- [`backend/db.py`](./backend/db.py)
- [`backend/main.py`](./backend/main.py)

## Priority recommendation

If the goal is maximum dashboard value with minimal churn, build in this order:

1. Executive overview with deltas and sparklines
2. Trend charts with derived rates
3. Model efficiency table
4. Tool quality and failure analysis
5. Edit behavior analysis
6. Session drilldown and anomalies
7. Secondary live feed console

