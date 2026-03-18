type TenantBranding = {
    tenantId: string;
    schoolName: string;
    logoUrl?: string | null;
};

function getCacheKey(tenantId: string) {
    return `tenant-branding:${tenantId}`;
}

export function cacheTenantBranding(branding: TenantBranding) {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(getCacheKey(branding.tenantId), JSON.stringify(branding));
}

export function readCachedTenantBranding(tenantId: string | null | undefined): TenantBranding | null {
    if (typeof window === 'undefined' || !tenantId) return null;

    try {
        const rawValue = window.localStorage.getItem(getCacheKey(tenantId));
        if (!rawValue) return null;
        const parsed = JSON.parse(rawValue) as TenantBranding;
        if (!parsed?.tenantId || !parsed?.schoolName) return null;
        return parsed;
    } catch {
        return null;
    }
}
