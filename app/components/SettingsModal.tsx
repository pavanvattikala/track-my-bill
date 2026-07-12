"use client";

import { useState } from "react";
import { Settings, X, Plus, Loader2, Check } from "lucide-react";

interface SettingsModalProps {
  categories: string[];
  isSaving: boolean;
  onSave: (newCategories: string[]) => Promise<void>;
}

export default function SettingsModal({ categories, isSaving, onSave }: SettingsModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localCategories, setLocalCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const openModal = () => {
    setLocalCategories([...categories]);
    setNewCategory("");
    setSaveSuccess(false);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
  };

  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (localCategories.map(c => c.toLowerCase()).includes(trimmed.toLowerCase())) return;
    setLocalCategories([...localCategories, trimmed]);
    setNewCategory("");
  };

  const handleRemoveCategory = (index: number) => {
    setLocalCategories(localCategories.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddCategory();
    }
  };

  const handleSave = async () => {
    if (localCategories.length === 0) return;
    await onSave(localCategories);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      closeModal();
    }, 1200);
  };

  return (
    <>
      {/* Gear Icon Trigger */}
      <button
        onClick={openModal}
        title="Settings"
        className="flex items-center justify-center p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-indigo-600 transition-colors"
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* Modal Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-gray-900">Settings</h2>
              </div>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">
                  Bill Categories
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  The AI will classify bills into these categories. Sync'd to your Google Drive.
                </p>

                {/* Category Chips */}
                <div className="flex flex-wrap gap-2 mb-4 min-h-[40px]">
                  {localCategories.map((cat, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-sm font-medium text-indigo-700"
                    >
                      {cat}
                      <button
                        onClick={() => handleRemoveCategory(i)}
                        className="text-indigo-400 hover:text-red-500 transition-colors ml-0.5"
                        title="Remove"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                  {localCategories.length === 0 && (
                    <p className="text-sm text-red-400 italic">
                      At least one category required.
                    </p>
                  )}
                </div>

                {/* Add Category Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add a category (e.g. Pet Supplies)"
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
                  />
                  <button
                    onClick={handleAddCategory}
                    disabled={!newCategory.trim()}
                    className="flex items-center justify-center px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-400">
                Changes are saved to <strong>Track-My-Bills/config.json</strong> in your Google Drive and sync across all your devices.
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 pb-5">
              <button
                onClick={handleSave}
                disabled={isSaving || localCategories.length === 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-white text-sm transition-all duration-150 shadow-md
                  bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <><Loader2 className="animate-spin w-4 h-4" /> Saving to Drive...</>
                ) : saveSuccess ? (
                  <><Check className="w-4 h-4" /> Saved!</>
                ) : (
                  "Save Settings"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
