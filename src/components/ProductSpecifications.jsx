const PRICING_METHOD_LABELS = {
  per_piece: "Per piece",
  per_sqft: "Per area",
  sqft: "Per area",
  blade: "Per blade",
  per_blade: "Per blade",
  per_meter: "Per meter",
  fixed: "Fixed price",
};

const MEASUREMENT_UNIT_LABELS = {
  in: "Inches (in)",
  ft: "Feet (ft)",
  cm: "Centimeters (cm)",
  m: "Meters (m)",
};

const formatMeasurement = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-PH", { maximumFractionDigits: 2 }) : "";
};

const capitalizeWords = (value) => String(value ?? "").trim().replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());

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
  add("Category", capitalizeWords(product.category));
  add("Variant", product.variant);

  const width = Number(product.width);
  const height = Number(product.height);
  const hasWidth = Number.isFinite(width) && width > 0;
  const hasHeight = Number.isFinite(height) && height > 0;
  const unit = product.measurement_unit || product.measurementUnit || "in";
  const unitLabel = MEASUREMENT_UNIT_LABELS[String(unit).trim().toLowerCase()] || unit;
  if (hasWidth && hasHeight) {
    add("Dimensions", `Width: ${formatMeasurement(width)} × Height: ${formatMeasurement(height)}`);
  } else {
    if (hasWidth) add("Width", formatMeasurement(width));
    if (hasHeight) add("Height", formatMeasurement(height));
  }
  if (hasWidth || hasHeight) add("Size unit", unitLabel);
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

export default function ProductSpecifications({ product, darkMode = false, className = "", compact = false }) {
  const specs = getProductSpecifications(product);
  if (!specs.length) return null;

  return (
    <section className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-800/70" : "border-slate-200 bg-white"} ${className}`} aria-label="Product specifications">
      <h3 className={`text-sm font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Specifications</h3>
      <dl className={`mt-3 grid gap-x-4 gap-y-3 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
        {specs.map(({ label, value }) => (
          <div key={label} className="min-w-0">
            <dt className={`text-xs font-bold uppercase tracking-[0.08em] ${darkMode ? "text-red-300" : "text-red-700"}`}>{label}</dt>
            <dd className={`mt-1 break-words text-sm font-semibold ${darkMode ? "text-slate-100" : "text-slate-800"}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
