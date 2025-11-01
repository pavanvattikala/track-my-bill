"use client";

import { useSession, signIn } from "next-auth/react";
import { useState, useCallback, useMemo } from "react";
import { Upload, Camera, DollarSign, Tag, Calendar, ShoppingBag, Edit, Loader2, Link } from 'lucide-react'; 
import Header from "./components/Header";
import imageCompression from 'browser-image-compression';

// Define types for extracted and final data
interface ExtractedData {
  amount: number | null;
  vendor: string | null;
  date: string | null;
  category: string | null;
  notes: string | null;
}

interface UploadResult {
    id: string;
    fileName: string;
    link: string;
}

const DataField: React.FC<{ label: string; value: string | number | null; isCurrency?: boolean; icon: React.ReactNode }> = ({ 
  label, 
  value, 
  isCurrency = false,
  icon
}) => {
  const displayValue = useMemo(() => {
    if (value === null || value === "" || value === 0) return "N/A";
    if (isCurrency && typeof value === 'number') {
      return `₹${value.toFixed(2)}`;
    }
    return String(value);
  }, [value, isCurrency]);

  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-3 last:pb-0 last:border-b-0">
      <span className="flex items-center font-medium text-gray-500">
        {icon}
        <span className="ml-2">{label}:</span>
      </span>
      <span className={`text-right font-semibold ${isCurrency ? 'text-indigo-600 text-lg' : 'text-gray-800'}`}>
        {displayValue}
      </span>
    </div>
  );
};


