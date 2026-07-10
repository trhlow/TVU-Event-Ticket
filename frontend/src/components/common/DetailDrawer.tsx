import React from 'react';
import { X } from 'lucide-react';

interface DetailDrawerProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function DetailDrawer({
  isOpen,
  title,
  onClose,
  children,
}: DetailDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-fade-in">
      <div className="absolute inset-0 bg-gray-950/30 backdrop-blur-xs" onClick={onClose}></div>
      <div className="bg-white h-full w-full max-w-lg relative z-10 p-6 shadow-2xl border-l border-gray-200 flex flex-col">
        <div className="flex justify-between items-center pb-4 border-b border-gray-100 mb-4">
          <h3 className="text-base font-bold text-gray-950 tracking-tight">{title}</h3>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1">
          {children}
        </div>
      </div>
    </div>
  );
}
