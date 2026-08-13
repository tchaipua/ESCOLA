'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';

export const PRINCIPAL_PROGRAM_HEADER_RIGHT_INSET_CLASS = 'lg:pr-[360px] xl:pr-[390px]';
export const PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS =
  'pointer-events-none absolute right-8 top-5 z-20 flex justify-end md:right-10 md:top-5';

type PrincipalProgramHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  schoolName?: string | null;
  logoUrl?: string | null;
  rightSlot?: React.ReactNode;
  rightInsetClassName?: string;
  secondaryAction?: React.ReactNode;
  density?: 'default' | 'compact';
};

function compactHeaderActionClassName(value: unknown) {
  if (typeof value !== 'string') return value;

  return value
    .replaceAll('h-11', 'h-9')
    .replaceAll('w-11', 'w-9')
    .replace('min-w-[72px]', 'min-w-[60px]')
    .replace('px-3', 'px-2.5')
    .replaceAll('rounded-2xl', 'rounded-xl');
}

function notificationHeaderActionClassName(value: unknown, unreadCount: number | null) {
  if (typeof value !== 'string' || unreadCount === null) return value;

  if (unreadCount === 0) {
    return value
      .replaceAll('border-white/20', 'border-emerald-300/80')
      .replaceAll('bg-white/10', 'bg-emerald-500')
      .replaceAll('hover:bg-white/20', 'hover:bg-emerald-600');
  }

  if (unreadCount > 0) {
    return value
      .replaceAll('border-white/20', 'border-red-300/80')
      .replaceAll('bg-white/10', 'bg-red-500')
      .replaceAll('hover:bg-white/20', 'hover:bg-red-600');
  }

  return value;
}

function compactHeaderActionNode(node: ReactNode, unreadCount: number | null, isCompact: boolean): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement(child)) return child;

    const props = child.props as {
      className?: unknown;
      children?: ReactNode;
      title?: unknown;
      'aria-label'?: unknown;
    };
    const nextProps: {
      className?: unknown;
      children?: ReactNode;
    } = {};
    const isNotificationAction = props.title === 'Abrir notificações' || props['aria-label'] === 'Abrir notificações';
    const notificationClassName = isNotificationAction
      ? notificationHeaderActionClassName(props.className, unreadCount)
      : props.className;
    const compactClassName = isCompact
      ? compactHeaderActionClassName(notificationClassName)
      : notificationClassName;
    const compactChildren = props.children
      ? compactHeaderActionNode(props.children, unreadCount, isCompact)
      : props.children;

    if (compactClassName !== props.className) {
      nextProps.className = compactClassName;
    }

    if (compactChildren !== props.children) {
      nextProps.children = compactChildren;
    }

    return Object.keys(nextProps).length ? cloneElement(child, nextProps) : child;
  });
}

export default function PrincipalProgramHeader({
  eyebrow,
  title,
  description,
  schoolName,
  logoUrl,
  rightSlot,
  rightInsetClassName = PRINCIPAL_PROGRAM_HEADER_RIGHT_INSET_CLASS,
  secondaryAction,
  density = 'compact',
}: PrincipalProgramHeaderProps) {
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState<string | null>(null);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number | null>(null);
  const isCompact = density === 'compact';
  const renderedSecondaryAction = compactHeaderActionNode(secondaryAction, unreadNotificationsCount, isCompact);

  useEffect(() => {
    setResolvedLogoUrl(logoUrl || null);
  }, [logoUrl]);

  useEffect(() => {
    let active = true;

    const loadUnreadNotifications = async () => {
      try {
        const { token, userId } = getDashboardAuthContext();
        if (!token || !userId) {
          if (active) setUnreadNotificationsCount(null);
          return;
        }

        const response = await fetch(`${API_BASE_URL}/notifications/my/unread-summary`, { headers: {} });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || 'Não foi possível consultar as notificações.');

        if (active) {
          setUnreadNotificationsCount(typeof data?.count === 'number' ? data.count : null);
        }
      } catch {
        if (active) setUnreadNotificationsCount(null);
      }
    };

    const refreshUnreadNotifications = () => {
      void loadUnreadNotifications();
    };

    void loadUnreadNotifications();
    window.addEventListener('notifications-updated', refreshUnreadNotifications);
    window.addEventListener('focus', refreshUnreadNotifications);

    return () => {
      active = false;
      window.removeEventListener('notifications-updated', refreshUnreadNotifications);
      window.removeEventListener('focus', refreshUnreadNotifications);
    };
  }, []);

  return (
    <div
      className={`overflow-hidden rounded-[28px] bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] ${isCompact ? 'px-4 py-5' : 'px-6 py-6'} ${rightInsetClassName}`}
    >
      <div className={`flex flex-col lg:flex-row lg:items-center lg:justify-between ${isCompact ? 'gap-3' : 'gap-5'}`}>
        <div className={`flex items-start ${isCompact ? 'gap-3' : 'gap-4'}`}>
          <div className={`flex flex-col pt-1 ${isCompact ? 'gap-2' : 'gap-3'}`}>{renderedSecondaryAction}</div>

          <div className={`flex shrink-0 items-center justify-center overflow-hidden border border-white/20 bg-white/10 shadow-lg backdrop-blur-sm ${isCompact ? 'h-14 w-14 rounded-2xl' : 'h-20 w-20 rounded-3xl'}`}>
            {resolvedLogoUrl ? (
              <img
                src={resolvedLogoUrl}
                alt={`Logo de ${schoolName || 'ESCOLA'}`}
                className={`h-full w-full object-contain ${isCompact ? 'p-1.5' : 'p-2'}`}
              />
            ) : (
              <span className="text-lg font-black uppercase tracking-[0.25em] text-white">
                {String(schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
              </span>
            )}
          </div>

          <div>
            <div className={`${isCompact ? 'text-[10px]' : 'text-xs'} font-black uppercase tracking-[0.24em] text-cyan-200`}>{eyebrow}</div>
            <h1 className={`${isCompact ? 'mt-1 text-2xl' : 'mt-2 text-3xl'} font-black tracking-tight text-white`}>{title}</h1>
            <p className={`${isCompact ? 'mt-1 text-xs' : 'mt-3 text-sm'} max-w-3xl font-medium text-blue-100/90`}>{description}</p>
          </div>
        </div>

        {rightSlot ? <div className="hidden lg:block">{rightSlot}</div> : null}
      </div>
    </div>
  );
}
