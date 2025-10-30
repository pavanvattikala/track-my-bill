"use client";

import { useSession, signOut } from "next-auth/react";
import { LogOut, Upload, UserCircle } from 'lucide-react';

export default function Header() {
    const { data: session } = useSession();

    if (!session?.user) return null;

    return (
        <header className="bg-white shadow-md sticky top-0 z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
                <div className="flex items-center space-x-3 text-xl font-bold text-green-600">
                    <Upload className="w-6 h-6" />
                    <span>Drive Uploader</span>
                </div>

                <div className="flex items-center space-x-4">
                    {/* User Info */}
                    <div className="flex items-center space-x-2">
                        {session.user.image ? (
                            <img
                                className="h-8 w-8 rounded-full"
                                src={session.user.image}
                                alt={session.user.name || "User"}
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <UserCircle className="h-8 w-8 text-gray-400" />
                        )}
                        <span className="text-sm font-medium text-gray-700 hidden sm:inline">
                            {session.user.name || session.user.email}
                        </span>
                    </div>

                    {/* Sign Out Button */}
                    <button 
                        onClick={() => signOut()} 
                        className="flex items-center p-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition shadow-sm"
                    >
                        <LogOut className="w-4 h-4 mr-1" />
                        Sign Out
                    </button>
                </div>
            </div>
        </header>
    );
}
