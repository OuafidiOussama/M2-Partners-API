import * as fs from 'fs';
import * as path from 'path';
import { EntityManager } from 'typeorm';
import { AppDataSource } from './data-source';
import { User } from './users/user.entity';
import { Employee } from './employees/employee.entity';
import {
  DEFAULT_SICK_TOTAL,
  LeaveAllowance,
  vacationTotalFor,
} from './leaves/leave-allowance.entity';
import { LeaveRequest } from './leaves/leave-request.entity';
import { Holiday } from './holidays/holiday.entity';
import { CompanyDocument } from './company-documents/company-document.entity';
import { Role } from './common/enums/role.enum';
import { ContractType } from './common/enums/contract-type.enum';
import { LeaveType } from './common/enums/leave-type.enum';
import { LeaveStatus } from './common/enums/leave-status.enum';
import { CompanyDocumentCategory } from './common/enums/company-document-category.enum';
import { calculateWorkingDays } from './common/utils/working-days.util';
import { isoToDate, todayIso } from './common/utils/date.util';

/**
 * Idempotent seed: every record is looked up first and only inserted when
 * missing, so this can be re-run safely against an existing database.
 */

const ADMIN_EMAIL = 'oussama.ouafidi@m2partnersglobal.com';
const STORAGE_PATH = process.env.STORAGE_PATH ?? './storage';

// --- date helpers ------------------------------------------------------------

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** nth (1-based) given weekday (0 = Sun) of a month. */
function nthWeekday(y: number, m: number, weekday: number, n: number): Date {
  const first = utc(y, m, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return utc(y, m, 1 + offset + (n - 1) * 7);
}

function lastWeekday(y: number, m: number, weekday: number): Date {
  const last = utc(y, m + 1, 0);
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return addDays(last, -offset);
}

/** Gregorian Easter Sunday (anonymous Gregorian algorithm). */
function easter(y: number): Date {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, month, day);
}

type SeedHoliday = { date: string; label: string };

/**
 * Moves weekend holidays to the next free weekday (UK / Canadian
 * "substitute day" rule). Weekday holidays are placed first so e.g. a Sunday
 * Christmas skips over a Monday Boxing Day.
 */
function withSubstituteDays(
  holidays: { date: Date; label: string }[],
): SeedHoliday[] {
  const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
  const taken = new Set(
    holidays.filter((h) => !isWeekend(h.date)).map((h) => iso(h.date)),
  );
  const result: SeedHoliday[] = [];
  for (const h of [...holidays].sort((a, b) => +a.date - +b.date)) {
    if (!isWeekend(h.date)) {
      result.push({ date: iso(h.date), label: h.label });
      continue;
    }
    let d = h.date;
    while (isWeekend(d) || taken.has(iso(d))) d = addDays(d, 1);
    taken.add(iso(d));
    result.push({ date: iso(d), label: `${h.label} (observed)` });
  }
  return result;
}

/** Ontario statutory holidays (the Toronto office). */
function canadaHolidays(y: number): SeedHoliday[] {
  const e = easter(y);
  return withSubstituteDays([
    { date: utc(y, 1, 1), label: "New Year's Day" },
    { date: nthWeekday(y, 2, 1, 3), label: 'Family Day' },
    { date: addDays(e, -2), label: 'Good Friday' },
    // Monday preceding May 25
    {
      date: addDays(utc(y, 5, 24), -((utc(y, 5, 24).getUTCDay() + 6) % 7)),
      label: 'Victoria Day',
    },
    { date: utc(y, 7, 1), label: 'Canada Day' },
    { date: nthWeekday(y, 9, 1, 1), label: 'Labour Day' },
    { date: nthWeekday(y, 10, 1, 2), label: 'Thanksgiving' },
    { date: utc(y, 12, 25), label: 'Christmas Day' },
    { date: utc(y, 12, 26), label: 'Boxing Day' },
  ]);
}

