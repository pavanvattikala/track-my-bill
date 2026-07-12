"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

export const DEFAULT_CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Travel",
  "Utilities",
  "Medical",
  "Shopping",
  "Entertainment",
  "Services",
  "Miscellaneous",
];

interface AppConfig {
  categories: string[];
}

interface UseConfigReturn {
  categories: string[];
  isConfigLoading: boolean;
  saveCategories: (newCategories: string[]) => Promise<void>;
  isSaving: boolean;
}

export function useConfig(): UseConfigReturn {
  const { data: session, status } = useSession();
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [isConfigLoading, setIsConfigLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Load config from Drive on login
  useEffect(() => {
    if (status !== "authenticated" || !session?.accessToken) return;

    const loadConfig = async () => {
      setIsConfigLoading(true);
      try {
        const res = await fetch("/api/get-config", {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
        });
        if (res.ok) {
          const config: AppConfig = await res.json();
          if (Array.isArray(config.categories) && config.categories.length > 0) {
            setCategories(config.categories);
          }
        } else {
          console.warn("Failed to load config from Drive. Using defaults.");
        }
      } catch (err) {
        console.error("Config load error:", err);
      } finally {
        setIsConfigLoading(false);
      }
    };

    loadConfig();
  }, [status, session?.accessToken]);

  // Save updated categories back to Drive
  const saveCategories = useCallback(
    async (newCategories: string[]) => {
      if (!session?.accessToken) return;
      setIsSaving(true);
      try {
        const res = await fetch("/api/save-config", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({ categories: newCategories }),
        });
        if (res.ok) {
          setCategories(newCategories);
        } else {
          console.error("Failed to save config to Drive.");
        }
      } catch (err) {
        console.error("Config save error:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [session?.accessToken]
  );

  return { categories, isConfigLoading, saveCategories, isSaving };
}
