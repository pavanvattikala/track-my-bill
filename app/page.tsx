"use client";

import { useState, useCallback, useMemo } from "react";
import { Upload, Camera, DollarSign, Tag, Calendar, ShoppingBag, Edit, Loader2 } from "lucide-react";

interface ExtractedData {
  amount: number | null;
  vendor: string | null;
  date: string | null;
  category: string | null;
  notes: string | null;
}

const DataField: React.FC<{ label: string; value: string | number | null; isCurrency?: boolean }> = ({ 
  label, 
  value, 
  isCurrency = false 
}) => {
  const displayValue = useMemo(() => {
    if (value === null) return "N/A";
    if (isCurrency && typeof value === 'number') {
      return `₹${value.toFixed(2)}`;
    }
    return String(value);
  }, [value, isCurrency]);

  return (
    <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-700 py-3 first:pt-0 last:pb-0 last:border-b-0">
      <span className="font-medium text-gray-500 dark:text-gray-400">{label}:</span>
      <span className={`text-right font-semibold ${isCurrency ? 'text-indigo-600 dark:text-indigo-400 text-lg' : 'text-gray-800 dark:text-gray-200'}`}>
        {displayValue}
      </span>
    </div>
  );
};


export default function BillTrackerApp() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null); // Clear error on new file selection
      setResult(null); // Clear old results
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file or take a photo first.");
      return;
    }

    setIsLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        const errorMsg = data.error || "An unknown error occurred during extraction.";
        throw new Error(errorMsg);
      }

      // 2. Capture and set the new extracted fields
      const { amount, vendor, date, category, notes } = data;
      
      setResult({ amount, vendor, date, category, notes });

    } catch (err) {
      const error = err as Error;
      setError(error.message || "Failed to extract data. Check the file format.");
    } finally {
      setIsLoading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans p-4 flex flex-col items-center justify-start sm:justify-center">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-2xl border border-gray-100 dark:border-gray-700 mt-4 mb-8 sm:mt-0 sm:mb-0">
        <h1 className="mb-2 text-center text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          Track My Bill 🧾
        </h1>
        <p className="mb-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Upload a bill, invoice, or receipt image to automatically log your expense.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="space-y-3">
            {!file ? (
                <>
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-4">Select or take a photo of your receipt.</p>
                    <label
                        htmlFor="file-upload"
                        className="flex items-center justify-center w-full rounded-xl bg-blue-50 dark:bg-blue-900 px-4 py-3 text-center text-base font-semibold text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-700 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors"
                    >
                        <Upload className="h-5 w-5 mr-2" />
                        Upload File (PDF/Image)
                    </label>
                    <label
                        htmlFor="camera-upload"
                        className="flex items-center justify-center w-full rounded-xl bg-green-50 dark:bg-green-900 px-4 py-3 text-center text-base font-semibold text-green-600 dark:text-green-300 border border-green-200 dark:border-green-700 cursor-pointer hover:bg-green-100 dark:hover:bg-green-800 transition-colors"
                    >
                        <Camera className="h-5 w-5 mr-2" />
                        Take Photo
                    </label>

                    <input
                      id="file-upload"
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <input
                      id="camera-upload"
                      type="file"
                      accept="image/*"
                      capture="environment" 
                      onChange={handleFileChange}
                      className="hidden"
                    />
                </>
            ) : (
                <div className="flex flex-col items-center justify-center p-4 border-2 border-solid border-indigo-400 dark:border-indigo-600 rounded-lg bg-indigo-50 dark:bg-indigo-950/50">
                    <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 truncate max-w-full">
                        File Selected: {file.name}
                    </p>
                    <button 
                        type="button" 
                        onClick={clearFile}
                        className="mt-2 text-xs text-red-500 hover:text-red-600"
                    >
                        Clear Selection
                    </button>
                </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || !file}
            className="w-full flex items-center justify-center rounded-xl bg-indigo-600 dark:bg-indigo-500 px-4 py-3 text-center text-base font-semibold text-white shadow-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin h-5 w-5 mr-3" />
                Extracting Data...
              </>
            ) : "Extract Bill Data"}
          </button>
        </form>

        {error && (
          <div
            className="mt-6 rounded-xl border-2 border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/50 p-4 text-red-800 dark:text-red-300 shadow-md"
            role="alert"
          >
            <p className="font-bold">🚫 Extraction Failed</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {result && (
          <div
            className="mt-6 rounded-xl border-2 border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/50 p-5 text-gray-800 shadow-xl"
            role="alert"
          >
            <p className="mb-4 text-lg font-bold text-green-700 dark:text-green-400 flex items-center">
              <Tag className="w-5 h-5 mr-2" /> Data Logged Successfully!
            </p>
            <div className="space-y-1">
              <DataField label="Vendor" value={result.vendor} />
              <DataField label="Date" value={result.date} />
              <DataField label="Category" value={result.category} />
              <DataField label="Notes" value={result.notes} />
              <div className="pt-3">
                <DataField label="Amount" value={result.amount} isCurrency={true} />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}