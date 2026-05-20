require("dotenv").config();
const { Client } = require("@notionhq/client");
const cron = require("node-cron");
const nodemailer = require("nodemailer");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// Logika khusus untuk Group = "Event"
function getStatusForEvent(dateStart, dateEnd) {
  if (!dateStart) return "Backlog";

  const now = new Date();
  const start = new Date(dateStart);
  const end = dateEnd ? new Date(dateEnd) : new Date(dateStart);

  // Kalau end tidak punya jam (date only), anggap berakhir di akhir hari itu
  if (!dateEnd || !dateEnd.includes("T")) {
    end.setHours(23, 59, 59, 999);
  }

  if (now < start) return "Up Next"; // Belum sampai hari H
  if (now >= start && now <= end) return "In Progress"; // Sedang berlangsung
  if (now - end > 30 * 24 * 60 * 60 * 1000) return "Archived"; // Lewat > 30 hari
  return "Done"; // Sudah selesai
}

// Logika untuk Group selain Event
function getStatusForGeneral(dateStart) {
  if (!dateStart) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(dateStart);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

  if (diffDays > 1) return null; // Lebih dari H-1, biarkan manual
  if (diffDays >= 0) return "In Progress"; // H-1 atau Hari H
  if (diffDays < -30) return "Archived"; // Lewat lebih dari 30 hari
  if (diffDays < -3) return "Done"; // Lewat lebih dari 3 hari kalender (hari ke-4+)
  return null; // Lewat 1-3 hari, biarkan manual
}

async function sendDigestEmail(changes) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !process.env.GMAIL_TO) return;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const timestamp = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

  const statusColor = {
    "Backlog": "#94a3b8",
    "Up Next": "#60a5fa",
    "In Progress": "#f59e0b",
    "Waiting": "#a78bfa",
    "Done": "#34d399",
    "Archived": "#6b7280",
  };

  const badge = (label) => {
    const color = statusColor[label] || "#94a3b8";
    return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${color}22;color:${color};border:1px solid ${color}66;font-size:12px;font-weight:600">${label}</span>`;
  };

  const tableRows = changes.map((c) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#1e293b;font-size:14px">${c.group}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#1e293b;font-size:14px;font-weight:500">${c.title}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${badge(c.from)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#94a3b8;font-size:18px;text-align:center">→</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${badge(c.to)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
    <div style="background:#1e293b;padding:24px 28px">
      <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:1px;color:#64748b;text-transform:uppercase">Second Brain</p>
      <h1 style="margin:6px 0 0;font-size:20px;color:#f8fafc;font-weight:600">${changes.length} status diperbarui</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#64748b">${timestamp}</p>
    </div>
    <div style="padding:8px 0">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase">Group</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase">Nama</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase">Dari</th>
            <th></th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase">Ke</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div style="padding:16px 28px;border-top:1px solid #f1f5f9">
      <p style="margin:0;font-size:12px;color:#cbd5e1">Dikirim otomatis oleh Second Brain</p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `Second Brain <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_TO,
    subject: `[Second Brain] ${changes.length} status diperbarui — ${timestamp}`,
    html,
  });

  console.log(`[Auto] Email digest dikirim (${changes.length} perubahan).`);
}

async function sendReminderEmail(reminders) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !process.env.GMAIL_TO) return;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowLabel = tomorrow.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Jakarta",
  });

  const tableRows = reminders.map((r) => {
    const timeLabel = r.time
      ? `<span style="font-size:13px;color:#f59e0b;font-weight:600">${r.time}</span>`
      : `<span style="font-size:12px;color:#94a3b8">—</span>`;
    return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#1e293b;font-size:14px">${r.group || "—"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#1e293b;font-size:14px;font-weight:500">${r.title}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center">${timeLabel}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
    <div style="background:#1e293b;padding:24px 28px">
      <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:1px;color:#64748b;text-transform:uppercase">Second Brain · Reminder</p>
      <h1 style="margin:6px 0 0;font-size:20px;color:#f8fafc;font-weight:600">${reminders.length} agenda besok</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#64748b">${tomorrowLabel}</p>
    </div>
    <div style="padding:8px 0">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase">Group</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase">Nama</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase">Jam Mulai</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div style="padding:16px 28px;border-top:1px solid #f1f5f9">
      <p style="margin:0;font-size:12px;color:#cbd5e1">Dikirim otomatis oleh Second Brain</p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `Second Brain <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_TO,
    subject: `[Second Brain] ${reminders.length} agenda besok — ${tomorrowLabel}`,
    html,
  });

  console.log(`[Auto] Email reminder dikirim (${reminders.length} agenda besok).`);
}

