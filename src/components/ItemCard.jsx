import React from "react";
import { ChevronDown, Package } from "lucide-react";
import TimelineStage from "./TimelineStage";
import { formatOrderItemMeasurements } from "./OrderProgressTimeline";
import { getTimelineFocusStage, getTimelineStageCounts, getTimelineStageStatus } from "./orderTimelineUtils";

const getItemName = (item, index) => item?.name || item?.product_name || `Product ${index + 1}`;

const getSizeLabel = (item, getItemDimension) => {
  if (Number(item?.widthIn) > 0 && Number(item?.heightIn) > 0) {
    const area = Number(item?.sqFt);
    return `Dimension: Width: ${item.widthIn}" x Height: ${item.heightIn}"${Number.isFinite(area) && area > 0 ? ` (${area.toLocaleString(undefined, { maximumFractionDigits: 2 })} sq ft)` : ""}`;
  }

  const value = getItemDimension?.(item) || formatOrderItemMeasurements(item) || "";
  const dimensions = value.match(/^(?:Size:\s*)?(.+?)\s+x\s+(.+?)(\s+\([\d,.]+\s+sq ft\))?(.*)$/i);
  if (dimensions) {
    return `Dimension: Width: ${dimensions[1]} x Height: ${dimensions[2]}${dimensions[3] || ""}${dimensions[4] || ""}`;
  }

  const formatted = value || "Measurements not provided";
  return formatted;
};
const getChipLabel = (stages) => {
  const active = stages.find((stage) => getTimelineStageStatus(stage) === "current");
  if (active) return active.label || active.name || "In progress";
  const next = stages.find((stage) => getTimelineStageStatus(stage) === "pending");
  if (next) return `Next: ${next.label || next.name || "Stage"}`;
  return "Completed";
};

const getChipClass = (stages, darkMode) => {
  const active = stages.some((stage) => getTimelineStageStatus(stage) === "current");
  const allDone = stages.length > 0 && stages.every((stage) => getTimelineStageStatus(stage) === "done");
  if (active) return darkMode ? "bg-amber-900/60 text-amber-200" : "bg-amber-100 text-amber-900";
  if (allDone) return darkMode ? "bg-emerald-900/60 text-emerald-200" : "bg-emerald-100 text-emerald-800";
  return darkMode ? "bg-sky-900/60 text-sky-200" : "bg-sky-100 text-sky-800";
};

const normalizeStageKey = (value) => String(value || "")
  .replace(/^batch_\d+_/, "")
  .toLowerCase()
  .replace(/[\s-]+/g, "_");

function StageList({ stages, darkMode, onPhotoOpen, onUploadProgressPhoto, itemIndex, notificationTarget }) {
  const nextUpIndex = stages.findIndex((stage) => getTimelineStageStatus(stage) === "pending");
  const hasCurrentStage = stages.some((stage) => getTimelineStageStatus(stage) === "current");
  const isSingleItem = !hasCurrentStage && nextUpIndex !== -1;

  return (
    <ol className="mt-4">
      {stages.map((stage, index) => (
        <TimelineStage
          key={`${stage.key || stage.label || "stage"}-${index}`}
          stage={stage}
          isLast={index === stages.length - 1}
          isNextUp={isSingleItem && index === nextUpIndex}
          isNotificationTarget={Boolean(notificationTarget &&
            (notificationTarget.itemIndex === null || notificationTarget.itemIndex === undefined || notificationTarget.itemIndex === itemIndex) &&
            ((notificationTarget.stageKey && normalizeStageKey(stage.key) === normalizeStageKey(notificationTarget.stageKey)) ||
              (notificationTarget.stageName && String(stage.label || stage.name || "").toLowerCase() === String(notificationTarget.stageName).toLowerCase())))}
          notificationStageKey={stage.key || stage.label || stage.name}
          notificationItemIndex={itemIndex}
          darkMode={darkMode}
          onPhotoOpen={onPhotoOpen}
          itemIndex={itemIndex}
          onUploadProgressPhoto={onUploadProgressPhoto}
        />
      ))}
    </ol>
  );
}

