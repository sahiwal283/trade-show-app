import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  isComplete: boolean;
  itemCount?: number;
  completedCount?: number;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  isComplete,
  itemCount,
  completedCount,
  children,
  defaultCollapsed = false
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-stone-200 overflow-hidden">
      {/* Section Header - Always Visible - Clickable */}
      <button
        onClick={toggleCollapse}
        className="w-full flex items-center justify-between p-4 sm:p-6 hover:bg-stone-50 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className={`flex-shrink-0 ${isComplete ? 'text-green-600' : 'text-purple-600'}`}>
            {icon}
          </div>
          <div className="text-left">
            <h3 className="font-display text-base sm:text-lg font-bold tracking-tight text-stone-900 flex items-center gap-2">
              {title}
              {isComplete && (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                  ✓
                </span>
              )}
            </h3>
            {itemCount !== undefined && (
              <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                {completedCount}/{itemCount} completed
              </p>
            )}
          </div>
        </div>
        
        <div className="flex-shrink-0 ml-2">
          {isCollapsed ? (
            <ChevronDown className="w-5 h-5 text-stone-400 group-hover:text-stone-600 transition-colors" />
          ) : (
            <ChevronUp className="w-5 h-5 text-stone-400 group-hover:text-stone-600 transition-colors" />
          )}
        </div>
      </button>

      {/* Section Content - Collapsible */}
      {!isCollapsed && (
        <div className="border-t border-stone-100">
          {children}
        </div>
      )}
    </div>
  );
};

