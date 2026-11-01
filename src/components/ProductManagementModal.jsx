import CustomerDropdown from "@/components/CustomerDropdown";
import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Search, Pencil, Trash2 } from 'lucide-react';
import * as catalogApi from '@/api/catalog';
import { formatDateToMMMDDYYYY } from '@/lib/dateUtils';

const getCatalogText = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    return String(value.name || value.type || value.variant || value.product_name || value.product_type || value.title || fallback);
  }
  return fallback;
};

const normalizeTypeItems = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return { id: item, name: item };
      const name = getCatalogText(item);
      return { ...item, id: item._id || item.id || name, name };
    });
  }
  return [];
};

const normalizeNameItems = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return { id: item, name: item, product_type: undefined };
      const name = getCatalogText(item);
      const product_type = getCatalogText(item.product_type);
      return { ...item, id: item._id || item.id || `${product_type}:${name}`, name, product_type };
    });
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([product_type, entries]) =>
      (Array.isArray(entries) ? entries : []).map((entry) => {
        const name = getCatalogText(entry);
        const itemProductType = getCatalogText(entry?.product_type, product_type);
        return {
          ...((entry && typeof entry === 'object') ? entry : {}),
          id: entry?._id || entry?.id || `${itemProductType}:${name}`,
          name,
          product_type: itemProductType,
        };
      })
    );
  }
  return [];
};

const normalizeCategoryItems = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return { id: item, name: item };
      const name = getCatalogText(item);
      return { ...item, id: item._id || item.id || name, name };
    });
  }
  return [];
};

const normalizeVariantItems = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return { id: item, name: item, product_name: undefined };
      const name = getCatalogText(item);
      const product_name = getCatalogText(item.product_name);
      return { ...item, id: item._id || item.id || `${product_name}:${name}`, name, product_name };
    });
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([product_name, entries]) =>
      (Array.isArray(entries) ? entries : []).map((entry) => {
        const name = getCatalogText(entry);
        const itemProductName = getCatalogText(entry?.product_name, product_name);
        return {
          ...((entry && typeof entry === 'object') ? entry : {}),
          id: entry?._id || entry?.id || `${itemProductName}:${name}`,
          name,
          product_name: itemProductName,
        };
      })
    );
  }
  return [];
};