/** England & Wales bank holidays. */
function ukHolidays(y: number): SeedHoliday[] {
  const e = easter(y);
  return withSubstituteDays([
    { date: utc(y, 1, 1), label: "New Year's Day" },
    { date: addDays(e, -2), label: 'Good Friday' },
    { date: addDays(e, 1), label: 'Easter Monday' },
    { date: nthWeekday(y, 5, 1, 1), label: 'Early May bank holiday' },
    { date: lastWeekday(y, 5, 1), label: 'Spring bank holiday' },
    { date: lastWeekday(y, 8, 1), label: 'Summer bank holiday' },
    { date: utc(y, 12, 25), label: 'Christmas Day' },
    { date: utc(y, 12, 26), label: 'Boxing Day' },
  ]);
}

/**
 * Moroccan religious holidays follow the lunar calendar and are confirmed by
 * moon sighting, so they are listed per year (verify / extend each year).
 */
const MOROCCO_LUNAR: Record<number, SeedHoliday[]> = {
  2026: [
    { date: '2026-03-20', label: 'Eid al-Fitr' },
    { date: '2026-03-21', label: 'Eid al-Fitr (day 2)' },
    { date: '2026-05-27', label: 'Eid al-Adha' },
    { date: '2026-05-28', label: 'Eid al-Adha (day 2)' },
    { date: '2026-06-17', label: 'Islamic New Year' },
    { date: '2026-08-25', label: "Prophet's Birthday" },
    { date: '2026-08-26', label: "Prophet's Birthday (day 2)" },
  ],
  // Provisional: replace with the dates announced by the Ministry of Habous.
  2027: [
    { date: '2027-03-10', label: 'Eid al-Fitr' },
    { date: '2027-03-11', label: 'Eid al-Fitr (day 2)' },
    { date: '2027-05-17', label: 'Eid al-Adha' },
    { date: '2027-05-18', label: 'Eid al-Adha (day 2)' },
    { date: '2027-06-06', label: 'Islamic New Year' },
    { date: '2027-08-15', label: "Prophet's Birthday" },
    { date: '2027-08-16', label: "Prophet's Birthday (day 2)" },
  ],
};

/** Morocco does not move weekend holidays. */
function moroccoHolidays(y: number): SeedHoliday[] {
  const fixed: [number, number, string][] = [
    [1, 1, "New Year's Day"],
    [1, 11, 'Proclamation of Independence'],
    [1, 14, 'Amazigh New Year'],
    [5, 1, 'Labour Day'],
    [7, 30, 'Throne Day'],
    [8, 14, 'Oued Ed-Dahab Day'],
    [8, 20, 'Revolution of the King and the People'],
    [8, 21, 'Youth Day'],
    [10, 31, 'Unity Day'],
    [11, 6, 'Green March'],
    [11, 18, 'Independence Day'],
  ];
  const lunar = MOROCCO_LUNAR[y];
  if (!lunar) {
    console.warn(`No Moroccan lunar holidays defined for ${y}; add them.`);
  }
  return [
    ...fixed.map(([m, d, label]) => ({ date: iso(utc(y, m, d)), label })),
    ...(lunar ?? []),
  ];
}

// --- placeholder PDF ---------------------------------------------------------

