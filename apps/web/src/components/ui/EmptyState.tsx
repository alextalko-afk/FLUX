import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-float-up">
      {icon && (
        <div className="w-16 h-16 mb-4 text-fg-tertiary transition-transform duration-300 ease-spring hover:scale-110 hover:text-fg-accent">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-fg-primary mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-fg-secondary max-w-sm mb-4">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
