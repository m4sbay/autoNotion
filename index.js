require("dotenv").config();
const { Client } = require("@notionhq/client");
const cron = require("node-cron");

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

async function updateStatuses() {
  console.log("[Auto] Mengecek status...", new Date().toLocaleString("id-ID"));

  try {
    // Notion SDK v5: database query dilakukan via data source.
    const db = await notion.databases.retrieve({ database_id: DATABASE_ID });
    const dataSourceId = db?.data_sources?.[0]?.id;
    if (!dataSourceId) {
      throw new Error("Tidak menemukan data source pada database (db.data_sources[0].id kosong).");
    }

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

        const title =
          page.properties["Name"]?.title?.[0]?.plain_text || page.id.slice(0, 8);
        console.log(`  [${group}] "${title}": ${currentStatus} -> ${newStatus}`);
      }

      startCursor = response.has_more ? response.next_cursor : undefined;
    } while (startCursor);

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