/** Builds a minimal one-page PDF showing `title`. */
function placeholderPdf(title: string): Buffer {
  const text = title.replace(/[()\\]/g, '');
  const content = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET\nBT /F1 12 Tf 72 690 Td (M2 Partners - placeholder document) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

// --- seed steps --------------------------------------------------------------

const JILL = 'jill.speirs@m2partnersglobal.com';
const ANDREW = 'andrew.speirs@m2partnersglobal.com';
const HAMID = 'hamid.ouikene@m2partnersglobal.com';
const YOUSSEF = 'youssef.amrani@m2partnersglobal.com';

interface PersonSeed {
  email: string;
  role: Role;
  first_name: string;
  last_name: string;
  department: string;
  /** Applied on creation; on later runs only fills fields that are empty. */
  fields: Partial<Employee>;
  /** Applied on every run: the values the test persona must always have. */
  enforced?: Partial<Employee>;
  managerEmail?: string;
}

const PEOPLE: PersonSeed[] = [
  {
    email: JILL,
    role: Role.ADMIN,
    first_name: 'Jill',
    last_name: 'Speirs',
    department: 'Leadership',
    fields: {
      job_title: 'Founder, President & CEO',
      country_code: 'CA',
      office: 'Toronto, Canada',
      start_date: '2010-01-04',
    },
  },
  {
    email: ANDREW,
    role: Role.EMPLOYEE,
    first_name: 'Andrew',
    last_name: 'Speirs',
    department: 'Marketing',
    managerEmail: JILL,
    fields: {
      work_hours: 'Monday - Friday, 9am - 5pm',
      mobile: '+1 416 555 0142',
      emergency_contact_name: 'Jill Speirs',
      emergency_contact_phone: '+1 416 555 0101',
    },
    // The Figma test employee.
    enforced: {
      job_title: 'Director of Growth & Partnerships',
      country_code: 'CA',
      office: 'Toronto, Canada',
      start_date: '2016-03-20',
    },
  },
  {
    email: HAMID,
    role: Role.EMPLOYEE,
    first_name: 'Hamid',
    last_name: 'Ouikene',
    department: 'Technology',
    managerEmail: JILL,
    fields: {
      job_title: 'Senior Director, Development',
      country_code: 'MA',
      office: 'Casablanca, Morocco',
      start_date: '2018-09-03',
      mobile: '+212 661 000 001',
      emergency_contact_name: 'Samira Ouikene',
      emergency_contact_phone: '+212 661 000 002',
    },
  },
  {
    email: YOUSSEF,
    role: Role.EMPLOYEE,
    first_name: 'Youssef',
    last_name: 'Amrani',
    department: 'Consultant',
    managerEmail: JILL,
    fields: {
      job_title: 'Senior Consultant',
      country_code: 'MA',
      office: 'Casablanca, Morocco',
      start_date: '2021-02-01',
    },
  },
];

const isEmpty = (v: unknown) => v === null || v === undefined || v === '';

async function upsertPerson(
  em: EntityManager,
  p: PersonSeed,
  employeesByEmail: Map<string, Employee>,
): Promise<Employee> {
  let user = await em.findOne(User, { where: { email: p.email } });
  if (!user) {
    user = await em.save(em.create(User, { email: p.email, role: p.role }));
    console.log(`  + user ${p.email}`);
  } else if (user.role !== p.role) {
    user.role = p.role;
    await em.save(user);
    console.log(`  ~ ${p.email} role -> ${p.role}`);
  }

  const manager = p.managerEmail
    ? (employeesByEmail.get(p.managerEmail) ?? null)
    : null;
  let emp = await em.findOne(Employee, {
    where: { user: { id: user.id } },
    relations: ['line_manager'],
  });
  if (!emp) {
    emp = await em.save(
      em.create(Employee, {
        user,
        first_name: p.first_name,
        last_name: p.last_name,
        department: p.department,
        contract_type: ContractType.FULL_TIME,
        start_date: '2020-01-01',
        ...p.fields,
        ...p.enforced,
        line_manager: manager,
      }),
    );
    console.log(`  + employee ${emp.full_name}`);
    return emp;
  }

  // Existing record: enforce the department, fill only empty fields.
  let changed = emp.department !== p.department;
  emp.department = p.department;
  for (const [key, value] of Object.entries(p.enforced ?? {})) {
    const k = key as keyof Employee;
    if (emp[k] !== value) {
      (emp as unknown as Record<string, unknown>)[k] = value;
      changed = true;
    }
  }
  for (const [key, value] of Object.entries(p.fields)) {
    const k = key as keyof Employee;
    if (isEmpty(emp[k])) {
      (emp as unknown as Record<string, unknown>)[k] = value;
      changed = true;
    }
  }
  if (manager && emp.line_manager?.id !== manager.id) {
    emp.line_manager = manager;
    changed = true;
  }
  if (changed) {
    emp = await em.save(emp);
    console.log(`  ~ employee ${emp.full_name}`);
  }
  return emp;
}

async function seedEmployees(
  em: EntityManager,
): Promise<Map<string, Employee>> {
  console.log('Employees');
  const byEmail = new Map<string, Employee>();
  for (const person of PEOPLE) {
    byEmail.set(person.email, await upsertPerson(em, person, byEmail));
  }

  // Existing admin account (Azure AD sign-in).
  let admin = await em.findOne(User, { where: { email: ADMIN_EMAIL } });
  if (!admin) {
    admin = await em.save(
      em.create(User, { email: ADMIN_EMAIL, role: Role.ADMIN }),
    );
    console.log(`  + admin user ${ADMIN_EMAIL}`);
  }
  let adminEmp = await em.findOne(Employee, {
    where: { user: { id: admin.id } },
  });
  if (!adminEmp) {
    adminEmp = await em.save(
      em.create(Employee, {
        user: admin,
        first_name: 'Oussama',
        last_name: 'Ouafidi',
        start_date: '2024-01-01',
        country_code: 'MA',
        department: 'Technology',
      }),
    );
    console.log('  + admin employee');
  } else if (!adminEmp.department) {
    adminEmp.department = 'Technology';
    await em.save(adminEmp);
    console.log('  ~ admin employee department');
  }
  byEmail.set(ADMIN_EMAIL, adminEmp);

  return byEmail;
}

async function seedAllowances(
  em: EntityManager,
  employees: Employee[],
  year: number,
) {
  console.log(`Allowances ${year}`);
  for (const employee of employees) {
    const exists = await em.exists(LeaveAllowance, {
      where: { employee: { id: employee.id }, year },
    });
    if (!exists) {
      await em.save(
        em.create(LeaveAllowance, {
          employee,
          year,
          vacation_total: vacationTotalFor(employee.country_code),
          sick_total: DEFAULT_SICK_TOTAL,
        }),
      );
      console.log(`  + ${employee.full_name}`);
    }
  }
}

async function seedHolidays(em: EntityManager, year: number) {
  console.log(`Holidays ${year}`);
  const byCountry: Record<string, SeedHoliday[]> = {
    CA: canadaHolidays(year),
    GB: ukHolidays(year),
    MA: moroccoHolidays(year),
  };
  for (const [country_code, holidays] of Object.entries(byCountry)) {
    let added = 0;
    for (const h of holidays) {
      const exists = await em.exists(Holiday, {
        where: { date: h.date, country_code },
      });
      if (!exists) {
        await em.save(em.create(Holiday, { ...h, country_code }));
        added++;
      }
    }
    console.log(`  ${country_code}: +${added} (of ${holidays.length})`);
  }
}

async function seedCompanyDocuments(em: EntityManager) {
  console.log('Company documents');
  const docs = [
    {
      category: CompanyDocumentCategory.GUIDE,
      title: 'Taking annual leave',
      file_name: 'annual-leave-guide.pdf',
      sort_order: 1,
    },
    {
      category: CompanyDocumentCategory.CONTRACT,
      title: 'Your employment',
      file_name: 'employment-contract.pdf',
      sort_order: 2,
    },
    {
      category: CompanyDocumentCategory.POLICY,
      title: 'Sick leave policy',
      file_name: 'sick-leave-policy.pdf',
      sort_order: 3,
    },
  ];
  for (const doc of docs) {
    const storage_key = `company-documents/seed-${doc.file_name}`;
    const filePath = path.join(STORAGE_PATH, storage_key);
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, placeholderPdf(doc.title));
    }
    const exists = await em.exists(CompanyDocument, {
      where: { category: doc.category, title: doc.title },
    });
    if (!exists) {
      await em.save(
        em.create(CompanyDocument, {
          ...doc,
          storage_key,
          mime_type: 'application/pdf',
        }),
      );
      console.log(`  + ${doc.title}`);
    }
  }
}

