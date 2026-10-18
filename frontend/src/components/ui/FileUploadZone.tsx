import { useState, useRef } from 'react';
import { UploadCloud, FileText, X, Image as ImageIcon } from 'lucide-react';

interface FileUploadZoneProps {
  label: string;
  file: File | null;
  onChange: (file: File) => void;
  onClear: () => void;
  error?: string;
  accept?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
}

export default function FileUploadZone({
  label,
  file,
  onChange,
  onClear,
  error,
  accept = '.jpg,.jpeg,.png,.pdf',
  hint = 'JPG, PNG, or PDF — max 5MB',
  required = false,
  disabled = false,
}: FileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function handlePick(selectedFile: File) {
    setLocalError(null);

    // Validate extension against what this field accepts (the server also checks the file's real content)
    const validExtensions = accept.split(',').map((a) => a.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!ext || !validExtensions.includes(ext)) {
      const names = Array.from(new Set(validExtensions.map((e) => (e === 'jpeg' ? 'jpg' : e).toUpperCase())));
      setLocalError(`Only ${names.join(', ')} files are allowed.`);
      return;
    }

    // Validate size (max 5 MB = 5,242,880 bytes; exactly 5 MB is allowed)
    if (selectedFile.size > 5 * 1024 * 1024) {
      setLocalError('The file is larger than 5 MB. Choose a file up to 5 MB.');
      return;
    }

    onChange(selectedFile);
    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  }

  function handleClear() {
    setPreview(null);
    setLocalError(null);
    onClear();
    if (inputRef.current) inputRef.current.value = '';
  }

  const isPdf = file?.type === 'application/pdf' || file?.name.toLowerCase().endsWith('.pdf');
  const displayError = error || localError;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-brand-gray-mid">
        {label} {required && <span className="text-brand-red">*</span>}
        <span className="text-xs text-gray-400 font-normal ml-1">({hint})</span>
      </label>

      {!file ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!disabled) {
              const dropped = e.dataTransfer.files[0];
              if (dropped) handlePick(dropped);
            }
          }}
          className={[
            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer',
            'min-h-[120px] px-4 py-6 transition-all duration-150',
            disabled ? 'opacity-60 cursor-not-allowed bg-gray-50 border-gray-200' : '',
            dragging
              ? 'border-brand-red bg-red-50'
              : displayError
              ? 'border-red-400 bg-red-50/30'
              : 'border-gray-200 bg-gray-50 hover:border-brand-red hover:bg-red-50/20',
          ].filter(Boolean).join(' ')}
          aria-label={`Upload ${label}`}
        >
          <UploadCloud className={`w-8 h-8 ${dragging ? 'text-brand-red' : 'text-gray-300'}`} />
          <p className="text-sm font-semibold text-gray-600">Click to upload or drag &amp; drop</p>
          <p className="text-xs text-gray-400">{hint}</p>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePick(f);
            }}
          />
        </div>
      ) : (
        <div className="relative rounded-xl border-2 border-brand-red/30 bg-red-50/20 overflow-hidden">
          {isPdf ? (
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-brand-red" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand-black truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB &middot; PDF Document</p>
              </div>
            </div>
          ) : preview ? (
            <div className="relative">
              <img
                src={preview}
                alt="File preview"
                className="w-full max-h-48 object-contain bg-gray-50 rounded-t-xl"
              />
              <div className="px-4 py-2 flex items-center gap-2 border-t border-red-100">
                <ImageIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <p className="text-xs text-gray-600 truncate flex-1">{file.name}</p>
                <p className="text-xs text-gray-400 shrink-0">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <ImageIcon className="w-5 h-5 text-brand-red" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand-black truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:border-red-400 hover:text-brand-red transition-colors focus:outline-none focus:ring-2 focus:ring-brand-red"
            aria-label={`Remove uploaded ${label}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {displayError && (
        <p className="text-xs text-red-600 font-medium" role="alert">
          {displayError}
        </p>
      )}
    </div>
  );
}
