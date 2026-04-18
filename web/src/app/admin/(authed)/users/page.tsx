import { UsersUI } from './UsersUI';

export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium text-gray-900">用户管理</h1>
      <UsersUI />
    </div>
  );
}