/** Monday of the current week, shifted by `weeks` weeks. */
function mondayInWeeks(weeks: number): Date {
  const today = isoToDate(todayIso());
  const monday = addDays(today, -((today.getUTCDay() + 6) % 7));
  return addDays(monday, weeks * 7);
}

interface LeaveSeed {
  email: string;
  /** Unique per employee: used as the idempotency key. */
  reason: string;
  weeks: number;
  /** Days after that Monday the leave starts (0 = Monday). */
  startOffset?: number;
  length: number;
  status: LeaveStatus;
  admin_reason?: string;
}

const LEAVES: LeaveSeed[] = [
  // Andrew
  {
    email: ANDREW,
    reason: 'Family trip',
    weeks: 4,
    length: 5,
    status: LeaveStatus.APPROVED,
  },
  {
    email: ANDREW,
    reason: 'Long weekend away',
    weeks: 8,
    length: 3,
    status: LeaveStatus.PENDING,
  },
  {
    email: ANDREW,
    reason: 'Summer holiday',
    weeks: -10,
    length: 5,
    status: LeaveStatus.APPROVED,
  },
  {
    email: ANDREW,
    reason: 'Christmas shopping',
    weeks: 6,
    length: 3,
    status: LeaveStatus.PENDING,
  },
  {
    email: ANDREW,
    reason: 'Partner offsite',
    weeks: -6,
    length: 3,
    status: LeaveStatus.REJECTED,
    admin_reason: 'Quarter-end reporting that week',
  },
  // Hamid
  {
    email: HAMID,
    reason: 'Visiting family',
    weeks: 2,
    length: 3,
    status: LeaveStatus.PENDING,
  },
  {
    email: HAMID,
    reason: 'Beach week',
    weeks: -6,
    length: 5,
    status: LeaveStatus.APPROVED,
  },
  {
    email: HAMID,
    reason: 'Long weekend',
    weeks: 0,
    startOffset: 3,
    length: 2,
    status: LeaveStatus.APPROVED,
  },
  // Youssef
  {
    email: YOUSSEF,
    reason: 'Moving house',
    weeks: 0,
    length: 2,
    status: LeaveStatus.APPROVED,
  },
  {
    email: YOUSSEF,
    reason: 'City break',
    weeks: -4,
    length: 3,
    status: LeaveStatus.REJECTED,
    admin_reason: 'Client workshop that week',
  },
  // Jill
  {
    email: JILL,
    reason: 'Spring break',
    weeks: -15,
    length: 5,
    status: LeaveStatus.APPROVED,
  },
];

