import React, { useState } from 'react';
import { ListTodo, Plus, CheckCircle2, Circle, Trash2, Edit2, Save, X, Settings, Download } from 'lucide-react';
import { ChecklistData, CustomItemData } from '../TradeShowChecklist';
import { api } from '../../../utils/api';

interface CustomItemsSectionProps {
  checklist: ChecklistData;
  onReload: () => void;
  canEdit: boolean; // Only admin, coordinator, developer can edit
  isAdmin: boolean; // Only admin can manage templates
}

interface TemplateData {
  id?: number;
  title: string;
  description: string | null;
  position: number;
  is_active: boolean;
}

export const CustomItemsSection: React.FC<CustomItemsSectionProps> = ({ checklist, onReload, canEdit, isAdmin }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<number | null>(null);
  const [newItem, setNewItem] = useState({ title: '', description: '' });
  const [editData, setEditData] = useState<{ title: string; description: string }>({ title: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const handleAddItem = async () => {
    if (!newItem.title.trim()) {
      alert('Title is required');
      return;
    }

    setSaving(true);
    try {
      await api.checklist.createCustomItem(checklist.id, {
        title: newItem.title,
        description: newItem.description || null,
        position: checklist.customItems.length,
      });

      setNewItem({ title: '', description: '' });
      setShowAddForm(false);
      onReload();
    } catch (error) {
      console.error('[CustomItemsSection] Error adding item:', error);
      alert('Failed to add custom item');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (item: CustomItemData) => {
    setEditingItem(item.id || null);
    setEditData({
      title: item.title,
      description: item.description || '',
    });
  };

  const handleSaveEdit = async (itemId: number) => {
    if (!editData.title.trim()) {
      alert('Title is required');
      return;
    }

    setSaving(true);
    try {
      await api.checklist.updateCustomItem(itemId, {
        title: editData.title,
        description: editData.description || null,
      });

      setEditingItem(null);
      onReload();
    } catch (error) {
      console.error('[CustomItemsSection] Error updating item:', error);
      alert('Failed to update custom item');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setEditData({ title: '', description: '' });
  };

  const toggleCompleted = async (item: CustomItemData) => {
    try {
      await api.checklist.updateCustomItem(item.id!, {
        completed: !item.completed,
      });
      onReload();
    } catch (error) {
      console.error('[CustomItemsSection] Error toggling item:', error);
      alert('Failed to update item status');
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!confirm('Delete this custom item?')) return;

    try {
      await api.checklist.deleteCustomItem(itemId);
      onReload();
    } catch (error) {
      console.error('[CustomItemsSection] Error deleting item:', error);
      alert('Failed to delete custom item');
    }
  };

  const handleApplyTemplates = async () => {
    if (!confirm('This will add all standard tasks to this event. Continue?')) return;

    setSaving(true);
    try {
      await api.checklist.applyTemplates(checklist.id);
      onReload();
      alert('Standard tasks applied successfully!');
    } catch (error) {
      console.error('[CustomItemsSection] Error applying templates:', error);
      alert('Failed to apply standard tasks');
    } finally {
      setSaving(false);
    }
  };

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const data = await api.checklist.getTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('[CustomItemsSection] Error loading templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleOpenTemplateModal = () => {
    setShowTemplateModal(true);
    loadTemplates();
  };

  return (
    <>
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">

          {canEdit && !showAddForm && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleApplyTemplates}
                disabled={saving}
                className="btn-primary"
                title="Add standard tasks to this event"
              >
                <Download className="w-4 h-4" />
                Apply Standard Tasks
              </button>
              
              {isAdmin && (
                <button
                  onClick={handleOpenTemplateModal}
                  className="btn-secondary"
                  title="Manage standard tasks for all events"
                >
                  <Settings className="w-4 h-4" />
                  Manage Templates
                </button>
              )}
              
              <button
                onClick={() => setShowAddForm(true)}
                className="btn-primary"
              >
                <Plus className="w-4 h-4" />
                Add Task
              </button>
            </div>
          )}
        </div>

      {/* Add New Item Form */}
      {showAddForm && (
        <div className="mb-4 border border-indigo-200 rounded-lg p-4 bg-indigo-50">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Task Title *
              </label>
              <input
                type="text"
                value={newItem.title}
                onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                placeholder="e.g., Order promotional materials"
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Description (Optional)
              </label>
              <textarea
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="Additional details about this task..."
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm resize-none"
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddItem}
                disabled={saving || !newItem.title.trim()}
                className="btn-primary"
              >
                <Save className="w-4 h-4" />
                Add Task
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewItem({ title: '', description: '' });
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Items List */}
      {checklist.customItems.length === 0 ? (
        <div className="text-center py-8 text-stone-500">
          <ListTodo className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <p className="text-sm">No custom tasks yet</p>
          {canEdit && (
            <p className="text-xs text-stone-400 mt-1">Click "Add Task" to create event-specific checklist items</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {checklist.customItems
            .sort((a, b) => {
              // Incomplete items first, completed items last
              if (a.completed === b.completed) return 0;
              return a.completed ? 1 : -1;
            })
            .map((item) => (
            <div
              key={item.id}
              className="border border-stone-200 rounded-lg p-4 hover:border-stone-300 transition-colors"
            >
              {editingItem === item.id ? (
                // Edit Mode
                <div className="space-y-3">
                  <div>
                    <input
                      type="text"
                      value={editData.title}
                      onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm font-medium"
                    />
                  </div>
                  <div>
                    <textarea
                      value={editData.description}
                      onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                      placeholder="Description (optional)"
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm resize-none"
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveEdit(item.id!)}
                      disabled={saving || !editData.title.trim()}
                      className="btn-primary"
                    >
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="btn-secondary"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleCompleted(item)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {item.completed ? (
                      <CheckCircle2 className="w-6 h-6 text-green-600 hover:scale-110 transition-transform" />
                    ) : (
                      <Circle className="w-6 h-6 text-stone-400 hover:text-stone-600 transition-colors" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold ${item.completed ? 'text-stone-500 line-through' : 'text-stone-900'}`}>
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="text-sm text-stone-600 mt-1">{item.description}</p>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleStartEdit(item)}
                        className="p-1.5 text-stone-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id!)}
                        className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Template Management Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-stone-200 p-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold tracking-tight text-stone-900">Manage Standard Tasks</h3>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="p-1 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Standard Tasks</strong> are automatically added to every new event's checklist. 
                  Manage them here to ensure consistency across all trade shows.
                </p>
              </div>

              {loadingTemplates ? (
                <div className="text-center py-8 text-stone-500">Loading templates...</div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-stone-500">
                  <p>No standard tasks yet.</p>
                  <p className="text-sm text-stone-400 mt-1">Tasks you create here will auto-apply to all new events.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {templates.map((template, index) => (
                    <div key={template.id} className="border border-stone-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <span className="text-stone-400 font-mono text-sm mt-1">{index + 1}.</span>
                        <div className="flex-1">
                          <p className="font-medium text-stone-900">{template.title}</p>
                          {template.description && (
                            <p className="text-sm text-stone-600 mt-1">{template.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-stone-200">
                <p className="text-xs text-stone-500">
                  💡 <strong>Tip:</strong> To add/edit/delete standard tasks, you'll need to update them in the database or add CRUD UI here in a future update.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