export default function ItemCard({
  row,
  isSingle = false,
  isExpanded = false,
  onToggle,
  darkMode = false,
  getItemDimension,
  fallbackImage = "",
  expandedKeys,
  onToggleKey,
  onPhotoOpen,
  onUploadProgressPhoto,
  notificationTarget,
}) {
  if (row.groupItems) {
    const members = row.groupItems;
    const first = members[0];
    const firstName = getItemName(first.item, first.index);
    const secondName = members[1] ? getItemName(members[1].item, members[1].index) : "";
    const groupTitle = members.length === 2
      ? `${firstName}, ${secondName}`
      : `${firstName}, ${secondName} +${members.length - 2}`;
    const isGroupOpen = expandedKeys.has(row.key);

    return (
      <section className={`overflow-hidden rounded-xl border ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
        <button
          type="button"
          aria-expanded={isGroupOpen}
          onClick={() => onToggleKey(row.key)}
          className={`flex w-full items-center gap-3 p-3 text-left transition ${darkMode ? "hover:bg-slate-800" : "hover:bg-slate-50"}`}
        >
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-100"}`}>
            {first.image ? <img src={first.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Package size={17} className="text-slate-400" aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-sm font-semibold ${darkMode ? "text-white" : "text-slate-900"}`}>
              {groupTitle} <span className="font-normal text-slate-500">· {row.stageLabel}</span>
            </span>
            <span className={`mt-1 block text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{members.length} items share this stage</span>
          </span>
          <ChevronDown size={17} className={`shrink-0 transition-transform ${darkMode ? "text-slate-400" : "text-slate-500"} ${isGroupOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        <div aria-hidden={!isGroupOpen} inert={!isGroupOpen} className={`grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none ${isGroupOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="overflow-hidden">
            <div className={`space-y-2 border-t p-3 ${darkMode ? "border-slate-700" : "border-slate-200"}`}>
              {members.map((member) => (
                <ItemCard
                  key={member.key}
                  row={member}
                  isExpanded={expandedKeys.has(member.key)}
                  onToggle={() => onToggleKey(member.key)}
                  darkMode={darkMode}
                  getItemDimension={getItemDimension}
                  fallbackImage={fallbackImage}
                  expandedKeys={expandedKeys}
                  onToggleKey={onToggleKey}
                  onPhotoOpen={onPhotoOpen}
                  onUploadProgressPhoto={onUploadProgressPhoto}
                  notificationTarget={notificationTarget}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const { item, index, image, stages } = row;
  const name = getItemName(item, index);
  const size = getSizeLabel(item, getItemDimension);
  const { done, total } = getTimelineStageCounts(stages);
  const progress = total ? Math.round((done / total) * 100) : 0;
  const focusStage = getTimelineFocusStage(stages);
  const currentStage = stages.find((stage) => getTimelineStageStatus(stage) === "current");
  const summaryStage = currentStage || focusStage;

  if (isSingle) {
    return (
      <article className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-100"}`}>
            {image ? <img src={image} alt={name} loading="lazy" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = fallbackImage; }} /> : <Package size={20} className="text-slate-400" aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm font-semibold ${darkMode ? "text-white" : "text-slate-900"}`}>{name}</p>
            <p className={`mt-1 truncate text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{size}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>{done} of {total} stages done</p>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${getChipClass(stages, darkMode)}`}>
            {currentStage ? summaryStage?.label : focusStage && getTimelineStageStatus(focusStage) === "pending" ? `Next: ${summaryStage?.label}` : "Completed"}
          </span>
        </div>
        <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${darkMode ? "bg-slate-700" : "bg-slate-100"}`} role="progressbar" aria-label={`${name} stage progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>
        <StageList stages={stages} darkMode={darkMode} onPhotoOpen={onPhotoOpen} onUploadProgressPhoto={onUploadProgressPhoto} itemIndex={index} notificationTarget={notificationTarget} />
      </article>
    );
  }

  return (
    <article className={`overflow-hidden rounded-xl border ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggle}
        className={`w-full p-3 text-left transition ${darkMode ? "hover:bg-slate-800" : "hover:bg-slate-50"}`}
      >
        <span className="flex items-center gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-100"}`}>
            {image ? <img src={image} alt={name} loading="lazy" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = fallbackImage; }} /> : <Package size={18} className="text-slate-400" aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className={`truncate text-sm font-semibold ${darkMode ? "text-white" : "text-slate-900"}`}>{name}</span>
              <span className={`max-w-[45%] truncate rounded-full px-2 py-1 text-[10px] font-medium ${getChipClass(stages, darkMode)}`}>
                {getChipLabel(stages)}
              </span>
            </span>
            <span className={`mt-0.5 block truncate text-xs font-medium ${darkMode ? "text-slate-200" : "text-slate-700"}`}>{size} · {done} of {total} done</span>
          </span>
          <ChevronDown size={17} className={`shrink-0 transition-transform ${darkMode ? "text-slate-400" : "text-slate-500"} ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
        <span className="mt-3 flex w-full gap-1" aria-label={`${done} of ${total} stages done`}>
          {stages.map((stage, stageIndex) => {
            const status = getTimelineStageStatus(stage);
            const segmentClass = status === "done"
              ? "bg-emerald-600"
              : status === "current"
                ? "bg-amber-500"
                : darkMode ? "bg-slate-700" : "bg-slate-200";
            return <span key={`${stage.key || stageIndex}-${stageIndex}`} className={`h-1 min-w-1 flex-1 rounded-full ${segmentClass}`} />;
          })}
        </span>
      </button>
      <div aria-hidden={!isExpanded} inert={!isExpanded} className={`grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className={`border-t px-4 pb-3 ${darkMode ? "border-slate-700" : "border-slate-200"}`}>
            <StageList stages={stages} darkMode={darkMode} onPhotoOpen={onPhotoOpen} onUploadProgressPhoto={onUploadProgressPhoto} itemIndex={index} notificationTarget={notificationTarget} />
          </div>
        </div>
      </div>
    </article>
  );
}
