import React, { useState, useEffect } from 'react';
import { User } from '../../App';
import { api } from '../../utils/api';
import { UserManagement } from './UserManagement';
import { RoleManagement } from './RoleManagement';
import {
  AdminSettingsHeader,
  AdminSettingsTabs,
  CardOptionsSection,
  EntityOptionsSection,
  CategoryOptionsSection,
} from './AdminSettings/index';

interface AdminSettingsProps {
  user: User;
}

interface CardOption {
  name: string;
  lastFour: string;
  entity?: string | null;
  zohoPaymentAccountId?: string | null;
}

interface CategoryOption {
  name: string;
  zohoExpenseAccountId?: string | null;
}

interface AppSettings {
  cardOptions: CardOption[];
  entityOptions: string[];
  categoryOptions: CategoryOption[];
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ user }) => {
  // Access control: Only admins, accountants, and developers can access settings
  if (user.role !== 'admin' && user.role !== 'accountant' && user.role !== 'developer') {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Access denied. Only administrators, accountants, and developers can access settings.</p>
        </div>
      </div>
    );
  }

  // State initialization - default to system
  const [activeTab, setActiveTab] = useState<'system' | 'users'>('system');
  const [settings, setSettings] = useState<AppSettings>({
    cardOptions: [
      { name: 'Haute Intl USD Debit', lastFour: '0000' },
      { name: 'Haute Inc GBP Amex', lastFour: '0000' },
      { name: 'Haute Inc USD Amex', lastFour: '0000' },
      { name: 'Haute Inc USD Debit', lastFour: '0000' },
      { name: 'Haute LLC GBP Amex', lastFour: '0000' },
      { name: 'Haute LLC USD Amex', lastFour: '0000' },
      { name: 'Haute LLC USD Debit', lastFour: '0000' }
    ],
    entityOptions: [
      'Entity A - Main Operations',
      'Entity B - Sales Division',
      'Entity C - Marketing Department',
      'Entity D - International Operations'
    ],
    categoryOptions: [
      { name: 'Booth / Marketing / Tools', zohoExpenseAccountId: null },
      { name: 'Travel - Flight', zohoExpenseAccountId: null },
      { name: 'Accommodation - Hotel', zohoExpenseAccountId: null },
      { name: 'Transportation - Uber / Lyft / Others', zohoExpenseAccountId: null },
      { name: 'Parking Fees', zohoExpenseAccountId: null },
      { name: 'Rental - Car / U-haul', zohoExpenseAccountId: null },
      { name: 'Meal and Entertainment', zohoExpenseAccountId: null },
      { name: 'Gas / Fuel', zohoExpenseAccountId: null },
      { name: 'Show Allowances - Per Diem', zohoExpenseAccountId: null },
      { name: 'Model', zohoExpenseAccountId: null },
      { name: 'Shipping Charges', zohoExpenseAccountId: null },
      { name: 'Other', zohoExpenseAccountId: null }
    ]
  });

  const [newCardName, setNewCardName] = useState('');
  const [newCardLastFour, setNewCardLastFour] = useState('');
  const [newCardEntity, setNewCardEntity] = useState('');
  const [newCardZohoAccountId, setNewCardZohoAccountId] = useState('');
  const [newEntityOption, setNewEntityOption] = useState('');
  const [newCategoryOption, setNewCategoryOption] = useState('');
  const [newCategoryZohoAccountId, setNewCategoryZohoAccountId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingCardIndex, setEditingCardIndex] = useState<number | null>(null);
  const [editCardName, setEditCardName] = useState('');
  const [editCardLastFour, setEditCardLastFour] = useState('');
  const [editCardEntity, setEditCardEntity] = useState('');
  const [editCardZohoAccountId, setEditCardZohoAccountId] = useState('');
  const [editingEntityIndex, setEditingEntityIndex] = useState<number | null>(null);
  const [editEntityValue, setEditEntityValue] = useState('');
  const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);
  const [editCategoryValue, setEditCategoryValue] = useState('');
  const [editCategoryZohoAccountId, setEditCategoryZohoAccountId] = useState('');

  // Check sessionStorage and hash on mount to set initial tab
  useEffect(() => {
    // Priority 1: Check sessionStorage (more reliable for programmatic navigation)
    const targetTab = sessionStorage.getItem('openSettingsTab');
    if (targetTab === 'users') {
      setActiveTab('users');
      sessionStorage.removeItem('openSettingsTab'); // Clear after reading
    } else if (window.location.hash === '#users') {
      // Priority 2: Check hash (for manual navigation or bookmarks)
      setActiveTab('users');
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (api.USE_SERVER) {
        try {
          console.log('[AdminSettings] Fetching settings...');
          const data = await api.getSettings();
          console.log('[AdminSettings] Received settings:', data);
          
          // Handle card options with backward compatibility
          let cardOptions = data?.cardOptions || settings.cardOptions;
          // Ensure all cards have zohoPaymentAccountId field
          cardOptions = cardOptions.map((card: any) => ({
            name: card.name,
            lastFour: card.lastFour,
            entity: card.entity || null,
            zohoPaymentAccountId: card.zohoPaymentAccountId || null
          }));
          
          // Handle category options with backward compatibility (string[] -> CategoryOption[])
          let categoryOptions: CategoryOption[] = settings.categoryOptions;
          if (data?.categoryOptions) {
            categoryOptions = data.categoryOptions.map((cat: any) => {
              // Handle old format (string) or new format (object)
              if (typeof cat === 'string') {
                return { name: cat, zohoExpenseAccountId: null };
              }
              return {
                name: cat.name,
                zohoExpenseAccountId: cat.zohoExpenseAccountId || null
              };
            });
          }
          
          // Merge with defaults to ensure all fields exist
          const mergedSettings = {
            cardOptions,
            entityOptions: data?.entityOptions || settings.entityOptions,
            categoryOptions
          };
          
          console.log('[AdminSettings] Merged settings:', mergedSettings);
          setSettings(mergedSettings);
        } catch (error) {
          console.error('[AdminSettings] Error loading settings:', error);
          // keep defaults
        }
      } else {
        const storedSettings = localStorage.getItem('app_settings');
        if (storedSettings) setSettings(JSON.parse(storedSettings));
      }
    })();
  }, []);

  // Watch for hash changes to switch tabs
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#users') {
        setActiveTab('users');
      }
    };
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const saveSettings = async (updatedSettings?: AppSettings) => {
    const settingsToSave = updatedSettings || settings;
    setIsSaving(true);
    try {
      if (api.USE_SERVER) {
        await api.updateSettings(settingsToSave as any);
      } else {
        localStorage.setItem('app_settings', JSON.stringify(settingsToSave));
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const addCardOption = async () => {
    if (newCardName && newCardLastFour && newCardLastFour.length === 4) {
      const isDuplicate = settings.cardOptions.some(
        card => card.name === newCardName && card.lastFour === newCardLastFour
      );
      
      if (!isDuplicate) {
        const updatedSettings = {
          ...settings,
          cardOptions: [...settings.cardOptions, { 
            name: newCardName, 
            lastFour: newCardLastFour,
            entity: newCardEntity || null,
            zohoPaymentAccountId: newCardZohoAccountId || null
          }]
        };
        setSettings(updatedSettings);
        setNewCardZohoAccountId('');
        setNewCardName('');
        setNewCardLastFour('');
        setNewCardEntity('');
        await saveSettings(updatedSettings);
      } else {
        alert('This card already exists.');
      }
    } else if (newCardLastFour && newCardLastFour.length !== 4) {
      alert('Last 4 digits must be exactly 4 characters.');
    }
  };

  const removeCardOption = async (option: CardOption) => {
    const updatedSettings = {
      ...settings,
      cardOptions: settings.cardOptions.filter(
        card => !(card.name === option.name && card.lastFour === option.lastFour)
      )
    };
    setSettings(updatedSettings);
    await saveSettings(updatedSettings);
  };

  const startEditCard = (index: number) => {
    setEditingCardIndex(index);
    setEditCardName(settings.cardOptions[index].name);
    setEditCardLastFour(settings.cardOptions[index].lastFour);
    setEditCardEntity(settings.cardOptions[index].entity || '');
    setEditCardZohoAccountId(settings.cardOptions[index].zohoPaymentAccountId || '');
  };

  const cancelEditCard = () => {
    setEditingCardIndex(null);
    setEditCardName('');
    setEditCardLastFour('');
    setEditCardEntity('');
    setEditCardZohoAccountId('');
  };

  const saveEditCard = async (index: number) => {
    if (editCardName && editCardLastFour && editCardLastFour.length === 4) {
      const updatedCards = [...settings.cardOptions];
      updatedCards[index] = { 
        name: editCardName, 
        lastFour: editCardLastFour,
        entity: editCardEntity || null,
        zohoPaymentAccountId: editCardZohoAccountId || null
      };
      const updatedSettings = {
        ...settings,
        cardOptions: updatedCards
      };
      setSettings(updatedSettings);
      setEditingCardIndex(null);
      setEditCardName('');
      setEditCardLastFour('');
      setEditCardZohoAccountId('');
      setEditCardEntity('');
      await saveSettings(updatedSettings);
    } else if (editCardLastFour && editCardLastFour.length !== 4) {
      alert('Last 4 digits must be exactly 4 characters.');
    }
  };

  const addEntityOption = async () => {
    if (newEntityOption && !settings.entityOptions.includes(newEntityOption)) {
      const updatedSettings = {
        ...settings,
        entityOptions: [...settings.entityOptions, newEntityOption]
      };
      setSettings(updatedSettings);
      setNewEntityOption('');
      await saveSettings(updatedSettings);
    }
  };

  const removeEntityOption = async (option: string) => {
    const updatedSettings = {
      ...settings,
      entityOptions: settings.entityOptions.filter(entity => entity !== option)
    };
    setSettings(updatedSettings);
    await saveSettings(updatedSettings);
  };

  const startEditEntity = (index: number) => {
    setEditingEntityIndex(index);
    setEditEntityValue(settings.entityOptions[index]);
  };

  const cancelEditEntity = () => {
    setEditingEntityIndex(null);
    setEditEntityValue('');
  };

  const saveEditEntity = async (index: number) => {
    if (editEntityValue && editEntityValue.trim()) {
      const updatedEntities = [...settings.entityOptions];
      updatedEntities[index] = editEntityValue.trim();
      const updatedSettings = {
        ...settings,
        entityOptions: updatedEntities
      };
      setSettings(updatedSettings);
      setEditingEntityIndex(null);
      setEditEntityValue('');
      await saveSettings(updatedSettings);
    }
  };

  const addCategoryOption = async () => {
    const isDuplicate = settings.categoryOptions.some(cat => cat.name === newCategoryOption);
    if (newCategoryOption && !isDuplicate) {
      const updatedSettings = {
        ...settings,
        categoryOptions: [...settings.categoryOptions, {
          name: newCategoryOption,
          zohoExpenseAccountId: newCategoryZohoAccountId || null
        }]
      };
      setSettings(updatedSettings);
      setNewCategoryOption('');
      setNewCategoryZohoAccountId('');
      await saveSettings(updatedSettings);
    }
  };

  const removeCategoryOption = async (option: CategoryOption) => {
    const updatedSettings = {
      ...settings,
      categoryOptions: settings.categoryOptions.filter(category => category.name !== option.name)
    };
    setSettings(updatedSettings);
    await saveSettings(updatedSettings);
  };

  const startEditCategory = (index: number) => {
    setEditingCategoryIndex(index);
    setEditCategoryValue(settings.categoryOptions[index].name);
    setEditCategoryZohoAccountId(settings.categoryOptions[index].zohoExpenseAccountId || '');
  };

  const cancelEditCategory = () => {
    setEditingCategoryIndex(null);
    setEditCategoryValue('');
    setEditCategoryZohoAccountId('');
  };

  const saveEditCategory = async (index: number) => {
    if (editCategoryValue && editCategoryValue.trim()) {
      const updatedCategories = [...settings.categoryOptions];
      updatedCategories[index] = {
        name: editCategoryValue.trim(),
        zohoExpenseAccountId: editCategoryZohoAccountId || null
      };
      const updatedSettings = {
        ...settings,
        categoryOptions: updatedCategories
      };
      setSettings(updatedSettings);
      setEditingCategoryIndex(null);
      setEditCategoryValue('');
      setEditCategoryZohoAccountId('');
      await saveSettings(updatedSettings);
    }
  };

  return (
    <div className="space-y-6">
      <AdminSettingsHeader />

      <AdminSettingsTabs
        user={user}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Tab Content */}
      {activeTab === 'users' ? (
        <div className="space-y-8">
          {/* User Management Section */}
          <UserManagement user={user} />
          
          {/* Divider */}
          <div className="border-t border-gray-200"></div>
          
          {/* Role Management Section (Collapsible) */}
          <RoleManagement />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Auto-save Note */}
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Changes to these settings are automatically saved to the database and will be immediately reflected in all expense forms and dropdowns throughout the application.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5 lg:gap-6">
            <CardOptionsSection
              cardOptions={settings.cardOptions}
              entityOptions={settings.entityOptions}
              newCardName={newCardName}
              setNewCardName={setNewCardName}
              newCardLastFour={newCardLastFour}
              setNewCardLastFour={setNewCardLastFour}
              newCardEntity={newCardEntity}
              setNewCardEntity={setNewCardEntity}
              newCardZohoAccountId={newCardZohoAccountId}
              setNewCardZohoAccountId={setNewCardZohoAccountId}
              editingCardIndex={editingCardIndex}
              editCardName={editCardName}
              setEditCardName={setEditCardName}
              editCardLastFour={editCardLastFour}
              setEditCardLastFour={setEditCardLastFour}
              editCardEntity={editCardEntity}
              setEditCardEntity={setEditCardEntity}
              editCardZohoAccountId={editCardZohoAccountId}
              setEditCardZohoAccountId={setEditCardZohoAccountId}
              isSaving={isSaving}
              onAddCard={addCardOption}
              onRemoveCard={removeCardOption}
              onStartEdit={startEditCard}
              onCancelEdit={cancelEditCard}
              onSaveEdit={saveEditCard}
            />

            <EntityOptionsSection
              entityOptions={settings.entityOptions}
              newEntityOption={newEntityOption}
              setNewEntityOption={setNewEntityOption}
              editingEntityIndex={editingEntityIndex}
              editEntityValue={editEntityValue}
              setEditEntityValue={setEditEntityValue}
              isSaving={isSaving}
              onAddEntity={addEntityOption}
              onRemoveEntity={removeEntityOption}
              onStartEdit={startEditEntity}
              onCancelEdit={cancelEditEntity}
              onSaveEdit={saveEditEntity}
            />

            <CategoryOptionsSection
              categoryOptions={settings.categoryOptions}
              newCategoryOption={newCategoryOption}
              setNewCategoryOption={setNewCategoryOption}
              newCategoryZohoAccountId={newCategoryZohoAccountId}
              setNewCategoryZohoAccountId={setNewCategoryZohoAccountId}
              editingCategoryIndex={editingCategoryIndex}
              editCategoryValue={editCategoryValue}
              setEditCategoryValue={setEditCategoryValue}
              editCategoryZohoAccountId={editCategoryZohoAccountId}
              setEditCategoryZohoAccountId={setEditCategoryZohoAccountId}
              isSaving={isSaving}
              onAddCategory={addCategoryOption}
              onRemoveCategory={removeCategoryOption}
              onStartEdit={startEditCategory}
              onCancelEdit={cancelEditCategory}
              onSaveEdit={saveEditCategory}
            />
          </div>
        </div>
      )}
    </div>
  );
};