export default function BillTrackerApp() {
    const { data: session, status } = useSession();
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [extractionResult, setExtractionResult] = useState<ExtractedData | null>(null);
    const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
    const [message, setMessage] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [currentStep, setCurrentStep] = useState<number>(1); // 1: Upload, 2: Extract
    
    // --- HANDLERS ---
    
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
            setError(null);
            setExtractionResult(null);
            setUploadResult(null);
        }
    }, []);

    const clearFile = () => {
        setFile(null);
        setExtractionResult(null);
        setUploadResult(null);
        setError(null);
        setMessage("");
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!file || !session?.accessToken) {
            setError("Please select a file and ensure you are signed in.");
            return;
        }

        setIsLoading(true);
        setExtractionResult(null);
        setError(null);
        setUploadResult(null);

        let driveFileId: string | null = null;
        let driveLink: string | null = null;
        let compressedUploadFile = file; // Default to original
        let isCompressed = false;

        let uploadFileToUse: File = file;


          try {
            // --- Step 0: Conditional Compression ---
            const MAX_SIZE_MB = 4; // Threshold for compression
            
        
            const fileSizeMB = file.size / 1024 / 1024;
            const isImage = file.type.startsWith("image/");
        
            if (isImage && fileSizeMB > MAX_SIZE_MB) {
              setMessage(`Compressing large image (${fileSizeMB.toFixed(2)} MB)...`);
              setCurrentStep(0);
        
              const compressionOptions = {
                maxSizeMB: MAX_SIZE_MB,
                useWebWorker: true,
                alwaysKeepResolution: true,
              };
        
              try {
                const compressedFile = await imageCompression(file, compressionOptions);
                console.log(
                  `✅ Compressed from ${fileSizeMB.toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`
                );
                compressedUploadFile = new File([compressedFile], file.name, { type: file.type }); 
                isCompressed = true;
              } catch (compressionError) {
                console.warn("⚠️ Image compression failed, continuing with original file:", compressionError);
                compressedUploadFile = file; // fallback gracefully
              }
            }
        } catch (err) {
            console.error("❌ Unexpected error during compression:", err);

        }

        // ------------------------------------
        // if compressedUploadFile is defined, use it; otherwise, use original file

        uploadFileToUse = isCompressed ? compressedUploadFile : file;
        

        // ------------------------------------
        // STEP 1: UPLOAD TO GOOGLE DRIVE
        // ------------------------------------
        try {

       
            setMessage(`1/2: Uploading '${uploadFileToUse.name}' to Drive...`);
            setCurrentStep(1);

            const uploadFormData = new FormData();
            uploadFormData.append("file", uploadFileToUse);

            const uploadResponse = await fetch("/api/upload-to-drive", {
                method: "POST",
                body: uploadFormData,
                headers: {
                    'Authorization': `Bearer ${session.accessToken}`,
                },
            });

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                throw new Error(errorData.details || "Drive upload failed.");
            }
            
            const uploadData: UploadResult = await uploadResponse.json();
            driveFileId = uploadData.id;
            driveLink = uploadData.link;
            setUploadResult(uploadData);
            setMessage(`1/2: Upload complete. File ID: ${driveFileId}`);

        } catch (err) {
            const error = err as Error;
            setError(`❌ Drive Upload Error: ${error.message}`);
            setIsLoading(false);
            return; 
        }
        
        // ------------------------------------
        // STEP 2: SEND FILE ID TO AI FOR EXTRACTION
        // ------------------------------------
        try {
            setMessage("2/2: Extracting data using AI...");
            setCurrentStep(2);

            if (!driveFileId) throw new Error("Missing file ID after upload.");

            // We send a JSON body with the file ID to the AI route
            const extractResponse = await fetch("/api/extract", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    // Pass the token again to the API route for authentication purposes, 
                    // even though the AI route primarily needs the file ID.
                    'Authorization': `Bearer ${session.accessToken}`,
                    
                },
                body: JSON.stringify({ fileId: driveFileId, fileName: uploadFileToUse.name, fileType: uploadFileToUse.type}),
            });

            const data = await extractResponse.json();

            if (!extractResponse.ok || data.success === false) {
                const errorMsg = data.error || "An unknown error occurred during extraction.";
                throw new Error(errorMsg);
            }

            setExtractionResult(data);
            setMessage("✅ Data extraction and logging complete!");

        } catch (err) {
            const error = err as Error;
            setError(`❌ AI Extraction Error: ${error.message || "Failed to extract data."}`);
        } finally {
            setIsLoading(false);
            setCurrentStep(3); // Indicate completion
        }
    };

    const buttonClass = isLoading || !file 
      ? "bg-gray-400 cursor-not-allowed" 
      : "bg-indigo-600 hover:bg-indigo-700 transition duration-150 shadow-md hover:shadow-lg";


  // --- AUTHENTICATION RENDER STATES ---

  if (status === "loading") {
    return (
        <div className="flex items-center justify-center min-h-screen text-lg text-gray-700">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Authenticating...
        </div>
    );
  }
  if (status === "unauthenticated" || session?.error === "RefreshAccessTokenError") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
        <p className="text-xl mb-6 text-gray-700">Please sign in to access Bill Tracker.</p>
        <button 
          onClick={() => signIn("google")} 
          className="flex items-center p-3 bg-blue-600 text-white font-semibold rounded-lg shadow-lg hover:bg-blue-700 transition"
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M22.0001 12.5C22.0001 11.45 21.9201 10.74 21.7501 10.08H11.0001V14.15H17.2901C17.0301 15.54 16.2101 16.72 15.0101 17.5V20.14H18.5701C20.6701 18.27 22.0001 15.35 22.0001 12.5Z" fill="#4285F4"/><path d="M11 22C13.92 22 16.43 21.05 18.27 19.4L14.71 16.76C13.75 17.38 12.44 17.78 11 17.78C8.36 17.78 6.13 16.09 5.34 13.72H1.72V16.39C3.59 20.07 7.02 22 11 22Z" fill="#34A853"/><path d="M5.34003 13.72H1.72003V11.05H5.34003C5.17003 10.4 5.08003 9.71 5.08003 9.02C5.08003 8.33 5.17003 7.64 5.34003 7H1.72003V4.33C-0.159971 8.01 -0.159971 14.03 1.72003 17.72H5.34003V13.72Z" fill="#FBBC04"/><path d="M11 5.79004C12.53 5.79004 13.91 6.3 15.01 7.22L18.3 3.93004C16.44 2.13004 13.92 1.10004 11 1.10004C7.02 1.10004 3.59 2.93004 1.72 6.61004L5.34 9.28004C6.13 6.91004 8.36 5.79004 11 5.79004Z" fill="#EA4335"/></svg>
          Sign in with Google
        </button>
      </div>
    );
  }


  // --- RENDER UI ---

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
        <Header /> 
        
        <div className="flex flex-col items-center justify-start pt-10 pb-8 p-4">
            <div className="w-full max-w-lg p-8 bg-white rounded-xl shadow-2xl border border-gray-200">
                <h1 className="mb-2 text-center text-3xl font-extrabold text-gray-900 tracking-tight flex items-center justify-center">
                    <ShoppingBag className="w-6 h-6 mr-2 text-indigo-600" /> Track My Bill
                </h1>
                <p className="mb-8 text-center text-sm text-gray-500">
                    Upload a bill, invoice, or receipt image. It is saved to Drive and data is extracted.
                </p>
                
                {/* --- FILE INPUT & SUBMIT FORM --- */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-3">
                        {!file ? (
                            <>
                                <p className="text-center text-sm text-gray-500 mb-4">Select or take a photo of your receipt.</p>
                                {/* File Upload Button */}
                                <label
                                    htmlFor="file-upload"
                                    className="flex items-center justify-center w-full rounded-xl bg-blue-50 px-4 py-3 text-center text-base font-semibold text-blue-600 border border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors shadow-sm"
                                >
                                    <Upload className="h-5 w-5 mr-2" />
                                    Upload File (PDF/Image)
                                </label>
                                {/* Camera Upload Button */}
                                <label
                                    htmlFor="camera-upload"
                                    className="flex items-center justify-center w-full rounded-xl bg-green-50 px-4 py-3 text-center text-base font-semibold text-green-600 border border-green-200 cursor-pointer hover:bg-green-100 transition-colors shadow-sm"
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
                            <div className="flex flex-col items-center justify-center p-4 border-2 border-solid border-indigo-400 rounded-lg bg-indigo-50">
                                <p className="text-sm font-semibold text-indigo-600 truncate max-w-full">
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
                        className={`w-full flex items-center justify-center rounded-xl px-4 py-3 text-center text-base font-semibold text-white transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass}`}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="animate-spin h-5 w-5 mr-3" />
                                {currentStep === 1 ? "Uploading to Drive..." : "Extracting Data..."}
                            </>
                        ) : "Upload and Extract Data"}
                    </button>
                </form>

                {/* --- UPLOAD STATUS MESSAGE --- */}
                {message && !error && !extractionResult && (
                    <div className="mt-6 p-4 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-800 text-center shadow-md">
                        <p className="text-sm font-medium">{message}</p>
                    </div>
                )}


                {/* --- ERROR DISPLAY --- */}
                {error && (
                    <div
                        className="mt-6 rounded-xl border-2 border-red-300 bg-red-50 p-4 text-red-800 shadow-md"
                        role="alert"
                    >
                        <p className="font-bold">🚫 Process Failed</p>
                        <p className="text-sm mt-1">{error}</p>
                    </div>
                )}

                {/* --- RESULTS DISPLAY --- */}
                {extractionResult && (
                    <div
                        className="mt-6 rounded-xl border-2 border-green-300 bg-green-50 p-5 text-gray-800 shadow-xl"
                        role="alert"
                    >
                        <div className="flex justify-between items-center mb-4 pb-2 border-b border-green-200">
                            <p className="text-lg font-bold text-green-700 flex items-center">
                                <Tag className="w-5 h-5 mr-2" /> Data Extracted!
                            </p>
                            {uploadResult && (
                                <a 
                                    href={uploadResult.link} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center underline transition-colors"
                                >
                                    <Link className="w-4 h-4 mr-1" />
                                    View File
                                </a>
                            )}
                        </div>
                        <div className="space-y-1">
                          <DataField label="Vendor" value={extractionResult.vendor} icon={<ShoppingBag className="w-4 h-4" />} />
                          <DataField label="Date" value={extractionResult.date} icon={<Calendar className="w-4 h-4" />} />
                          <DataField label="Category" value={extractionResult.category} icon={<Tag className="w-4 h-4" />} />
                          <DataField label="Notes" value={extractionResult.notes} icon={<Edit className="w-4 h-4" />} />
                          <div className="pt-3">
                            <DataField label="Total Amount" value={extractionResult.amount} isCurrency={true} icon={<DollarSign className="w-4 h-4" />} />
                          </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
}
