/**
 * BoothShippingSection Component
 * 
 * Booth shipping subsection with shipments list and form.
 */

import React from 'react';
import { Package, CheckCircle2, Circle, Receipt, Eye, X } from 'lucide-react';
import { ChecklistData, BoothShippingData } from '../../TradeShowChecklist';

interface BoothShippingSectionProps {
  checklist: ChecklistData;
  showAddShipmentForm: boolean;
  setShowAddShipmentForm: (show: boolean) => void;
  newShipmentData: Omit<BoothShippingData, 'id'>;
  handleNewShipmentFieldChange: <K extends keyof Omit<BoothShippingData, 'id'>>(
    field: K,
    value: Omit<BoothShippingData, 'id'>[K]
  ) => void;
  savingShipment: boolean;
  onAddShipment: () => Promise<void>;
  onDeleteShipment: (shipmentId: string) => Promise<void>;
  onToggleShipped: (shipment: BoothShippingData) => Promise<void>;
  receiptCount: number;
  onViewReceipt: () => void;
  onUploadReceipt: () => void;
}

export const BoothShippingSection: React.FC<BoothShippingSectionProps> = ({
  checklist,
  showAddShipmentForm,
  setShowAddShipmentForm,
  newShipmentData,
  handleNewShipmentFieldChange,
  savingShipment,
  onAddShipment,
  onDeleteShipment,
  onToggleShipped,
  receiptCount,
  onViewReceipt,
  onUploadReceipt
}) => {
  return (
    <div className="border border-stone-200 rounded-lg p-4 hover:border-stone-300 transition-colors bg-stone-50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-purple-600" />
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Booth Shipping</h4>
          {checklist.boothShipping.length > 0 && (
            <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium">
              {checklist.boothShipping.length} Shipment{checklist.boothShipping.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        
        <button
          onClick={() => setShowAddShipmentForm(!showAddShipmentForm)}
          className="btn-primary"
        >
          <Package className="w-4 h-4" />
          {showAddShipmentForm ? 'Cancel' : 'Add Shipment'}
        </button>
      </div>

      <div className="space-y-3">
        {/* Existing Shipments List */}
        {checklist.boothShipping.map((shipment) => (
          <div key={shipment.id} className="border border-stone-200 rounded-lg p-3 bg-white">
            <div className="flex items-start justify-between gap-3">
              <button
                onClick={() => onToggleShipped(shipment)}
                className="flex-shrink-0 mt-0.5"
              >
                {shipment.shipped ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 hover:scale-110 transition-transform" />
                ) : (
                  <Circle className="w-5 h-5 text-stone-400 hover:text-stone-600 transition-colors" />
                )}
              </button>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    shipment.shipping_method === 'carrier' 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'bg-stone-100 text-stone-700'
                  }`}>
                    {shipment.shipping_method === 'carrier' ? 'Carrier' : 'Manual'}
                  </span>
                  {shipment.shipped && (
                    <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                      Shipped
                    </span>
                  )}
                </div>
                
                {shipment.shipping_method === 'carrier' && (
                  <div className="space-y-1 text-sm">
                    {shipment.carrier_name && (
                      <p className="text-stone-700">
                        <span className="font-medium">Carrier:</span> {shipment.carrier_name}
                      </p>
                    )}
                    {shipment.tracking_number && (
                      <p className="text-stone-700">
                        <span className="font-medium">Tracking:</span> {shipment.tracking_number}
                      </p>
                    )}
                  </div>
                )}
                
                <div className="flex gap-4 text-xs text-stone-600 mt-2">
                  {shipment.shipping_date && (
                    <span>Shipped: {new Date(shipment.shipping_date).toLocaleDateString()}</span>
                  )}
                  {shipment.delivery_date && (
                    <span>Delivery: {new Date(shipment.delivery_date).toLocaleDateString()}</span>
                  )}
                </div>
                
                {shipment.notes && (
                  <p className="text-xs text-stone-600 mt-2 italic">{shipment.notes}</p>
                )}
              </div>
              
              <button
                onClick={() => onDeleteShipment(shipment.id!)}
                className="flex-shrink-0 p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Delete shipment"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {/* Add New Shipment Form */}
        {showAddShipmentForm && (
          <div className="border border-purple-300 rounded-lg p-4 bg-purple-50">
            <h5 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-3">New Shipment</h5>
            
            {/* Shipping Method */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-stone-700 mb-2">
                Shipping Method
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="carrier"
                    checked={newShipmentData.shipping_method === 'carrier'}
                    onChange={(e) => handleNewShipmentFieldChange('shipping_method', e.target.value)}
                    className="w-4 h-4 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-stone-700">Carrier Shipping</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="manual"
                    checked={newShipmentData.shipping_method === 'manual'}
                    onChange={(e) => handleNewShipmentFieldChange('shipping_method', e.target.value)}
                    className="w-4 h-4 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-stone-700">Manual Delivery</span>
                </label>
              </div>
            </div>

            {/* Carrier Fields */}
            {newShipmentData.shipping_method === 'carrier' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Carrier Name
                  </label>
                  <input
                    type="text"
                    value={newShipmentData.carrier_name || ''}
                    onChange={(e) => handleNewShipmentFieldChange('carrier_name', e.target.value)}
                    placeholder="e.g., FedEx, UPS, Road Runner"
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Tracking Number
                  </label>
                  <input
                    type="text"
                    value={newShipmentData.tracking_number || ''}
                    onChange={(e) => handleNewShipmentFieldChange('tracking_number', e.target.value)}
                    placeholder="Tracking/shipment number"
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
            )}

            {/* Date Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Shipping Date
                </label>
                <input
                  type="date"
                  value={newShipmentData.shipping_date || ''}
                  onChange={(e) => handleNewShipmentFieldChange('shipping_date', e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Expected Delivery
                </label>
                <input
                  type="date"
                  value={newShipmentData.delivery_date || ''}
                  onChange={(e) => handleNewShipmentFieldChange('delivery_date', e.target.value)}
                  min={newShipmentData.shipping_date || ''}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Notes
              </label>
              <textarea
                value={newShipmentData.notes || ''}
                onChange={(e) => handleNewShipmentFieldChange('notes', e.target.value)}
                placeholder="Shipment details, special instructions, contact info, etc."
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm resize-none"
                rows={2}
              />
            </div>

            {/* Shipped Checkbox */}
            <div className="mb-3 flex items-center gap-3 p-3 bg-stone-50 rounded-lg border border-stone-200">
              <button
                type="button"
                onClick={() => handleNewShipmentFieldChange('shipped', !newShipmentData.shipped)}
                className="flex-shrink-0"
              >
                {newShipmentData.shipped ? (
                  <CheckCircle2 className="w-6 h-6 text-green-600 hover:scale-110 transition-transform" />
                ) : (
                  <Circle className="w-6 h-6 text-stone-400 hover:text-stone-600 transition-colors" />
                )}
              </button>
              <div className="flex-1">
                <p className="font-medium text-stone-900 text-sm">Mark as Shipped</p>
                <p className="text-xs text-stone-600">Check this if the booth materials have already been shipped</p>
              </div>
            </div>

            <button
              onClick={onAddShipment}
              disabled={savingShipment}
              className="btn-primary w-full"
            >
              {savingShipment ? 'Adding...' : 'Add Shipment'}
            </button>
          </div>
        )}

        {/* Receipt Upload Button */}
        {checklist.boothShipping.length === 0 && !showAddShipmentForm && (
          <p className="text-sm text-stone-500 text-center py-4">
            No shipments added yet. Click "Add Shipment" to get started.
          </p>
        )}

        <div className="flex items-center gap-2 pt-2">
          {receiptCount > 0 && (
            <>
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium">
                <CheckCircle2 className="w-3 h-3" />
                {receiptCount} Receipt{receiptCount !== 1 ? 's' : ''}
              </span>
              <button
                onClick={onViewReceipt}
                className="btn-ghost"
                title="View receipt"
              >
                <Eye className="w-4 h-4" />
                View
              </button>
            </>
          )}
          <button
            onClick={onUploadReceipt}
            className="btn-ghost"
          >
            <Receipt className="w-4 h-4" />
            {receiptCount > 0 ? 'Add Another' : 'Upload Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
};

