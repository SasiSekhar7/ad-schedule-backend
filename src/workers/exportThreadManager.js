// const { Worker } = require("worker_threads");
// const os = require("os");
// const path = require("path");

// const MAX_THREADS = Math.max(1, os.cpus().length - 1);
// let activeWorkers = 0;
// const jobQueue = [];

// console.log("🧠 Max Export Threads:", MAX_THREADS);

// function runNextJob() {
//   if (activeWorkers >= MAX_THREADS) return;
//   if (jobQueue.length === 0) return;

//   const job = jobQueue.shift();
//   activeWorkers++;

//   let worker;

//   try {
//     worker = new Worker(
//       path.join(__dirname, "../workers/exportWorker.js"),
//       { workerData: { job :job.toJSON() } }
//     );
//   } catch (err) {
//     console.error("❌ Failed to create worker:", err);
//     activeWorkers--;
//     runNextJob();
//     return;
//   }

//   let finished = false; // prevents double decrement

//   const cleanup = () => {
//     if (!finished) {
//       finished = true;
//       activeWorkers--;
//       runNextJob();
//     }
//   };

//   worker.on("message", (msg) => {
//     if (msg?.error) {
//       console.error("❌ Worker Job Error:", msg.error);
//     } else {
//       console.log("✅ Worker completed job");
//     }
//     cleanup();
//   });

//   worker.on("error", (err) => {
//     console.error("❌ Worker Runtime Error:", err);
//     cleanup();
//   });

//   worker.on("exit", (code) => {
//     if (code !== 0) {
//       console.error("❌ Worker stopped with exit code:", code);
//     }
//     cleanup();
//   });
// }

// function addExportJob(job) {
//   try {
//     if (!job) throw new Error("Invalid job");

//     jobQueue.push(job);
//     runNextJob();
//   } catch (err) {
//     console.error("❌ Failed to add job:", err);
//   }
// }

// module.exports = { addExportJob };



const { Worker } = require("worker_threads");
const os = require("os");
const path = require("path");

const MAX_THREADS = Math.max(1, os.cpus().length - 1);
const MAX_QUEUE = 1000;
const WORKER_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const MAX_RETRIES = 2;

let activeWorkers = 0;
const jobQueue = [];

console.log("🧠 Max Export Threads:", MAX_THREADS);

function startWorker(job) {
  activeWorkers++;

  let worker;
  let finished = false;

  try {
    worker = new Worker(
      path.join(__dirname, "../workers/exportWorker.js"),
      { workerData: { job: job.toJSON ? job.toJSON() : job } }
    );
  } catch (err) {
    console.error("❌ Failed to create worker:", err);
    activeWorkers--;
    retryJob(job);
    runNextJobs();
    return;
  }

  const timer = setTimeout(() => {
    console.error("⚠️ Worker timeout — terminating job:", job.job_id);
    worker.terminate();
  }, WORKER_TIMEOUT);

  const cleanup = () => {
    if (finished) return;

    finished = true;
    clearTimeout(timer);
    activeWorkers--;

    runNextJobs();
  };

  worker.on("message", (msg) => {
    if (msg?.error) {
      console.error("❌ Worker Job Error:", msg.error);
      retryJob(job);
    } else {
      console.log("✅ Worker completed job:", job.job_id);
    }

    cleanup();
  });

  worker.on("error", (err) => {
    console.error("❌ Worker Runtime Error:", err);
    retryJob(job);
    cleanup();
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      console.error("❌ Worker stopped with exit code:", code);
      retryJob(job);
    }

    cleanup();
  });
}

function runNextJobs() {
  while (activeWorkers < MAX_THREADS && jobQueue.length > 0) {
    const job = jobQueue.shift();
    startWorker(job);
  }
}

function retryJob(job) {
  job.retryCount = job.retryCount || 0;

  if (job.retryCount < MAX_RETRIES) {
    job.retryCount++;
    console.log(`🔁 Retrying job ${job.job_id} (attempt ${job.retryCount})`);
    jobQueue.push(job);
  } else {
    console.error(`💀 Job failed permanently: ${job.job_id}`);
  }
}

function addExportJob(job) {
  try {
    if (!job) throw new Error("Invalid job");

    if (jobQueue.length >= MAX_QUEUE) {
      console.error("🚨 Job queue overflow. Rejecting job:", job.job_id);
      return;
    }

    job.retryCount = 0;

    jobQueue.push(job);

    runNextJobs();
  } catch (err) {
    console.error("❌ Failed to add job:", err);
  }
}

module.exports = { addExportJob };