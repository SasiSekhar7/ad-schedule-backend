const { ExportJob } = require("../models");
const { Op } = require("sequelize");
const moment = require("moment");

exports.createExportJob = async (req, res) => {
  try {

    const {
      job_type,
      device_id,
      ad_id,
      start_date,
      end_date
    } = req.body;

    // 1️⃣ Required fields
    if (!job_type || !start_date || !end_date) {
      return res.status(400).json({
        error: "job_type, start_date and end_date are required"
      });
    }

    // 2️⃣ Date validation
    const start = moment(start_date);
    const end = moment(end_date);

    if (!start.isValid() || !end.isValid()) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    if (start.isAfter(end)) {
      return res.status(400).json({
        error: "start_date must be before end_date"
      });
    }

    // 3️⃣ Max range validation (prevent heavy exports)
    const maxMonths = 13;
    if (end.diff(start, "months", true) > maxMonths) {
      return res.status(400).json({
        error: `Date range cannot exceed ${maxMonths} months`
      });
    }

    // 4️⃣ UUID validation
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (device_id && !uuidRegex.test(device_id)) {
      return res.status(400).json({ error: "Invalid device_id" });
    }

    if (ad_id && !uuidRegex.test(ad_id)) {
      return res.status(400).json({ error: "Invalid ad_id" });
    }

    // 5️⃣ Prevent duplicate running jobs
    const existingJob = await ExportJob.findOne({
      where: {
        client_id: req.user.client_id,
        status: {
          [Op.in]: ["PENDING", "PROCESSING"]
        },
        job_type
      }
    });

    if (existingJob) {
      return res.status(409).json({
        error: "An export job is already running"
      });
    }

    // 6️⃣ Create job
    const job = await ExportJob.create({
      client_id: req.user.client_id,
      job_type,
      device_id: device_id || null,
      ad_id: ad_id || null,
      start_date,
      end_date,
      status: "PENDING"
    });

    res.json({
      message: "Export job created",
      job_id: job.job_id
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getJobStatus = async (req, res) => {

  const job = await ExportJob.findOne({
    where: {
      job_id: req.params.job_id,
      client_id: req.user.client_id
    }
  });

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json(job);
};

exports.listJobs = async (req, res) => {

  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;

  const jobs = await ExportJob.findAll({
    where: { client_id: req.user.client_id },
    order: [["created_at", "DESC"]],
    limit,
    offset
  });

  res.json(jobs);
};

exports.updateJobStatus = async (req, res) => {
  const t = await ExportJob.sequelize.transaction();

  try {
    const { job_id } = req.params;
    const { status, error_message, file_url, progress_percent } = req.body;

    const allowedStatuses = [
      "PENDING",
      "QUEUED",
      "PROCESSING",
      "COMPLETED",
      "FAILED",
      "CANCELLED"
    ];

    if (!allowedStatuses.includes(status)) {
      await t.rollback();
      return res.status(400).json({
        error: "Invalid status value"
      });
    }

    const job = await ExportJob.findOne({
      where: {
        job_id,
        client_id: req.user.client_id
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!job) {
      await t.rollback();
      return res.status(404).json({ error: "Job not found" });
    }

    // Prevent overriding finished jobs
    // if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
    //   await t.rollback();
    //   return res.status(409).json({
    //     error: "Job already finalized"
    //   });
    // }

    job.status = status;

    if (progress_percent !== undefined) {
      job.progress_percent = progress_percent;
    }

    if (error_message) {
      job.error_message = error_message;
    }

    if (file_url) {
      job.file_url = file_url;
    }

    job.updated_at = new Date();

    await job.save({ transaction: t });
    await t.commit();

    res.json({
      message: "Job updated",
      status: job.status
    });

  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
};