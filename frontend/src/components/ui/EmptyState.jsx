import { Ticket, Users, Bell, FileText } from 'lucide-react';

const icons = { ticket: Ticket, users: Users, bell: Bell, file: FileText };

export default function EmptyState({ icon = 'ticket', title, description, action }) {
  const Icon = icons[icon] || Ticket;
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-400 dark:text-gray-600" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-sm">{description}</p>
      )}
      {action}
    </div>
  );
}
