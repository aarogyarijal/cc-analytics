import SessionScatter from "./SessionScatter";
import DowHeatmap from "./DowHeatmap";

export default function InsightsRow() {
  return <div className="grid gap-4 xl:grid-cols-2">
    <SessionScatter />
    <DowHeatmap />
  </div>;
}
