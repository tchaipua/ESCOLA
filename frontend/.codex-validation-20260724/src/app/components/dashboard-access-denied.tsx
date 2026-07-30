'use client';

type DashboardAccessDeniedProps = {
    title: string;
    message: string;
};

export default function DashboardAccessDenied({ title, message }: DashboardAccessDeniedProps) {
    return (
        <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl items-center justify-center">
            <div className="w-full rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-2xl font-black text-amber-700">
                    !
                </div>
                <h1 className="mt-5 text-3xl font-extrabold text-[#153a6a]">{title}</h1>
                <p className="mt-3 text-sm font-medium text-slate-500">{message}</p>
            </div>
        </div>
    );
}
