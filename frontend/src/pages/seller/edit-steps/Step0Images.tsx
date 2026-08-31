import { useRef, useCallback, type ChangeEvent, type DragEvent } from 'react';
import { ImagePlus, X, GripVertical } from 'lucide-react';
import type { EditForm } from '../SellerEditProductModal';

function uid() { return Math.random().toString(36).slice(2); }

export default function Step0Images({ form, patch, errors, clearError }: {
  form: EditForm;
  patch: (p: Partial<EditForm>) => void;
  errors: Record<string, string>;
  clearError: (k: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragItem = useRef<{ type: 'existing' | 'new'; index: number } | null>(null);
  const dragOver = useRef<{ type: 'existing' | 'new'; index: number } | null>(null);

  const totalCount = form.existingImages.length + form.newImages.length;

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const next = [...form.newImages];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      next.push({ id: uid(), file, preview: URL.createObjectURL(file) });
    });
    patch({ newImages: next });
    clearError('images');
  }, [form.newImages, patch, clearError]);

  const removeExisting = (id: number) => {
    patch({
      existingImages: form.existingImages.filter((img) => img.id !== id),
      deletedImageIds: [...form.deletedImageIds, id],
    });
    clearError('images');
  };

  const removeNew = (id: string) => {
    patch({ newImages: form.newImages.filter((img) => img.id !== id) });
    clearError('images');
  };

  const onDrop = (e: DragEvent) => { e.preventDefault(); addFiles(e.dataTransfer.files); };

  type FlatItem =
    | { kind: 'existing'; index: number; id: number; url: string }
    | { kind: 'new'; index: number; id: string; preview: string };

  const flatItems: FlatItem[] = [
    ...form.existingImages.map((img, i) => ({ kind: 'existing' as const, index: i, id: img.id, url: img.url })),
    ...form.newImages.map((img, i) => ({ kind: 'new' as const, index: i, id: img.id, preview: img.preview })),
  ];

  const handleDragEnd = () => {
    const from = dragItem.current;
    const to = dragOver.current;
    if (!from || !to || (from.type === to.type && from.index === to.index)) {
      dragItem.current = null; dragOver.current = null; return;
    }
    if (from.type === 'existing' && to.type === 'existing') {
      const next = [...form.existingImages];
      const [moved] = next.splice(from.index, 1);
      next.splice(to.index, 0, moved);
      patch({ existingImages: next });
    }
    if (from.type === 'new' && to.type === 'new') {
      const next = [...form.newImages];
      const [moved] = next.splice(from.index, 1);
      next.splice(to.index, 0, moved);
      patch({ newImages: next });
    }
    dragItem.current = null; dragOver.current = null;
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] font-semibold text-gray-700">
          Product Images<span className="text-brand-red ml-0.5">*</span>
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          First image is the main photo shown to buyers. Drag thumbnails to reorder.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          'border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 py-8 cursor-pointer transition-all',
          errors.images
            ? 'border-red-300 bg-red-50/40'
            : 'border-gray-200 hover:border-brand-red hover:bg-red-50/30',
        ].join(' ')}
      >
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <ImagePlus className="w-5 h-5 text-gray-400" />
        </div>
        <p className="text-[13px] font-semibold text-gray-500">
          Drop images here, or <span className="text-brand-red">browse</span>
        </p>
        <p className="text-[11px] text-gray-400">PNG, JPG, WEBP · max 5 MB each</p>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden
          onChange={(e: ChangeEvent<HTMLInputElement>) => addFiles(e.target.files)} />
      </div>

      {/* Image grid */}
      {flatItems.length > 0 && (
        <div className="grid grid-cols-4 gap-2.5">
          {flatItems.map((item, flatIdx) => {
            const src = item.kind === 'existing' ? item.url : item.preview;
            return (
              <div
                key={item.kind === 'existing' ? `e-${item.id}` : `n-${item.id}`}
                draggable
                onDragStart={() => { dragItem.current = { type: item.kind, index: item.index }; }}
                onDragEnter={() => { dragOver.current = { type: item.kind, index: item.index }; }}
                onDragEnd={handleDragEnd}
                className="relative group w-full aspect-square rounded-xl overflow-hidden border-2 border-gray-100 cursor-grab active:cursor-grabbing hover:border-brand-red transition-colors"
              >
                <img src={src} alt="" className="w-full h-full object-cover" />
                {flatIdx === 0 && (
                  <span className="absolute bottom-0 left-0 right-0 bg-brand-red/90 text-white text-[9px] font-bold text-center py-0.5 tracking-wide">
                    MAIN
                  </span>
                )}
                {item.kind === 'new' && (
                  <span className="absolute top-1 left-1 bg-blue-500 text-white text-[8px] font-bold px-1 py-0.5 rounded">
                    NEW
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    item.kind === 'existing' ? removeExisting(item.id) : removeNew(item.id);
                  }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
                <GripVertical className="absolute bottom-6 right-1 w-3.5 h-3.5 text-white/60 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            );
          })}
        </div>
      )}

      {errors.images && <p className="text-[11px] text-red-500 font-medium">{errors.images}</p>}
      {totalCount > 0 && (
        <p className="text-[11px] text-gray-400">{totalCount} image{totalCount !== 1 ? 's' : ''} total</p>
      )}
    </div>
  );
}
