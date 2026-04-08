import { createContext, useContext, useState, type ReactNode } from "react";

export type Period = "today" | "week" | "month";

type IntervalOption = {
  label: string;
  interval_hours: number;
  total_hours: number;
};

const INTERVALS_BY_PERIOD: Record<Period, IntervalOption[]> = {
  today: [
    { label: "15m", interval_hours: 0.25, total_hours: 24 },
    { label: "30m", interval_hours: 0.5, total_hours: 24 },
    { label: "1h", interval_hours: 1, total_hours: 24 },
  ],
  week: [
    { label: "1h", interval_hours: 1, total_hours: 168 },
    { label: "2h", interval_hours: 2, total_hours: 168 },
    { label: "5h", interval_hours: 5, total_hours: 168 },
  ],
  month: [
    { label: "5h", interval_hours: 5, total_hours: 720 },
    { label: "12h", interval_hours: 12, total_hours: 720 },
    { label: "24h", interval_hours: 24, total_hours: 720 },
  ],
};

const DEFAULT_INTERVAL_IDX: Record<Period, number> = {
  today: 1,
  week: 1,
  month: 1,
};

type DashboardContextType = {
  period: Period;
  setPeriod: (p: Period) => void;
  intervalIdx: number;
  setIntervalIdx: (i: number) => void;
  intervals: IntervalOption[];
  currentInterval: IntervalOption;
};

const DashboardContext = createContext<DashboardContextType>(null!);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [period, setPeriodRaw] = useState<Period>("today");
  const [intervalIdx, setIntervalIdx] = useState(DEFAULT_INTERVAL_IDX.today);

  const intervals = INTERVALS_BY_PERIOD[period];
  const currentInterval = intervals[intervalIdx] ?? intervals[0];

  function setPeriod(p: Period) {
    setPeriodRaw(p);
    setIntervalIdx(DEFAULT_INTERVAL_IDX[p]);
  }

  return (
    <DashboardContext.Provider value={{ period, setPeriod, intervalIdx, setIntervalIdx, intervals, currentInterval }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  return useContext(DashboardContext);
}
