import React, { useState } from 'react';
import { User, UserRole } from '../../App';
import { api } from '../../utils/api';
import {
  UserManagementHeader,
  UserManagementFilters,
  UserManagementTable,
  ActivationModal,
  RejectionModal,
  UserFormModal,
} from './UserManagement/index';
import { useUserManagement } from './UserManagement/hooks/useUserManagement';

interface UserManagementProps {
  user: User;
}

export const UserManagement: React.FC<UserManagementProps> = ({ user: currentUser }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [activatingUser, setActivatingUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('salesperson');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingUser, setRejectingUser] = useState<User | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'salesperson' as UserRole
  });

  // Use user management hook
  const { users, roles, loadUsers } = useUserManagement();

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (api.USE_SERVER) {
      if (editingUser) {
        await api.updateUser(editingUser.id, {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          ...(formData.password ? { password: formData.password } : {}),
        });
      } else {
        await api.createUser({
          name: formData.name,
          username: formData.username,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        });
      }
      await loadUsers();
    } else {
      const newUser: User = { id: editingUser?.id || Date.now().toString(), ...formData } as User;
      const updatedUsers = editingUser ? users.map(u => u.id === editingUser.id ? newUser : u) : [...users, newUser];
      localStorage.setItem('tradeshow_users', JSON.stringify(updatedUsers));
      if (formData.password) localStorage.setItem(`user_password_${newUser.username}`, formData.password);
      await loadUsers();
    }
    setShowForm(false);
    setEditingUser(null);
    setFormData({ name: '', username: '', email: '', password: '', role: 'salesperson' });
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      username: user.username,
      email: user.email,
      password: '', // Don't pre-fill password
      role: user.role
    });
    setShowForm(true);
  };

  /**
   * Deactivation replaced the hard delete here. users.id is the join key for
   * expenses stored in Midas, so deleting someone orphaned every expense they
   * ever filed with no way back — see the Rita Dubb incident, Sept 11 2026.
   */
  const handleSetUserActive = async (user: User, isActive: boolean) => {
    if (!isActive) {
      if (user.id === currentUser.id) {
        alert('You cannot deactivate your own account!');
        return;
      }
      if (user.username === 'admin') {
        alert('Cannot deactivate the system admin user!');
        return;
      }
      const confirmed = window.confirm(
        `Deactivate ${user.name}?\n\nThey will not be able to sign in and will not appear when assigning people to events. ` +
          'Their existing expenses, events and history are kept, and you can reactivate them at any time.'
      );
      if (!confirmed) return;
    }

    try {
      if (api.USE_SERVER) {
        await api.setUserActive(user.id, isActive);
      } else {
        const updatedUsers = users.map(u => (u.id === user.id ? { ...u, is_active: isActive } : u));
        localStorage.setItem('tradeshow_users', JSON.stringify(updatedUsers));
      }
      await loadUsers();
    } catch (error) {
      console.error('Failed to change user active state:', error);
      alert(`Failed to ${isActive ? 'reactivate' : 'deactivate'} ${user.name}`);
    }
  };

  const handleInviteUser = (userId: string) => {
    // Simulate sending invitation email
    const user = users.find(u => u.id === userId);
    if (user) {
      alert(`Invitation email sent to ${user.email}`);
    }
  };

  const handleActivateUser = async () => {
    if (!activatingUser) return;
    
    try {
      await api.updateUser(activatingUser.id, {
        name: activatingUser.name,
        email: activatingUser.email,
        role: selectedRole,
      });
      await loadUsers();
      setShowActivationModal(false);
      setActivatingUser(null);
      alert(`User ${activatingUser.name} activated with role: ${getRoleLabel(selectedRole)}`);
    } catch (error) {
      console.error('Failed to activate user:', error);
      alert('Failed to activate user');
    }
  };

  const openActivationModal = (user: User) => {
    setActivatingUser(user);
    setSelectedRole('salesperson'); // Default
    setShowActivationModal(true);
  };

  const handleRejectUser = async () => {
    if (!rejectingUser) return;
    
    try {
      await api.deleteUser(rejectingUser.id);
      await loadUsers();
      
      setShowRejectModal(false);
      setRejectingUser(null);
      alert(`User ${rejectingUser.name} has been rejected and removed`);
    } catch (error) {
      console.error('Error rejecting user:', error);
      alert('Failed to reject user');
    }
  };

  const openRejectModal = (user: User) => {
    setRejectingUser(user);
    setShowRejectModal(true);
  };

  const isPendingUser = (user: User) => {
    return user.role === 'pending';
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const isActive = user.is_active !== false;
    const matchesStatus =
      filterStatus === 'all' || (filterStatus === 'active' ? isActive : !isActive);

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Get role color from dynamic roles data
  const getRoleColor = (roleName: string) => {
    const role = roles.find(r => r.name === roleName);
    if (role && role.color) {
      return role.color;
    }
    // Fallback colors for roles not yet in database
    const fallbackColors = {
      'admin': 'bg-purple-100 text-purple-800',
      'coordinator': 'bg-blue-100 text-blue-800',
      'salesperson': 'bg-emerald-100 text-emerald-800',
      'accountant': 'bg-orange-100 text-orange-800',
      'pending': 'bg-yellow-100 text-yellow-800',
      'developer': 'bg-indigo-100 text-indigo-800',
      'temporary': 'bg-pink-100 text-pink-800'
    };
    return fallbackColors[roleName as keyof typeof fallbackColors] || 'bg-gray-100 text-gray-800';
  };

  // Get role label from dynamic roles data
  const getRoleLabel = (roleName: string) => {
    const role = roles.find(r => r.name === roleName);
    if (role) {
      return role.label;
    }
    // Fallback labels for roles not yet in database
    const fallbackLabels = {
      'admin': 'Administrator',
      'coordinator': 'Show Coordinator',
      'salesperson': 'Sales Person',
      'accountant': 'Accountant',
      'pending': 'Pending Approval',
      'developer': 'Developer',
      'temporary': 'Temporary Attendee'
    };
    return fallbackLabels[roleName as keyof typeof fallbackLabels] || roleName;
  };

  return (
    <div className="space-y-6">
      <UserManagementHeader onAddUser={() => setShowForm(true)} />

      <UserManagementFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filterRole={filterRole}
        setFilterRole={setFilterRole}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        roles={roles}
      />

      <UserManagementTable
        users={filteredUsers}
        roles={roles}
        currentUserId={currentUser.id}
        isPendingUser={isPendingUser}
        getRoleColor={getRoleColor}
        getRoleLabel={getRoleLabel}
        onEditUser={handleEditUser}
        onSetUserActive={handleSetUserActive}
        onInviteUser={handleInviteUser}
        onActivateUser={openActivationModal}
        onRejectUser={openRejectModal}
      />

      <ActivationModal
        isOpen={showActivationModal}
        user={activatingUser}
        selectedRole={selectedRole}
        roles={roles}
        onClose={() => {
          setShowActivationModal(false);
          setActivatingUser(null);
        }}
        onRoleChange={setSelectedRole}
        onActivate={handleActivateUser}
      />

      <RejectionModal
        isOpen={showRejectModal}
        user={rejectingUser}
        onClose={() => {
          setShowRejectModal(false);
          setRejectingUser(null);
        }}
        onReject={handleRejectUser}
      />

      <UserFormModal
        isOpen={showForm}
        editingUser={editingUser}
        formData={formData}
        roles={roles}
        onClose={() => {
          setShowForm(false);
          setEditingUser(null);
          setFormData({ name: '', username: '', email: '', password: '', role: 'salesperson' });
        }}
        onFormDataChange={(data) => setFormData({ ...formData, ...data })}
        onSubmit={handleSaveUser}
      />
    </div>
  );
};