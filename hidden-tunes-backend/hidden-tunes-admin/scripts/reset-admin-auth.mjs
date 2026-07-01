import { createClient } from "@supabase/supabase-js";

const TARGET_ACCOUNTS = [
  {
    email: "admin@hiddentune.com",
    role: "owner",
    status: "active",
    passwordEnv: "ADMIN_RESET_PASSWORD",
  },
  {
    email: "uploader@hiddentune.com",
    role: "upload_manager",
    status: "active",
    passwordEnv: "UPLOADER_RESET_PASSWORD",
  },
];

const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_RESET_PASSWORD",
  "UPLOADER_RESET_PASSWORD",
];

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

function printSection(title) {
  console.log("");
  console.log(`=== ${title} ===`);
}

function fail(message, details) {
  console.error("");
  console.error(`Reset aborted: ${message}`);

  if (details) {
    console.error(details);
  }

  process.exit(1);
}

function assertRequiredEnv() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !readEnv(name));

  if (missing.length > 0) {
    fail(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function createSupabaseAdmin() {
  return createClient(
    readEnv("SUPABASE_URL"),
    readEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

async function listAllAuthUsers(supabase) {
  const users = [];
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      fail("Could not list Supabase Auth users.", error.message);
    }

    users.push(...(data.users || []));

    if (!data.users || data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

function buildProfileConflictFilter(emails, userIds) {
  const filters = [
    ...emails.map((email) => `email.eq.${email}`),
    ...userIds.map((userId) => `id.eq.${userId}`),
  ];

  return filters.join(",");
}

async function getConflictingProfiles(supabase, emails, userIds) {
  const filter = buildProfileConflictFilter(emails, userIds);

  if (!filter) return [];

  const { data, error } = await supabase
    .from("uploader_profiles")
    .select("id, email, role, status")
    .or(filter);

  if (error) {
    fail("Could not load conflicting uploader_profiles rows.", error.message);
  }

  return data || [];
}

function printPlan({ targetUsers, conflictingProfiles }) {
  printSection("Hidden Tunes Admin Auth Reset Plan");
  console.log("Production admin domain: https://admin.hiddentunes.com");
  console.log("This script only targets these accounts:");
  TARGET_ACCOUNTS.forEach((account) => {
    console.log(
      `- ${account.email} -> role=${account.role}, status=${account.status}`
    );
  });

  printSection("Auth Users To Delete/Recreate");
  if (targetUsers.length === 0) {
    console.log("- No existing matching Supabase Auth users found.");
  } else {
    targetUsers.forEach((user) => {
      console.log(`- ${user.email || "(no email)"} id=${user.id}`);
    });
  }

  printSection("Uploader Profiles To Delete/Recreate");
  if (conflictingProfiles.length === 0) {
    console.log("- No existing conflicting uploader_profiles rows found.");
  } else {
    conflictingProfiles.forEach((profile) => {
      console.log(
        `- ${profile.email || "(no email)"} id=${profile.id} role=${
          profile.role || "(none)"
        } status=${profile.status || "(none)"}`
      );
    });
  }

  printSection("Records That Will Not Be Touched");
  console.log("- songs");
  console.log("- lyrics");
  console.log("- synced lyrics");
  console.log("- artists");
  console.log("- albums");
  console.log("- catalog");
  console.log("- uploads");
  console.log("- Cloudflare R2 files");
  console.log("- listener app data");
  console.log("- playback data");
  console.log("- rankings");
  console.log("- genre metadata");
  console.log("- any non-conflicting uploader_profiles rows");
}

function assertConfirmed() {
  if (readEnv("CONFIRM_RESET") !== "true") {
    fail(
      "CONFIRM_RESET must be exactly true. No records were changed.",
      'Run manually only when ready: CONFIRM_RESET=true ADMIN_RESET_PASSWORD="TEMP_ADMIN_PASSWORD" UPLOADER_RESET_PASSWORD="TEMP_UPLOADER_PASSWORD" npm run reset-admin-auth'
    );
  }
}

async function deleteConflictingProfiles(supabase, conflictingProfiles) {
  if (conflictingProfiles.length === 0) return;

  const profileIds = conflictingProfiles.map((profile) => profile.id);
  const { error } = await supabase
    .from("uploader_profiles")
    .delete()
    .in("id", profileIds);

  if (error) {
    fail("Could not delete conflicting uploader_profiles rows.", error.message);
  }
}

async function deleteTargetAuthUsers(supabase, targetUsers) {
  for (const user of targetUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);

    if (error) {
      fail(`Could not delete Auth user ${user.email || user.id}.`, error.message);
    }
  }
}

async function createFreshAccounts(supabase) {
  const createdAccounts = [];

  for (const account of TARGET_ACCOUNTS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: readEnv(account.passwordEnv),
      email_confirm: true,
      user_metadata: {
        role: account.role,
        created_by: "hidden_tunes_admin_reset",
      },
      app_metadata: {
        role: account.role,
      },
    });

    if (error || !data.user?.id) {
      fail(
        `Could not create Auth user ${account.email}.`,
        error?.message || "Supabase did not return a user id."
      );
    }

    const { error: profileError } = await supabase
      .from("uploader_profiles")
      .insert({
        id: data.user.id,
        email: account.email,
        role: account.role,
        status: account.status,
      });

    if (profileError) {
      fail(
        `Created Auth user ${account.email}, but could not create uploader profile.`,
        profileError.message
      );
    }

    createdAccounts.push({
      email: account.email,
      id: data.user.id,
      role: account.role,
      status: account.status,
    });
  }

  return createdAccounts;
}

async function main() {
  assertRequiredEnv();

  const supabase = createSupabaseAdmin();
  const targetEmails = TARGET_ACCOUNTS.map((account) => account.email);
  const allUsers = await listAllAuthUsers(supabase);
  const targetUsers = allUsers.filter((user) =>
    targetEmails.includes(String(user.email || "").toLowerCase())
  );
  const targetUserIds = targetUsers.map((user) => user.id);
  const conflictingProfiles = await getConflictingProfiles(
    supabase,
    targetEmails,
    targetUserIds
  );

  printPlan({ targetUsers, conflictingProfiles });
  assertConfirmed();

  printSection("Applying Reset");
  await deleteConflictingProfiles(supabase, conflictingProfiles);
  console.log(`Deleted uploader_profiles rows: ${conflictingProfiles.length}`);

  await deleteTargetAuthUsers(supabase, targetUsers);
  console.log(`Deleted Supabase Auth users: ${targetUsers.length}`);

  const createdAccounts = await createFreshAccounts(supabase);

  printSection("Reset Complete");
  createdAccounts.forEach((account) => {
    console.log(
      `- ${account.email} id=${account.id} role=${account.role} status=${account.status}`
    );
  });
  console.log("");
  console.log("Temporary passwords were read from environment variables only.");
  console.log("Rotate the temporary passwords after first successful login.");
}

main().catch((error) => {
  fail("Unexpected reset script failure.", error?.message || String(error));
});
