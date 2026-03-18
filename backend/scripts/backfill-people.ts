import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SYSTEM_USER = "SYSTEM_BACKFILL_PEOPLE";

type LegacyRoleKind = "TEACHER" | "STUDENT" | "GUARDIAN";

type SharedIdentityRecord = {
  id: string;
  tenantId: string;
  personId: string | null;
  name: string;
  birthDate: Date | null;
  rg: string | null;
  cpf: string | null;
  cnpj: string | null;
  nickname: string | null;
  corporateName: string | null;
  phone: string | null;
  whatsapp: string | null;
  cellphone1: string | null;
  cellphone2: string | null;
  email: string | null;
  password: string | null;
  resetPasswordToken: string | null;
  resetPasswordExpires: Date | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  complement: string | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
  canceledAt: Date | null;
  canceledBy: string | null;
};

type LegacyRecord = SharedIdentityRecord & {
  kind: LegacyRoleKind;
};

type ExistingPerson = {
  id: string;
  tenantId: string;
  name: string;
  birthDate: Date | null;
  rg: string | null;
  cpf: string | null;
  cpfDigits: string | null;
  cnpj: string | null;
  nickname: string | null;
  corporateName: string | null;
  phone: string | null;
  whatsapp: string | null;
  cellphone1: string | null;
  cellphone2: string | null;
  email: string | null;
  password: string | null;
  resetPasswordToken: string | null;
  resetPasswordExpires: Date | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  complement: string | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
  canceledAt: Date | null;
  canceledBy: string | null;
};

type PersonGroup = {
  key: string;
  tenantId: string;
  personId: string | null;
  records: LegacyRecord[];
};

