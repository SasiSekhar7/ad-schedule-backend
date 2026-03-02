const { Worker } = require("worker_threads");
const os = require("os");
const path = require("path");

const MAX_THREADS = Math.max(1, os.cpus().length - 1);
let activeWorkers = 0;
const jobQueue = [];

console.log("🧠 Max Export Threads:", MAX_THREADS);

function runNextJob() {
  if (activeWorkers >= MAX_THREADS) return;
  if (jobQueue.length === 0) return;

  const job = jobQueue.shift();
  activeWorkers++;

  let worker;

  try {
    worker = new Worker(
      path.join(__dirname, "../workers/exportWorker.js"),
      { workerData: { job :job.toJSON() } }
    );
  } catch (err) {
    console.error("❌ Failed to create worker:", err);
    activeWorkers--;
    runNextJob();
    return;
  }

  let finished = false; // prevents double decrement

  const cleanup = () => {
    if (!finished) {
      finished = true;
      activeWorkers--;
      runNextJob();
    }
  };

  worker.on("message", (msg) => {
    if (msg?.error) {
      console.error("❌ Worker Job Error:", msg.error);
    } else {
      console.log("✅ Worker completed job");
    }
    cleanup();
  });

  worker.on("error", (err) => {
    console.error("❌ Worker Runtime Error:", err);
    cleanup();
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      console.error("❌ Worker stopped with exit code:", code);
    }
    cleanup();
  });
}

function addExportJob(job) {
  try {
    if (!job) throw new Error("Invalid job");

    jobQueue.push(job);
    runNextJob();
  } catch (err) {
    console.error("❌ Failed to add job:", err);
  }
}

module.exports = { addExportJob };