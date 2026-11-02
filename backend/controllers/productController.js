import Product from "../models/Product.js";

const trimText = (value) => String(value ?? "").trim();
const isJalousiePerBladeProduct = (product = {}) => {
  const name = String(product.product_name || product.name || "");
  const method = String(product.pricing_method || (/jalousie/i.test(name) ? "blade" : "")).trim().toLowerCase();
  return ["blade", "per_blade"].includes(method) && /jalousie/i.test(name);
};
const toNonNegativeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};
const hasProductImage = ({ image_url, images } = {}) => {
  if (trimText(image_url)) return true;
  if (typeof images === "string") return Boolean(trimText(images));
  if (Array.isArray(images)) {
    return images.some((image) => trimText(typeof image === "string" ? image : image?.url));
  }
  if (images && typeof images === "object") {
    return Object.values(images).some((image) => trimText(image));
  }
  return false;
};
const validateProductPayload = (payload, existingProduct = null) => {
  const merged = existingProduct ? { ...existingProduct.toObject(), ...payload } : payload;
  const productName = trimText(merged.product_name || merged.name);
  const productType = trimText(merged.product_type);
  const category = trimText(merged.category);
  const pricingMethod = trimText(merged.pricing_method);
  const isJalousieBlade = isJalousiePerBladeProduct(merged);
  const allowCustomFrameSize = !isJalousieBlade && Boolean(merged.allow_custom_frame_size);
  const doorPricing = merged.finished_door_pricing || {};
  const isFinishedDoor = /finished\s*door/i.test(`${productType} ${productName}`);
  const frameTypes = Array.isArray(merged.blade_frame_types) ? merged.blade_frame_types : [];
  const sellWithFrame = Boolean(merged.sell_with_frame) && (!isJalousieBlade || frameTypes.length > 0);
  const defaultSaleMode = isJalousieBlade
    && merged.default_sale_mode === "frame"
    && !frameTypes.some((frame) => frame.name === merged.default_frame_type)
    && merged.sell_blades_only !== false
    ? "blades_only"
    : merged.default_sale_mode;
  const image_url = payload.image_url !== undefined ? payload.image_url : merged.image_url;
  const images = payload.images !== undefined ? payload.images : merged.images;

  if (!productName) return "Product name is required.";
  if (!productType) return "Product type is required.";
  if (!category) return "Category is required.";
  if (!trimText(merged.variant) && !existingProduct && pricingMethod !== "blade") return "Variant is required.";
  if (!hasProductImage({ image_url, images })) return "Main product photo is required.";
  const allowedMethods = ["sqft", "blade", "fixed", "per_piece", "per_meter"];
  if (!allowedMethods.includes(pricingMethod)) {
    return "A valid pricing method is required.";
  }

  if (isFinishedDoor && doorPricing.enabled) {
    if (pricingMethod !== "per_piece") return "Finished Door pricing must use Per Piece.";
    if (!Number.isFinite(Number(doorPricing.standard_size_cm)) || Number(doorPricing.standard_size_cm) <= 0) return "Standard size must be greater than zero.";
    if (!Number.isFinite(Number(doorPricing.standard_price_per_piece)) || Number(doorPricing.standard_price_per_piece) < 0) return "Standard price cannot be negative.";
    if (!Number.isFinite(Number(doorPricing.additional_price_per_cm)) || Number(doorPricing.additional_price_per_cm) < 0) return "Additional price per centimeter cannot be negative.";
    if (!["width", "height", "length"].includes(doorPricing.measurement_dimension)) return "Choose a valid Finished Door measurement dimension.";
  }

  if (merged.estimated_price_override != null && (!Number.isFinite(Number(merged.estimated_price_override)) || Number(merged.estimated_price_override) < 0)) {
    return "Product price override must be a valid non-negative amount.";
  }

  if (pricingMethod === "sqft") {
    if (toNonNegativeNumber(merged.width) <= 0 || toNonNegativeNumber(merged.height) <= 0) {
      return "Width and height must be greater than 0.";
    }
    const areaOptions = Array.isArray(merged.area_options) ? merged.area_options : [];
    if (areaOptions.some((option) => {
      const price = String(option?.price_per_sqft ?? "").trim();
      return !trimText(option?.name)
        || (price && (!Number.isFinite(Number(option.price_per_sqft)) || Number(option.price_per_sqft) <= 0));
    })) {
      return "Each area option needs a name, and any entered price must be greater than zero.";
    }
    const areaOptionNames = areaOptions.map((option) => trimText(option.name).toLowerCase());
    if (new Set(areaOptionNames).size !== areaOptionNames.length) return "Area option names must be unique.";
    if (toNonNegativeNumber(merged.price_per_sqft) <= 0 && areaOptions.length === 0) {
      return "Price per sq ft is required.";
    }
  }

  if (pricingMethod === "blade") {
    const glassTypes = Array.isArray(merged.blade_glass_types) ? merged.blade_glass_types : [];
    if (!glassTypes.length && toNonNegativeNumber(merged.price_per_blade) <= 0) {
      return "Add at least one glass type with a price per blade.";
    }
    if (glassTypes.some((glass) => !trimText(glass?.name) || toNonNegativeNumber(glass?.price_per_blade) <= 0)) {
      return "Each glass type needs a name and a price per blade greater than zero.";
    }
    if (!merged.sell_blades_only && !sellWithFrame) {
      return "Enable at least one selling option: blades only or blades with frame.";
    }
    if (sellWithFrame && !frameTypes.length && !allowCustomFrameSize) {
      return "Add at least one frame type or enable custom frame size.";
    }
    if (frameTypes.some((frame) => !trimText(frame?.name) || toNonNegativeNumber(frame?.blade_count) <= 0 || !Number.isFinite(Number(frame?.price)) || Number(frame.price) < 0)) {
      return "Each frame type needs a name, blade count, and valid frame price.";
    }
    if (allowCustomFrameSize && toNonNegativeNumber(merged.custom_frame_price) <= 0) {
      return "Custom frame price must be greater than zero.";
    }
    const minimumBlades = Math.max(1, Number(merged.minimum_blades) || 1);
    const maximumBlades = Number(merged.maximum_blades) || 0;
    if (maximumBlades > 0 && maximumBlades < minimumBlades) {
      return "Maximum blades cannot be lower than minimum blades.";
    }
    const largestFrameBladeCount = Math.max(0, ...frameTypes.map((frame) => Number(frame?.blade_count) || 0));
    if (maximumBlades > 0 && largestFrameBladeCount > maximumBlades) {
      return "Maximum blades cannot be lower than the blade count of any frame type.";
    }
    if (glassTypes.length && !glassTypes.some((glass) => glass.name === merged.default_blade_glass_type)) {
      return "Choose a default glass type from the configured glass types.";
    }
    if (defaultSaleMode === "frame" && !sellWithFrame) {
      return "The default sale mode must be one of the enabled selling options.";
    }
    if (defaultSaleMode === "blades_only" && !merged.sell_blades_only) {
      return "The default sale mode must be one of the enabled selling options.";
    }
    if (defaultSaleMode === "frame" && frameTypes.length && !frameTypes.some((frame) => frame.name === merged.default_frame_type)) {
      return "Choose a default frame type from the configured frame types.";
    }
    if (defaultSaleMode === "frame" && !frameTypes.length && !allowCustomFrameSize) {
      return "Choose a default frame type or enable custom frame size.";
    }
  }

  if (pricingMethod === "per_piece") {
    const pieceOptions = Array.isArray(merged.piece_options) ? merged.piece_options : [];
    if (pieceOptions.some((option) => !trimText(option?.name) || !Number.isFinite(Number(option?.price_per_piece)) || Number(option.price_per_piece) <= 0)) {
      return "Each option needs a name and a price per piece greater than zero.";
    }
    const names = pieceOptions.map((option) => trimText(option.name).toLowerCase());
    if (new Set(names).size !== names.length) return "Option names must be unique.";
  }

  const hasValidPieceOptionPricing = pricingMethod === "per_piece"
    && Array.isArray(merged.piece_options)
    && merged.piece_options.length > 0
    && merged.piece_options.every((option) => trimText(option?.name) && toNonNegativeNumber(option?.price_per_piece) > 0);
  if ((pricingMethod === "fixed" || pricingMethod === "per_piece") && !(isFinishedDoor && doorPricing.enabled) && !hasValidPieceOptionPricing && toNonNegativeNumber(merged.base_price || merged.unit_price) <= 0) {
    return "Base price is required for fixed price products.";
  }

  if (pricingMethod === "per_meter") {
    if (toNonNegativeNumber(merged.width) <= 0) return "Length must be greater than 0 for per-meter products.";
    if (toNonNegativeNumber(merged.unit_price) <= 0) return "Price per meter is required.";
  }

  if (merged.extra_charges != null && !Array.isArray(merged.extra_charges)) {
    return "Extra charges must be a list.";
  }
  for (const charge of merged.extra_charges || []) {
    if (!trimText(charge?.name) || trimText(charge?.amount) === "" || !Number.isFinite(Number(charge.amount)) || Number(charge.amount) < 0) {
      return "Each extra charge needs a name and a valid amount.";
    }
    if (!["fixed", "per_sqft", "per_blade", "percentage"].includes(charge.type)) {
      return "Each extra charge needs a valid calculation type.";
    }
  }

  const limits = merged.size_limits || {};
  if (limits.unit && !["in", "ft", "cm", "m"].includes(limits.unit)) {
    return "Size limit unit must be in, ft, cm, or m.";
  }
  if ((Number(limits.min_width) > 0 && Number(limits.max_width) > 0 && Number(limits.min_width) > Number(limits.max_width))
    || (Number(limits.min_height) > 0 && Number(limits.max_height) > 0 && Number(limits.min_height) > Number(limits.max_height))) {
    return "A minimum size cannot be greater than its maximum.";
  }

  return "";
};

