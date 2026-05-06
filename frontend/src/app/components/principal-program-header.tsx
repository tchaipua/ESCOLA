'use client';

import { useEffect, useState } from 'react';

export const PRINCIPAL_PROGRAM_HEADER_RIGHT_INSET_CLASS = 'lg:pr-[360px] xl:pr-[390px]';
export const PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS =
  'pointer-events-none absolute right-8 top-16 z-20 flex justify-end md:right-10 md:top-16';

type PrincipalProgramHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  schoolName?: string | null;
  logoUrl?: string | null;
  rightSlot?: React.ReactNode;
  rightInsetClassName?: string;
  secondaryAction?: React.ReactNode;
};

export default function PrincipalProgramHeader({
  eyebrow,
  title,
  description,
  schoolName,
  logoUrl,
  rightSlot,
  rightInsetClassName = PRINCIPAL_PROGRAM_HEADER_RIGHT_INSET_CLASS,
  secondaryAction,
}: PrincipalProgramHeaderProps) {
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    setResolvedLogoUrl(logoUrl || null);
  }, [logoUrl]);

  return (
    <div
      className={`overflow-hidden rounded-[28px] bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] ${rightInsetClassName}`}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex flex-col gap-3 pt-1">{secondaryAction}</div>

          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-white/10 shadow-lg backdrop-blur-sm">
            {resolvedLogoUrl ? (
              <img
                src={resolvedLogoUrl}
                alt={`Logo de ${schoolName || 'ESCOLA'}`}
                className="h-full w-full object-contain p-2"
              />
            ) : (
              <span className="text-lg font-black uppercase tracking-[0.25em] text-white">
                {String(schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
              </span>
            )}
          </div>

          <div>
            <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">{eyebrow}</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white">{title}</h1>
            <p className="mt-3 max-w-3xl text-sm font-medium text-blue-100/90">{description}</p>
          </div>
        </div>

        {rightSlot ? <div className="hidden lg:block">{rightSlot}</div> : null}
      </div>
    </div>
  );
}
