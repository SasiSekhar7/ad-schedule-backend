const { ExportJob } = require("../models");
const { addExportJob } = require("./exportThreadManager");

async function pollExportJobs() {
  try {

    const jobs = await ExportJob.findAll({
      where: { status: "PENDING" },
      limit: 5
    });

    for (const job of jobs) {

      await ExportJob.update(
        { status: "QUEUED" },
        { where: { job_id: job.job_id } }
      );

      addExportJob(job);
    }

  } catch (err) {
    console.error("Export Poller Error:", err);
  }
}

setInterval(pollExportJobs, 5000);

console.log("📦 Export Job Processor Running...");