async function seedLeaveRequests(
  em: EntityManager,
  byEmail: Map<string, Employee>,
  reviewerId: string,
) {
  console.log('Leave requests');
  for (const l of LEAVES) {
    const employee = byEmail.get(l.email);
    if (!employee) continue;
    const exists = await em.exists(LeaveRequest, {
      where: { employee: { id: employee.id }, reason: l.reason },
    });
    if (exists) continue;

    const start = addDays(mondayInWeeks(l.weeks), l.startOffset ?? 0);
    const end = addDays(start, l.length - 1);
    const holidays = (
      await em.find(Holiday, {
        where: { country_code: employee.country_code },
      })
    ).map((h) => new Date(h.date));
    const days = calculateWorkingDays(start, end, holidays);
    if (days === 0) continue;

    const reviewed = l.status !== LeaveStatus.PENDING;
    await em.save(
      em.create(LeaveRequest, {
        employee,
        type: LeaveType.VACATION,
        start_date: iso(start),
        end_date: iso(end),
        days,
        status: l.status,
        reason: l.reason,
        admin_reason: l.admin_reason ?? null,
        reviewed_by: reviewed ? reviewerId : null,
        reviewed_at: reviewed ? new Date() : null,
      }),
    );
    console.log(
      `  + ${employee.full_name}: ${l.status} ${iso(start)} -> ${iso(end)}`,
    );
  }
}

async function seed() {
  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (em) => {
      const year = new Date().getFullYear();
      const byEmail = await seedEmployees(em);
      await seedAllowances(em, [...byEmail.values()], year);
      // Next year too: requests can already be made for it.
      await seedHolidays(em, year);
      await seedHolidays(em, year + 1);
      await seedCompanyDocuments(em);

      const reviewer = byEmail.get(ADMIN_EMAIL)?.user;
      if (reviewer) await seedLeaveRequests(em, byEmail, reviewer.id);
    });
    console.log('Seed complete.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

void seed();
