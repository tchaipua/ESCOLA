'use client';

import { useEffect, useMemo, useState } from 'react';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';

const API_BASE_URL = 'http://localhost:3001/api/v1';

type ClassScheduleItemRecord = {
  id: string;
  canceledAt?: string | null;
  schoolYear?: { id: string; year: number } | null;
  teacherSubject?: {
    id: string;
    teacher?: { id: string; name?: string | null } | null;
    subject?: { id: string; name?: string | null } | null;
  } | null;
};

type SchoolYearOption = { id: string; year: number; isActive?: boolean };

type TeacherSubjectSummary = {
  subjectId: string;
  subjectName: string;
  classesThisWeek: number;
};

type TeacherWeeklySummary = {
  teacherId: string;
  teacherName: string;
  totalClasses: number;
  subjects: TeacherSubjectSummary[];
};

type TeacherSubjectLookupEntry = {
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
};

const getInitials = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
};

const buildTeacherSummaries = (
  items: ClassScheduleItemRecord[],
  selectedSchoolYearId: string | null,
  teacherSubjectLookup: Record<string, TeacherSubjectLookupEntry>,
): TeacherWeeklySummary[] => {
  if (!selectedSchoolYearId) return [];

  type TeacherAccumulator = {
    teacherId: string;
    teacherName: string;
    totalClasses: number;
    subjectMap: Map<string, TeacherSubjectSummary>;
  };

  const map = new Map<string, TeacherAccumulator>();

  items.forEach((item) => {
    if (!item || item.canceledAt) return;
    if (item.schoolYear?.id !== selectedSchoolYearId) return;

    const teacherSubjectId = item.teacherSubject?.id ?? '';
    const lookup = teacherSubjectLookup[teacherSubjectId];
    const fallbackTeacherName = item.teacherSubject?.teacher?.name?.trim();
    const teacherName = (lookup?.teacherName || fallbackTeacherName || 'PROFESSOR NÃO INFORMADO').toUpperCase();
    const teacherId = lookup?.teacherId ?? item.teacherSubject?.teacher?.id ?? `unknown-${teacherName}`;

    const fallbackSubjectName = item.teacherSubject?.subject?.name?.trim();
    const subjectName = (lookup?.subjectName || fallbackSubjectName || 'MATÉRIA NÃO INFORMADA').toUpperCase();
    const subjectId = lookup?.subjectId ?? item.teacherSubject?.subject?.id ?? `unknown-${subjectName}`;

    const accumulator = map.get(teacherId) ?? {
      teacherId,
      teacherName,
      totalClasses: 0,
      subjectMap: new Map<string, TeacherSubjectSummary>(),
    };

    accumulator.totalClasses += 1;

    const subjectEntry = accumulator.subjectMap.get(subjectId);
    if (subjectEntry) {
      subjectEntry.classesThisWeek += 1;
    } else {
      accumulator.subjectMap.set(subjectId, {
        subjectId,
        subjectName,
        classesThisWeek: 1,
      });
    }

    map.set(teacherId, accumulator);
  });

  return Array.from(map.values())
    .map(({ subjectMap, ...rest }) => ({
      ...rest,
      subjects: Array.from(subjectMap.values()).sort((left, right) =>
        left.subjectName.localeCompare(right.subjectName, 'pt-BR'),
      ),
    }))
    .sort((left, right) => left.teacherName.localeCompare(right.teacherName, 'pt-BR'));
};