async function updateStatuses() {
  console.log("[Auto] Mengecek status...", new Date().toLocaleString("id-ID"));

  try {
    // Notion SDK v5: database query dilakukan via data source.
    const db = await notion.databases.retrieve({ database_id: DATABASE_ID });
    const dataSourceId = db?.data_sources?.[0]?.id;
    if (!dataSourceId) {
      throw new Error("Tidak menemukan data source pada database (db.data_sources[0].id kosong).");
    }

    // Cek apakah sekarang jam 07.00 WIB untuk kirim reminder H-1
    const nowWIB = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
    const hourWIB = new Date(nowWIB).getHours();
    const isReminderHour = hourWIB === 7;

    // Hitung tanggal besok (WIB) untuk filter reminder
    const tomorrowWIB = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    tomorrowWIB.setDate(tomorrowWIB.getDate() + 1);
    const tomorrowDateStr = tomorrowWIB.toISOString().slice(0, 10); // "YYYY-MM-DD"

    const changes = [];
    const reminders = [];
    let startCursor = undefined;
    do {
      const response = await notion.dataSources.query({
        data_source_id: dataSourceId,
        start_cursor: startCursor,
      });

      for (const page of response.results) {
        const props = page.properties;

        const group = props["Group"]?.select?.name;
        const dateStart = props["Date"]?.date?.start;
        const dateEnd = props["Date"]?.date?.end; // bisa null kalau single date
        const currentStatus = props["Status"]?.status?.name;
        const title = props["Name"]?.title?.[0]?.plain_text || page.id.slice(0, 8);

        // Kumpulkan reminder H-1 (hanya di jam 07.00 WIB)
        if (isReminderHour && dateStart && dateStart.slice(0, 10) === tomorrowDateStr) {
          const time = dateStart.includes("T")
            ? new Date(dateStart).toLocaleTimeString("id-ID", {
                hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
              })
            : null;
          reminders.push({ group, title, time });
        }

        let newStatus = null;

        if (group === "Event") {
          newStatus = getStatusForEvent(dateStart, dateEnd);
        } else {
          newStatus = getStatusForGeneral(dateStart);
        }

        // Skip kalau tidak ada perubahan atau tidak ada status baru
        if (!newStatus || currentStatus === newStatus) continue;

        await notion.pages.update({
          page_id: page.id,
          properties: {
            Status: { status: { name: newStatus } },
          },
        });

        console.log(`  [${group}] "${title}": ${currentStatus} -> ${newStatus}`);
        changes.push({ group, title, from: currentStatus, to: newStatus });
      }

      startCursor = response.has_more ? response.next_cursor : undefined;
    } while (startCursor);

    if (changes.length > 0) {
      await sendDigestEmail(changes);
    }

    if (reminders.length > 0) {
      await sendReminderEmail(reminders);
    }

    console.log("[Auto] Selesai.");
  } catch (err) {
    console.error("[Auto] Error:", err.message);
  }
}

module.exports = {
  updateStatuses,
};

if (require.main === module) {
  updateStatuses();

  cron.schedule(
    "0 * * * *",
    () => {
      updateStatuses();
    },
    {
      timezone: "Asia/Jakarta",
    },
  );

  console.log("Scheduler aktif. Cek setiap jam.");
}
