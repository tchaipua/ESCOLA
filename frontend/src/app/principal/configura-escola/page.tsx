'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

type TenantBranding = {
    schoolName: string;
    logoUrl?: string | null;
};

const configurationPrograms = [
    {
        href: '/principal/financeiro/msinfor/usuarios-sistema',
        title: 'Usuários do Sistema',
        image: '/principal/pessoas.svg',
    },
    {
        href: '/principal/notificacoes/configurar-usuarios',
        title: 'Configura notificações por usuário',
        image: '/principal/notificacoes.svg',
    },
    {
        href: '/principal/disciplinas',
        title: 'Disciplinas',
        image: '/principal/grade.svg',
    },
    {
        href: '/principal/series',
        title: 'Séries',
        image: '/principal/grade.svg',
    },
    {
        href: '/principal/turmas',
        title: 'Turmas',
        image: '/principal/grade.svg',
    },
];

export default function ConfiguraEscolaPage() {
    const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);

    useEffect(() => {
        const { tenantId } = getDashboardAuthContext();
        if (!tenantId) return;

        const cachedBranding = readCachedTenantBranding(tenantId);
        if (cachedBranding) {
            setTenantBranding(cachedBranding);
        }
    }, []);

    return (
        <div className="flex min-h-[calc(100vh-12rem)] w-full pt-0">
            <div className="flex w-full flex-col bg-transparent">
                <PrincipalProgramHeader
                    eyebrow="Configuração escolar"
                    title="Administrativo"
                    description="Acesse os programas administrativos que já fazem parte da rotina da escola."
                    schoolName={tenantBranding?.schoolName}
                    logoUrl={tenantBranding?.logoUrl}
                    density="compact"
                    secondaryAction={
                        <>
                            <button
                                type="button"
                                onClick={() => window.dispatchEvent(new Event('msinfor-financeiro-toggle-sidebar'))}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/20"
                                title="Recolher menu lateral"
                                aria-label="Recolher menu lateral"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                onClick={() => window.dispatchEvent(new Event('msinfor-financeiro-open-notifications'))}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/20"
                                title="Abrir notificações"
                                aria-label="Abrir notificações"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                            </button>
                        </>
                    }
                />

                <div className="flex-1 px-5 pb-8 pt-6 sm:px-6 lg:px-8">
                    <section className="rounded-[30px] bg-[#f8fafc] p-5">
                        <div className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">
                            Programas de configuração
                        </div>
                        <div className="mt-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                                {configurationPrograms.map((program) => (
                                    <Link
                                        key={program.href}
                                        href={program.href}
                                        className="group dashboard-band-soft overflow-hidden rounded-xl border shadow-sm transition-colors hover:border-blue-300"
                                    >
                                        <div className="flex h-20 items-center justify-center overflow-hidden bg-slate-100 p-3">
                                            <img
                                                src={program.image}
                                                alt={program.title}
                                                className="max-h-full max-w-full object-contain opacity-95 transition-transform duration-300 group-hover:scale-105"
                                            />
                                        </div>
                                        <div className="flex min-h-11 items-center justify-center p-2.5 text-center">
                                            <h3 className="text-sm font-bold text-slate-800">
                                                {program.title}
                                            </h3>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