function normalizeDocument(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeEmail(value?: string | null) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isBlank(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}

function pickValue<T>(
  records: LegacyRecord[],
  getter: (record: LegacyRecord) => T | null | undefined,
  fallback: T | null,
) {
  for (const record of records) {
    const value = getter(record);
    if (!isBlank(value)) {
      return value as T;
    }
  }

  return fallback;
}

function buildIdentityKeys(record: LegacyRecord) {
  const keys: string[] = [];
  const normalizedCpf = normalizeDocument(record.cpf);
  const normalizedEmail = normalizeEmail(record.email);

  if (record.personId) {
    keys.push(`PERSON:${record.personId}`);
  }

  if (normalizedCpf) {
    keys.push(`CPF:${record.tenantId}:${normalizedCpf}`);
  }

  if (normalizedEmail) {
    keys.push(`EMAIL:${record.tenantId}:${normalizedEmail}`);
  }

  if (keys.length === 0) {
    keys.push(`ROW:${record.kind}:${record.id}`);
  }

  return keys;
}

function mergeGroups(
  groups: Map<string, PersonGroup>,
  aliasToGroupKey: Map<string, string>,
  targetKey: string,
  sourceKey: string,
) {
  if (targetKey === sourceKey) return targetKey;

  const targetGroup = groups.get(targetKey);
  const sourceGroup = groups.get(sourceKey);

  if (!targetGroup || !sourceGroup) {
    return targetKey;
  }

  targetGroup.records.push(...sourceGroup.records);
  if (!targetGroup.personId && sourceGroup.personId) {
    targetGroup.personId = sourceGroup.personId;
  }

  for (const [alias, currentGroupKey] of aliasToGroupKey.entries()) {
    if (currentGroupKey === sourceKey) {
      aliasToGroupKey.set(alias, targetKey);
    }
  }

  groups.delete(sourceKey);
  return targetKey;
}

async function main() {
  const startedAt = Date.now();
  const tenants = await prisma.tenant.findMany({
    where: { canceledAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  let createdPeople = 0;
  let updatedPeople = 0;
  let linkedRecords = 0;

  for (const tenant of tenants) {
    const [teachers, students, guardians, existingPeople] = await Promise.all([
      prisma.teacher.findMany({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          tenantId: true,
          personId: true,
          name: true,
          birthDate: true,
          rg: true,
          cpf: true,
          cnpj: true,
          nickname: true,
          corporateName: true,
          phone: true,
          whatsapp: true,
          cellphone1: true,
          cellphone2: true,
          email: true,
          password: true,
          resetPasswordToken: true,
          resetPasswordExpires: true,
          zipCode: true,
          street: true,
          number: true,
          city: true,
          state: true,
          neighborhood: true,
          complement: true,
          createdAt: true,
          createdBy: true,
          updatedAt: true,
          updatedBy: true,
          canceledAt: true,
          canceledBy: true,
        },
      }),
      prisma.student.findMany({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          tenantId: true,
          personId: true,
          name: true,
          birthDate: true,
          rg: true,
          cpf: true,
          cnpj: true,
          nickname: true,
          corporateName: true,
          phone: true,
          whatsapp: true,
          cellphone1: true,
          cellphone2: true,
          email: true,
          password: true,
          resetPasswordToken: true,
          resetPasswordExpires: true,
          zipCode: true,
          street: true,
          number: true,
          city: true,
          state: true,
          neighborhood: true,
          complement: true,
          createdAt: true,
          createdBy: true,
          updatedAt: true,
          updatedBy: true,
          canceledAt: true,
          canceledBy: true,
        },
      }),
      prisma.guardian.findMany({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          tenantId: true,
          personId: true,
          name: true,
          birthDate: true,
          rg: true,
          cpf: true,
          cnpj: true,
          nickname: true,
          corporateName: true,
          phone: true,
          whatsapp: true,
          cellphone1: true,
          cellphone2: true,
          email: true,
          password: true,
          resetPasswordToken: true,
          resetPasswordExpires: true,
          zipCode: true,
          street: true,
          number: true,
          city: true,
          state: true,
          neighborhood: true,
          complement: true,
          createdAt: true,
          createdBy: true,
          updatedAt: true,
          updatedBy: true,
          canceledAt: true,
          canceledBy: true,
        },
      }),
      prisma.person.findMany({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          tenantId: true,
          name: true,
          birthDate: true,
          rg: true,
          cpf: true,
          cpfDigits: true,
          cnpj: true,
          nickname: true,
          corporateName: true,
          phone: true,
          whatsapp: true,
          cellphone1: true,
          cellphone2: true,
          email: true,
          password: true,
          resetPasswordToken: true,
          resetPasswordExpires: true,
          zipCode: true,
          street: true,
          number: true,
          city: true,
          state: true,
          neighborhood: true,
          complement: true,
          createdAt: true,
          createdBy: true,
          updatedAt: true,
          updatedBy: true,
          canceledAt: true,
          canceledBy: true,
        },
      }),
    ]);

    const peopleById = new Map(existingPeople.map((person) => [person.id, person]));
    const peopleByCpf = new Map(
      existingPeople
        .filter((person) => !!person.cpfDigits)
        .map((person) => [`CPF:${tenant.id}:${person.cpfDigits}`, person.id]),
    );
    const peopleByEmail = new Map(
      existingPeople
        .filter((person) => !!person.email)
        .map((person) => [`EMAIL:${tenant.id}:${normalizeEmail(person.email)}`, person.id]),
    );

    const legacyRecords: LegacyRecord[] = [
      ...teachers.map((record) => ({ ...record, kind: "TEACHER" as const })),
      ...students.map((record) => ({ ...record, kind: "STUDENT" as const })),
      ...guardians.map((record) => ({ ...record, kind: "GUARDIAN" as const })),
    ].sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
    );

    const groups = new Map<string, PersonGroup>();
    const aliasToGroupKey = new Map<string, string>();

    for (const record of legacyRecords) {
      const aliases = buildIdentityKeys(record);
      const candidateKeys = new Set<string>();

      for (const alias of aliases) {
        const existingGroupKey = aliasToGroupKey.get(alias);
        if (existingGroupKey) {
          candidateKeys.add(existingGroupKey);
        }

        if (alias.startsWith("PERSON:")) {
          const personId = alias.replace("PERSON:", "");
          if (peopleById.has(personId)) {
            candidateKeys.add(`PERSON:${personId}`);
          }
        }

        if (alias.startsWith("CPF:")) {
          const personId = peopleByCpf.get(alias);
          if (personId) {
            candidateKeys.add(`PERSON:${personId}`);
          }
        }

        if (alias.startsWith("EMAIL:")) {
          const personId = peopleByEmail.get(alias);
          if (personId) {
            candidateKeys.add(`PERSON:${personId}`);
          }
        }
      }

      const resolvedGroupKeys = Array.from(candidateKeys);
      let primaryKey = resolvedGroupKeys[0] || aliases[0];

      if (!groups.has(primaryKey)) {
        const personId = primaryKey.startsWith("PERSON:")
          ? primaryKey.replace("PERSON:", "")
          : null;

        groups.set(primaryKey, {
          key: primaryKey,
          tenantId: tenant.id,
          personId,
          records: [],
        });
      }

      for (const groupKey of resolvedGroupKeys.slice(1)) {
        primaryKey = mergeGroups(groups, aliasToGroupKey, primaryKey, groupKey);
      }

      const group = groups.get(primaryKey);
      if (!group) continue;

      if (!group.personId) {
        const resolvedPersonKey = resolvedGroupKeys.find((groupKey) =>
          groupKey.startsWith("PERSON:"),
        );
        if (resolvedPersonKey) {
          group.personId = resolvedPersonKey.replace("PERSON:", "");
        }
      }

      group.records.push(record);
      for (const alias of aliases) {
        aliasToGroupKey.set(alias, primaryKey);
      }
    }

    for (const group of groups.values()) {
      const orderedRecords = [...group.records].sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
      );

      const currentPerson = group.personId ? peopleById.get(group.personId) || null : null;
      const mergedCpf =
        normalizeDocument(
          pickValue(orderedRecords, (record) => record.cpf, currentPerson?.cpf || null),
        ) || null;
      const mergedEmail =
        normalizeEmail(
          pickValue(orderedRecords, (record) => record.email, currentPerson?.email || null),
        ) || null;

      const cpfAlias = mergedCpf ? `CPF:${tenant.id}:${mergedCpf}` : null;
      const emailAlias = mergedEmail ? `EMAIL:${tenant.id}:${mergedEmail}` : null;

      const conflictingCpfPersonId =
        cpfAlias && peopleByCpf.has(cpfAlias) ? peopleByCpf.get(cpfAlias)! : null;
      const conflictingEmailPersonId =
        emailAlias && peopleByEmail.has(emailAlias) ? peopleByEmail.get(emailAlias)! : null;

      const effectiveCpf =
        conflictingCpfPersonId &&
        currentPerson &&
        conflictingCpfPersonId !== currentPerson.id
          ? currentPerson.cpf
          : mergedCpf
            ? pickValue(orderedRecords, (record) => record.cpf, currentPerson?.cpf || null)
            : currentPerson?.cpf || null;

      const effectiveEmail =
        conflictingEmailPersonId &&
        currentPerson &&
        conflictingEmailPersonId !== currentPerson.id
          ? currentPerson.email
          : mergedEmail || null;

      const isFullyCanceled =
        orderedRecords.length > 0 &&
        orderedRecords.every((record) => record.canceledAt instanceof Date);

      const personPayload = {
        tenantId: tenant.id,
        name:
          pickValue(orderedRecords, (record) => record.name, currentPerson?.name || null) ||
          currentPerson?.name ||
          "PESSOA SEM NOME",
        birthDate: pickValue(
          orderedRecords,
          (record) => record.birthDate,
          currentPerson?.birthDate || null,
        ),
        rg: pickValue(orderedRecords, (record) => record.rg, currentPerson?.rg || null),
        cpf: effectiveCpf || null,
        cpfDigits: normalizeDocument(effectiveCpf) || null,
        cnpj: pickValue(orderedRecords, (record) => record.cnpj, currentPerson?.cnpj || null),
        nickname: pickValue(
          orderedRecords,
          (record) => record.nickname,
          currentPerson?.nickname || null,
        ),
        corporateName: pickValue(
          orderedRecords,
          (record) => record.corporateName,
          currentPerson?.corporateName || null,
        ),
        phone: pickValue(orderedRecords, (record) => record.phone, currentPerson?.phone || null),
        whatsapp: pickValue(
          orderedRecords,
          (record) => record.whatsapp,
          currentPerson?.whatsapp || null,
        ),
        cellphone1: pickValue(
          orderedRecords,
          (record) => record.cellphone1,
          currentPerson?.cellphone1 || null,
        ),
        cellphone2: pickValue(
          orderedRecords,
          (record) => record.cellphone2,
          currentPerson?.cellphone2 || null,
        ),
        email: effectiveEmail || null,
        password: pickValue(
          orderedRecords,
          (record) => record.password,
          currentPerson?.password || null,
        ),
        resetPasswordToken: pickValue(
          orderedRecords,
          (record) => record.resetPasswordToken,
          currentPerson?.resetPasswordToken || null,
        ),
        resetPasswordExpires: pickValue(
          orderedRecords,
          (record) => record.resetPasswordExpires,
          currentPerson?.resetPasswordExpires || null,
        ),
        zipCode: pickValue(
          orderedRecords,
          (record) => record.zipCode,
          currentPerson?.zipCode || null,
        ),
        street: pickValue(
          orderedRecords,
          (record) => record.street,
          currentPerson?.street || null,
        ),
        number: pickValue(
          orderedRecords,
          (record) => record.number,
          currentPerson?.number || null,
        ),
        city: pickValue(orderedRecords, (record) => record.city, currentPerson?.city || null),
        state: pickValue(
          orderedRecords,
          (record) => record.state,
          currentPerson?.state || null,
        ),
        neighborhood: pickValue(
          orderedRecords,
          (record) => record.neighborhood,
          currentPerson?.neighborhood || null,
        ),
        complement: pickValue(
          orderedRecords,
          (record) => record.complement,
          currentPerson?.complement || null,
        ),
        canceledAt: isFullyCanceled
          ? pickValue(
              orderedRecords,
              (record) => record.canceledAt,
              currentPerson?.canceledAt || null,
            )
          : null,
        canceledBy: isFullyCanceled
          ? pickValue(
              orderedRecords,
              (record) => record.canceledBy,
              currentPerson?.canceledBy || null,
            )
          : null,
      };

      const person = currentPerson
        ? await prisma.person.update({
            where: { id: currentPerson.id },
            data: {
              ...personPayload,
              updatedBy: SYSTEM_USER,
            },
          })
        : await prisma.person.create({
            data: {
              ...personPayload,
              createdBy:
                pickValue(
                  orderedRecords,
                  (record) => record.createdBy,
                  null,
                ) || SYSTEM_USER,
              updatedBy: SYSTEM_USER,
            },
          });

      if (currentPerson) {
        updatedPeople += 1;
      } else {
        createdPeople += 1;
      }

      peopleById.set(person.id, person);
      if (person.cpfDigits) {
        peopleByCpf.set(`CPF:${tenant.id}:${person.cpfDigits}`, person.id);
      }
      if (person.email) {
        peopleByEmail.set(`EMAIL:${tenant.id}:${normalizeEmail(person.email)}`, person.id);
      }

      const sharedRolePayload = {
        personId: person.id,
        name: person.name,
        birthDate: person.birthDate,
        rg: person.rg,
        cpf: person.cpf,
        cnpj: person.cnpj,
        nickname: person.nickname,
        corporateName: person.corporateName,
        phone: person.phone,
        whatsapp: person.whatsapp,
        cellphone1: person.cellphone1,
        cellphone2: person.cellphone2,
        email: person.email,
        password: person.password,
        resetPasswordToken: person.resetPasswordToken,
        resetPasswordExpires: person.resetPasswordExpires,
        zipCode: person.zipCode,
        street: person.street,
        number: person.number,
        city: person.city,
        state: person.state,
        neighborhood: person.neighborhood,
        complement: person.complement,
        updatedBy: SYSTEM_USER,
      };

      for (const record of group.records) {
        if (record.kind === "TEACHER") {
          await prisma.teacher.update({
            where: { id: record.id },
            data: sharedRolePayload,
          });
        }

        if (record.kind === "STUDENT") {
          await prisma.student.update({
            where: { id: record.id },
            data: sharedRolePayload,
          });
        }

        if (record.kind === "GUARDIAN") {
          await prisma.guardian.update({
            where: { id: record.id },
            data: sharedRolePayload,
          });
        }

        linkedRecords += 1;
      }
    }

    console.log(
      `[BACKFILL PEOPLE] ${tenant.name}: ${groups.size} grupo(s) processado(s).`,
    );
  }

  console.log(
    `[BACKFILL PEOPLE] Pessoas criadas: ${createdPeople} | atualizadas: ${updatedPeople} | registros vinculados: ${linkedRecords} | tempo: ${Date.now() - startedAt}ms`,
  );
}

main()
  .catch((error) => {
    console.error("[BACKFILL PEOPLE] Falha:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
