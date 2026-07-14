/**
 * UserChecklist Component
 * 
 * User-facing checklist with placeholder items for all users.
 */

import React from 'react';
import { FileText, Luggage, Clock } from 'lucide-react';
import { User } from '../../App';

interface UserChecklistProps {
  user: User;
}

export const UserChecklist: React.FC<UserChecklistProps> = ({ user }) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
          Preparation
        </p>
        <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-stone-900">My Checklist</h1>
        <p className="text-stone-500 mt-1 text-sm">Personal preparation checklist for trade shows</p>
      </div>

      {/* Checklist Items */}
      <div className="space-y-4">
        {/* Trade Show Guidelines Document */}
        <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="font-display text-lg font-bold tracking-tight text-stone-900">Trade Show Guidelines Document</h3>
                <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Coming Soon
                </span>
              </div>
              <p className="text-stone-600 text-sm">
                Access comprehensive guidelines and best practices for trade show participation.
              </p>
            </div>
          </div>
        </div>

        {/* Packing List */}
        <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                <Luggage className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="font-display text-lg font-bold tracking-tight text-stone-900">Packing List</h3>
                <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Coming Soon
                </span>
              </div>
              <p className="text-stone-600 text-sm">
                Get a personalized packing checklist based on your event and travel details.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Message */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> These features are currently under development. Check back soon for updates!
        </p>
      </div>
    </div>
  );
};

