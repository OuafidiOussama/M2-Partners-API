import { AppDataSource } from './data-source';

async function seed() {
  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    const email = 'oussama.ouafidi@m2partnersglobal.com';

    const existing = await qr.query(
      `SELECT id FROM users WHERE email = $1`,
      [email],
    );
    if (existing.length > 0) {
      console.log('User already exists, skipping seed.');
      await qr.rollbackTransaction();
      return;
    }

    const userResult = await qr.query(
      `INSERT INTO users (email, role, created_at)
       VALUES ($1, 'ADMIN', NOW())
       RETURNING id`,
      [email],
    );
    const userId = userResult[0].id;
    console.log(`Inserted user: ${userId}`);

    const empResult = await qr.query(
      `INSERT INTO employees (full_name, cin, start_date, net_salary, gross_salary, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['Oussama Ouafidi', 'TEST001', '2024-01-01', 0, 0, userId],
    );
    const employeeId = empResult[0].id;
    console.log(`Inserted employee: ${employeeId}`);

    await qr.query(
      `INSERT INTO leave_balances (year, vacation_days, sick_days, "employeeId")
       VALUES ($1, $2, $3, $4)`,
      [2026, 18, 3, employeeId],
    );
    console.log(`Inserted leave_balance for 2026`);

    await qr.commitTransaction();
    console.log('Seed complete.');
  } catch (err) {
    await qr.rollbackTransaction();
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

seed();
