/**
 * AdminSettingsHeader Component
 * 
 * Header section for Admin Settings page.
 */

import React from 'react';

export const AdminSettingsHeader: React.FC = () => {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Administration</p>
      <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-stone-900">Settings</h1>
      <p className="text-stone-600 mt-1">Manage system settings and user accounts</p>
    </div>
  );
};

