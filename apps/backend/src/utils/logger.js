const levels = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const activeLevel = levels[process.env.LOG_LEVEL || "info"] ?? levels.info;

const write = (level, message, meta = {}) => {
  if (levels[level] < activeLevel) return;
  const record = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta
  };
  const line = JSON.stringify(record);
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
};

export const logger = {
  debug: (message, meta) => write("debug", message, meta),
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta)
};