export const listProducts = async (req, res) => {
  try {
    const { search, category, adminOnly, featured } = req.query;
    const filter = {};

    // By default only show active products to non-admin (public) requests
    if (adminOnly !== "true") {
      filter.is_active = true;
    }

    if (featured === "true") {
      filter.is_featured = true;
    }

    if (category && category !== "all") {
      filter.category = category.toLowerCase();
    }

    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [{ name: regex }, { sku: regex }, { description: regex }];
    }

    const productQuery = Product.find(filter).sort({ is_featured: -1, createdAt: -1 });
    if (adminOnly !== "true") {
      productQuery.select("name sku category description unit_price unit measurement_unit stock_quantity is_featured image_url images product_type product_name pricing_method variant base_price price_per_sqft price_per_blade customization customization_fee extra_charges size_limits standard_size finished_door_pricing width height blade_count blade_glass_types piece_options area_options sell_blades_only sell_with_frame blade_frame_types allow_custom_frame_size custom_frame_size_unit custom_frame_price minimum_blades maximum_blades customer_can_choose_blade_count default_blade_glass_type default_sale_mode default_frame_type show_price_per_blade estimated_area estimated_price estimated_price_override is_active");
    }
    const products = await productQuery.lean();
    res.json({ success: true, products });
  } catch (error) {
    console.error("List products error:", error);
    res.status(500).json({ success: false, message: "Unable to list products", error: error.message });
  }
};

