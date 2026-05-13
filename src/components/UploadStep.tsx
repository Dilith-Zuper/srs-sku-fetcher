import { useRef, useState } from 'react';
import type { ZuperProduct } from '../types';
import { parseZuperExcel } from '../lib/excelParser';

interface UploadStepProps {
  onReady: (products: ZuperProduct[], file: File) => void;
}

export default function UploadStep({ onReady }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [products, setProducts] = useState<ZuperProduct[] | null>(null);
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);

  async function handleFile(f: File) {
    if (!f.name.endsWith('.xlsx') && !f.name.endsWith('.xls')) {
      setError('Please upload an .xlsx file.');
      return;
    }
    setError('');
    setParsing(true);
    setFile(f);
    try {
      const parsed = await parseZuperExcel(f);
      setProducts(parsed);
    } catch {
      setError('Failed to parse the file. Make sure it is a valid Zuper product export.');
      setFile(null);
    } finally {
      setParsing(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">
          Step 1 of 3
        </p>
        <h1 className="text-[36px] font-extrabold text-[#1A1A1A] leading-tight">
          Match products to SRS catalog
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed mt-2 max-w-xl">
          Upload a Zuper product export (.xlsx). The app will match each product against the SRS
          roofing catalog and return an Excel with SRS product IDs, names, and match confidence.
        </p>
      </div>

      <div
        className={`bg-white rounded-2xl border-2 border-dashed transition-colors cursor-pointer ${
          dragging
            ? 'border-orange-400 bg-orange-50'
            : 'border-[#E5E2DC] hover:border-orange-300'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
          <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          {parsing ? (
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
              <span className="text-sm text-gray-500">Parsing file…</span>
            </div>
          ) : file && products ? (
            <div className="space-y-1">
              <p className="text-base font-semibold text-[#1A1A1A]">{file.name}</p>
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-orange-600">{products.length.toLocaleString()}</span> products found
              </p>
              <p className="text-xs text-gray-400 mt-1">Click to choose a different file</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-base font-semibold text-[#1A1A1A]">
                Drop your Zuper export here
              </p>
              <p className="text-sm text-gray-500">or click to browse — .xlsx files only</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {products && products.length > 0 && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-[#E5E2DC] p-5 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Preview</p>
            <div className="overflow-hidden rounded-xl border border-[#E5E2DC]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F5F3F0]">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Brand</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {products.slice(0, 5).map((p, i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-[#F5F3F0]' : 'bg-white'}>
                      <td className="px-4 py-2.5 text-[#1A1A1A] font-medium truncate max-w-[240px]">{p.productName}</td>
                      <td className="px-4 py-2.5 text-gray-500 truncate max-w-[140px]">{p.productCategory}</td>
                      <td className="px-4 py-2.5 text-gray-500">{p.brand || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500">{p.price ? `$${p.price}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {products.length > 5 && (
                <div className="px-4 py-2 bg-[#F5F3F0] border-t border-[#E5E2DC]">
                  <p className="text-xs text-gray-400">
                    +{(products.length - 5).toLocaleString()} more rows
                  </p>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => onReady(products, file!)}
            className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full transition-colors text-base"
          >
            Run matching →
          </button>
        </div>
      )}
    </div>
  );
}
