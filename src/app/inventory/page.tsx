'use client';

import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Database, Check, AlertCircle, RefreshCw, FileText, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface Product {
  id: string;
  sku: string;
  name: string;
  price: string;
  inventory: number;
  category: string | null;
  supplier: string | null;
}

interface UploadResponse {
  uploadId: string;
  filename: string;
  headers: string[];
  mapping: Record<string, string | null>;
  preview: Array<{
    sku: string;
    name: string;
    price: number;
    inventory: number;
    raw: any;
  }>;
  rowCount: number;
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  
  // State to hold the parsed mapping and preview
  const [mappingData, setMappingData] = useState<UploadResponse | null>(null);
  const [isApprovedSubmitted, setIsApprovedSubmitted] = useState(false);
  const [submittedApprovalId, setSubmittedApprovalId] = useState('');

  // Query to get current product database list
  const { data: productsData, isLoading: isProductsLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('Failed to fetch products');
      const data = await res.json();
      return data.products;
    }
  });

  // Mutation to upload CSV and get mappings
  const uploadMutation = useMutation({
    mutationFn: async (uploadFile: File) => {
      const formData = new FormData();
      formData.append('file', uploadFile);

      const res = await fetch('/api/inventory/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to map CSV file');
      }

      return res.json() as Promise<UploadResponse>;
    },
    onSuccess: (data) => {
      setMappingData(data);
      setIsApprovedSubmitted(false);
    }
  });

  // Mutation to submit mapped products for governance approval
  const submitApprovalMutation = useMutation({
    mutationFn: async () => {
      if (!mappingData) return;

      const res = await fetch('/api/inventory/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_approval',
          uploadId: mappingData.uploadId,
          mapping: mappingData.mapping,
          products: mappingData.preview,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to submit approval request');
      }

      return res.json();
    },
    onSuccess: (data) => {
      setIsApprovedSubmitted(true);
      setSubmittedApprovalId(data.approvalId);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.csv')) {
        setFile(droppedFile);
        uploadMutation.mutate(droppedFile);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      uploadMutation.mutate(selectedFile);
    }
  };

  const handleReset = () => {
    setFile(null);
    setMappingData(null);
    setIsApprovedSubmitted(false);
    setSubmittedApprovalId('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Helper to generate a dummy supplier inventory CSV for testing
  const downloadSampleCsv = () => {
    const csvContent = 
      "Supplier Item No.,Product Description,Stock Qty,Cost Rate\n" +
      "PROD-001,Premium Leather Jacket,50,4800.00\n" +
      "PROD-002,Wireless Noise-Cancelling Headphones,140,2400.00\n" +
      "PROD-006,Ultra mechanical keyboard v3,22,2900.00";
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "supplier_messy_inventory.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">Inventory Control</h2>
          <p className="text-xs text-zinc-400 mt-1">Upload supplier inventory files and automatically map attributes using AI.</p>
        </div>
        <button
          onClick={downloadSampleCsv}
          className="self-start px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-purple-300 hover:text-purple-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
        >
          <FileText className="w-4 h-4" />
          <span>Download Sample Messy CSV</span>
        </button>
      </div>

      {/* Upload Zone & Mapper */}
      {!mappingData ? (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed rounded-xl p-5 cursor-pointer transition-all duration-300 flex flex-col sm:flex-row items-center justify-between gap-4 ${
            dragActive
              ? 'border-purple-500 bg-purple-500/5 shadow-lg shadow-purple-500/5'
              : 'border-zinc-800/85 bg-zinc-900/10 hover:bg-zinc-900/25 hover:border-zinc-750'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv"
            className="hidden"
          />
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-zinc-200">Import Supplier Inventory CSV</h3>
              <p className="text-[11px] text-zinc-550 mt-0.5 leading-normal">
                Drag and drop your file here, or click to browse. AI will map custom supplier headers to our schema.
              </p>
            </div>
          </div>
          <div className="px-3.5 py-1.5 rounded-xl bg-purple-650 hover:bg-purple-600 text-white text-[11px] font-semibold shrink-0 transition-colors">
            Select File
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Success Submission Card */}
          {isApprovedSubmitted ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex gap-3.5">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-400">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-200">Inventory Updates Submitted for Approval!</h4>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                    A governance check has blocked direct updates. The approval request `#{submittedApprovalId.substring(0, 8)}` has been created.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-semibold transition-all"
                >
                  Upload New File
                </button>
                <Link
                  href="/approvals"
                  className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white transition-all flex items-center gap-1.5"
                >
                  <span>Go to Approvals Hub</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 glass space-y-6">
              {/* File Info */}
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200">{mappingData.filename}</h4>
                    <p className="text-[10px] text-zinc-500">{mappingData.rowCount} row(s) detected</p>
                  </div>
                </div>
                <button
                  onClick={handleReset}
                  className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset Upload</span>
                </button>
              </div>

              {/* Column Mapping Visualizer */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
                  AI Schema Mapping Recommendations
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(mappingData.mapping).map(([supplierHeader, systemField]) => (
                    <div
                      key={supplierHeader}
                      className="p-3.5 rounded-xl bg-zinc-950/30 border border-zinc-800/80 flex flex-col justify-between min-h-[80px]"
                    >
                      <span className="text-[10px] text-zinc-500 font-semibold truncate block" title={supplierHeader}>
                        {supplierHeader}
                      </span>
                      <div className="mt-2 flex items-center justify-between">
                        {systemField ? (
                          <>
                            <span className="text-[9px] text-purple-400 font-bold uppercase tracking-wider bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/10">
                              → {systemField}
                            </span>
                            <span className="text-[9px] text-emerald-400 font-medium flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" />
                              Mapped
                            </span>
                          </>
                        ) : (
                          <span className="text-[9px] text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded">
                            Ignored
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Difference Preview Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
                  Mapped Products Preview
                </h4>
                <div className="overflow-x-auto border border-zinc-800/60 rounded-xl bg-zinc-950/20">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-900/50 border-b border-zinc-800/80 text-zinc-400 uppercase tracking-wider text-[9px] font-semibold">
                      <tr>
                        <th className="p-3.5">SKU</th>
                        <th className="p-3.5">Product Title</th>
                        <th className="p-3.5 text-right">Preview Cost</th>
                        <th className="p-3.5 text-right">Preview Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/30 text-zinc-300">
                      {mappingData.preview.map((p, i) => (
                        <tr key={i} className="hover:bg-zinc-900/20">
                          <td className="p-3.5 font-mono text-[10px] text-purple-300">{p.sku}</td>
                          <td className="p-3.5 font-medium text-zinc-200">{p.name}</td>
                          <td className="p-3.5 text-right font-mono">₹{p.price.toLocaleString('en-IN')}</td>
                          <td className="p-3.5 text-right font-bold text-zinc-100">{p.inventory}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Submit for Approval Action */}
              <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-end">
                <button
                  onClick={() => submitApprovalMutation.mutate()}
                  disabled={submitApprovalMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 text-xs font-semibold text-white disabled:text-zinc-500 transition-all shadow-md shadow-purple-600/10 flex items-center gap-1.5"
                >
                  {submitApprovalMutation.isPending ? 'Registering Governance Request...' : 'Submit for Governance Approval'}
                  {!submitApprovalMutation.isPending && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Current Inventory database list */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 glass">
        <h3 className="text-sm font-semibold text-zinc-200 pb-4 border-b border-zinc-800/80 flex items-center gap-2">
          <Database className="w-4 h-4 text-purple-400" />
          <span>Active Product Database Inventory</span>
        </h3>
        
        {isProductsLoading ? (
          <div className="py-12 flex justify-center text-zinc-500 text-xs gap-2">
            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-ping" />
            <span>Loading active database...</span>
          </div>
        ) : !productsData || productsData.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-xs">No products registered in the database.</div>
        ) : (
          <div className="overflow-x-auto mt-4 border border-zinc-800/50 rounded-xl bg-zinc-950/20">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/50 border-b border-zinc-800/80 text-zinc-400 uppercase tracking-wider text-[9px] font-semibold">
                <tr>
                  <th className="p-3.5">SKU</th>
                  <th className="p-3.5">Product Name</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Supplier</th>
                  <th className="p-3.5 text-right">Unit Price</th>
                  <th className="p-3.5 text-right">In Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/30 text-zinc-300">
                {productsData.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-900/20">
                    <td className="p-3.5 font-mono text-[10px] text-purple-300">{p.sku}</td>
                    <td className="p-3.5 font-medium text-zinc-200">{p.name}</td>
                    <td className="p-3.5 text-zinc-400">{p.category || 'N/A'}</td>
                    <td className="p-3.5 text-zinc-500">{p.supplier || 'N/A'}</td>
                    <td className="p-3.5 text-right font-mono">₹{Number(p.price).toLocaleString('en-IN')}</td>
                    <td className="p-3.5 text-right font-bold text-zinc-100">{p.inventory}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
