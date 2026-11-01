const progressEligibleStatuses = new Set(["approved", "admin_review", "contract_accepted", "processing", "completed"]);

export const isProgressMonitorEligibleOrder = (order = {}) => {
  const status = String(order.status || "").toLowerCase();
  if (status === "cancelled") return true;

  const savedStageGroups = [
    ...(Array.isArray(order.progress_stages) && order.progress_stages.length > 0 ? [order.progress_stages] : []),
    ...(Array.isArray(order.items) ? order.items.map((item) => item?.progress_stages).filter((stages) => Array.isArray(stages) && stages.length > 0) : []),
  ];
  const hasSavedProductionProgress = savedStageGroups.some((stages) => stages.some((stage) => {
    const stageStatus = String(stage?.status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const stageStarted = stage.completed === true || !["", "pending", "not_started"].includes(stageStatus);
    const subStageStarted = Array.isArray(stage.subStages) && stage.subStages.some((subStage) => (
      subStage.completed === true || !["", "pending", "not_started"].includes(
        String(subStage?.status || "").trim().toLowerCase().replace(/[\s-]+/g, "_")
      )
    ));
    return stageStarted || subStageStarted;
  }));
  if (hasSavedProductionProgress) return true;

  return progressEligibleStatuses.has(status);
};