export default function DashboardResumoSemanalProfessorAulasPage() {
  const { tenantId } = getDashboardAuthContext();
  const [tenantBranding, setTenantBranding] = useState<{ schoolName: string; logoUrl?: string | null } | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const cached = readCachedTenantBranding(tenantId);
    setTenantBranding(cached);
  }, [tenantId]);

  const [schoolYears, setSchoolYears] = useState<SchoolYearOption[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string | null>(null);
  const [scheduleItems, setScheduleItems] = useState<ClassScheduleItemRecord[]>([]);
  const [isSchoolYearLoading, setIsSchoolYearLoading] = useState(false);
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [schoolYearLoadError, setSchoolYearLoadError] = useState<string | null>(null);
  const [scheduleLoadError, setScheduleLoadError] = useState<string | null>(null);
  const [teacherSubjectLookup, setTeacherSubjectLookup] = useState<Record<string, TeacherSubjectLookupEntry>>({});

  useEffect(() => {
    const { token } = getDashboardAuthContext();
    if (!token) return;
    const controller = new AbortController();

    const fetchData = async () => {
      setIsSchoolYearLoading(true);
      setIsScheduleLoading(true);
      setSchoolYearLoadError(null);
      setScheduleLoadError(null);

      try {
        const [yearResponse, scheduleResponse, teacherSubjectsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/school-years`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }),
          fetch(`${API_BASE_URL}/class-schedule-items`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }),
          fetch(`${API_BASE_URL}/teacher-subjects`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }),
        ]);

        const [yearPayload, schedulePayload, teacherSubjectsPayload] = await Promise.all([
          yearResponse.json().catch(() => null),
          scheduleResponse.json().catch(() => null),
          teacherSubjectsResponse.json().catch(() => null),
        ]);

        if (yearResponse.ok) {
          const normalizedYears = Array.isArray(yearPayload) ? yearPayload : [];
          const dedupedYears = Array.from(
            normalizedYears.reduce<Map<number, SchoolYearOption>>((map, item) => {
              if (!item || typeof item.year !== 'number' || !item.id) return map;
              if (!map.has(item.year)) {
                map.set(item.year, { id: item.id, year: item.year, isActive: item.isActive });
              }
              return map;
            }, new Map()).values(),
          ).sort((left, right) => left.year - right.year);

          setSchoolYears(dedupedYears);
          if (dedupedYears.length > 0) {
            const currentYear = new Date().getFullYear();
            const defaultOption =
              dedupedYears.find((option) => option.year === currentYear) ?? dedupedYears[dedupedYears.length - 1];
            setSelectedSchoolYearId(defaultOption.id);
          } else {
            setSelectedSchoolYearId(null);
          }
        } else {
          setSchoolYearLoadError('Não foi possível carregar os anos letivos.');
        }

        if (scheduleResponse.ok) {
          const normalizedSchedules = Array.isArray(schedulePayload) ? schedulePayload : [];
          setScheduleItems(normalizedSchedules);
        } else {
          setScheduleLoadError('Não foi possível carregar a grade horária.');
        }

        if (teacherSubjectsResponse.ok) {
          const normalizedTeacherSubjects = Array.isArray(teacherSubjectsPayload)
            ? teacherSubjectsPayload
            : [];
          const lookup: Record<string, TeacherSubjectLookupEntry> = {};
          normalizedTeacherSubjects.forEach((entry) => {
            if (!entry || !entry.id) return;
            const teacherName = entry.teacher?.name?.trim();
            const subjectName = entry.subject?.name?.trim();
            lookup[entry.id] = {
              teacherId: entry.teacher?.id || `unknown-${entry.id}`,
              teacherName: teacherName ? teacherName.toUpperCase() : 'PROFESSOR NÃO INFORMADO',
              subjectId: entry.subject?.id || `unknown-${entry.id}`,
              subjectName: subjectName ? subjectName.toUpperCase() : 'MATÉRIA NÃO INFORMADA',
            };
          });
          setTeacherSubjectLookup(lookup);
        } else {
          setScheduleLoadError((prev) => prev || 'Não foi possível carregar os vínculos professor x matéria.');
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        const message = error instanceof Error ? error.message : 'Não foi possível carregar os dados da grade.';
        setSchoolYearLoadError((prev) => prev || message);
        setScheduleLoadError((prev) => prev || message);
      } finally {
        setIsSchoolYearLoading(false);
        setIsScheduleLoading(false);
      }
    };

    void fetchData();
    return () => controller.abort();
  }, []);

  const selectedSchoolYearYear = useMemo(() => {
    const selected = schoolYears.find((option) => option.id === selectedSchoolYearId);
    return selected ? selected.year : null;
  }, [schoolYears, selectedSchoolYearId]);

  const teacherSummaries = useMemo(
    () => buildTeacherSummaries(scheduleItems, selectedSchoolYearId, teacherSubjectLookup),
    [scheduleItems, selectedSchoolYearId, teacherSubjectLookup],
  );

  const totalClasses = useMemo(
    () => teacherSummaries.reduce((acc, summary) => acc + summary.totalClasses, 0),
    [teacherSummaries],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {tenantBranding?.logoUrl ? (
                <img
                  src={tenantBranding.logoUrl}
                  alt={`Logo de ${tenantBranding.schoolName}`}
                  className="h-full w-full object-contain p-2"
                />
              ) : (
                <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">
                  {tenantBranding?.schoolName
                    ? tenantBranding.schoolName.slice(0, 3).toUpperCase()
                    : 'ESC'}
                </span>
              )}
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">
                Resumo Semanal
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900">
                Professores x Aulas da semana
              </h1>
              <p className="text-sm font-medium text-slate-500">
                Cada cartão apresenta o total semanal por professor e o detalhamento por matéria.
              </p>
            </div>
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-xs font-black uppercase tracking-[0.3em] text-slate-400">
              PROFESSORES
              <div className="mt-2 text-2xl font-extrabold text-slate-900">{teacherSummaries.length}</div>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-xs font-black uppercase tracking-[0.3em] text-slate-400">
              TOTAL DE AULAS
              <div className="mt-2 text-2xl font-extrabold text-blue-600">{totalClasses}</div>
            </article>
          </div>
          <div className="mt-4 flex justify-center">
            <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-[32px] border border-emerald-300 bg-emerald-100/90 px-6 py-4 text-center shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-700">Selecionar Ano</span>
              <select
                value={selectedSchoolYearId ?? ''}
                onChange={(event) => setSelectedSchoolYearId(event.target.value || null)}
                disabled={isSchoolYearLoading || schoolYears.length === 0}
                className="w-full rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-lg font-black uppercase tracking-[0.2em] text-emerald-800 outline-none transition focus:border-emerald-500"
              >
                {schoolYears.length === 0 ? (
                  <option value="">{isSchoolYearLoading ? 'CARREGANDO...' : '—'}</option>
                ) : (
                  schoolYears.map((yearOption) => (
                    <option key={yearOption.id} value={yearOption.id}>
                      {yearOption.year}
                      {yearOption.isActive ? ' (ATIVO)' : ''}
                    </option>
                  ))
                )}
              </select>
              {schoolYearLoadError && (
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">
                  {schoolYearLoadError}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
            Cards semanais
          </div>
          <p className="text-sm font-medium text-slate-500">
            Cada card representa um professor ativo. Role para verificar o total semanal por docente e o detalhamento por matéria.
          </p>
        </div>
        {isScheduleLoading ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                className="h-60 animate-pulse rounded-[28px] border border-slate-200 bg-slate-200/60"
              />
            ))}
          </div>
        ) : scheduleLoadError ? (
          <div className="mt-6 rounded-[28px] border border-rose-200 bg-rose-50 px-6 py-8 text-center text-sm font-bold uppercase tracking-[0.2em] text-rose-600">
            {scheduleLoadError}
          </div>
        ) : teacherSummaries.length === 0 ? (
          <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm font-medium text-slate-500">
            Nenhum lançamento disponível
            {selectedSchoolYearYear ? ` para o ano letivo ${selectedSchoolYearYear}` : ' para o ano letivo selecionado'}.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {teacherSummaries.map((professor) => (
              <article
                key={professor.teacherId}
                className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50/30 p-5 shadow-sm backdrop-blur-sm"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900">
                      <span className="text-lg font-black uppercase tracking-[0.2em]">
                        {getInitials(professor.teacherName)}
                      </span>
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                        Professor titular
                      </p>
                      <h3 className="text-lg font-extrabold text-slate-900">{professor.teacherName}</h3>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                      Total semanal
                    </p>
                    <div className="text-3xl font-black text-blue-600">{professor.totalClasses}</div>
                  </div>
                </div>
                <div className="mt-6 space-y-2">
                  {professor.subjects.map((subject) => (
                    <div
                      key={`${professor.teacherId}-${subject.subjectId}`}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm"
                    >
                      <span className="text-slate-800 tracking-[0.15em]">{subject.subjectName}</span>
                      <span className="text-xs font-black uppercase tracking-[0.3em] text-blue-600">
                        {subject.classesThisWeek} AULAS
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
