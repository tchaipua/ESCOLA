// @ts-nocheck
import { PrismaClient } from "@prisma/client";

/**
 * Consolida a identidade da pessoa no cadastro People.
 *
 * A execução é somente leitura por padrão. Para aplicar no banco de testes:
 *   npm run ops:normalize-identity -- --apply
 *
 * Nenhum registro de negócio é removido fisicamente. Duplicidades são
 * vinculadas ao cadastro principal e inativadas com os campos de auditoria.
 */
const prisma = new PrismaClient();
const SYSTEM_USER = "SYSTEM_NORMALIZE_IDENTITY";
const APPLY = process.argv.includes("--apply");

const personMergeFields = [
  "birthDate",
  "rg",
  "cpf",
  "cnpj",
  "nickname",
  "corporateName",
  "phone",
  "whatsapp",
  "cellphone1",
  "cellphone2",
  "email",
  "telegramUsername",
  "zipCode",
  "street",
  "number",
  "city",
  "state",
  "neighborhood",
  "complement",
];

const roleModels = [
  { model: "teacher", label: "PROFESSOR" },
  { model: "student", label: "ALUNO" },
  { model: "guardian", label: "RESPONSAVEL" },
];

function upper(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizedName(value: unknown) {
  return upper(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizedEmail(value: unknown) {
  return upper(value);
}

function validEmail(value: unknown) {
  const email = normalizedEmail(value);
  return email.includes("@") && email.includes(".") && !email.includes(" ")
    ? email
    : null;
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function identityKey(person: any) {
  const cpf = String(person.cpfDigits || "").trim();
  if (cpf) return `CPF:${person.tenantId}:${cpf}`;

  return `ROW:${person.tenantId}:${person.id}`;
}

function relationCounts(counts: Map<string, number>, personId: string) {
  return counts.get(personId) || 0;
}

function personScore(person: any, counts: Map<string, number>) {
  const fields = [
    person.name,
    person.birthDate,
    person.rg,
    person.cpf,
    person.cnpj,
    person.email,
    person.phone,
    person.cellphone1,
    person.cellphone2,
    person.accessUsername,
    person.password,
  ].filter(hasValue).length;

  return (
    relationCounts(counts, person.id) * 1000 +
    fields * 10 +
    (person.updatedAt instanceof Date ? person.updatedAt.getTime() / 1e12 : 0)
  );
}

function log(message: string) {
  console.log(`[NORMALIZE IDENTITY] ${message}`);
}

function emptyStats() {
  return {
    createdPeople: 0,
    linkedUsers: 0,
    mergedPeople: 0,
    mergedUserProfiles: 0,
    normalizedRoleLogins: 0,
    linkedRoleProfiles: 0,
    canceledRoleDuplicates: 0,
    unresolvedRoleProfiles: 0,
    conflicts: 0,
  };
}

async function buildPersonRelationCounts(db: any, tenantId: string) {
  const [teachers, students, guardians, users] = await Promise.all([
    db.teacher.findMany({
      where: { tenantId, canceledAt: null, personId: { not: null } },
      select: { personId: true },
    }),
    db.student.findMany({
      where: { tenantId, canceledAt: null, personId: { not: null } },
      select: { personId: true },
    }),
    db.guardian.findMany({
      where: { tenantId, canceledAt: null, personId: { not: null } },
      select: { personId: true },
    }),
    db.user.findMany({
      where: { tenantId, canceledAt: null, personId: { not: null } },
      select: { personId: true },
    }),
  ]);

  const counts = new Map<string, number>();
  for (const row of [...teachers, ...students, ...guardians, ...users]) {
    if (row.personId) {
      counts.set(row.personId, relationCounts(counts, row.personId) + 1);
    }
  }
  return counts;
}

async function mergeDuplicatePeople(
  db: any,
  tenantId: string,
  stats: ReturnType<typeof emptyStats>,
) {
  const people = await db.person.findMany({
    where: { tenantId, canceledAt: null },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  const counts = await buildPersonRelationCounts(db, tenantId);
  const groups = new Map<string, any[]>();

  for (const person of people) {
    const key = identityKey(person);
    const current = groups.get(key) || [];
    current.push(person);
    groups.set(key, current);
  }

  for (const [key, candidates] of groups.entries()) {
    if (candidates.length < 2) continue;

    const ordered = [...candidates].sort(
      (left, right) => personScore(right, counts) - personScore(left, counts),
    );
    const survivor = ordered[0];
    const sources = ordered.slice(1);

    log(
      `${tenantId}: duplicidade ${key} -> principal ${survivor.id}; ` +
        `${sources.length} cadastro(s) serão inativados${APPLY ? "" : " (simulação)"}.`,
    );

    for (const source of sources) {
      stats.mergedPeople += 1;
      if (!APPLY) continue;

      const target = await db.person.findUnique({ where: { id: survivor.id } });
      if (!target) continue;

      const mergedData: any = { updatedBy: SYSTEM_USER };
      for (const field of personMergeFields) {
        if (!hasValue(target[field]) && hasValue(source[field])) {
          mergedData[field] = source[field];
        }
      }

      let copiedAccessUsername = false;
      const sourceLogin = upper(source.accessUsername);
      if (!hasValue(target.accessUsername) && sourceLogin) {
        const loginConflict = await db.person.findFirst({
          where: {
            tenantId,
            id: { not: survivor.id },
            accessUsername: sourceLogin,
          },
          select: { id: true },
        });
        if (!loginConflict) {
          mergedData.accessUsername = sourceLogin;
          copiedAccessUsername = true;
        }
      }

      if (!hasValue(target.password) && hasValue(source.password)) {
        mergedData.password = source.password;
      }
      if (!hasValue(target.resetPasswordToken) && hasValue(source.resetPasswordToken)) {
        mergedData.resetPasswordToken = source.resetPasswordToken;
        mergedData.resetPasswordExpires = source.resetPasswordExpires;
      }
      if (
        normalizedName(target.name) === "PESSOA SEM NOME" &&
        normalizedName(source.name) !== "PESSOA SEM NOME"
      ) {
        mergedData.name = upper(source.name);
      }

      await db.person.update({
        where: { id: survivor.id },
        data: mergedData,
      });

      for (const role of roleModels) {
        await db[role.model].updateMany({
          where: { tenantId, personId: source.id },
          data: { personId: survivor.id, updatedBy: SYSTEM_USER },
        });
      }
      await db.user.updateMany({
        where: { tenantId, personId: source.id },
        data: { personId: survivor.id, updatedBy: SYSTEM_USER },
      });

      await db.person.update({
        where: { id: source.id },
        data: {
          ...(copiedAccessUsername ? { accessUsername: null } : {}),
          canceledAt: new Date(),
          canceledBy: SYSTEM_USER,
          updatedBy: SYSTEM_USER,
          mergedIntoPersonId: survivor.id,
          mergedAt: new Date(),
          mergedBy: SYSTEM_USER,
          mergeReason: "DUPLICIDADE CONSOLIDADA NO CADASTRO CENTRAL DE PESSOAS",
        },
      });
    }
  }

  return db.person.findMany({
    where: { tenantId, canceledAt: null },
  });
}

function findPersonForUser(user: any, people: any[]) {
  const byId = user.personId
    ? people.find((person) => person.id === user.personId)
    : null;
  if (byId && byId.tenantId === user.tenantId) return byId;
  return null;
}

async function linkUsersToPeople(
  db: any,
  tenantId: string,
  people: any[],
  stats: ReturnType<typeof emptyStats>,
) {
  const users = await db.user.findMany({
    where: { tenantId, canceledAt: null },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: { person: { select: { email: true } } },
  });
  const peopleById = new Map(people.map((person) => [person.id, person]));

  for (const user of users) {
    let person = findPersonForUser(user, people);
    const email = validEmail(user.person?.email);
    const name = upper(user.name) || "PESSOA SEM NOME";
    const login = upper(user.accessUsername) || null;

    if (!person) {
      stats.createdPeople += 1;
      log(
        `${tenantId}: usuário ${user.name} será incluído em People${
          APPLY ? "" : " (simulação)"
        }${email ? ` com e-mail ${email}` : " sem e-mail válido"}.`,
      );

      if (!APPLY) continue;

      person = await db.person.create({
        data: {
          tenantId,
          branchCode: user.branchCode,
          name,
          email,
          accessUsername: login,
          password: user.password || null,
          resetPasswordToken: user.resetPasswordToken || null,
          resetPasswordExpires: user.resetPasswordExpires || null,
          createdBy: SYSTEM_USER,
          updatedBy: SYSTEM_USER,
        },
      });
      people.push(person);
      peopleById.set(person.id, person);
    } else if (APPLY) {
      const personData: any = { updatedBy: SYSTEM_USER };
      if (!hasValue(person.name) || normalizedName(person.name) === "PESSOA SEM NOME") {
        personData.name = name;
      }
      if (!hasValue(person.email) && email) personData.email = email;
      if (!hasValue(person.accessUsername) && login) {
        const conflict = await db.person.findFirst({
          where: {
            tenantId,
            id: { not: person.id },
            accessUsername: login,
          },
          select: { id: true },
        });
        if (conflict) {
          stats.conflicts += 1;
          log(`conflito de login ${login} no tenant ${tenantId}; o login central existente foi preservado.`);
        } else {
          personData.accessUsername = login;
        }
      }
      if (!hasValue(person.password) && hasValue(user.password)) {
        personData.password = user.password;
      }
      if (!hasValue(person.resetPasswordToken) && hasValue(user.resetPasswordToken)) {
        personData.resetPasswordToken = user.resetPasswordToken;
        personData.resetPasswordExpires = user.resetPasswordExpires;
      }
      if (Object.keys(personData).length > 1) {
        person = await db.person.update({ where: { id: person.id }, data: personData });
        peopleById.set(person.id, person);
      }
    }

    if (!APPLY || !person) continue;

    const effectiveName = upper(person.name) || name;
    await db.user.update({
      where: { id: user.id },
      data: {
        personId: person.id,
        name: effectiveName,
        accessUsername: null,
        password: null,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        updatedBy: SYSTEM_USER,
      },
    });
    stats.linkedUsers += 1;
  }

  return people;
}

async function mergeDuplicateUserProfiles(
  db: any,
  tenantId: string,
  stats: ReturnType<typeof emptyStats>,
) {
  const users = await db.user.findMany({
    where: { tenantId, canceledAt: null, personId: { not: null } },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  const groups = new Map<string, any[]>();
  for (const user of users) {
    const key = `${user.personId}|${upper(user.role)}`;
    const current = groups.get(key) || [];
    current.push(user);
    groups.set(key, current);
  }

  for (const [key, candidates] of groups.entries()) {
    if (candidates.length < 2) continue;
    const survivor = candidates[0];
    for (const source of candidates.slice(1)) {
      stats.mergedUserProfiles += 1;
      log(
        `${tenantId}: perfis de usuário duplicados ${key}; ` +
          `${source.id} será inativado${APPLY ? "" : " (simulação)"}.`,
      );
      if (!APPLY) continue;

      const accesses = await db.userBranchAccess.findMany({
        where: { tenantId, userId: source.id, canceledAt: null },
      });
      for (const access of accesses) {
        const existing = await db.userBranchAccess.findFirst({
          where: {
            tenantId,
            userId: survivor.id,
            branchCode: access.branchCode,
            canceledAt: null,
          },
        });
        if (existing) {
          await db.userBranchAccess.update({
            where: { id: access.id },
            data: {
              canceledAt: new Date(),
              canceledBy: SYSTEM_USER,
              updatedBy: SYSTEM_USER,
            },
          });
        } else {
          await db.userBranchAccess.update({
            where: { id: access.id },
            data: { userId: survivor.id, updatedBy: SYSTEM_USER },
          });
        }
      }

      await db.user.update({
        where: { id: source.id },
        data: {
          canceledAt: new Date(),
          canceledBy: SYSTEM_USER,
          updatedBy: SYSTEM_USER,
          accessUsername: null,
          password: null,
          resetPasswordToken: null,
          resetPasswordExpires: null,
        },
      });
    }
  }
}

async function centralizeRoleLogins(
  db: any,
  tenantId: string,
  stats: ReturnType<typeof emptyStats>,
) {
  for (const role of roleModels) {
    const rows = await db[role.model].findMany({
      where: { tenantId, canceledAt: null },
      select: { id: true, personId: true, accessUsername: true, accessProfile: true },
    });
    const people = await db.person.findMany({
      where: { tenantId, canceledAt: null },
      select: { id: true, accessUsername: true },
    });
    const peopleById = new Map(people.map((person) => [person.id, person]));

    for (const row of rows) {
      if (row.personId && row.accessUsername) {
        const person = peopleById.get(row.personId);
        if (!person) continue;
        const login = upper(row.accessUsername);
        if (!person.accessUsername) {
          const conflict = people.find(
            (candidate) => candidate.id !== person.id && candidate.accessUsername === login,
          );
          if (conflict) {
            stats.conflicts += 1;
            log(`conflito de login ${login} no perfil ${role.label}; perfil central preservado.`);
            continue;
          }
          if (APPLY) {
            await db.person.update({
              where: { id: person.id },
              data: { accessUsername: login, updatedBy: SYSTEM_USER },
            });
          }
        }
        if (APPLY) {
          await db[role.model].update({
            where: { id: row.id },
            data: { accessUsername: null, updatedBy: SYSTEM_USER },
          });
        }
        stats.normalizedRoleLogins += 1;
      }
    }

    const orphanRows = rows.filter((row) => !row.personId && row.accessUsername);
    const linkedRows = rows.filter((row) => row.personId && row.accessUsername);
    for (const orphan of orphanRows) {
      const oldLogin = upper(orphan.accessUsername);
      const possibleDuplicate = linkedRows.find(
        (linked) =>
          upper(linked.accessUsername) === oldLogin.replace(/^QA\./, "QA.UI.") &&
          linked.accessProfile === orphan.accessProfile,
      );
      if (possibleDuplicate) {
        stats.canceledRoleDuplicates += 1;
        log(
          `${tenantId}: perfil legado ${role.label} ${oldLogin} será inativado por duplicidade de teste${
            APPLY ? "" : " (simulação)"
          }.`,
        );
        if (APPLY) {
          await db[role.model].update({
            where: { id: orphan.id },
            data: {
              canceledAt: new Date(),
              canceledBy: SYSTEM_USER,
              updatedBy: SYSTEM_USER,
            },
          });
        }
      } else {
        stats.unresolvedRoleProfiles += 1;
      }
    }
  }
}

async function linkOrphanRoleProfiles(
  db: any,
  tenantId: string,
  stats: ReturnType<typeof emptyStats>,
) {
  for (const role of roleModels) {
    const orphanRows = await db[role.model].findMany({
      where: { tenantId, canceledAt: null, personId: null },
      select: { id: true, branchCode: true, accessUsername: true },
    });

    for (const row of orphanRows) {
      stats.linkedRoleProfiles += 1;
      stats.createdPeople += 1;
      const login = upper(row.accessUsername) || null;
      const displayName = login
        ? `PERFIL LEGADO SEM IDENTIFICAÇÃO - ${role.label} - ${login}`
        : `PESSOA LEGADA SEM IDENTIFICAÇÃO - ${role.label} - ${row.id.slice(0, 8)}`;
      log(
        `${tenantId}: perfil ${role.label} ${row.id} será ligado a ${displayName}${
          APPLY ? "" : " (simulação)"
        }.`,
      );

      if (!APPLY) continue;

      const person = await db.person.create({
        data: {
          tenantId,
          branchCode: row.branchCode,
          name: displayName,
          accessUsername: login,
          createdBy: SYSTEM_USER,
          updatedBy: SYSTEM_USER,
        },
      });
      await db[role.model].update({
        where: { id: row.id },
        data: {
          personId: person.id,
          accessUsername: null,
          updatedBy: SYSTEM_USER,
        },
      });
    }
  }
}

async function normalizeTenant(tenant: any) {
  const stats = emptyStats();
  const people = await mergeDuplicatePeople(prisma, tenant.id, stats);
  await linkUsersToPeople(prisma, tenant.id, people, stats);
  await mergeDuplicateUserProfiles(prisma, tenant.id, stats);
  await centralizeRoleLogins(prisma, tenant.id, stats);
  await linkOrphanRoleProfiles(prisma, tenant.id, stats);
  return stats;
}

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { canceledAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  log(APPLY ? "EXECUÇÃO COM ALTERAÇÕES ATIVADA." : "MODO SIMULAÇÃO; nenhum dado será alterado.");
  const total = emptyStats();

  for (const tenant of tenants) {
    const stats = await normalizeTenant(tenant);
    for (const key of Object.keys(total)) {
      total[key] += stats[key];
    }
    log(`${tenant.name}: ${JSON.stringify(stats)}`);
  }

  log(`RESUMO: ${JSON.stringify(total)}`);
}

main()
  .catch((error) => {
    console.error("[NORMALIZE IDENTITY] Falha:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