export default function ProductManagementModal({ open, show, onClose, onChange, darkMode = false }) {
  const visible = open ?? show;
  const [tab, setTab] = useState('types');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 8;

  const [types, setTypes] = useState([]);
  const [names, setNames] = useState([]);
  const [categories, setCategories] = useState([]);
  const [variants, setVariants] = useState([]);

  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    try {
      const [t, n, c, v] = await Promise.allSettled([
        catalogApi.getTypes(),
        catalogApi.getNames(),
        catalogApi.getCategories(),
        catalogApi.getVariants(),
      ]);
      setTypes((t.status === 'fulfilled' && normalizeTypeItems(t.value.items || t.value)) || []);
      setNames((n.status === 'fulfilled' && normalizeNameItems(n.value.items || n.value)) || []);
      setCategories((c.status === 'fulfilled' && normalizeCategoryItems(c.value.items || c.value)) || []);
      setVariants((v.status === 'fulfilled' && normalizeVariantItems(v.value.items || v.value)) || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { if (visible) load(); }, [visible]);

  useEffect(() => { setPage(1); setQuery(''); setEditing(null); setConfirm(null); }, [tab]);

  const tabLabels = {
    types: 'Product Types',
    names: 'Product Names',
    categories: 'Categories',
    variants: 'Variants',
  };

  const items = useMemo(() => {
    const src = tab === 'types'
      ? types
      : tab === 'names'
      ? names
      : tab === 'categories'
      ? categories
      : variants;

    const normalized = Array.isArray(src) ? src : [];
    return normalized.filter((it) => {
      const searchable = [it.name, it.type, it.variant, it.product_type, it.product_name]
        .map((value) => getCatalogText(value))
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(query.toLowerCase());
    });
  }, [tab, types, names, categories, variants, query]);

  const paged = items.slice((page-1)*perPage, page*perPage);

  const saveItem = async (payload) => {
    try {
      if (tab === 'types') {
        if (payload.id) await catalogApi.updateType(payload.id, { name: payload.name });
        else await catalogApi.createType({ name: payload.name });
      }
      if (tab === 'names') {
        if (payload.id) await catalogApi.updateName(payload.id, { name: payload.name, product_type: payload.product_type });
        else await catalogApi.createName({ name: payload.name, product_type: payload.product_type });
      }
      if (tab === 'categories') {
        if (payload.id) await catalogApi.updateCategory(payload.id, { name: payload.name });
        else await catalogApi.createCategory({ name: payload.name });
      }
      if (tab === 'variants') {
        const payloadBody = { name: payload.name, product_name: payload.product_name };
        if (payload.id) await catalogApi.updateVariant(payload.id, payloadBody);
        else await catalogApi.createVariant(payloadBody);
      }
      await load();
      if (onChange) onChange({ tab, item: payload, action: 'save' });
      setEditing(null);
    } catch (err) { console.error(err); alert('Save failed'); }
  };

  const requestDelete = async (item) => {
    try {
      const usage = await catalogApi.checkUsage(tab, item._id || item.id).catch(()=>({count:0}));
      setConfirm({ item, usage: usage.count || 0 });
    } catch (e) { console.error(e); setConfirm({ item, usage: 0 }); }
  };

  const doDelete = async () => {
    if (!confirm) return;
    const id = confirm.item._id || confirm.item.id;
    try {
      if (tab === 'types') await catalogApi.deleteType(id);
      if (tab === 'names') await catalogApi.deleteName(id);
      if (tab === 'categories') await catalogApi.deleteCategory(id);
      if (tab === 'variants') await catalogApi.deleteVariant(id);
      await load();
      if (onChange) onChange({ tab, item: confirm.item, action: 'delete' });
      setConfirm(null);
    } catch (e) { console.error(e); alert('Delete failed'); }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
        <div className="border-b border-white/20 bg-gradient-to-r from-red-600 to-orange-500 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em]">Catalog</span>
                <span className="text-sm text-red-50">Reusable product setup</span>
              </div>
              <h3 className="mt-3 text-2xl font-semibold">Product Management</h3>
              <p className="mt-1 max-w-2xl text-sm text-red-50">Create and maintain product types, names, categories, and variants that power the product form.</p>
            </div>
            <button onClick={onClose} className="rounded-full p-2 text-white transition hover:bg-white/15" aria-label="Close product management">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="mb-4 flex flex-wrap gap-2">
            <Tab label="Product Types" active={tab==='types'} onClick={()=>setTab('types')} />
            <Tab label="Product Names" active={tab==='names'} onClick={()=>setTab('names')} />
            <Tab label="Categories" active={tab==='categories'} onClick={()=>setTab('categories')} />
            <Tab label="Variants" active={tab==='variants'} onClick={()=>setTab('variants')} />
          </div>

          <div className="mb-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-gray-400" size={16} />
                <input
                  value={query}
                  onChange={(e)=>setQuery(e.target.value)}
                  placeholder={`Search ${tabLabels[tab]}`}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none ring-0 focus:border-red-400"
                />
              </div>
              <button
                type="button"
                onClick={()=>setEditing({})}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                <Plus size={14} />
                Add {tabLabels[tab].replace('Product ', '')}
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
            <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">{tabLabels[tab]}</h4>
                  <p className="text-xs text-gray-500">Current catalog entries</p>
                </div>
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">{items.length} items</span>
              </div>

              {paged.length === 0 ? (
                <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-center">
                  <div>
                    <p className="font-medium text-gray-700">No {tabLabels[tab].toLowerCase()} yet</p>
                    <p className="mt-1 text-sm text-gray-500">Add a new item to start building the catalog.</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600">
                      <tr>
                        <th className="px-3 py-2">No.</th>
                        <th className="px-3 py-2">{tab==='types'?'Product Type':tab==='names'?'Product Name':tab==='categories'?'Category':'Variant'}</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {paged.map((it, idx) => (
                        <tr key={getCatalogText(it._id || it.id || it.name, `${tab}-${idx}`)} className="hover:bg-gray-50">
                          <td className="px-3 py-2">{(page-1)*perPage + idx + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-700">{getCatalogText(it.name || it.type || it.variant || it.template_name, 'Untitled')}</td>
                          <td className="px-3 py-2 text-gray-500">{formatDateToMMMDDYYYY(it.createdAt || it.created_at || it.created) || '-'}</td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" onClick={()=>setEditing(it)} className="rounded-lg p-2 text-gray-600 transition hover:bg-gray-100 hover:text-red-600"><Pencil size={14}/></button>
                            <button type="button" onClick={()=>requestDelete(it)} className="ml-1 rounded-lg p-2 text-gray-600 transition hover:bg-gray-100 hover:text-red-600"><Trash2 size={14}/></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-gray-600">Showing {(page-1)*perPage + 1} - {Math.min(page*perPage, items.length)} of {items.length}</div>
                <div className="flex gap-2">
                  <button type="button" disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60">Prev</button>
                  <button type="button" disabled={page*perPage>=items.length} onClick={()=>setPage(p=>p+1)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60">Next</button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
              {editing !== null ? (
                <div>
                  <div className="mb-4">
                    <h4 className="text-base font-semibold text-gray-900">{editing._id||editing.id ? 'Edit' : 'Add'} {tabLabels[tab].replace('Product ', '')}</h4>
                    <p className="text-sm text-gray-500">Update the details below and it will be available in the product form.</p>
                  </div>
                  <EditorForm
                    tab={tab}
                    item={editing}
                    types={types}
                    names={names}
                    onCancel={()=>setEditing(null)}
                    onSave={saveItem}
                  />
                </div>
              ) : (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-4 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                    <Plus size={20} />
                  </div>
                  <h4 className="text-base font-semibold text-gray-900">Create a catalog entry</h4>
                  <p className="mt-2 text-sm text-gray-500">Choose a tab and add a new item to start using it in the product form.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {confirm && (
          <ConfirmDialog confirm={confirm} onClose={()=>setConfirm(null)} onDelete={doDelete} />
        )}
      </div>
    </div>
  );
}

function Tab({label, active, onClick}){ return (<button onClick={onClick} className={`px-3 py-2 rounded ${active? 'bg-red-600 text-white':'bg-gray-100'}`}>{label}</button>); }

function EditorForm({tab, item={}, types=[], names={}, onCancel, onSave}){
  const [name, setName] = useState(getCatalogText(item.name || item.type || item.variant));
  const [productType, setProductType] = useState(getCatalogText(item.product_type || item.productType));
  const [productName, setProductName] = useState(getCatalogText(item.product_name || item.productName));
  const [formError, setFormError] = useState('');

  const tabLabels = {
    types: 'Product Types',
    names: 'Product Names',
    categories: 'Categories',
    variants: 'Variants',
  };

  useEffect(() => {
    setName(getCatalogText(item.name || item.type || item.variant));
    setProductType(getCatalogText(item.product_type || item.productType));
    setProductName(getCatalogText(item.product_name || item.productName));
    setFormError('');
  }, [item, tab]);

  const variantNameOptions = Array.isArray(names)
    ? names
    : names && typeof names === 'object'
      ? Object.values(names).flatMap((group) => Array.isArray(group) ? group : [])
      : [];

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Please enter a valid name.');
      return;
    }
    if (tab === 'names' && !productType) {
      setFormError('Please select a product type for this name.');
      return;
    }
    if (tab === 'variants' && !productName) {
      setFormError('Please select the product name this variant belongs to.');
      return;
    }

    const payload = {
      id: item._id || item.id,
      name: trimmedName,
      ...(tab === 'names' ? { product_type: productType } : {}),
      ...(tab === 'variants' ? { product_name: productName } : {}),
    };
    onSave(payload);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Name</label>
        <input
          className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-red-400"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Enter ${tab === 'types' ? 'product type' : tab === 'names' ? 'product name' : tab === 'categories' ? 'category' : 'variant'}`}
        />
      </div>

      {tab === 'names' && (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Product Type</label>
          <CustomerDropdown darkMode={darkMode}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-red-400"
            value={productType}
            onChange={(e) => setProductType(e.target.value)}
          >
            <option value="">Select product type</option>
            {types.map((t, index) => {
              const typeName = getCatalogText(t.name || t.type);
              return (
                <option key={getCatalogText(t._id || t.id || typeName, `type-${index}`)} value={typeName}>
                  {typeName}
                </option>
              );
            })}
          </CustomerDropdown>
          <p className="mt-1 text-xs text-gray-500">Product names are grouped under a product type to keep the catalog consistent.</p>
        </div>
      )}

      {tab === 'variants' && (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Product Name</label>
          <CustomerDropdown darkMode={darkMode}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-red-400"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
          >
            <option value="">Select product name</option>
            {variantNameOptions.map((item, index) => {
              const optionName = getCatalogText(item.name || item.product_name);
              return (
                <option key={getCatalogText(item.id || item._id || optionName, `name-${index}`)} value={optionName}>
                  {optionName}
                </option>
              );
            })}
          </CustomerDropdown>
          <p className="mt-1 text-xs text-gray-500">Variants are attached to a product name to keep pricing and customization correct.</p>
        </div>
      )}

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
        <button type="button" className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          onClick={handleSave}
        >
          Save {tabLabels[tab].replace('Product ', '')}
        </button>
      </div>
    </div>
  );
}

function ConfirmDialog({confirm, onClose, onDelete}){
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h4 className="text-lg font-semibold text-gray-900">Confirm Delete</h4>
        <p className="mt-2 text-sm text-gray-600">Are you sure you want to delete <strong>{getCatalogText(confirm.item.name, 'this item')}</strong>?</p>
        {confirm.usage > 0 && (<p className="mt-2 text-sm text-red-600">This item is currently used by existing products. Deleting it may affect product records.</p>)}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50" onClick={onClose}>Cancel</button>
          <button type="button" className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700" onClick={onDelete}>Delete</button>
        </div>
      </div>
    </div>
  );
}