export const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    res.json({ success: true, product });
  } catch (error) {
    console.error("Get product error:", error);
    res.status(500).json({ success: false, message: "Unable to get product", error: error.message });
  }
};

export const createProduct = async (req, res) => {
  try {
    const {
      name,
      sku,
      category,
      description,
      unit_price,
      unit,
      measurement_unit,
      stock_quantity,
      image_url,
      // ERP fields
      product_type,
      product_name,
      pricing_method,
      variant,
      base_price,
      price_per_sqft,
      price_per_blade,
      customization,
      customization_fee,
      extra_charges,
      size_limits,
      standard_size,
      finished_door_pricing,
      width,
      height,
      blade_count,
      blade_glass_types,
      piece_options,
      area_options,
      sell_blades_only,
      sell_with_frame,
      blade_frame_types,
      allow_custom_frame_size,
      custom_frame_size_unit,
      custom_frame_price,
      minimum_blades,
      maximum_blades,
      customer_can_choose_blade_count,
      default_blade_glass_type,
      default_sale_mode,
      default_frame_type,
      show_price_per_blade,
      estimated_area,
      estimated_price,
      estimated_price_override,
      images,
    } = req.body;

    const validationError = validateProductPayload(req.body);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const categoryValue = String(category || "other").trim().toLowerCase();
    const productNameValue = trimText(product_name || name);
    const isJalousieBlade = isJalousiePerBladeProduct({ product_name: productNameValue, pricing_method });
    const frameTypes = Array.isArray(blade_frame_types) ? blade_frame_types : [];
    const normalizedSellWithFrame = Boolean(sell_with_frame) && (!isJalousieBlade || frameTypes.length > 0);
    const normalizedDefaultSaleMode = isJalousieBlade
      && default_sale_mode === "frame"
      && !frameTypes.some((frame) => frame.name === default_frame_type)
      && sell_blades_only !== false
      ? "blades_only"
      : default_sale_mode || (normalizedSellWithFrame && sell_blades_only === false ? "frame" : "blades_only");

    const product = new Product({
      name: productNameValue,
      sku: sku || "",
      category: categoryValue,
      description: description || "",
      unit_price: Number(unit_price) || 0,
      unit: unit || "per_piece",
      measurement_unit: measurement_unit || "in",
      stock_quantity: Number(stock_quantity) || 0,
      is_featured: req.body.is_featured !== undefined ? Boolean(req.body.is_featured) : false,
      image_url: image_url || "",
      created_by: req.user?.id || undefined,
      // ERP fields
      product_type: trimText(product_type),
      product_name: productNameValue,
      pricing_method: pricing_method || "",
      variant: variant || "",
      base_price: Number(base_price) || 0,
      price_per_sqft: Number(price_per_sqft) || 0,
      price_per_blade: Number(price_per_blade) || 0,
      customization: Boolean(customization),
      customization_fee: Number(customization_fee) || 0,
      extra_charges: Array.isArray(extra_charges) ? extra_charges : [],
      size_limits: isJalousieBlade ? {} : size_limits || {},
      standard_size: isJalousieBlade ? "" : standard_size || "",
      finished_door_pricing: finished_door_pricing || { enabled: false },
      width: isJalousieBlade ? 0 : Number(width) || 0,
      height: isJalousieBlade ? 0 : Number(height) || 0,
      blade_count: Number(blade_count) || 0,
      blade_glass_types: Array.isArray(blade_glass_types) ? blade_glass_types : [],
      piece_options: Array.isArray(piece_options) ? piece_options : [],
      area_options: Array.isArray(area_options) ? area_options : [],
      sell_blades_only: sell_blades_only !== false,
      sell_with_frame: normalizedSellWithFrame,
      blade_frame_types: Array.isArray(blade_frame_types) ? blade_frame_types : [],
      allow_custom_frame_size: !isJalousieBlade && Boolean(allow_custom_frame_size),
      custom_frame_size_unit: custom_frame_size_unit || measurement_unit || "in",
      custom_frame_price: isJalousieBlade ? 0 : Number(custom_frame_price) || 0,
      minimum_blades: Math.max(1, Number(minimum_blades) || 1),
      maximum_blades: Number(maximum_blades) || 0,
      customer_can_choose_blade_count: Boolean(customer_can_choose_blade_count),
      default_blade_glass_type: default_blade_glass_type || "",
      default_sale_mode: normalizedDefaultSaleMode,
      default_frame_type: default_frame_type || "",
      show_price_per_blade: show_price_per_blade !== false,
      estimated_area: Number(estimated_area) || 0,
      estimated_price: Number(estimated_price) || 0,
      estimated_price_override: Number(estimated_price_override) || 0,
      images: images || {},
      is_active: req.body.is_active !== undefined ? Boolean(req.body.is_active) : true,
    });

    await product.save();
    res.status(201).json({ success: true, product });
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json({ success: false, message: "Unable to create product", error: error.message });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const validationError = validateProductPayload(req.body, product);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const updatedName = trimText(req.body.product_name ?? req.body.name ?? product.product_name ?? product.name);
    const updatedPricingMethod = req.body.pricing_method ?? product.pricing_method;
    const updatedBladeFrameTypes = req.body.blade_frame_types ?? product.blade_frame_types ?? [];
    const updatedDefaultFrameType = req.body.default_frame_type ?? product.default_frame_type;
    const updatedSellBladesOnly = req.body.sell_blades_only != null ? Boolean(req.body.sell_blades_only) : product.sell_blades_only;
    const isJalousieBlade = isJalousiePerBladeProduct({ product_name: updatedName, pricing_method: updatedPricingMethod });
    const requestedSellWithFrame = req.body.sell_with_frame != null ? Boolean(req.body.sell_with_frame) : Boolean(product.sell_with_frame);
    const normalizedSellWithFrame = requestedSellWithFrame && (!isJalousieBlade || updatedBladeFrameTypes.length > 0);
    const updatedDefaultSaleMode = req.body.default_sale_mode ?? product.default_sale_mode;
    const normalizedDefaultSaleMode = isJalousieBlade
      && updatedDefaultSaleMode === "frame"
      && !updatedBladeFrameTypes.some((frame) => frame.name === updatedDefaultFrameType)
      && updatedSellBladesOnly
      ? "blades_only"
      : updatedDefaultSaleMode || (normalizedSellWithFrame && !updatedSellBladesOnly ? "frame" : "blades_only");
    const updates = {
      name: updatedName,
      sku: req.body.sku ?? product.sku,
      category: String(req.body.category ?? product.category ?? "other").trim().toLowerCase(),
      description: req.body.description ?? product.description,
      unit_price: req.body.unit_price != null ? Number(req.body.unit_price) : product.unit_price,
      unit: req.body.unit ?? product.unit,
      measurement_unit: req.body.measurement_unit ?? product.measurement_unit,
      stock_quantity: req.body.stock_quantity != null ? Number(req.body.stock_quantity) : product.stock_quantity,
      is_featured: req.body.is_featured != null ? Boolean(req.body.is_featured) : product.is_featured,
      image_url: req.body.image_url ?? product.image_url,
      // ERP fields
      product_type: trimText(req.body.product_type ?? product.product_type),
      product_name: updatedName,
      pricing_method: updatedPricingMethod,
      variant: req.body.variant ?? product.variant,
      base_price: req.body.base_price != null ? Number(req.body.base_price) : product.base_price,
      price_per_sqft: req.body.price_per_sqft != null ? Number(req.body.price_per_sqft) : product.price_per_sqft,
      price_per_blade: req.body.price_per_blade != null ? Number(req.body.price_per_blade) : product.price_per_blade,
      customization: req.body.customization != null ? Boolean(req.body.customization) : product.customization,
      customization_fee: req.body.customization_fee != null ? Number(req.body.customization_fee) : product.customization_fee,
      extra_charges: req.body.extra_charges != null ? req.body.extra_charges : product.extra_charges,
      size_limits: isJalousieBlade ? {} : req.body.size_limits != null ? req.body.size_limits : product.size_limits,
      standard_size: isJalousieBlade ? "" : req.body.standard_size != null ? String(req.body.standard_size) : product.standard_size,
      finished_door_pricing: req.body.finished_door_pricing != null ? req.body.finished_door_pricing : product.finished_door_pricing,
      width: isJalousieBlade ? 0 : req.body.width != null ? Number(req.body.width) : product.width,
      height: isJalousieBlade ? 0 : req.body.height != null ? Number(req.body.height) : product.height,
      blade_count: req.body.blade_count != null ? Number(req.body.blade_count) : product.blade_count,
      blade_glass_types: req.body.blade_glass_types != null ? req.body.blade_glass_types : product.blade_glass_types,
      piece_options: req.body.piece_options != null ? req.body.piece_options : product.piece_options,
      area_options: req.body.area_options != null ? req.body.area_options : product.area_options,
      sell_blades_only: req.body.sell_blades_only != null ? Boolean(req.body.sell_blades_only) : product.sell_blades_only,
      sell_with_frame: normalizedSellWithFrame,
      blade_frame_types: req.body.blade_frame_types != null ? req.body.blade_frame_types : product.blade_frame_types,
      allow_custom_frame_size: isJalousieBlade ? false : req.body.allow_custom_frame_size != null ? Boolean(req.body.allow_custom_frame_size) : product.allow_custom_frame_size,
      custom_frame_size_unit: req.body.custom_frame_size_unit ?? product.custom_frame_size_unit,
      custom_frame_price: isJalousieBlade ? 0 : req.body.custom_frame_price != null ? Number(req.body.custom_frame_price) : product.custom_frame_price,
      minimum_blades: req.body.minimum_blades != null ? Number(req.body.minimum_blades) : product.minimum_blades,
      maximum_blades: req.body.maximum_blades != null ? Number(req.body.maximum_blades) : product.maximum_blades,
      customer_can_choose_blade_count: req.body.customer_can_choose_blade_count != null ? Boolean(req.body.customer_can_choose_blade_count) : product.customer_can_choose_blade_count,
      default_blade_glass_type: req.body.default_blade_glass_type ?? product.default_blade_glass_type,
      default_sale_mode: normalizedDefaultSaleMode,
      default_frame_type: req.body.default_frame_type ?? product.default_frame_type,
      show_price_per_blade: req.body.show_price_per_blade != null ? Boolean(req.body.show_price_per_blade) : product.show_price_per_blade,
      estimated_area: req.body.estimated_area != null ? Number(req.body.estimated_area) : product.estimated_area,
      estimated_price: req.body.estimated_price != null ? Number(req.body.estimated_price) : product.estimated_price,
      estimated_price_override: req.body.estimated_price_override != null ? Number(req.body.estimated_price_override) : product.estimated_price_override || 0,
      images: req.body.images ?? product.images,
      is_active: req.body.is_active != null ? Boolean(req.body.is_active) : product.is_active,
    };

    Object.assign(product, updates);
    await product.save();
    res.json({ success: true, product });
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({ success: false, message: "Unable to update product", error: error.message });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    await product.deleteOne();
    res.json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({ success: false, message: "Unable to delete product", error: error.message });
  }
};
