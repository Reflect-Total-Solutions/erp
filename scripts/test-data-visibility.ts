import { PrismaClient } from "@prisma/client";
import {
  buildRecordVisibilityFilter,
  canUserAccessRecord,
  getModuleVisibilityScope,
  getAuthorizedUserIdsForScope,
} from "../src/lib/data-visibility";

type TestSession = {
  userId: string;
  email: string;
  name: string;
  role: string;
  roles?: string[];
};

const prisma = new PrismaClient();

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    if (details) console.error(`     Details: ${details}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log("==========================================================");
  console.log("🧪 RUNNING COMPREHENSIVE DATA VISIBILITY & ISOLATION TESTS");
  console.log("==========================================================\n");

  // -------------------------------------------------------------------------
  // SETUP TEST USERS & ROLES
  // -------------------------------------------------------------------------
  console.log("⚙️  Setting up test accounts and role hierarchy in database...");

  const adminRole = await prisma.role.findUnique({ where: { name: "admin" } });
  const supervisorRole = await prisma.role.findUnique({ where: { name: "supervisor" } });
  const employeeRole = await prisma.role.findUnique({ where: { name: "employee" } });

  if (!adminRole || !supervisorRole || !employeeRole) {
    throw new Error("Standard roles not found. Run seed-permissions first.");
  }

  // 1. Test Admin
  const adminUser = await prisma.user.upsert({
    where: { email: "test-admin@reflecterp.com" },
    update: { name: "Test Administrator" },
    create: {
      name: "Test Administrator",
      email: "test-admin@reflecterp.com",
      passwordHash: "hash-placeholder",
      roles: { create: [{ roleId: adminRole.id }] },
    },
  });

  // 2. Test Supervisor
  const supervisorUser = await prisma.user.upsert({
    where: { email: "test-supervisor@reflecterp.com" },
    update: { name: "Test Supervisor", department: "Operations" },
    create: {
      name: "Test Supervisor",
      email: "test-supervisor@reflecterp.com",
      passwordHash: "hash-placeholder",
      department: "Operations",
      roles: { create: [{ roleId: supervisorRole.id }] },
    },
  });

  // 3. Test Employee A (Under Test Supervisor)
  const employeeA = await prisma.user.upsert({
    where: { email: "test-emp-a@reflecterp.com" },
    update: {
      name: "Alice Employee (Team Alpha)",
      supervisorId: supervisorUser.id,
      department: "Operations",
    },
    create: {
      name: "Alice Employee (Team Alpha)",
      email: "test-emp-a@reflecterp.com",
      passwordHash: "hash-placeholder",
      supervisorId: supervisorUser.id,
      department: "Operations",
      roles: { create: [{ roleId: employeeRole.id }] },
    },
  });

  // 4. Test Employee B (Under Test Supervisor)
  const employeeB = await prisma.user.upsert({
    where: { email: "test-emp-b@reflecterp.com" },
    update: {
      name: "Bob Employee (Team Alpha)",
      supervisorId: supervisorUser.id,
      department: "Operations",
    },
    create: {
      name: "Bob Employee (Team Alpha)",
      email: "test-emp-b@reflecterp.com",
      passwordHash: "hash-placeholder",
      supervisorId: supervisorUser.id,
      department: "Operations",
      roles: { create: [{ roleId: employeeRole.id }] },
    },
  });

  // 5. Test Employee C (Under a different team/no supervisor)
  const employeeC = await prisma.user.upsert({
    where: { email: "test-emp-c@reflecterp.com" },
    update: {
      name: "Charlie Employee (Team Beta)",
      supervisorId: null,
      department: "Finance",
    },
    create: {
      name: "Charlie Employee (Team Beta)",
      email: "test-emp-c@reflecterp.com",
      passwordHash: "hash-placeholder",
      supervisorId: null,
      department: "Finance",
      roles: { create: [{ roleId: employeeRole.id }] },
    },
  });

  // Sessions to simulate authenticated calls
  const sessionAdmin: TestSession = {
    userId: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
    role: "admin",
    roles: ["admin"],
  };

  const sessionSupervisor: TestSession = {
    userId: supervisorUser.id,
    email: supervisorUser.email,
    name: supervisorUser.name,
    role: "supervisor",
    roles: ["supervisor"],
  };

  const sessionEmpA: TestSession = {
    userId: employeeA.id,
    email: employeeA.email,
    name: employeeA.name,
    role: "employee",
    roles: ["employee"],
  };

  const sessionEmpB: TestSession = {
    userId: employeeB.id,
    email: employeeB.email,
    name: employeeB.name,
    role: "employee",
    roles: ["employee"],
  };

  const sessionEmpC: TestSession = {
    userId: employeeC.id,
    email: employeeC.email,
    name: employeeC.name,
    role: "employee",
    roles: ["employee"],
  };

  // Helper Supplier & Jobs
  const testSupplier = await prisma.supplier.upsert({
    where: { code: "TEST-SUP-VIS" },
    update: {
      name: "Test Visibility Vendor",
      contactPerson: "Vendor Contact",
      phone: "0112345678",
      email: "vendor@test.com",
      address: "123 Industrial Park",
      createdById: adminUser.id,
    },
    create: {
      code: "TEST-SUP-VIS",
      name: "Test Visibility Vendor",
      contactPerson: "Vendor Contact",
      phone: "0112345678",
      email: "vendor@test.com",
      address: "123 Industrial Park",
      createdById: adminUser.id,
    },
  });

  // Job created by Employee A
  const jobA = await prisma.job.upsert({
    where: { jobCode: "TEST-JOB-EMP-A" },
    update: {
      name: "Alice Project Job A",
      submittedById: employeeA.id,
      grandTotal: 120000,
    },
    create: {
      jobCode: "TEST-JOB-EMP-A",
      name: "Alice Project Job A",
      date: "2026-11-06",
      status: "APPROVED",
      submittedById: employeeA.id,
      grandTotal: 120000,
    },
  });

  // Job created by Employee B
  const jobB = await prisma.job.upsert({
    where: { jobCode: "TEST-JOB-EMP-B" },
    update: {
      name: "Bob Project Job B",
      submittedById: employeeB.id,
      grandTotal: 250000,
    },
    create: {
      jobCode: "TEST-JOB-EMP-B",
      name: "Bob Project Job B",
      date: "2026-11-06",
      status: "APPROVED",
      submittedById: employeeB.id,
      grandTotal: 250000,
    },
  });

  // Job created by Employee C (outside supervisor's team)
  const jobC = await prisma.job.upsert({
    where: { jobCode: "TEST-JOB-EMP-C" },
    update: {
      name: "Charlie Project Job C",
      submittedById: employeeC.id,
      grandTotal: 80000,
    },
    create: {
      jobCode: "TEST-JOB-EMP-C",
      name: "Charlie Project Job C",
      date: "2026-11-06",
      status: "APPROVED",
      submittedById: employeeC.id,
      grandTotal: 80000,
    },
  });

  // Legacy / System job with null creator
  const jobSystem = await prisma.job.upsert({
    where: { jobCode: "TEST-JOB-SYSTEM" },
    update: {
      name: "Legacy System Job",
      submittedById: null,
      grandTotal: 500000,
    },
    create: {
      jobCode: "TEST-JOB-SYSTEM",
      name: "Legacy System Job",
      date: "2026-01-01",
      status: "APPROVED",
      submittedById: null,
      grandTotal: 500000,
    },
  });

  // Invoice 1 created by Employee A
  const invoiceA = await prisma.supplierInvoice.upsert({
    where: { invoiceNumber: "INV-EMP-A-001" },
    update: {
      jobId: jobA.id,
      supplierId: testSupplier.id,
      totalAmount: 45000,
      createdById: employeeA.id,
      status: "APPROVED",
      invoiceDate: new Date("2026-11-06T00:00:00.000Z"),
    },
    create: {
      invoiceNumber: "INV-EMP-A-001",
      jobId: jobA.id,
      supplierId: testSupplier.id,
      totalAmount: 45000,
      createdById: employeeA.id,
      status: "APPROVED",
      invoiceDate: new Date("2026-11-06T00:00:00.000Z"),
    },
  });

  // Invoice 2 created by Employee B
  const invoiceB = await prisma.supplierInvoice.upsert({
    where: { invoiceNumber: "INV-EMP-B-001" },
    update: {
      jobId: jobB.id,
      supplierId: testSupplier.id,
      totalAmount: 75000,
      createdById: employeeB.id,
      status: "APPROVED",
      invoiceDate: new Date("2026-11-06T00:00:00.000Z"),
    },
    create: {
      invoiceNumber: "INV-EMP-B-001",
      jobId: jobB.id,
      supplierId: testSupplier.id,
      totalAmount: 75000,
      createdById: employeeB.id,
      status: "APPROVED",
      invoiceDate: new Date("2026-11-06T00:00:00.000Z"),
    },
  });

  // Invoice 3 created by Employee C
  const invoiceC = await prisma.supplierInvoice.upsert({
    where: { invoiceNumber: "INV-EMP-C-001" },
    update: {
      jobId: jobC.id,
      supplierId: testSupplier.id,
      totalAmount: 20000,
      createdById: employeeC.id,
      status: "APPROVED",
      invoiceDate: new Date("2026-11-06T00:00:00.000Z"),
    },
    create: {
      invoiceNumber: "INV-EMP-C-001",
      jobId: jobC.id,
      supplierId: testSupplier.id,
      totalAmount: 20000,
      createdById: employeeC.id,
      status: "APPROVED",
      invoiceDate: new Date("2026-11-06T00:00:00.000Z"),
    },
  });

  // Attachment on Invoice A
  const attachmentA = await prisma.supplierInvoiceAttachment.findFirst({
    where: { invoiceId: invoiceA.id },
  }) || await prisma.supplierInvoiceAttachment.create({
    data: {
      invoiceId: invoiceA.id,
      fileName: "alice_spec_sheet.pdf",
      storagePath: "invoices/alice_spec_sheet.pdf",
      fileType: "application/pdf",
      fileSize: "10 KB",
      fileUrl: "https://mock.storage/alice_spec_sheet.pdf",
    },
  });

  console.log("   Test fixtures initialized successfully.\n");

  // =========================================================================
  // SCENARIO 1: Employee A creates invoice -> Employee A sees it
  // =========================================================================
  console.log("📌 SCENARIO 1: Employee A Visibility");
  const filterA = await buildRecordVisibilityFilter(sessionEmpA, "supplierInvoices", "createdById");
  const invoicesForA = await prisma.supplierInvoice.findMany({
    where: { ...filterA.filter, id: { in: [invoiceA.id, invoiceB.id, invoiceC.id] } },
  });
  assert(
    invoicesForA.some((inv) => inv.id === invoiceA.id),
    "Employee A sees own invoice (INV-EMP-A-001)"
  );

  // =========================================================================
  // SCENARIO 2: Employee B cannot see Employee A's invoice
  // =========================================================================
  console.log("\n📌 SCENARIO 2: Cross-Employee Isolation");
  const filterB = await buildRecordVisibilityFilter(sessionEmpB, "supplierInvoices", "createdById");
  const invoicesForB = await prisma.supplierInvoice.findMany({
    where: { ...filterB.filter, id: { in: [invoiceA.id, invoiceB.id, invoiceC.id] } },
  });
  assert(
    !invoicesForB.some((inv) => inv.id === invoiceA.id),
    "Employee B CANNOT see Employee A's invoice (strict isolation)"
  );
  assert(
    invoicesForB.some((inv) => inv.id === invoiceB.id),
    "Employee B sees own invoice (INV-EMP-B-001)"
  );

  // =========================================================================
  // SCENARIO 3: Supervisor sees subordinates' invoices (Team Scope)
  // =========================================================================
  console.log("\n📌 SCENARIO 3: Supervisor Team Scope Visibility");
  const filterSup = await buildRecordVisibilityFilter(sessionSupervisor, "supplierInvoices", "createdById");
  const invoicesForSup = await prisma.supplierInvoice.findMany({
    where: { ...filterSup.filter, id: { in: [invoiceA.id, invoiceB.id, invoiceC.id] } },
  });
  assert(
    invoicesForSup.some((inv) => inv.id === invoiceA.id),
    "Supervisor sees Subordinate Alice's invoice"
  );
  assert(
    invoicesForSup.some((inv) => inv.id === invoiceB.id),
    "Supervisor sees Subordinate Bob's invoice"
  );
  assert(
    !invoicesForSup.some((inv) => inv.id === invoiceC.id),
    "Supervisor does NOT see Employee C's invoice (outside team scope)"
  );

  // =========================================================================
  // SCENARIO 4: Admin sees all invoices across all employees
  // =========================================================================
  console.log("\n📌 SCENARIO 4: Admin Enterprise Scope Visibility");
  const filterAdmin = await buildRecordVisibilityFilter(sessionAdmin, "supplierInvoices", "createdById");
  const invoicesForAdmin = await prisma.supplierInvoice.findMany({
    where: { ...filterAdmin.filter, id: { in: [invoiceA.id, invoiceB.id, invoiceC.id] } },
  });
  assert(
    invoicesForAdmin.length === 3,
    "Admin sees all 3 invoices (Alice, Bob, Charlie)"
  );

  // =========================================================================
  // SCENARIO 5: Employee direct URL / detail access to other employee's record
  // =========================================================================
  console.log("\n📌 SCENARIO 5: Direct URL / Detail Route Access Control");
  const empACanViewOwn = await canUserAccessRecord(sessionEmpA, "supplierInvoices", invoiceA.createdById, "view");
  const empACanViewB = await canUserAccessRecord(sessionEmpA, "supplierInvoices", invoiceB.createdById, "view");
  assert(empACanViewOwn.allowed === true, "Employee A can view own invoice details");
  assert(empACanViewB.allowed === false, "Employee A is DENIED viewing Employee B's invoice (403/404)");

  // =========================================================================
  // SCENARIO 6: Attachment Access Control (Signed URL protection)
  // =========================================================================
  console.log("\n📌 SCENARIO 6: File / Attachment Download Privacy");
  const empBCanDownloadAAttachment = await canUserAccessRecord(
    sessionEmpB,
    "supplierInvoices",
    invoiceA.createdById,
    "download"
  );
  const empACanDownloadAAttachment = await canUserAccessRecord(
    sessionEmpA,
    "supplierInvoices",
    invoiceA.createdById,
    "download"
  );
  assert(empBCanDownloadAAttachment.allowed === false, "Employee B is DENIED downloading Employee A's invoice PDF");
  assert(empACanDownloadAAttachment.allowed === true, "Employee A is AUTHORIZED to download own invoice PDF");

  // =========================================================================
  // SCENARIO 7: Employee edit of another employee's record
  // =========================================================================
  console.log("\n📌 SCENARIO 7: Mutation / Edit Protection");
  const empACanEditB = await canUserAccessRecord(sessionEmpA, "supplierInvoices", invoiceB.createdById, "edit");
  assert(empACanEditB.allowed === false, "Employee A is DENIED editing Employee B's invoice");

  // =========================================================================
  // SCENARIO 8: Supervisor action permission enforcement (Edit vs View)
  // =========================================================================
  console.log("\n📌 SCENARIO 8: Supervisor Granular Action Permissions");
  const supCanViewSubordinate = await canUserAccessRecord(sessionSupervisor, "supplierInvoices", invoiceA.createdById, "view");
  const supCanEditSubordinate = await canUserAccessRecord(sessionSupervisor, "supplierInvoices", invoiceA.createdById, "edit");
  assert(supCanViewSubordinate.allowed === true, "Supervisor is permitted to view subordinate invoice");
  assert(supCanEditSubordinate.allowed === true, "Supervisor has edit permission on subordinate invoice");

  // =========================================================================
  // SCENARIO 9: Employee Dashboard Stats Isolation
  // =========================================================================
  console.log("\n📌 SCENARIO 9: Employee Dashboard Aggregation Isolation");
  const empAJobFilter = await buildRecordVisibilityFilter(sessionEmpA, "jobs", "submittedById");
  const empAJobCount = await prisma.job.count({
    where: { ...empAJobFilter.filter, id: { in: [jobA.id, jobB.id, jobC.id] } },
  });
  assert(empAJobCount === 1, "Employee A dashboard shows strictly 1 job (own job only)");

  // =========================================================================
  // SCENARIO 10: Supervisor Dashboard Stats & Team Breakdown
  // =========================================================================
  console.log("\n📌 SCENARIO 10: Supervisor Team Dashboard Breakdown");
  const supScope = await getModuleVisibilityScope(sessionSupervisor, "dashboard");
  const authorizedTeamIds = await getAuthorizedUserIdsForScope(sessionSupervisor.userId, supScope);
  assert(supScope === "team", "Supervisor visibility scope is 'team'");
  assert(
    !!authorizedTeamIds &&
      authorizedTeamIds.includes(employeeA.id) &&
      authorizedTeamIds.includes(employeeB.id),
    "Authorized team includes Alice and Bob"
  );
  assert(
    !!authorizedTeamIds && !authorizedTeamIds.includes(employeeC.id),
    "Authorized team excludes Charlie (different supervisor)"
  );

  // =========================================================================
  // SCENARIO 11: Admin Complete System Dashboard Stats
  // =========================================================================
  console.log("\n📌 SCENARIO 11: Admin Enterprise Dashboard Scope");
  const adminScope = await getModuleVisibilityScope(sessionAdmin, "dashboard");
  assert(adminScope === "all", "Admin visibility scope is 'all' (company-wide)");

  // =========================================================================
  // SCENARIO 12: Profit & Loss Job Ownership & Visibility
  // =========================================================================
  console.log("\n📌 SCENARIO 12: Profit & Loss Scoping");
  const plFilterEmpA = await buildRecordVisibilityFilter(sessionEmpA, "profitLoss", "submittedById");
  const plJobsEmpA = await prisma.job.findMany({
    where: { ...plFilterEmpA.filter, id: { in: [jobA.id, jobB.id, jobC.id] } },
  });
  assert(plJobsEmpA.length === 1 && plJobsEmpA[0].id === jobA.id, "P&L reports for Employee A contains only Job A");

  // =========================================================================
  // SCENARIO 13: Search and Export Filter Integrity
  // =========================================================================
  console.log("\n📌 SCENARIO 13: Search & Export Leaks Prevention");
  const searchFilterB = await buildRecordVisibilityFilter(sessionEmpB, "jobs", "submittedById");
  // Simulating a search for "Project" which matches both Job A and Job B
  const searchResultsB = await prisma.job.findMany({
    where: {
      ...searchFilterB.filter,
      id: { in: [jobA.id, jobB.id, jobC.id] },
      name: { contains: "Project", mode: "insensitive" },
    },
  });
  assert(
    searchResultsB.length === 1 && searchResultsB[0].id === jobB.id,
    "Search for generic term does not leak unowned jobs to Employee B"
  );

  // =========================================================================
  // SCENARIO 14: Created By & Updated By Tracking Integrity
  // =========================================================================
  console.log("\n📌 SCENARIO 14: Created By & Audit Tracking");
  const fetchedInvA = await prisma.supplierInvoice.findUnique({
    where: { id: invoiceA.id },
    include: { createdBy: true },
  });
  assert(
    fetchedInvA?.createdById === employeeA.id,
    "Invoice A createdById is correctly stored as Employee A"
  );
  assert(
    fetchedInvA?.createdBy?.name === employeeA.name,
    "Invoice A createdBy relation resolves to Alice Employee"
  );

  // =========================================================================
  // SCENARIO 15: Migration & System Records Access
  // =========================================================================
  console.log("\n📌 SCENARIO 15: Migration & System Records Fallback");
  const supJobFilter = await buildRecordVisibilityFilter(sessionSupervisor, "jobs", "submittedById", true);
  const supSystemJobs = await prisma.job.findMany({
    where: { ...supJobFilter.filter, id: jobSystem.id },
  });
  assert(
    supSystemJobs.length === 1,
    "Supervisor can view legacy / system records with null creator"
  );

  const empJobFilter = await buildRecordVisibilityFilter(sessionEmpA, "jobs", "submittedById", false);
  const empSystemJobs = await prisma.job.findMany({
    where: { ...empJobFilter.filter, id: jobSystem.id },
  });
  assert(
    empSystemJobs.length === 0,
    "Standard Employee CANNOT view unassigned system records without permission"
  );

  // -------------------------------------------------------------------------
  // CLEANUP TEST FIXTURES
  // -------------------------------------------------------------------------
  console.log("\n🧹 Cleaning up test fixtures...");
  await prisma.supplierInvoiceAttachment.deleteMany({ where: { invoiceId: { in: [invoiceA.id, invoiceB.id, invoiceC.id] } } });
  await prisma.supplierInvoice.deleteMany({ where: { id: { in: [invoiceA.id, invoiceB.id, invoiceC.id] } } });
  await prisma.job.deleteMany({ where: { id: { in: [jobA.id, jobB.id, jobC.id, jobSystem.id] } } });
  await prisma.supplier.deleteMany({ where: { id: testSupplier.id } });
  await prisma.userRole.deleteMany({ where: { userId: { in: [adminUser.id, supervisorUser.id, employeeA.id, employeeB.id, employeeC.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [employeeA.id, employeeB.id, employeeC.id, supervisorUser.id, adminUser.id] } } });
  console.log("   Test fixtures cleaned up.\n");

  console.log("==========================================================");
  console.log(`📊 TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("==========================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((err) => {
    console.error("Test execution failed with error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
