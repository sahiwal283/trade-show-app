/**
 * useReportsFilters Hook
 *
 * Manages filter state for Reports component
 */

import { useState } from 'react';

type ReportType = 'overview' | 'detailed' | 'entity';

interface UseReportsFiltersProps {
  initialEvent?: string;
  initialReportType?: ReportType;
}

export function useReportsFilters({
  initialEvent = 'all',
  initialReportType = 'overview',
}: UseReportsFiltersProps = {}) {
  const [selectedEvent, setSelectedEvent] = useState(initialEvent);
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [selectedEntity, setSelectedEntity] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [reportType, setReportType] = useState<ReportType>(initialReportType);
  const [showFilterModal, setShowFilterModal] = useState(false);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const clearFilters = () => {
    setSelectedEvent('all');
    setSelectedPeriod('all');
    setSelectedEntity('all');
    setSelectedCategories([]);
    setReportType('overview');
  };

  return {
    // State
    selectedEvent,
    setSelectedEvent,
    selectedPeriod,
    setSelectedPeriod,
    selectedEntity,
    setSelectedEntity,
    selectedCategories,
    setSelectedCategories,
    reportType,
    setReportType,
    showFilterModal,
    setShowFilterModal,

    // Actions
    toggleCategory,
    clearFilters,
  };
}
