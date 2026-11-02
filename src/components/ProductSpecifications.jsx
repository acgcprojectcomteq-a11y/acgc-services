const PRICING_METHOD_LABELS = {
  per_piece: "Per piece",
  per_sqft: "Per area",
  sqft: "Per area",
  blade: "Per blade",
  per_blade: "Per blade",
  per_meter: "Per meter",
  fixed: "Fixed price",
};

const formatMeasurement = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-PH", { maximumFractionDigits: 2 }) : "";
};

export const getProductDimensionsLabel = (product = {}) => {
  const width = Number(product.width);
  const height = Number(product.height);
  const unit = product.measurement_unit || product.measurementUnit || "in";
  const hasWidth = Number.isFinite(width) && width > 0;
  const hasHeight = Number.isFinite(height) && height > 0;

  if (hasWidth && hasHeight) return `${formatMeasurement(width)} × ${formatMeasurement(height)} ${unit}`;
  if (hasWidth) return `Width ${formatMeasurement(width)} ${unit}`;
  if (hasHeight) return `Height ${formatMeasurement(height)} ${unit}`;

  const finishedDoorPricing = product.finished_door_pricing || {};
  if (finishedDoorPricing.enabled && Number(finishedDoorPricing.standard_size_cm) > 0) {
    const dimension = String(finishedDoorPricing.measurement_dimension || "height").toLowerCase();
    const dimensionLabel = dimension === "length" ? "Length" : dimension === "width" ? "Width" : "Height";
    return `${formatMeasurement(finishedDoorPricing.standard_size_cm)} cm (${dimensionLabel})`;
  }

  const savedSize = String(product.dimensions || product.standard_size || product.size || "")
    .replace(/\u00c3(?:\u0097|\u2014)|\u00c3\u0192\u00e2\u20ac\u201d/g, "×")
    .trim();
  return /^\d+(?:\.\d+)?$/.test(savedSize) ? `${savedSize} ${unit}` : savedSize;
};

export const getProductSpecifications = (product = {}) => {
  const specs = [];
  const add = (label, value) => {
    const text = String(value ?? "").trim();
    if (text) specs.push({ label, value: text });
  };

  add("Type", product.product_type || product.type);
  add("Category", product.category);
  add("Variant", product.variant);

  const width = Number(product.width);
  const height = Number(product.height);
  const hasWidth = Number.isFinite(width) && width > 0;
  const hasHeight = Number.isFinite(height) && height > 0;
  const unit = product.measurement_unit || product.measurementUnit || "in";
  if (hasWidth && hasHeight) {
    add("Dimensions", `${formatMeasurement(width)} × ${formatMeasurement(height)} ${unit}`);
  } else {
    if (hasWidth) add("Width", `${formatMeasurement(width)} ${unit}`);
    if (hasHeight) add("Height", `${formatMeasurement(height)} ${unit}`);
  }

  const finishedDoorPricing = product.finished_door_pricing || {};
  if (finishedDoorPricing.enabled && Number(finishedDoorPricing.standard_size_cm) > 0) {
    const dimension = String(finishedDoorPricing.measurement_dimension || "height").toLowerCase();
    const dimensionLabel = dimension === "length" ? "Length" : dimension === "width" ? "Width" : "Height";
    add("Standard size", `${formatMeasurement(finishedDoorPricing.standard_size_cm)} cm (${dimensionLabel})`);
  } else if (!hasWidth && !hasHeight) {
    add("Standard size", getProductDimensionsLabel(product));
  }

  const pricingMethod = product.pricing_method || product.unit;
  add("Price basis", PRICING_METHOD_LABELS[pricingMethod] || "");

  const glassTypes = (product.blade_glass_types || []).map((glass) => String(glass?.name || "").trim()).filter(Boolean);
  if (glassTypes.length) add("Glass types", glassTypes.join(", "));

  const frameTypes = (product.blade_frame_types || []).map((frame) => String(frame?.name || "").trim()).filter(Boolean);
  if (frameTypes.length) add("Frame options", frameTypes.join(", "));

  return specs;
};

export default function ProductSpecifications({ product, darkMode = false, className = "" }) {
  const specs = getProductSpecifications(product);
  if (!specs.length) return null;

  return (
    <section className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-800/70" : "border-slate-200 bg-slate-50"} ${className}`} aria-label="Product specifications">
      <h3 className={`text-sm font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Specifications</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {specs.map(({ label, value }) => (
          <div key={label} className="min-w-0">
            <dt className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{label}</dt>
            <dd className={`mt-1 break-words text-sm font-semibold ${darkMode ? "text-slate-100" : "text-slate-800"}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
