import { STATUS_CONFIG, PRIORITY_CONFIG, ROLE_CONFIG } from '../../lib/utils';
import { cn } from '../../lib/utils';

export function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || { label: status, class: 'badge-gray', dot: 'bg-gray-500' };
  return (
    <span className={cn('badge gap-1.5', config.class)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
      {config.label}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const config = PRIORITY_CONFIG[priority] || { label: priority, class: 'badge-gray' };
  return <span className={cn('badge', config.class)}>{config.label}</span>;
}

export function RoleBadge({ role }) {
  const config = ROLE_CONFIG[role] || { label: role, class: 'badge-gray' };
  return <span className={cn('badge', config.class)}>{config.label}</span>;
}

export function SLABadge({ slaBreached, slaDeadline }) {
  if (!slaDeadline) return null;
  const isPast = new Date(slaDeadline) < new Date();
  if (slaBreached || isPast) {
    return <span className="badge badge-red">SLA Breached</span>;
  }
  const hoursLeft = Math.round((new Date(slaDeadline) - new Date()) / 3600000);
  if (hoursLeft <= 2) {
    return <span className="badge badge-yellow">⚠ {hoursLeft}h left</span>;
  }
  return <span className="badge badge-green">SLA OK</span>;
}
