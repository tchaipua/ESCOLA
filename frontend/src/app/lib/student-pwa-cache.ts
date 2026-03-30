const STUDENT_PWA_CACHE_KEY = '@Escola-PWA-Student-Cache:v1';
const STUDENT_PWA_READ_QUEUE_KEY = '@Escola-PWA-Student-Read-Queue:v1';

export type StudentPwaNotification = {
    id: string;
    title: string;
    message: string;
    category: string;
    actionUrl?: string | null;
    readAt?: string | null;
    createdAt: string;
};

export type StudentPwaAttendanceSubject = {
    subjectId?: string | null;
    subjectName: string;
    totalLessons: number;
    totalPresent: number;
    totalAbsent: number;
    lastRecordedAt?: string | null;
    frequency: number;
};

export type StudentPwaAttendanceHistoryItem = {
    id: string;
    status: string;
    notes?: string | null;
    recordedAt?: string | null;
    lessonDate?: string | null;
    subjectName: string;
    teacherName: string;
    schoolYear?: number | null;
    seriesName: string;
    className: string;
    startTime?: string | null;
    endTime?: string | null;
};

export type StudentPwaSubjectAssessment = {
    id: string;
    title: string;
    assessmentType: string;
    score?: number | null;
    maxScore?: number | null;
    remarks?: string | null;
    releasedAt?: string | null;
    lessonDate?: string | null;
    schoolYear?: number | null;
};

export type StudentPwaGradeSubject = {
    subjectId?: string | null;
    subjectName: string;
    teacherName: string;
    averageScore: number;
    totalReleasedGrades: number;
    latestReleasedAt?: string | null;
    assessments: StudentPwaSubjectAssessment[];
};

export type StudentPwaPayload = {
    tenant: {
        id: string;
        name: string;
        logoUrl?: string | null;
    } | null;
    studentSummary: {
        student: {
            name?: string | null;
            email?: string | null;
            whatsapp?: string | null;
            phone?: string | null;
            guardians?: Array<{
                id: string;
                kinship?: string | null;
                kinshipDescription?: string | null;
                guardian?: {
                    name?: string | null;
                } | null;
            }>;
        } | null;
        currentEnrollment?: {
            schoolYear?: number | null;
            seriesName?: string | null;
            className?: string | null;
            shift?: string | null;
        } | null;
        attendance: {
            totalLessons: number;
            totalPresent: number;
            totalAbsent: number;
            overallFrequency: number;
            bySubject: StudentPwaAttendanceSubject[];
            history: StudentPwaAttendanceHistoryItem[];
        };
        grades: {
            totalReleasedGrades: number;
            overallAverage: number;
            bySubject: StudentPwaGradeSubject[];
        };
        syncedAt?: string | null;
    } | null;
    schedule: {
        items?: Array<{
            id: string;
            dayOfWeek: string;
            startTime: string;
            endTime: string;
            teacherSubject?: {
                subject?: { name?: string | null } | null;
                teacher?: { name?: string | null } | null;
            } | null;
        }>;
    } | null;
    notifications: StudentPwaNotification[];
    syncedAt: string;
};

function canUseStorage() {
    return typeof window !== 'undefined';
}

export function loadStudentPwaCache(): StudentPwaPayload | null {
    if (!canUseStorage()) return null;

    try {
        const raw = localStorage.getItem(STUDENT_PWA_CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as StudentPwaPayload;
    } catch {
        return null;
    }
}

export function saveStudentPwaCache(payload: StudentPwaPayload) {
    if (!canUseStorage()) return;
    localStorage.setItem(STUDENT_PWA_CACHE_KEY, JSON.stringify(payload));
}

export function clearStudentPwaCache() {
    if (!canUseStorage()) return;
    localStorage.removeItem(STUDENT_PWA_CACHE_KEY);
    localStorage.removeItem(STUDENT_PWA_READ_QUEUE_KEY);
}

export function loadStudentPwaReadQueue(): string[] {
    if (!canUseStorage()) return [];

    try {
        const raw = localStorage.getItem(STUDENT_PWA_READ_QUEUE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

export function saveStudentPwaReadQueue(ids: string[]) {
    if (!canUseStorage()) return;
    localStorage.setItem(STUDENT_PWA_READ_QUEUE_KEY, JSON.stringify(Array.from(new Set(ids))));
}

export function enqueueStudentPwaRead(notificationId: string) {
    const queue = loadStudentPwaReadQueue();
    queue.push(notificationId);
    saveStudentPwaReadQueue(queue);
}

export function dequeueStudentPwaReads(notificationIds: string[]) {
    const queue = loadStudentPwaReadQueue();
    const remaining = queue.filter((item) => !notificationIds.includes(item));
    saveStudentPwaReadQueue(remaining);
}
