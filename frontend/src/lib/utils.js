import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';

export const cn = (...inputs) => twMerge(clsx(inputs));

export const formatDate = (date, fmt = 'dd MMM yyyy') =>
  date ? format(new Date(date), fmt, { locale: id }) : '-';

export const formatDateTime = (date) =>
  date ? format(new Date(date), 'dd MMM yyyy, HH:mm', { locale: id }) : '-';

export const timeAgo = (date) =>
  date ? formatDistanceToNow(new Date(date), { addSuffix: true, locale: id }) : '-';

export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

export const STATUS_CONFIG = {
  OPEN:        { label: 'Open',       class: 'badge-blue',   dot: 'bg-blue-500' },
  ON_PROGRESS: { label: 'On Progress',class: 'badge-yellow', dot: 'bg-yellow-500' },
  PENDING:     { label: 'Pending',    class: 'badge-gray',   dot: 'bg-gray-500' },
  RESOLVED:    { label: 'Resolved',   class: 'badge-green',  dot: 'bg-green-500' },
  CLOSED:      { label: 'Closed',     class: 'badge-gray',   dot: 'bg-gray-400' },
};

export const PRIORITY_CONFIG = {
  LOW:      { label: 'Low',      class: 'badge-green',  color: '#10B981' },
  MEDIUM:   { label: 'Medium',   class: 'badge-blue',   color: '#3B82F6' },
  HIGH:     { label: 'High',     class: 'badge-yellow', color: '#F59E0B' },
  CRITICAL: { label: 'Critical', class: 'badge-red',    color: '#EF4444' },
};

export const ROLE_CONFIG = {
  USER:     { label: 'User',      class: 'badge-gray' },
  IT_STAFF: { label: 'IT Staff',  class: 'badge-blue' },
  ADMIN:    { label: 'Admin',     class: 'badge-purple' },
};
